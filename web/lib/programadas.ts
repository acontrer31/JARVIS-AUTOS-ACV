import { miAgenciaId, supabase } from "@/lib/supabase";
import type { Formato, Red } from "@/lib/redes";

// Publicaciones agendadas para un día y hora. Un cron de Vercel las levanta
// cuando vencen (ver app/api/redes/cron).

export const ESTADOS_PROGRAMADA = ["pendiente", "publicada", "fallida", "cancelada"] as const;
export type EstadoProgramada = (typeof ESTADOS_PROGRAMADA)[number];

export const ETIQUETA_ESTADO_PROGRAMADA: Record<EstadoProgramada, string> = {
  pendiente: "Programada",
  publicada: "Publicada",
  fallida: "Falló",
  cancelada: "Cancelada",
};

export interface Programada {
  id: string;
  vehiculo_id: string | null;
  red: Red;
  formato: Formato;
  texto: string | null;
  imagen_url: string | null;
  imagen_urls: string[] | null;
  video_url: string | null;
  programada_para: string;
  estado: EstadoProgramada;
  post_id: string | null;
  error: string | null;
  creado_en: string;
}

const COLUMNAS =
  "id, vehiculo_id, red, formato, texto, imagen_url, imagen_urls, video_url, " +
  "programada_para, estado, post_id, error, creado_en";

export async function cargarProgramadas(): Promise<Programada[]> {
  const { data, error } = await supabase
    .from("publicaciones_programadas")
    .select(COLUMNAS)
    .order("programada_para", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as Programada[];
}

export interface ProgramarInput {
  vehiculo_id: string | null;
  red: Red;
  formato: Formato;
  texto: string | null;
  imagen_url: string | null;
  imagen_urls: string[];
  video_url: string | null;
  /** Instante exacto en ISO. */
  programada_para: string;
}

export async function programarPublicacion(datos: ProgramarInput): Promise<Programada> {
  const agencia_id = await miAgenciaId();
  const { data: sesion } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("publicaciones_programadas")
    .insert({ ...datos, agencia_id, creado_por: sesion.session?.user?.id ?? null })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Programada;
}

// No se borra: se cancela. Así queda el rastro de que existió y de quién la
// dio de baja — igual que el resto del sistema.
export async function cancelarProgramada(id: string): Promise<void> {
  const { error } = await supabase
    .from("publicaciones_programadas")
    .update({ estado: "cancelada" })
    .eq("id", id)
    .eq("estado", "pendiente");
  if (error) throw error;
}

// Convierte lo que eligió el usuario en un <input type="datetime-local"> a un
// instante real. El input da hora local sin zona; new Date() la interpreta en
// la zona del navegador, que es la de la agencia.
export function aInstante(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}
