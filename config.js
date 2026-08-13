// Configuración de conexión a Supabase.
// Completar con los valores de tu proyecto: Project Settings → API en supabase.com.
// SUPABASE_ANON_KEY es la clave pública "anon" — segura para exponer en el cliente
// (la seguridad real la dan las políticas RLS en la base, no el secreto de esta clave).
// Mientras estos dos campos queden vacíos, el sitio sigue funcionando con el catálogo
// estático de data.js, sin login ni base de datos real.
//
// ELEVENLABS_AGENT_ID: el "Agent ID" de tu agente conversacional creado en
// elevenlabs.io/app/conversational-ai. Es un identificador público (no una
// clave secreta), seguro para exponer en el cliente. Ver README para la guía
// de creación paso a paso. Mientras quede vacío, el widget de voz no aparece.
window.JARVIS_CONFIG = {
  SUPABASE_URL: "https://qmkhiqkwiduufilkqnlt.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFta2hpcWt3aWR1dWZpbGtxbmx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MDk5NDEsImV4cCI6MjEwMjA4NTk0MX0.akyt9skT3g0l_VsL-Le60icnp6erEY_YqWK_muGZvSA",
  ELEVENLABS_AGENT_ID: "agent_0501kzs629c5fn8agsxf08v1nw4z",
};
