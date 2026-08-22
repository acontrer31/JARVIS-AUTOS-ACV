import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Corre en el servidor (nunca en el navegador) — es el único lugar que
// puede usar ELEVENLABS_API_KEY (secreta). Le pide a ElevenLabs una URL de
// conexión firmada y de un solo uso para el agente configurado, y devuelve
// solo esa URL al cliente. Necesario porque este agente exige autenticación
// para conectarse directo por SDK.
//
// EXIGE SESIÓN. Antes no la pedía, y como la app está desplegada en un
// dominio público, cualquiera que conociera la URL podía pedir URLs firmadas
// — y cada una consume cuota de la cuenta de ElevenLabs. Ahora el cliente
// manda su token de Supabase y acá se verifica contra el servidor de auth
// antes de gastar un solo crédito.
export async function GET(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiKey || !agentId || !supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno en el servidor (ver .env.example)." },
      { status: 500 }
    );
  }

  // El token viaja en el header, no en la URL: las URLs quedan en logs de
  // servidor, historiales y referers; los headers no.
  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });
  }

  // Se valida contra el servidor de auth de Supabase (getUser verifica la
  // firma del lado del servidor); no alcanza con confiar en lo que diga el
  // cliente. Si el token no es válido, se corta acá sin llamar a ElevenLabs.
  const supabase = createClient(supabaseUrl, anonKey);
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  try {
    const respuesta = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return NextResponse.json(
        { error: `ElevenLabs respondió ${respuesta.status}: ${detalle}` },
        { status: 502 }
      );
    }
    const datos = await respuesta.json();
    return NextResponse.json({ signedUrl: datos.signed_url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido pidiendo la URL firmada." },
      { status: 502 }
    );
  }
}
