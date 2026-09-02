import { miAgenciaId, supabase } from "@/lib/supabase";

// Memoria de cada publicación en redes: permite retirarlas cuando el auto se
// vende y llevar el historial/métricas para reportes. RLS por agencia.
export type RedPub = "facebook" | "instagram" | "tiktok";
export type EstadoPub = "publicada" | "eliminada" | "pendiente_retiro" | "error";

export interface PublicacionRed {
  id: string;
  vehiculo_id: string | null;
  red: RedPub;
  formato: string;
  post_id: string | null;
  url: string | null;
  estado: EstadoPub;
  metricas: Record<string, unknown> | null;
  publicado_en: string;
  eliminado_en: string | null;
}

const COLS = "id, vehiculo_id, red, formato, post_id, url, estado, metricas, publicado_en, eliminado_en";

// Guarda una publicación recién hecha (la llama el módulo después de postear).
export async function registrarPublicacion(datos: {
  vehiculo_id: string | null;
  red: RedPub;
  formato: string;
  post_id: string | null;
  url?: string | null;
}): Promise<void> {
  const agencia_id = await miAgenciaId();
  const { data: sesion } = await supabase.auth.getUser();
  const { error } = await supabase.from("publicaciones_redes").insert({
    vehiculo_id: datos.vehiculo_id,
    red: datos.red,
    formato: datos.formato,
    post_id: datos.post_id,
    url: datos.url ?? null,
    agencia_id,
    creado_por: sesion.user?.id ?? null,
  });
  if (error) throw error;
}

// Publicaciones de Instagram/TikTok que quedaron pendientes de borrar a mano
// (la API de esas redes no permite borrar por código).
export async function cargarPendientesRetiro(): Promise<PublicacionRed[]> {
  const { data, error } = await supabase
    .from("publicaciones_redes")
    .select(COLS)
    .eq("estado", "pendiente_retiro")
    .order("eliminado_en", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as PublicacionRed[];
}

// El usuario ya la borró a mano en la app → se marca eliminada.
export async function marcarRetirada(id: string): Promise<void> {
  const { error } = await supabase
    .from("publicaciones_redes")
    .update({ estado: "eliminada", eliminado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
