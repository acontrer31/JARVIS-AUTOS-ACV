import { NextResponse } from "next/server";
import {
  demasiadasRequests,
  dentroDelLimite,
  esDelTenantConCredenciales,
  esError,
  identificar,
} from "@/lib/server/sesion";

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

import {
  idInstagram,
  publicarFacebook,
  publicarFacebookCarrusel,
  publicarFacebookReel,
  publicarInstagram,
  publicarInstagramCarrusel,
  type Formato,
  type Red,
} from "@/lib/server/meta";

export async function POST(request: Request) {
  const pageId = process.env.META_PAGE_ID;
  const pageToken = process.env.META_PAGE_TOKEN;

  if (!pageId || !pageToken) {
    return NextResponse.json(
      { error: "Faltan las credenciales de Meta (META_PAGE_ID / META_PAGE_TOKEN) en el servidor." },
      { status: 500 }
    );
  }

  // Sesión + agencia + rol. Hasta la auditoría de septiembre de 2026 acá solo
  // se validaba el token, y eso era el agujero: las credenciales de Meta son
  // una sola cuenta para todo el despliegue, así que CUALQUIER usuario logueado
  // —de cualquier agencia, con cualquier rol— podía publicar el texto y la
  // imagen que quisiera en el Facebook e Instagram reales de la agencia.
  const identidad = await identificar(request);
  if (esError(identidad)) return identidad.error;
  const { llamante, admin } = identidad;

  const propietaria = await esDelTenantConCredenciales(admin, llamante);
  if ("error" in propietaria) return propietaria.error;

  // Publicar sale a una cuenta pública real: si algo se descontrola, se
  // descontrola a la vista de los clientes. Diez por usuario cada diez minutos
  // es holgado para trabajar y corta un bucle.
  if (!(await dentroDelLimite(admin, `publicar:${llamante.usuarioId}`, 10, 600))) {
    return demasiadasRequests(600);
  }

  let cuerpo: {
    red?: Red;
    texto?: string;
    imagen_url?: string | null;
    imagen_urls?: string[] | null;
    video_url?: string | null;
    formato?: Formato;
  };
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
    cuerpo.formato === "reel"
      ? "reel"
      : cuerpo.formato === "historia"
        ? "historia"
        : cuerpo.formato === "carrusel"
          ? "carrusel"
          : "feed";
  // Las fotos del carrusel, limpias y sin repetidas: mandar dos veces la misma
  // hace que Instagram rechace el contenedor entero.
  const imagenes = [...new Set((cuerpo.imagen_urls ?? []).map((u) => (u || "").trim()).filter(Boolean))];

  if (red !== "facebook" && red !== "instagram") {
    return NextResponse.json({ error: 'La red debe ser "facebook" o "instagram".' }, { status: 400 });
  }
  // Instagram acepta entre 2 y 10 fotos por carrusel; Facebook no marca un tope
  // publicado, así que se le aplica el mismo criterio para que las dos redes se
  // comporten igual y nadie arme un carrusel de 30 que después falle.
  if (formato === "carrusel") {
    if (imagenes.length < 2) {
      return NextResponse.json(
        { error: "Un carrusel necesita al menos 2 fotos distintas." },
        { status: 400 }
      );
    }
    if (imagenes.length > 10) {
      return NextResponse.json(
        { error: "Un carrusel admite hasta 10 fotos." },
        { status: 400 }
      );
    }
  }
  if (formato === "reel" && !videoUrl) {
    return NextResponse.json({ error: "El Reel necesita la URL pública de un video." }, { status: 400 });
  }
  if (red === "instagram" && formato === "feed" && !imagenUrl) {
    return NextResponse.json({ error: "El post de Instagram necesita una imagen (URL pública)." }, { status: 400 });
  }
  if (red === "instagram" && formato === "historia" && !imagenUrl && !videoUrl) {
    return NextResponse.json({ error: "La historia necesita una imagen o un video." }, { status: 400 });
  }
  if (formato === "feed" && red === "facebook" && !texto && !imagenUrl) {
    return NextResponse.json({ error: "El posteo necesita texto o una imagen." }, { status: 400 });
  }

  try {
    let id: string | null;
    if (red === "facebook") {
      id =
        formato === "reel"
          ? await publicarFacebookReel(pageId, pageToken, texto, videoUrl!)
          : formato === "carrusel"
            ? await publicarFacebookCarrusel(pageId, pageToken, texto, imagenes)
            : await publicarFacebook(pageId, pageToken, texto, imagenUrl);
    } else if (formato === "carrusel") {
      const igId = await idInstagram(pageId, pageToken);
      id = await publicarInstagramCarrusel(igId, pageToken, texto, imagenes);
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
