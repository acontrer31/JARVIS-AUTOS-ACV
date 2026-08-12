// ============================================================
// JARVIS · Webhook de ElevenLabs → memoria de conversaciones
// ============================================================
// Recibe el aviso de "conversación terminada" que manda ElevenLabs
// (Conversational AI → tu agente → Webhooks) y guarda un resumen en
// public.interacciones, para que cada charla por voz con JARVIS quede
// en la misma memoria que el resto de las operaciones del negocio.
//
// Importante — no verificado en vivo: no tuve acceso a la documentación
// de ElevenLabs desde este entorno de desarrollo (dominio bloqueado toda
// la sesión), así que:
//  - La autenticación es un secreto compartido por query string
//    (?token=...), no la firma HMAC que ElevenLabs pueda mandar en un
//    header. Es una capa de seguridad real, pero si ElevenLabs firma sus
//    webhooks (probable), conviene sumar esa verificación después.
//  - La forma exacta del payload puede variar. Esta función prueba varias
//    rutas típicas (summary, transcript, agent_id) y guarda igual el
//    payload completo en `datos_origen` para nunca perder información,
//    aunque la extracción automática falle.
//
// Deploy: supabase functions deploy elevenlabs-webhook --no-verify-jwt
// Configuración: ver README.md, sección "Captura automática de voz".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function primeraCadenaNoVacia(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// El payload real de ElevenLabs puede tener el resumen y el agent_id en
// distintos niveles de anidamiento según la versión/tipo de evento.
// Probamos las rutas más plausibles sin asumir una única forma fija.
function extraerResumen(body: any): string | null {
  const directo = primeraCadenaNoVacia(
    body?.summary,
    body?.transcript_summary,
    body?.conversation_summary,
    body?.data?.summary,
    body?.data?.transcript_summary,
    body?.analysis?.summary,
    body?.analysis?.transcript_summary,
  );
  if (directo) return directo;

  // Sin resumen armado: reconstruimos uno básico a partir del transcript
  // (lista de turnos {role, message} o {speaker, text}, según la versión).
  const transcript = body?.transcript || body?.data?.transcript;
  if (Array.isArray(transcript) && transcript.length) {
    const texto = transcript
      .map((turno: any) => {
        const quien = turno.role || turno.speaker || "?";
        const msg = turno.message || turno.text || "";
        return msg ? `${quien}: ${msg}` : null;
      })
      .filter(Boolean)
      .join(" · ");
    if (texto) return texto.slice(0, 4000);
  }
  return null;
}

function extraerAgentId(body: any): string | null {
  return primeraCadenaNoVacia(
    body?.agent_id,
    body?.data?.agent_id,
    body?.conversation_initiation_client_data?.agent_id,
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (WEBHOOK_SECRET) {
    const token = new URL(req.url).searchParams.get("token");
    if (token !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const agentId = extraerAgentId(body);
  if (!agentId) {
    return new Response("Falta agent_id en el payload", { status: 400 });
  }

  const { data: agencia, error: errorAgencia } = await supabase
    .from("agencias")
    .select("id")
    .eq("elevenlabs_agent_id", agentId)
    .maybeSingle();

  if (errorAgencia) {
    console.error("Error buscando agencia:", errorAgencia);
    return new Response("Error interno", { status: 500 });
  }
  if (!agencia) {
    // El agente no está vinculado a ninguna agencia (elevenlabs_agent_id en
    // la tabla agencias) — no hay dónde guardar la interacción.
    return new Response("Agencia no encontrada para ese agent_id", { status: 404 });
  }

  const resumen = extraerResumen(body) ?? "Conversación de voz con JARVIS (sin resumen disponible).";

  const { error: errorInsert } = await supabase.from("interacciones").insert({
    agencia_id: agencia.id,
    cliente_id: null,
    tipo: "voz_jarvis",
    resumen,
    datos_origen: body,
  });

  if (errorInsert) {
    console.error("Error guardando interacción:", errorInsert);
    return new Response("Error interno", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
