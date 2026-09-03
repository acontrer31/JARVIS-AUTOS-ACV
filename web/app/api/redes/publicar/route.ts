import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Publica en redes (Facebook Page / Instagram) desde el SERVIDOR — es el único
// lugar que puede tocar el token de la red (secreto). El cliente manda su token
// de Supabase en el header; acá se valida contra el servidor de auth antes de
// publicar nada. Mismo patrón que /api/elevenlabs-signed-url.
//
// Formatos:
//   feed     -> post normal (FB: foto/texto; IG: foto + epígrafe)
//   historia -> IG Stories (foto, sin epígrafe)
//   reel     -> video (FB: Video Reels API en 3 pasos; IG: media_type=REELS)
//
// Credenciales por variables de entorno (demo, un solo tenant):
//   META_PAGE_ID, META_PAGE_TOKEN (obligatorias), IG_USER_ID (opcional),
//   META_GRAPH_VERSION (opcional; por defecto v21.0).

// Los Reels necesitan que Meta procese el video: damos más margen de tiempo.
export const maxDuration = 60;

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;

type Red = "facebook" | "instagram";
type Formato = "feed" | "historia" | "reel";

// ---------- Facebook ----------
async function publicarFacebook(pageId: string, token: string, texto: string, imagenUrl: string | null) {
  const base = imagenUrl ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
  const params = new URLSearchParams({ access_token: token });
  if (imagenUrl) {
    params.set("url", imagenUrl);
    if (texto) params.set("message", texto);
  } else {
    params.set("message", texto);
  }
  const resp = await fetch(base, { method: "POST", body: params });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Facebook respondió ${resp.status}`);
  return data?.id ?? null;
}

// Reel de Facebook: API de Video Reels, subida en 3 fases (start -> upload por
// URL alojada -> finish PUBLISHED).
async function publicarFacebookReel(pageId: string, token: string, texto: string, videoUrl: string) {
  const start = await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: "POST",
    body: new URLSearchParams({ upload_phase: "start", access_token: token }),
  });
  const s = await start.json();
  if (!start.ok || !s?.video_id || !s?.upload_url) {
    throw new Error(s?.error?.message || "Facebook no pudo iniciar la subida del Reel.");
  }

  const up = await fetch(s.upload_url, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
  });
  const upData = await up.json().catch(() => ({}));
  if (!up.ok || upData?.success === false) {
    throw new Error(upData?.debug_info?.message || upData?.error?.message || "Facebook no pudo cargar el video del Reel.");
  }

  const finish = await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: "POST",
    body: new URLSearchParams({
      upload_phase: "finish",
      video_id: s.video_id,
      video_state: "PUBLISHED",
      description: texto || "",
      access_token: token,
    }),
  });
  const f = await finish.json();
  if (!finish.ok) throw new Error(f?.error?.message || "Facebook no pudo publicar el Reel.");
  return s.video_id as string;
}

// ---------- Instagram ----------
async function idInstagram(pageId: string, token: string): Promise<string> {
  const env = process.env.IG_USER_ID;
  if (env) return env;
  const resp = await fetch(`${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
  const data = await resp.json();
  const id = data?.instagram_business_account?.id;
  if (!id) throw new Error("La Página no tiene una cuenta de Instagram Business vinculada.");
  return id;
}

// Espera a que Instagram termine de procesar el contenedor y, si lo rechaza,
// devuelve el motivo REAL (el campo `status`). Sin esto, publicar un contenedor
// fallido devuelve el inútil "Media ID is not available". Acotado en tiempo para
// no pasarnos del límite de la función serverless.
async function esperarContenedor(
  creationId: string,
  token: string,
  intentos: number,
  esperaMs: number
): Promise<{ ok: boolean; detalle?: string }> {
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(
      `${GRAPH}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
    );
    const d = await r.json();
    if (d?.status_code === "FINISHED") return { ok: true };
    if (d?.status_code === "ERROR") {
      return { ok: false, detalle: d?.status || "Instagram rechazó el archivo (no dio detalle)." };
    }
    await new Promise((res) => setTimeout(res, esperaMs));
  }
  return {
    ok: false,
    detalle: "Instagram todavía está procesando el contenido. Esperá un momento y publicá de nuevo.",
  };
}

async function publicarInstagram(
  pageId: string,
  token: string,
  texto: string,
  imagenUrl: string | null,
  videoUrl: string | null,
  formato: Formato
) {
  const igId = await idInstagram(pageId, token);

  // 1) contenedor según formato
  const cont = new URLSearchParams({ access_token: token });
  if (formato === "reel") {
    cont.set("media_type", "REELS");
    cont.set("video_url", videoUrl!);
    if (texto) cont.set("caption", texto);
  } else if (formato === "historia") {
    cont.set("media_type", "STORIES");
    cont.set("image_url", imagenUrl!);
  } else {
    cont.set("image_url", imagenUrl!);
    if (texto) cont.set("caption", texto);
  }

  const r1 = await fetch(`${GRAPH}/${igId}/media`, { method: "POST", body: cont });
  const d1 = await r1.json();
  if (!r1.ok || !d1?.id) throw new Error(d1?.error?.message || `Instagram respondió ${r1.status} al crear el post`);

  // 2) Esperar el procesamiento SIEMPRE (no solo en Reels): si el contenedor
  //    falla (imagen inaccesible, formato rechazado, etc.) acá obtenemos el
  //    motivo real en vez del genérico "Media ID is not available" al publicar.
  //    Las fotos suelen estar listas al instante; el video tarda más.
  const espera =
    formato === "reel"
      ? await esperarContenedor(d1.id, token, 5, 2500)
      : await esperarContenedor(d1.id, token, 3, 1200);
  if (!espera.ok) throw new Error(`Instagram no aceptó el contenido: ${espera.detalle}`);

  // 3) publicar
  const pub = new URLSearchParams({ creation_id: d1.id, access_token: token });
  const r2 = await fetch(`${GRAPH}/${igId}/media_publish`, { method: "POST", body: pub });
  const d2 = await r2.json();
  if (!r2.ok) throw new Error(d2?.error?.message || `Instagram respondió ${r2.status} al publicar`);
  return d2?.id ?? null;
}

export async function POST(request: Request) {
  const pageId = process.env.META_PAGE_ID;
  const pageToken = process.env.META_PAGE_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Faltan variables de Supabase en el servidor." }, { status: 500 });
  }
  if (!pageId || !pageToken) {
    return NextResponse.json(
      { error: "Faltan las credenciales de Meta (META_PAGE_ID / META_PAGE_TOKEN) en el servidor." },
      { status: 500 }
    );
  }

  // Exige sesión válida (igual que el endpoint de la voz).
  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  let cuerpo: { red?: Red; texto?: string; imagen_url?: string | null; video_url?: string | null; formato?: Formato };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const red = cuerpo.red;
  const texto = (cuerpo.texto || "").trim();
  const imagenUrl = cuerpo.imagen_url?.trim() || null;
  const videoUrl = cuerpo.video_url?.trim() || null;
  const formato: Formato =
    cuerpo.formato === "reel" ? "reel" : cuerpo.formato === "historia" ? "historia" : "feed";

  if (red !== "facebook" && red !== "instagram") {
    return NextResponse.json({ error: 'La red debe ser "facebook" o "instagram".' }, { status: 400 });
  }
  if (formato === "reel" && !videoUrl) {
    return NextResponse.json({ error: "El Reel necesita la URL pública de un video." }, { status: 400 });
  }
  if (red === "instagram" && formato !== "reel" && !imagenUrl) {
    return NextResponse.json({ error: "Instagram necesita una imagen (URL pública)." }, { status: 400 });
  }
  if (formato === "feed" && red === "facebook" && !texto && !imagenUrl) {
    return NextResponse.json({ error: "El posteo necesita texto o una imagen." }, { status: 400 });
  }

  try {
    let id: string | null;
    if (red === "facebook") {
      id = formato === "reel"
        ? await publicarFacebookReel(pageId, pageToken, texto, videoUrl!)
        : await publicarFacebook(pageId, pageToken, texto, imagenUrl);
    } else {
      id = await publicarInstagram(pageId, pageToken, texto, imagenUrl, videoUrl, formato);
    }
    return NextResponse.json({ ok: true, red, formato, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo publicar." },
      { status: 502 }
    );
  }
}
