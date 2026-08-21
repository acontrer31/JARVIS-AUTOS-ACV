import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local (ver .env.example)."
  );
}

export const supabase = createClient(url, anonKey);

// La agencia nunca se elige desde la UI: sale del perfil del usuario logueado.
// Las políticas RLS exigen que el `agencia_id` de cada insert coincida con
// public.mi_agencia_id(), así que mandar otro valor no abriría datos ajenos —
// la base lo rechazaría igual. Vive acá y no en un módulo puntual porque la
// usan todos los módulos que escriben (vehículos, clientes, interacciones).
//
// El filtro por `id` es obligatorio: desde la Fase 5 la política
// "ver perfiles de mi agencia" hace que `perfiles` devuelva a todos los
// vendedores de la agencia, así que sin él `.single()` fallaría por recibir
// más de una fila.
export async function miAgenciaId(): Promise<string> {
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion) throw errorSesion;
  if (!sesion.user) throw new Error("No hay sesión activa.");

  const { data, error } = await supabase
    .from("perfiles")
    .select("agencia_id")
    .eq("id", sesion.user.id)
    .single();
  if (error) throw error;
  return data.agencia_id as string;
}
