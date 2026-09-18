import type { NextConfig } from "next";

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
    // Clickjacking: que nadie pueda meter JARVIS dentro de un iframe suyo y
    // hacerle clickear cosas al usuario sin que las vea. Van las dos formas —
    // frame-ancestors es la moderna, X-Frame-Options la que entienden los
    // navegadores viejos.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
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
