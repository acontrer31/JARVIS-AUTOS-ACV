import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Retira de las redes las publicaciones de un vehículo (se llama cuando el auto
// pasa a "vendido"). Facebook se borra por API; Instagram/TikTok no se pueden
// borrar por código, así que quedan marcadas como "pendiente_retiro" (con su
// permalink para borrarlas a mano). Siempre guarda un snapshot de métricas
// antes, para el historial. Token de Meta solo en el servidor.

export const maxDuration = 60;

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;

// Snapshot de métricas de un post de Facebook (best-effort).
async function metricasFacebook(postId: string, token: string): Promise<Record<string, number> | null> {
  try {
    const r = await fetch(
      `${GRAPH}/${postId}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0),shares&access_token=${encodeURIComponent(token)}`
    );
    const d = await r.json();
    if (!r.ok) return null;
    return {
      likes: d?.likes?.summary?.total_count ?? 0,
      comentarios: d?.comments?.summary?.total_count ?? 0,
      compartidos: d?.shares?.count ?? 0,
    };
  } catch {
    return null;
  }
}

// Permalink + métricas básicas de un media de Instagram (para el link de retiro
// manual y el historial).
async function datosInstagram(mediaId: string, token: string): Promise<{ url: string | null; metricas: Record<string, number> | null }> {
  try {
    const r = await fetch(
      `${GRAPH}/${mediaId}?fields=permalink,like_count,comments_count&access_token=${encodeURIComponent(token)}`
    );
    const d = await r.json();
    if (!r.ok) return { url: null, metricas: null };
    return {
      url: d?.permalink ?? null,
      metricas: { likes: d?.like_count ?? 0, comentarios: d?.comments_count ?? 0 },
    };
  } catch {
    return { url: null, metricas: null };
  }
}

export async function POST(request: Request) {
  const pageToken = process.env.META_PAGE_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Faltan variables de Supabase en el servidor." }, { status: 500 });
  }

  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });

  // Cliente con el token del usuario → las consultas respetan la RLS (solo ve/
  // toca las publicaciones de su agencia).
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  let cuerpo: { vehiculo_id?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const vehiculoId = cuerpo.vehiculo_id;
  if (!vehiculoId) return NextResponse.json({ error: "Falta vehiculo_id." }, { status: 400 });

  const { data: pubs, error } = await supabase
    .from("publicaciones_redes")
    .select("id, red, formato, post_id")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "publicada");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let facebookBorradas = 0;
  let pendientes = 0;
  const ahora = new Date().toISOString();

  for (const p of pubs ?? []) {
    const postId = (p as { post_id: string | null }).post_id;
    const red = (p as { red: string }).red;
    const id = (p as { id: string }).id;

    if (red === "facebook" && postId && pageToken) {
      const metricas = await metricasFacebook(postId, pageToken);
      try {
        await fetch(`${GRAPH}/${postId}?access_token=${encodeURIComponent(pageToken)}`, { method: "DELETE" });
      } catch {}
      await supabase
        .from("publicaciones_redes")
        .update({ estado: "eliminada", eliminado_en: ahora, metricas })
        .eq("id", id);
      facebookBorradas += 1;
    } else {
      // Instagram / TikTok: no se pueden borrar por API → pendiente de retiro
      // manual, con permalink y métricas para el historial.
      let url: string | null = null;
      let metricas: Record<string, number> | null = null;
      if (red === "instagram" && postId && pageToken) {
        const d = await datosInstagram(postId, pageToken);
        url = d.url;
        metricas = d.metricas;
      }
      await supabase
        .from("publicaciones_redes")
        .update({ estado: "pendiente_retiro", eliminado_en: ahora, url, metricas })
        .eq("id", id);
      pendientes += 1;
    }
  }

  return NextResponse.json({ ok: true, facebook_borradas: facebookBorradas, pendientes });
}
