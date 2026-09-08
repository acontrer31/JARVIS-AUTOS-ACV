import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

// Publica las publicaciones programadas que ya vencieron.
//
// Lo llama el cron de Vercel (ver vercel.json). No hay usuario del otro lado,
// así que la autenticación no puede ser el token de sesión: se usa CRON_SECRET,
// que Vercel manda en el header Authorization. Sin ese secreto el endpoint no
// hace nada — si no, cualquiera con la URL podría disparar publicaciones a la
// cuenta real de la agencia.
export const maxDuration = 60;

// Cuántas se procesan por corrida. Con el cron cada 5 minutos alcanza de sobra,
// y acota el tiempo de la función: publicar un Reel puede tardar bastante.
const POR_CORRIDA = 5;

interface Programada {
  id: string;
  agencia_id: string;
  vehiculo_id: string | null;
  red: Red;
  formato: Formato;
  texto: string | null;
  imagen_url: string | null;
  imagen_urls: string[] | null;
  video_url: string | null;
  intentos: number;
}

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pageId = process.env.META_PAGE_ID;
  const pageToken = process.env.META_PAGE_TOKEN;

  if (!secreto) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET en el servidor: el cron queda desactivado a propósito." },
      { status: 500 }
    );
  }
  const encabezado = request.headers.get("authorization") ?? "";
  if (encabezado !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!url || !serviceKey || !pageId || !pageToken) {
    return NextResponse.json({ error: "Falta configuración de Supabase o Meta." }, { status: 500 });
  }

  // Service role: no hay sesión de usuario, y hay que ver las programadas de
  // todas las agencias. La RLS acá no aplica, por eso el endpoint está cerrado
  // con el secreto.
  const admin = createClient(url, serviceKey);

  const { data, error } = await admin
    .from("publicaciones_programadas")
    .select("id, agencia_id, vehiculo_id, red, formato, texto, imagen_url, imagen_urls, video_url, intentos")
    .eq("estado", "pendiente")
    .lte("programada_para", new Date().toISOString())
    .order("programada_para", { ascending: true })
    .limit(POR_CORRIDA);

  if (error) {
    return NextResponse.json({ error: "No se pudieron leer las programadas." }, { status: 500 });
  }

  const pendientes = (data ?? []) as Programada[];

  // Una agencia puede tener apagada la publicación automática desde el módulo
  // Automatización. Se consulta una sola vez por corrida y solo para las
  // agencias que aparecen en esta tanda. Falta la fila = encendida.
  const apagadas = new Set<string>();
  if (pendientes.length) {
    const { data: reglas } = await admin
      .from("automatizaciones")
      .select("agencia_id, activa")
      .eq("clave", "publicar_programadas")
      .in("agencia_id", [...new Set(pendientes.map((p) => p.agencia_id))]);
    for (const r of (reglas ?? []) as { agencia_id: string; activa: boolean }[]) {
      if (!r.activa) apagadas.add(r.agencia_id);
    }
  }

  let publicadas = 0;
  let fallidas = 0;
  let omitidas = 0;
  const agenciasTocadas = new Set<string>();

  for (const p of pendientes) {
    if (apagadas.has(p.agencia_id)) {
      // Se deja pendiente, no se descarta: si el admin vuelve a encender la
      // regla, la publicación sale — atrasada, pero sale. Descartarla acá
      // borraría algo que alguien programó a propósito.
      omitidas++;
      continue;
    }
    agenciasTocadas.add(p.agencia_id);

    // Se marca como publicada ANTES de intentar, condicionado a que siga
    // pendiente. Si dos corridas del cron se pisan, la segunda no encuentra la
    // fila y no vuelve a publicar: es preferible perder una publicación a
    // publicarla dos veces en la cuenta real de la agencia.
    const { data: tomada, error: errorTomar } = await admin
      .from("publicaciones_programadas")
      .update({ estado: "publicada", intentos: p.intentos + 1, publicada_en: new Date().toISOString() })
      .eq("id", p.id)
      .eq("estado", "pendiente")
      .select("id");
    if (errorTomar || !tomada?.length) continue;

    try {
      const texto = p.texto ?? "";
      const imagenes = p.imagen_urls ?? [];
      let postId: string | null;

      if (p.red === "facebook") {
        postId =
          p.formato === "reel"
            ? await publicarFacebookReel(pageId, pageToken, texto, p.video_url!)
            : p.formato === "carrusel"
              ? await publicarFacebookCarrusel(pageId, pageToken, texto, imagenes)
              : await publicarFacebook(pageId, pageToken, texto, p.imagen_url);
      } else if (p.formato === "carrusel") {
        const igId = await idInstagram(pageId, pageToken);
        postId = await publicarInstagramCarrusel(igId, pageToken, texto, imagenes);
      } else {
        postId = await publicarInstagram(pageId, pageToken, texto, p.imagen_url, p.video_url, p.formato);
      }

      await admin.from("publicaciones_programadas").update({ post_id: postId }).eq("id", p.id);

      // Queda en el historial, igual que una publicación hecha a mano: es lo
      // que permite retirarla sola cuando el auto se venda.
      await admin.from("publicaciones_redes").insert({
        agencia_id: p.agencia_id,
        vehiculo_id: p.vehiculo_id,
        red: p.red,
        formato: p.formato,
        post_id: postId,
      });
      publicadas++;
    } catch (err) {
      // Vuelve a pendiente para que el próximo cron la reintente, con el motivo
      // guardado. A los 3 intentos se da por fallida y deja de molestar.
      const seRinde = p.intentos + 1 >= 3;
      await admin
        .from("publicaciones_programadas")
        .update({
          estado: seRinde ? "fallida" : "pendiente",
          publicada_en: null,
          error: err instanceof Error ? err.message : "Error desconocido al publicar.",
        })
        .eq("id", p.id);
      fallidas++;
    }
  }

  // Solo se anota la corrida de las agencias que efectivamente tenían algo que
  // publicar. Marcar a todas cada 5 minutos sería escribir de más para decir
  // "no hice nada", y en el panel `ultima_corrida` significa justamente la
  // última vez que esta regla trabajó.
  for (const agencia_id of agenciasTocadas) {
    await admin.from("automatizaciones").upsert(
      {
        agencia_id,
        clave: "publicar_programadas",
        ultima_corrida: new Date().toISOString(),
        ultimo_resultado: `${publicadas} publicada${publicadas === 1 ? "" : "s"} · ${fallidas} con error`,
      },
      { onConflict: "agencia_id,clave" }
    );
  }

  return NextResponse.json({ ok: true, revisadas: pendientes.length, publicadas, fallidas, omitidas });
}
