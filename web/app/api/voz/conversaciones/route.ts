import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Historial de conversaciones del agente de voz.
//
// Pasa por acá y no directo desde el navegador porque ELEVENLABS_API_KEY es
// server-only: es la misma llave que puede gastar créditos de la cuenta. El
// cliente manda su token de Supabase, se valida, y recién ahí se consulta.
//
// Sin `?id` devuelve la lista; con `?id` devuelve la transcripción de esa
// conversación.
export const maxDuration = 30;

const API = "https://api.elevenlabs.io/v1/convai";

interface FilaEL {
  conversation_id?: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  message_count?: number;
  status?: string;
  call_successful?: string;
}

interface MensajeEL {
  role?: string;
  message?: string | null;
}

export async function GET(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Faltan variables de Supabase en el servidor." }, { status: 500 });
  }

  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  // Falta de configuración no es un error del usuario: se contesta 200 con el
  // motivo para que el panel lo explique en vez de mostrar una pantalla rota.
  if (!apiKey || !agentId) {
    return NextResponse.json({
      configurado: false,
      motivo: !agentId
        ? "Falta NEXT_PUBLIC_ELEVENLABS_AGENT_ID: no hay agente configurado."
        : "Falta ELEVENLABS_API_KEY en el servidor.",
      conversaciones: [],
    });
  }

  const id = new URL(request.url).searchParams.get("id");

  try {
    if (id) {
      const r = await fetch(`${API}/conversations/${encodeURIComponent(id)}`, {
        headers: { "xi-api-key": apiKey },
      });
      if (!r.ok) {
        return NextResponse.json(
          { error: `ElevenLabs respondió ${r.status} al pedir la conversación.` },
          { status: 502 }
        );
      }
      const d = await r.json();
      // Se filtran los turnos sin texto: en una llamada quedan eventos internos
      // (herramientas, interrupciones) que como línea de diálogo no dicen nada.
      const transcripcion = ((d?.transcript ?? []) as MensajeEL[])
        .filter((m) => (m.message ?? "").trim())
        .map((m) => ({
          quien: m.role === "user" ? "usuario" : "agente",
          texto: (m.message ?? "").trim(),
        }));
      return NextResponse.json({ ok: true, transcripcion });
    }

    const r = await fetch(
      `${API}/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=30`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!r.ok) {
      return NextResponse.json(
        { error: `ElevenLabs respondió ${r.status} al pedir el historial.` },
        { status: 502 }
      );
    }
    const d = await r.json();

    const conversaciones = ((d?.conversations ?? []) as FilaEL[]).map((c) => ({
      id: c.conversation_id ?? "",
      inicio: c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000).toISOString() : null,
      duracionSegundos: c.call_duration_secs ?? null,
      mensajes: c.message_count ?? null,
      estado: c.status ?? null,
      resultado: c.call_successful ?? null,
    }));

    return NextResponse.json({ configurado: true, conversaciones });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo hablar con ElevenLabs." },
      { status: 502 }
    );
  }
}
