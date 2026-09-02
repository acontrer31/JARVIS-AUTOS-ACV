import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Publica en redes (Facebook Page / Instagram) desde el SERVIDOR — es el único
// lugar que puede tocar el token de la red (secreto). El cliente manda su token
// de Supabase en el header; acá se valida contra el servidor de auth antes de
// publicar nada. Mismo patrón que /api/elevenlabs-signed-url.
//
// Credenciales por variables de entorno (demo, un solo tenant):
//   META_PAGE_ID     -> ID de la Página de Facebook
//   META_PAGE_TOKEN  -> Page Access Token de larga duración (SECRETO)
//   IG_USER_ID       -> (opcional) ID de la cuenta de Instagram Business;
//                       si falta, se deriva de la Página en tiempo real.
//   META_GRAPH_VERSION -> (opcional) por defecto v21.0
//
// A futuro (multi-tenant) esto se reemplaza por una tabla `redes_sociales`
// leída con service role; el resto del flujo queda igual.

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;

type Red = "facebook" | "instagram";
type FormatoIG = "feed" | "historia";

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

async function idInstagram(pageId: string, token: string): Promise<string> {
  const env = process.env.IG_USER_ID;
  if (env) return env;
  const resp = await fetch(`${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
  const data = await resp.json();
  const id = data?.instagram_business_account?.id;
  if (!id) throw new Error("La Página no tiene una cuenta de Instagram Business vinculada.");
  return id;
}

async function publicarInstagram(
  pageId: string,
  token: string,
  texto: string,
  imagenUrl: string,
  formato: FormatoIG
) {
  const igId = await idInstagram(pageId, token);
  // 1) contenedor. Una historia lleva media_type=STORIES y no usa epígrafe
  //    (Instagram lo ignora); un post normal (feed) sí lleva caption.
  const cont = new URLSearchParams({ image_url: imagenUrl, access_token: token });
  if (formato === "historia") {
    cont.set("media_type", "STORIES");
  } else if (texto) {
    cont.set("caption", texto);
  }
  const r1 = await fetch(`${GRAPH}/${igId}/media`, { method: "POST", body: cont });
  const d1 = await r1.json();
  if (!r1.ok) throw new Error(d1?.error?.message || `Instagram respondió ${r1.status} al crear el post`);
  // 2) publicar
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

  let cuerpo: { red?: Red; texto?: string; imagen_url?: string | null; formato?: FormatoIG };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const red = cuerpo.red;
  const texto = (cuerpo.texto || "").trim();
  const imagenUrl = cuerpo.imagen_url?.trim() || null;
  const formato: FormatoIG = cuerpo.formato === "historia" ? "historia" : "feed";

  if (red !== "facebook" && red !== "instagram") {
    return NextResponse.json({ error: 'La red debe ser "facebook" o "instagram".' }, { status: 400 });
  }
  if (red === "instagram" && !imagenUrl) {
    return NextResponse.json({ error: "Instagram necesita una imagen (URL pública)." }, { status: 400 });
  }
  if (!texto && !imagenUrl) {
    return NextResponse.json({ error: "El posteo necesita texto o una imagen." }, { status: 400 });
  }

  try {
    const id =
      red === "facebook"
        ? await publicarFacebook(pageId, pageToken, texto, imagenUrl)
        : await publicarInstagram(pageId, pageToken, texto, imagenUrl!, formato);
    return NextResponse.json({ ok: true, red, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo publicar." },
      { status: 502 }
    );
  }
}
