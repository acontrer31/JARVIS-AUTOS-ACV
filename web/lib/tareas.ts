import { miAgenciaId, supabase } from "@/lib/supabase";

// Tareas del día del usuario logueado. La RLS (política "mis tareas") ya limita
// a las propias de su agencia, así que estas consultas no necesitan filtrar por
// usuario a mano — la base solo devuelve lo suyo.
export interface Tarea {
  id: string;
  titulo: string;
  hecha: boolean;
  vence: string | null; // fecha ISO (YYYY-MM-DD) o null si no tiene vencimiento
  creado_en: string;
}

const COLUMNAS = "id, titulo, hecha, vence, creado_en";

// Lista de tareas. Por defecto trae todas (pendientes primero); con
// soloPendientes solo las que faltan hacer.
export async function cargarTareas(soloPendientes = false): Promise<Tarea[]> {
  let consulta = supabase
    .from("tareas")
    .select(COLUMNAS)
    .order("hecha", { ascending: true })
    .order("vence", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: true });
  if (soloPendientes) consulta = consulta.eq("hecha", false);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as unknown as Tarea[];
}

export async function crearTarea(titulo: string, vence?: string | null): Promise<Tarea> {
  const limpio = (titulo || "").trim();
  if (!limpio) throw new Error("La tarea necesita un título.");
  const agencia_id = await miAgenciaId();
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion) throw errorSesion;
  const usuario_id = sesion.user?.id;
  if (!usuario_id) throw new Error("No hay sesión activa.");

  const { data, error } = await supabase
    .from("tareas")
    .insert({ titulo: limpio, vence: vence ?? null, agencia_id, usuario_id })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Tarea;
}

export async function marcarHecha(id: string, hecha: boolean): Promise<void> {
  const { error } = await supabase.from("tareas").update({ hecha }).eq("id", id);
  if (error) throw error;
}

export async function eliminarTarea(id: string): Promise<void> {
  const { error } = await supabase.from("tareas").delete().eq("id", id);
  if (error) throw error;
}
