import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Catálogo público de una agencia, para que el sitio web oficial lo lea.
//
// POR QUÉ UN ENDPOINT Y NO UNA POLICY PÚBLICA EN `vehiculos`:
// abrirle `select` a `anon` sobre la tabla dejaría ver TODAS las columnas de
// TODAS las filas — notas internas, el dominio (la patente), los borradores y
// los autos ya vendidos. Acá se elige explícitamente qué sale y qué no, y la
// RLS queda intacta para el resto del sistema.
//
// LA REGLA DE NEGOCIO: el catálogo son los autos `disponible` y `reservado`.
// Nada más. Por eso marcar un auto como vendido en JARVIS lo saca del sitio
// solo, sin que nadie tenga que acordarse de borrarlo — que es justamente lo
// que hoy se hace a mano y se olvida.

export const dynamic = "force-dynamic";

// Solo lo que puede estar a la vista de cualquiera. Faltan a propósito:
//   dominio            → es la patente; no se publica.
//   notas              → son internas, escritas para el equipo.
//   valor_tabla_dnrpa  → dato de cálculo interno.
//   costo_interno      → ni figura: vive en otra tabla, solo-admin.
const CAMPOS_PUBLICOS =
  "id, marca, modelo, version, anio, km, es_cero, precio, condicion, " +
  "motor, caja, traccion, carroceria, specs, destacado, estado";

const ESTADOS_PUBLICABLES = ["disponible", "reservado"];

// El sitio vive en otro dominio, así que sin CORS el navegador bloquea la
// lectura. Es un catálogo público: no hay nada que restringir por origen, y
// atarlo a un dominio rompería el día que la agencia cambie de sitio.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface FotoFila {
  vehiculo_id: string;
  url: string;
  orden: number;
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Falta configuración de Supabase." }, { status: 500, headers: CORS });
  }

  const agencia = new URL(request.url).searchParams.get("agencia");
  if (!agencia) {
    return NextResponse.json(
      { error: "Falta el parámetro `agencia` (el id de la agencia)." },
      { status: 400, headers: CORS }
    );
  }

  // Service role porque del otro lado no hay sesión: es una página pública. El
  // filtro por agencia y por estado lo pone este código, y son las dos únicas
  // cosas que salen — por eso la consulta está escrita con la lista de campos
  // explícita y no con `select("*")`, que mañana filtraría una columna nueva
  // sin que nadie lo note.
  const admin = createClient(url, serviceKey);

  const { data, error } = await admin
    .from("vehiculos")
    .select(CAMPOS_PUBLICOS)
    .eq("agencia_id", agencia)
    .in("estado", ESTADOS_PUBLICABLES)
    .order("destacado", { ascending: false })
    .order("precio", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "No se pudo leer el catálogo." }, { status: 500, headers: CORS });
  }

  const vehiculos = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = vehiculos.map((v) => v.id as string);

  // Las fotos en una sola consulta y no una por auto: con treinta vehículos
  // serían treinta viajes a la base por cada visita al catálogo.
  const porVehiculo = new Map<string, string[]>();
  if (ids.length) {
    const { data: fotos } = await admin
      .from("vehiculo_media")
      .select("vehiculo_id, url, orden")
      .in("vehiculo_id", ids)
      .eq("tipo", "foto")
      .order("orden");
    for (const f of (fotos ?? []) as unknown as FotoFila[]) {
      const lista = porVehiculo.get(f.vehiculo_id) ?? [];
      lista.push(f.url);
      porVehiculo.set(f.vehiculo_id, lista);
    }
  }

  const salida = vehiculos.map((v) => ({
    ...v,
    titulo: [v.marca, v.modelo, v.version].filter(Boolean).join(" "),
    fotos: porVehiculo.get(v.id as string) ?? [],
  }));

  return NextResponse.json(
    { ok: true, actualizado: new Date().toISOString(), total: salida.length, vehiculos: salida },
    {
      headers: {
        ...CORS,
        // Un minuto de caché en el borde: el catálogo de una agencia no cambia
        // cada segundo, y sin esto cada visita al sitio pega en la base. Con
        // `stale-while-revalidate` el visitante nunca espera: recibe la copia
        // guardada mientras se refresca por detrás.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
