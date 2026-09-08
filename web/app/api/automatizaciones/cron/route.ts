import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Las automatizaciones diarias: las que miran el estado del negocio y crean una
// tarea cuando algo se pasó de fecha.
//
// Igual que el cron de redes, del otro lado no hay usuario, así que se
// autentica con CRON_SECRET y no con el token de sesión. Lo dispara pg_cron
// desde Supabase (ver supabase/cron-automatizaciones.sql).
export const maxDuration = 60;

// Tope por regla y por agencia. La primera corrida de una agencia con años de
// leads podría querer crear cientos de tareas de golpe: mejor que entren de a
// tandas y que el vendedor vea una lista que puede trabajar.
const TOPE = 50;

interface Agencia {
  id: string;
  nombre: string;
}

interface Regla {
  agencia_id: string;
  clave: string;
  activa: boolean;
  parametros: Record<string, unknown> | null;
}

/** Hoy en AAAA-MM-DD, en la hora de Argentina y no en UTC. */
function hoyEnArgentina(): string {
  // `en-CA` da justo el formato AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

// Los títulos son la clave de deduplicación: si ya hay una tarea pendiente con
// el mismo título, no se crea otra. Por eso no llevan la cantidad de días ni la
// fecha — cambiarían todos los días y la tarea se duplicaría sola.
function tituloSeguimiento(nombre: string): string {
  return `Seguimiento vencido: ${nombre}`;
}

function tituloEstancado(marca: string, modelo: string, dominio: string | null): string {
  return `Revisar publicación y precio: ${marca} ${modelo}${dominio ? ` (${dominio})` : ""}`;
}

/**
 * Crea las tareas que falten. Devuelve cuántas se crearon.
 *
 * La deduplicación es contra las tareas NO hechas: si el vendedor ya la marcó
 * hecha y el lead sigue vencido, mañana le vuelve a aparecer — que es lo
 * correcto, porque el seguimiento sigue sin hacerse de verdad.
 */
async function crearTareasFaltantes(
  admin: SupabaseClient,
  agencia_id: string,
  vence: string,
  pedidos: { titulo: string; usuario_id: string }[]
): Promise<number> {
  if (!pedidos.length) return 0;

  const { data: existentes, error } = await admin
    .from("tareas")
    .select("titulo")
    .eq("agencia_id", agencia_id)
    .eq("hecha", false)
    .in(
      "titulo",
      pedidos.map((p) => p.titulo)
    );
  if (error) throw error;

  const yaEstan = new Set((existentes ?? []).map((t) => (t as { titulo: string }).titulo));
  const nuevas = pedidos
    .filter((p) => !yaEstan.has(p.titulo))
    .map((p) => ({ agencia_id, usuario_id: p.usuario_id, titulo: p.titulo, vence }));
  if (!nuevas.length) return 0;

  const { error: errorInsert } = await admin.from("tareas").insert(nuevas);
  if (errorInsert) throw errorInsert;
  return nuevas.length;
}

async function seguimientosVencidos(admin: SupabaseClient, agencia_id: string, hoy: string): Promise<string> {
  const { data, error } = await admin
    .from("clientes")
    .select("id, nombre, vendedor_id")
    .eq("agencia_id", agencia_id)
    .lt("proximo_contacto", hoy)
    .not("estado_lead", "in", "(ganado,perdido)")
    .order("proximo_contacto", { ascending: true })
    .limit(TOPE);
  if (error) throw error;

  const leads = (data ?? []) as { id: string; nombre: string; vendedor_id: string | null }[];
  // Sin vendedor asignado no hay a quién darle la tarea. No se la inventamos a
  // nadie: se cuenta aparte para que el admin sepa que hay leads sueltos.
  const sinVendedor = leads.filter((l) => !l.vendedor_id).length;
  const creadas = await crearTareasFaltantes(
    admin,
    agencia_id,
    hoy,
    leads
      .filter((l) => l.vendedor_id)
      .map((l) => ({ titulo: tituloSeguimiento(l.nombre), usuario_id: l.vendedor_id as string }))
  );

  const partes = [`${creadas} tarea${creadas === 1 ? "" : "s"} nueva${creadas === 1 ? "" : "s"}`];
  if (sinVendedor) partes.push(`${sinVendedor} lead${sinVendedor === 1 ? "" : "s"} sin vendedor asignado`);
  return partes.join(" · ");
}

async function stockEstancado(
  admin: SupabaseClient,
  agencia_id: string,
  hoy: string,
  dias: number
): Promise<string> {
  // La tarea es del administrador: un auto parado en stock es una decisión de
  // precio o de publicación, no del vendedor que lo tenga asignado (no lo está).
  const { data: admins, error: errorAdmin } = await admin
    .from("perfiles")
    .select("id")
    .eq("agencia_id", agencia_id)
    .eq("rol", "admin")
    .order("creado_en", { ascending: true })
    .limit(1);
  if (errorAdmin) throw errorAdmin;
  const responsable = (admins ?? [])[0] as { id: string } | undefined;
  if (!responsable) return "sin administrador a quién asignarle la tarea";

  const limite = new Date();
  limite.setDate(limite.getDate() - dias);

  const { data, error } = await admin
    .from("vehiculos")
    .select("id, marca, modelo, dominio")
    .eq("agencia_id", agencia_id)
    .eq("estado", "disponible")
    .lt("creado_en", limite.toISOString())
    .order("creado_en", { ascending: true })
    .limit(TOPE);
  if (error) throw error;

  const autos = (data ?? []) as { marca: string; modelo: string; dominio: string | null }[];
  const creadas = await crearTareasFaltantes(
    admin,
    agencia_id,
    hoy,
    autos.map((v) => ({ titulo: tituloEstancado(v.marca, v.modelo, v.dominio), usuario_id: responsable.id }))
  );
  return `${autos.length} auto${autos.length === 1 ? "" : "s"} con más de ${dias} días · ${creadas} tarea${creadas === 1 ? "" : "s"} nueva${creadas === 1 ? "" : "s"}`;
}

// Deja el rastro de la corrida en la propia fila de la regla. Es un upsert
// porque una agencia puede no tener fila todavía: falta la fila = regla
// encendida, así que la primera corrida es la que la crea.
async function anotarCorrida(
  admin: SupabaseClient,
  agencia_id: string,
  clave: string,
  resultado: string
): Promise<void> {
  await admin
    .from("automatizaciones")
    .upsert(
      { agencia_id, clave, ultima_corrida: new Date().toISOString(), ultimo_resultado: resultado },
      { onConflict: "agencia_id,clave" }
    );
}

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secreto) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET en el servidor: el cron queda desactivado a propósito." },
      { status: 500 }
    );
  }
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Falta configuración de Supabase." }, { status: 500 });
  }

  // Service role: no hay sesión y hay que recorrer todas las agencias. La RLS
  // no aplica acá, por eso el endpoint está cerrado con el secreto.
  const admin = createClient(url, serviceKey);
  const hoy = hoyEnArgentina();

  const [{ data: agenciasData, error: errorAgencias }, { data: reglasData, error: errorReglas }] = await Promise.all([
    admin.from("agencias").select("id, nombre"),
    admin.from("automatizaciones").select("agencia_id, clave, activa, parametros"),
  ]);
  if (errorAgencias || errorReglas) {
    return NextResponse.json({ error: "No se pudo leer la configuración." }, { status: 500 });
  }

  const reglas = new Map(
    ((reglasData ?? []) as Regla[]).map((r) => [`${r.agencia_id}:${r.clave}`, r])
  );
  const estaActiva = (agencia_id: string, clave: string) =>
    reglas.get(`${agencia_id}:${clave}`)?.activa ?? true;

  const informe: Record<string, Record<string, string>> = {};

  for (const agencia of (agenciasData ?? []) as Agencia[]) {
    const porAgencia: Record<string, string> = {};

    if (estaActiva(agencia.id, "seguimientos_vencidos")) {
      try {
        const resultado = await seguimientosVencidos(admin, agencia.id, hoy);
        await anotarCorrida(admin, agencia.id, "seguimientos_vencidos", resultado);
        porAgencia.seguimientos_vencidos = resultado;
      } catch (err) {
        const motivo = err instanceof Error ? err.message : "error desconocido";
        await anotarCorrida(admin, agencia.id, "seguimientos_vencidos", `Error: ${motivo}`);
        porAgencia.seguimientos_vencidos = `error: ${motivo}`;
      }
    }

    if (estaActiva(agencia.id, "stock_estancado")) {
      const crudo = Number(reglas.get(`${agencia.id}:stock_estancado`)?.parametros?.dias);
      const dias = Number.isFinite(crudo) && crudo > 0 ? Math.round(crudo) : 60;
      try {
        const resultado = await stockEstancado(admin, agencia.id, hoy, dias);
        await anotarCorrida(admin, agencia.id, "stock_estancado", resultado);
        porAgencia.stock_estancado = resultado;
      } catch (err) {
        const motivo = err instanceof Error ? err.message : "error desconocido";
        await anotarCorrida(admin, agencia.id, "stock_estancado", `Error: ${motivo}`);
        porAgencia.stock_estancado = `error: ${motivo}`;
      }
    }

    if (Object.keys(porAgencia).length) informe[agencia.nombre] = porAgencia;
  }

  return NextResponse.json({ ok: true, dia: hoy, agencias: informe });
}
