import { supabase } from "@/lib/supabase";

// Cliente del endpoint /api/redes/publicar. El token de la red vive en el
// servidor; acá solo mandamos qué publicar + el token de sesión de Supabase.
export const REDES = ["facebook", "instagram"] as const;
export type Red = (typeof REDES)[number];

export const ETIQUETA_RED: Record<Red, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

// Solo aplica a Instagram: post normal (feed) o historia (STORIES).
export type FormatoIG = "feed" | "historia";

export interface ResultadoPublicacion {
  ok: boolean;
  red: Red;
  id: string | null;
}

export async function publicarEnRedes(
  red: Red,
  texto: string,
  imagenUrl?: string | null,
  formato: FormatoIG = "feed"
): Promise<ResultadoPublicacion> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Volvé a iniciar sesión.");

  const resp = await fetch("/api/redes/publicar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ red, texto, imagen_url: imagenUrl ?? null, formato }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(data.error || "No se pudo publicar.");
  return data as ResultadoPublicacion;
}
