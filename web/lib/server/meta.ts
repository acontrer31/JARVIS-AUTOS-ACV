// Publicación en Meta (Facebook + Instagram). SOLO servidor: usa META_PAGE_TOKEN.
//
// Vive acá y no dentro de una ruta porque hay dos que publican: la que dispara
// el usuario (/api/redes/publicar) y la que dispara el cron de las programadas
// (/api/redes/cron). Si cada una tuviera su copia, tarde o temprano se
// separarían y una publicaría distinto que la otra.

export type Red = "facebook" | "instagram";
export type Formato = "feed" | "historia" | "reel" | "carrusel";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;


// ---------- Facebook ----------
export async function publicarFacebook(pageId: string, token: string, texto: string, imagenUrl: string | null) {
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

// Carrusel de Facebook: no hay un endpoint "carrusel". Se suben las fotos sin
// publicar (published=false), y después se crea UN post del feed que las
// adjunta a todas. Facebook lo muestra como galería.
export async function publicarFacebookCarrusel(
  pageId: string,
  token: string,
  texto: string,
  imagenes: string[]
) {
  // 1) Cada foto, subida pero sin publicar: devuelve el id que se adjunta luego.
  const ids: string[] = [];
  for (const url of imagenes) {
    const p = new URLSearchParams({ access_token: token, url, published: "false" });
    const r = await fetch(`${GRAPH}/${pageId}/photos`, { method: "POST", body: p });
    const d = await r.json();
    if (!r.ok || !d?.id) {
      throw new Error(d?.error?.message || `Facebook rechazó una de las fotos (${r.status}).`);
    }
    ids.push(d.id);
  }

  // 2) Un solo post del feed con todas adjuntas.
  const post = new URLSearchParams({ access_token: token });
  if (texto) post.set("message", texto);
  ids.forEach((id, i) => post.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));

  const r = await fetch(`${GRAPH}/${pageId}/feed`, { method: "POST", body: post });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Facebook respondió ${r.status} al armar el carrusel`);
  return d?.id ?? null;
}

// Reel de Facebook: API de Video Reels, subida en 3 fases (start -> upload por
// URL alojada -> finish PUBLISHED).
export async function publicarFacebookReel(pageId: string, token: string, texto: string, videoUrl: string) {
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
export async function idInstagram(pageId: string, token: string): Promise<string> {
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

// Carrusel de Instagram: tres pasos. Cada foto es un "item" del carrusel, y
// después se crea un contenedor CAROUSEL que las agrupa. Instagram acepta
// entre 2 y 10.
export async function publicarInstagramCarrusel(
  igId: string,
  token: string,
  texto: string,
  imagenes: string[]
) {
  // 1) Un contenedor por foto, marcado como item de carrusel.
  const hijos: string[] = [];
  for (const url of imagenes) {
    const p = new URLSearchParams({
      access_token: token,
      image_url: url,
      is_carousel_item: "true",
    });
    const r = await fetch(`${GRAPH}/${igId}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (!r.ok || !d?.id) {
      throw new Error(d?.error?.message || `Instagram rechazó una de las fotos (${r.status}).`);
    }
    // Se espera foto por foto: si una falla, el motivo aparece acá y no como el
    // inútil "Media ID is not available" al publicar el carrusel entero.
    const listo = await esperarContenedor(d.id, token, 3, 1200);
    if (!listo.ok) throw new Error(`Instagram no aceptó una de las fotos: ${listo.detalle}`);
    hijos.push(d.id);
  }

  // 2) El contenedor del carrusel, que agrupa a los hijos.
  const cont = new URLSearchParams({
    access_token: token,
    media_type: "CAROUSEL",
    children: hijos.join(","),
  });
  if (texto) cont.set("caption", texto);
  const r1 = await fetch(`${GRAPH}/${igId}/media`, { method: "POST", body: cont });
  const d1 = await r1.json();
  if (!r1.ok || !d1?.id) {
    throw new Error(d1?.error?.message || `Instagram respondió ${r1.status} al armar el carrusel`);
  }
  const espera = await esperarContenedor(d1.id, token, 4, 1500);
  if (!espera.ok) throw new Error(`Instagram no aceptó el carrusel: ${espera.detalle}`);

  // 3) Publicar.
  const r2 = await fetch(`${GRAPH}/${igId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: d1.id, access_token: token }),
  });
  const d2 = await r2.json();
  if (!r2.ok) throw new Error(d2?.error?.message || `Instagram respondió ${r2.status} al publicar el carrusel`);
  return d2?.id ?? null;
}

export async function publicarInstagram(
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
    // Una historia puede ser foto o video; si vino video, manda el video.
    cont.set("media_type", "STORIES");
    if (videoUrl) cont.set("video_url", videoUrl);
    else cont.set("image_url", imagenUrl!);
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
  const llevaVideo = formato === "reel" || (formato === "historia" && !!videoUrl);
  const espera = llevaVideo
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
