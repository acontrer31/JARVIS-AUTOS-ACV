import { NextResponse } from "next/server";

// Corre en el servidor (nunca en el navegador) — es el único lugar que
// puede usar ELEVENLABS_API_KEY (secreta). Le pide a ElevenLabs una URL de
// conexión firmada y de un solo uso para el agente configurado, y devuelve
// solo esa URL al cliente. Necesario porque este agente exige autenticación
// para conectarse directo por SDK (a diferencia del widget embebido del
// sitio estático, que resuelve esto de otra forma internamente).
//
// Endpoint tomado del propio código del SDK instalado (@elevenlabs/client),
// que usa el mismo prefijo /v1/convai/conversation/... para el flujo de
// WebRTC — no se pudo confirmar en vivo contra la cuenta real porque este
// entorno no tiene acceso de red a elevenlabs.io. Si devuelve un error acá,
// avisale al usuario para revisarlo juntos.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "Faltan ELEVENLABS_API_KEY o NEXT_PUBLIC_ELEVENLABS_AGENT_ID en el servidor." },
      { status: 500 }
    );
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
