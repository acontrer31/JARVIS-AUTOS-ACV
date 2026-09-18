import type { NextConfig } from "next";

// ----------------------------------------------------------------------------
// Content-Security-Policy
//
// Va en dos mitades a propósito, porque solo una se puede activar sin probar.
//
// LA QUE BLOQUEA AHORA: todo lo que no tiene nada que ver con los scripts
// inline. `object-src` y `base-uri` son ganancia pura —la app no usa plugins ni
// la etiqueta <base>, y `<base>` es el truco clásico para redirigir todos los
// enlaces de una página—. `connect-src` es la importante de esta mitad: aunque
// alguien lograra ejecutar un script, no podría mandar los datos a un servidor
// suyo, porque el navegador solo deja hablar con estos orígenes.
//
// LA QUE SOLO REPORTA: la lista completa, con `script-src`. Esa no se puede
// encender de una porque Next inyecta scripts inline para hidratar la página;
// bloquearlos necesita nonces, y los nonces obligan a renderizar cada visita en
// el servidor en vez de servir la página pregenerada. Es un cambio de
// comportamiento, no solo de seguridad. En modo reporte el navegador anota la
// violación en la consola y NO bloquea nada — sirve para ver qué falta antes de
// decidir.
//
// Los orígenes no están inventados: salieron de buscar en el código todos los
// dominios a los que la app se conecta desde el navegador.
//   Supabase           datos, auth y storage (https y websocket)
//   api.elevenlabs.io  la voz (https y websocket)
//   open-meteo         el clima, que se pide desde el navegador sin API key
// Google Fonts NO está: `next/font/google` descarga las tipografías en el build
// y las sirve desde el propio dominio.
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_WS = SUPABASE.replace(/^https:/, "wss:");

// ElevenLabs va con comodín de subdominio a propósito. La URL firmada del
// websocket la devuelve ElevenLabs, no la escribimos nosotros, y puede apuntar
// a un subdominio regional. Si la CSP solo dejara `api.elevenlabs.io` y la URL
// viniera de otro, la voz —que es la función central de JARVIS— dejaría de
// conectar sin ningún mensaje de error visible.
//
// El comodín no debilita lo que importa: lo que `connect-src` frena es que un
// script inyectado mande los datos de la agencia a un servidor del atacante, y
// para eso tendría que ser dueño de elevenlabs.io.
const CONEXIONES = [
  "'self'",
  SUPABASE,
  SUPABASE_WS,
  "https://*.elevenlabs.io",
  "wss://*.elevenlabs.io",
  "https://api.open-meteo.com",
  "https://geocoding-api.open-meteo.com",
].filter(Boolean);

// Lo que se bloquea desde ya. Ninguna de estas directivas puede romper un
// script inline de Next.
const CSP_ACTIVA = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  `connect-src ${CONEXIONES.join(" ")}`,
].join("; ");

// La lista completa, en modo reporte. Cuando la consola del navegador no
// muestre más violaciones después de un día de uso real —incluida una
// conversación de voz entera y una publicación en redes—, esta pasa a ser la
// activa. Ver docs/phases/pendientes.md §12.1.
const CSP_REPORTE = [
  "default-src 'self'",
  // 'unsafe-inline' está acá solo para MEDIR: con él la política no sirve de
  // mucho, pero deja ver si algo más falta antes de pasar a nonces.
  "script-src 'self' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE}`.trim(),
  `media-src 'self' blob: ${SUPABASE}`.trim(),
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  `connect-src ${CONEXIONES.join(" ")}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

// Cabeceras de seguridad. Hasta la auditoría de septiembre de 2026 este archivo
// estaba vacío: la app salía a producción sin ninguna.
//
// Están todas elegidas para NO romper nada de lo que JARVIS hace hoy. La que
// falta —una Content-Security-Policy completa, que es la que de verdad frena un
// XSS— está documentada como pendiente en docs/phases/pendientes.md: necesita
// enumerar cada origen que la app usa (Supabase por https y wss, ElevenLabs por
// wss, Meta, Google Fonts) y probarse contra el sitio andando. Ponerla a ciegas
// deja la aplicación en blanco.
const CABECERAS = [
  {
    // Sin esto, un archivo subido con el tipo equivocado puede terminar
    // interpretándose como HTML o como script por olfateo del navegador.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // La URL completa no se manda a sitios de terceros. Importa porque las URLs
    // de la app y los enlaces firmados de Storage no tienen por qué aparecer en
    // el Referer de otro dominio.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Incluye frame-ancestors (clickjacking: que nadie meta JARVIS dentro de un
    // iframe suyo y le haga clickear cosas al usuario sin que las vea) más el
    // resto de la mitad que no puede romper nada. Ver el comentario de arriba.
    key: "Content-Security-Policy",
    value: CSP_ACTIVA,
  },
  {
    // No bloquea: anota en la consola del navegador lo que la política completa
    // bloquearía. Es el paso previo a encenderla.
    key: "Content-Security-Policy-Report-Only",
    value: CSP_REPORTE,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // El navegador recuerda por un año que este dominio es solo HTTPS.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Micrófono SÍ: es lo que usa la voz de JARVIS (getUserMedia). Portapapeles
    // sí: lo usa Marketing para copiar el aviso. Cámara, ubicación, pagos y USB
    // no los usa nada — y una función a la que nadie llama no debería estar
    // disponible para un script inyectado.
    key: "Permissions-Policy",
    value: "microphone=(self), clipboard-write=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Next anuncia su versión en cada respuesta. Es regalarle al que busca
  // objetivos la mitad del trabajo: saber contra qué versión está parado.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
