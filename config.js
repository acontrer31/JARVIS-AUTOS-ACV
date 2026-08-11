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
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  ELEVENLABS_AGENT_ID: "",
};
