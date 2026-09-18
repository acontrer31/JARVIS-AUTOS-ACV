import { NextResponse } from "next/server";
import { demasiadasRequests, dentroDelLimite, esError, identificar } from "@/lib/server/sesion";

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
  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "Faltan variables de entorno en el servidor (ver .env.example)." },
      { status: 500 }
    );
  }

  const identidad = await identificar(request);
  if (esError(identidad)) return identidad.error;
  const { llamante, admin } = identidad;

  // Cada URL firmada arranca una conversación y CADA CONVERSACIÓN GASTA CUOTA
  // de la cuenta de ElevenLabs — que es plata, y que ya se agotó una vez en
  // este proyecto. Exigir sesión frenaba a los desconocidos; no frenaba a una
  // pestaña en bucle ni a un usuario que quisiera vaciar la cuenta. Veinte cada
  // cinco minutos es muchísimo para hablar y es un techo para el abuso.
  if (!(await dentroDelLimite(admin, `voz:${llamante.usuarioId}`, 20, 300))) {
    return demasiadasRequests(300);
  }

  try {
    const respuesta = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!respuesta.ok) {
      // Solo el código. El cuerpo que devuelve ElevenLabs puede describir la
      // cuenta, el plan o el agente, y eso no tiene por qué llegar al navegador.
      return NextResponse.json(
        { error: `ElevenLabs respondió ${respuesta.status}.` },
        { status: 502 }
      );
    }
    const datos = await respuesta.json();
    return NextResponse.json({ signedUrl: datos.signed_url });
  } catch {
    return NextResponse.json({ error: "No se pudo iniciar la sesión de voz." }, { status: 502 });
  }
}
