// Configuración de conexión a Supabase.
// Completar con los valores de tu proyecto: Project Settings → API en supabase.com.
// SUPABASE_ANON_KEY es la clave pública "anon" — segura para exponer en el cliente
// (la seguridad real la dan las políticas RLS en la base, no el secreto de esta clave).
// Mientras estos dos campos queden vacíos, el sitio sigue funcionando con el catálogo
// estático de data.js, sin login ni base de datos real.
window.JARVIS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
