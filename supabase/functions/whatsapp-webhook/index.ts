// ============================================================
// JARVIS · Webhook de WhatsApp (Meta Cloud API) → memoria de clientes
// ============================================================
// Recibe los mensajes que los clientes le mandan al WhatsApp de la agencia
// (WhatsApp Cloud API → Configuration → Webhooks) y los guarda en JARVIS:
// busca o crea el cliente por su teléfono e inserta una interacción
// `tipo = 'whatsapp'`, para que cada mensaje entre solo al CRM en vez de
// perderse en el chat del celular.
//
// A diferencia del webhook de ElevenLabs, acá SÍ se verifica la firma del
// mensaje (X-Hub-Signature-256), porque el mecanismo de WhatsApp está
// documentado y es estándar. Sin esa verificación cualquiera podría
// falsear mensajes entrantes.
//
// Secretos (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  → los pone Supabase solo.
//   WHATSAPP_VERIFY_TOKEN  → palabra secreta que elegís vos; la misma que
//                            cargás en Meta al configurar el webhook.
//   WHATSAPP_APP_SECRET    → "App Secret" de tu app en Meta for Developers.
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
// (el --no-verify-jwt es necesario: Meta no manda un JWT de Supabase).
// Setup completo de Meta: ver README.md, sección "WhatsApp: recibir mensajes".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Verifica la firma HMAC-SHA256 que Meta manda en X-Hub-Signature-256.
// Devuelve true solo si coincide con el cuerpo crudo firmado con el App Secret.
async function firmaValida(crudo: string, encabezado: string | null): Promise<boolean> {
  if (!APP_SECRET) return false; // sin secreto no se puede verificar → se rechaza
  if (!encabezado || !encabezado.startsWith("sha256=")) return false;
  const esperado = encabezado.slice("sha256=".length);

  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(crudo));
  const calculado = Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparación de tiempo constante para no filtrar info por el tiempo de respuesta.
  if (calculado.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < calculado.length; i++) {
    diferencia |= calculado.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}

// De la estructura de Meta saca lo que nos importa. Puede venir sin mensajes
// (por ejemplo, avisos de estado de entrega), en cuyo caso devolvemos null.
interface MensajeEntrante {
  telefono: string;
  texto: string;
  phoneNumberId: string;
  nombrePerfil: string | null;
}

function extraerMensaje(body: any): MensajeEntrante | null {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = value?.messages?.[0];
  if (!mensaje) return null;

  const telefono = mensaje.from;
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!telefono || !phoneNumberId) return null;

  // Los mensajes de texto traen el cuerpo en text.body. Otros tipos
  // (imagen, audio, ubicación) no tienen texto plano: se registran con una
  // etiqueta para no perder que hubo contacto, y el payload crudo queda igual.
  const texto =
    typeof mensaje.text?.body === "string" && mensaje.text.body.trim()
      ? mensaje.text.body.trim()
      : `[mensaje de ${mensaje.type ?? "tipo desconocido"} sin texto]`;

  const nombrePerfil = value?.contacts?.[0]?.profile?.name ?? null;

  return { telefono, texto, phoneNumberId, nombrePerfil };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Verificación del webhook (Meta hace un GET una sola vez al configurarlo) ---
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("Verificación fallida.", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido.", { status: 405 });
  }

  // Se lee el cuerpo CRUDO (texto exacto) porque la firma se calcula sobre él;
  // parsear primero y re-serializar cambiaría bytes y rompería la verificación.
  const crudo = await req.text();
  if (!(await firmaValida(crudo, req.headers.get("x-hub-signature-256")))) {
    return new Response("Firma inválida.", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(crudo);
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }

  const msg = extraerMensaje(body);
  // 200 igual: Meta reintenta si no recibe 200, y un evento sin mensaje
  // (estado de entrega, etc.) no es un error — simplemente no hay nada que guardar.
  if (!msg) return new Response("ok (sin mensaje)", { status: 200 });

  try {
    // 1) La agencia se resuelve por el número de destino, no se cablea a ninguna.
    const { data: agencia } = await supabase
      .from("agencias")
      .select("id")
      .eq("whatsapp_phone_number_id", msg.phoneNumberId)
      .single();
    if (!agencia) {
      // Número no asociado a ninguna agencia: se responde 200 para que Meta no
      // reintente en loop, pero se deja constancia en los logs.
      console.warn(`phone_number_id ${msg.phoneNumberId} sin agencia asociada.`);
      return new Response("ok (agencia no encontrada)", { status: 200 });
    }

    // 2) Cliente por teléfono dentro de esa agencia; si no existe, se crea.
    let clienteId: string | null = null;
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("agencia_id", agencia.id)
      .eq("telefono", msg.telefono)
      .maybeSingle();

    if (existente) {
      clienteId = existente.id;
    } else {
      const { data: creado, error: errorCliente } = await supabase
        .from("clientes")
        .insert({
          agencia_id: agencia.id,
          nombre: msg.nombrePerfil || `WhatsApp ${msg.telefono}`,
          telefono: msg.telefono,
        })
        .select("id")
        .single();
      if (errorCliente) throw errorCliente;
      clienteId = creado.id;
    }

    // 3) La interacción: el texto como resumen, el payload crudo en datos_origen.
    const { error: errorInteraccion } = await supabase.from("interacciones").insert({
      agencia_id: agencia.id,
      cliente_id: clienteId,
      tipo: "whatsapp",
      resumen: msg.texto,
      datos_origen: body,
    });
    if (errorInteraccion) throw errorInteraccion;

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Error guardando el mensaje de WhatsApp:", error);
    return new Response("Error interno.", { status: 500 });
  }
});
