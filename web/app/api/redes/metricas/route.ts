import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { datosInstagram, metricasFacebook } from "@/lib/server/meta";

// Refresca los contadores de las publicaciones que siguen vivas.
//
// Hasta ahora las métricas solo se guardaban en el momento del retiro, o sea
// justo cuando el auto ya se vendió: servían para el historial pero no para
// decidir nada. Esto las trae mientras el aviso está publicado, que es cuando
// mirarlas cambia algo (bajar el precio, repostear, cambiar la foto).
//
// Lo dispara el usuario desde el módulo Marketing, así que se autentica con su
// sesión y la RLS acota a su agencia. El token de Meta no sale del servidor.
export const maxDuration = 60;

// Tope por llamada: cada publicación es un viaje a la API de Meta y la función
// tiene 60 segundos. El módulo pide de a tandas.
const POR_LLAMADA = 25;

export async function POST(request: Request) {
  const pageToken = process.env.META_PAGE_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Faltan variables de Supabase en el servidor." }, { status: 500 });
  }
  if (!pageToken) {
    return NextResponse.json({ error: "Falta META_PAGE_TOKEN en el servidor." }, { status: 500 });
  }

  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  // Las más viejas primero: son las que tienen los números más desactualizados.
  const { data, error } = await supabase
    .from("publicaciones_redes")
    .select("id, red, post_id, metricas_actualizadas_en")
    .eq("estado", "publicada")
    .not("post_id", "is", null)
    .order("metricas_actualizadas_en", { ascending: true, nullsFirst: true })
    .limit(POR_LLAMADA);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicaciones = (data ?? []) as { id: string; red: string; post_id: string }[];
  let actualizadas = 0;
  let sinDatos = 0;
  const ahora = new Date().toISOString();

  for (const p of publicaciones) {
    let metricas: Record<string, number> | null = null;
    let url: string | null = null;

    if (p.red === "facebook") {
      metricas = await metricasFacebook(p.post_id, pageToken);
    } else if (p.red === "instagram") {
      const d = await datosInstagram(p.post_id, pageToken);
      metricas = d.metricas;
      url = d.url;
    }

    if (!metricas) {
      // Meta no contestó, o el posteo se borró desde la app. No se pisa el
      // último número bueno con un cero que sería mentira; solo se anota que se
      // intentó, para que la próxima tanda pase a otras.
      await supabase
        .from("publicaciones_redes")
        .update({ metricas_actualizadas_en: ahora })
        .eq("id", p.id);
      sinDatos++;
      continue;
    }

    await supabase
      .from("publicaciones_redes")
      .update({ metricas, metricas_actualizadas_en: ahora, ...(url ? { url } : {}) })
      .eq("id", p.id);
    actualizadas++;
  }

  return NextResponse.json({ ok: true, revisadas: publicaciones.length, actualizadas, sin_datos: sinDatos });
}
