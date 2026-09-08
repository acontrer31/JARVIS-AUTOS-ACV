import { miAgenciaId, supabase } from "@/lib/supabase";
import { hoyISO } from "@/lib/fechas";

// Las reglas que el sistema ejecuta solo, sin que nadie las apriete.
//
// Dos ya venían corriendo escondidas (publicar lo programado, retirar de redes
// al vender) y no había forma de ver si andaban ni de apagarlas. Las otras dos
// son nuevas y crean tareas: son el "avisame vos" que hasta ahora dependía de
// que alguien se acordara de mirar.

export const CLAVES = [
  "publicar_programadas",
  "retirar_al_vender",
  "seguimientos_vencidos",
  "stock_estancado",
] as const;
export type ClaveAutomatizacion = (typeof CLAVES)[number];

/** Qué la dispara: el reloj (un cron) o algo que pasó en el sistema. */
export type Disparo = "reloj" | "evento";

export interface FichaAutomatizacion {
  clave: ClaveAutomatizacion;
  nombre: string;
  /** Qué hace, en una línea, como se lo explicarías a quien la va a apagar. */
  hace: string;
  disparo: Disparo;
  /** Cuándo corre, en castellano. */
  cuando: string;
  /** Qué deja como resultado visible. */
  resultado: string;
}

export const CATALOGO: FichaAutomatizacion[] = [
  {
    clave: "publicar_programadas",
    nombre: "Publicar lo programado",
    hace: "Publica en Facebook e Instagram las piezas que se agendaron para más tarde.",
    disparo: "reloj",
    cuando: "Cada 5 minutos",
    resultado: "El posteo sale a la hora agendada y queda en el historial de redes.",
  },
  {
    clave: "retirar_al_vender",
    nombre: "Retirar al vender",
    hace: "Cuando un vehículo pasa a vendido, baja sus publicaciones de Facebook.",
    disparo: "evento",
    cuando: "Al marcar un vehículo como vendido",
    resultado:
      "Facebook se borra por API. Instagram no se puede borrar por código: queda listado para sacarlo a mano.",
  },
  {
    clave: "seguimientos_vencidos",
    nombre: "Seguimientos vencidos",
    hace: "Le crea una tarea al vendedor por cada lead cuya fecha de contacto ya pasó.",
    disparo: "reloj",
    cuando: "Todos los días a las 8:00",
    resultado: "Una tarea por lead, en la lista del vendedor asignado. No se repite si ya está.",
  },
  {
    clave: "stock_estancado",
    nombre: "Stock estancado",
    hace: "Avisa qué autos llevan demasiado tiempo disponibles sin venderse.",
    disparo: "reloj",
    cuando: "Todos los días a las 8:00",
    resultado: "Una tarea para el administrador por cada auto pasado de tiempo.",
  },
];

export interface Automatizacion extends FichaAutomatizacion {
  activa: boolean;
  parametros: Record<string, unknown>;
  ultima_corrida: string | null;
  ultimo_resultado: string | null;
}

interface Fila {
  clave: ClaveAutomatizacion;
  activa: boolean;
  parametros: Record<string, unknown> | null;
  ultima_corrida: string | null;
  ultimo_resultado: string | null;
}

/** Días por defecto de "stock estancado" si la fila no trae el parámetro. */
export const DIAS_ESTANCADO_POR_DEFECTO = 60;

export function diasEstancado(parametros: Record<string, unknown>): number {
  const valor = Number(parametros.dias);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : DIAS_ESTANCADO_POR_DEFECTO;
}

// El catálogo manda: siempre se ven las cuatro reglas, tenga o no fila la
// agencia. Que falte la fila significa encendida — igual que del lado del
// servidor, para que el panel no diga una cosa y el cron haga otra.
export async function cargarAutomatizaciones(): Promise<Automatizacion[]> {
  const { data, error } = await supabase
    .from("automatizaciones")
    .select("clave, activa, parametros, ultima_corrida, ultimo_resultado");
  if (error) throw error;

  const filas = new Map((data ?? []).map((f) => [(f as Fila).clave, f as Fila]));
  return CATALOGO.map((ficha) => {
    const fila = filas.get(ficha.clave);
    return {
      ...ficha,
      activa: fila?.activa ?? true,
      parametros: fila?.parametros ?? {},
      ultima_corrida: fila?.ultima_corrida ?? null,
      ultimo_resultado: fila?.ultimo_resultado ?? null,
    };
  });
}

// Upsert por (agencia, clave): si la agencia todavía no tenía la fila, la crea.
// Solo lo deja pasar la policy de admin.
async function guardar(clave: ClaveAutomatizacion, cambios: Partial<Fila>): Promise<void> {
  const agencia_id = await miAgenciaId();
  const { error } = await supabase
    .from("automatizaciones")
    .upsert({ agencia_id, clave, ...cambios }, { onConflict: "agencia_id,clave" });
  if (error) throw error;
}

export async function alternarAutomatizacion(clave: ClaveAutomatizacion, activa: boolean): Promise<void> {
  await guardar(clave, { activa });
}

export async function guardarParametros(
  clave: ClaveAutomatizacion,
  parametros: Record<string, unknown>
): Promise<void> {
  await guardar(clave, { parametros });
}

// ---------- Salud ----------

/**
 * Lo que está pasando de verdad ahora mismo, contado contra las tablas del
 * negocio. `ultima_corrida` dice cuándo trabajó por última vez; esto dice si
 * hay trabajo acumulado, que es lo que uno mira para saber si algo se trabó.
 */
export interface Salud {
  /** Programadas todavía pendientes (agendadas a futuro incluidas). */
  programadasPendientes: number;
  /** Pendientes cuya hora YA pasó: si esto crece, el cron no está corriendo. */
  programadasVencidas: number;
  programadasFallidas: number;
  /** Publicaciones de Instagram que hay que borrar a mano. */
  pendientesRetiro: number;
  /** Leads con la fecha de contacto pasada. */
  seguimientosVencidos: number;
  /** Autos disponibles hace más de N días. */
  autosEstancados: number;
}

export async function cargarSalud(dias: number): Promise<Salud> {
  const ahora = new Date().toISOString();
  const hoy = hoyISO();
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);

  // `head: true` con `count`: cuenta en la base y no baja las filas — de esto
  // solo interesa el número.
  const contar = (consulta: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(consulta).then(({ count, error }) => {
      if (error) throw error;
      return count ?? 0;
    });

  const [
    programadasPendientes,
    programadasVencidas,
    programadasFallidas,
    pendientesRetiro,
    seguimientosVencidos,
    autosEstancados,
  ] = await Promise.all([
    contar(
      supabase.from("publicaciones_programadas").select("id", { count: "exact", head: true }).eq("estado", "pendiente")
    ),
    contar(
      supabase
        .from("publicaciones_programadas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .lte("programada_para", ahora)
    ),
    contar(
      supabase.from("publicaciones_programadas").select("id", { count: "exact", head: true }).eq("estado", "fallida")
    ),
    contar(
      supabase.from("publicaciones_redes").select("id", { count: "exact", head: true }).eq("estado", "pendiente_retiro")
    ),
    contar(
      supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .lt("proximo_contacto", hoy)
        .not("estado_lead", "in", "(ganado,perdido)")
    ),
    contar(
      supabase
        .from("vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("estado", "disponible")
        .lt("creado_en", limite.toISOString())
    ),
  ]);

  return {
    programadasPendientes,
    programadasVencidas,
    programadasFallidas,
    pendientesRetiro,
    seguimientosVencidos,
    autosEstancados,
  };
}
