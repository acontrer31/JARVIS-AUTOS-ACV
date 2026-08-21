import { miAgenciaId, supabase } from "@/lib/supabase";

// Historial de contacto con un cliente. La tabla ya venía alimentándose sola
// desde la Edge Function `elevenlabs-webhook` (tipo 'voz_jarvis'); esta lib
// suma la carga manual y la lectura desde el módulo Clientes.
export interface Interaccion {
  id: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  tipo: TipoInteraccion;
  resumen: string;
  creado_en: string;
}

// Valores usados por el esquema y por la Edge Function de voz. La columna no
// tiene check constraint (a diferencia de estado_lead), así que esta lista es
// una convención del código, no algo que la base imponga.
export const TIPOS_INTERACCION = ["llamada", "whatsapp", "visita", "email", "voz_jarvis", "otro"] as const;
export type TipoInteraccion = (typeof TIPOS_INTERACCION)[number];

export const ETIQUETA_TIPO: Record<TipoInteraccion, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  visita: "Visita",
  email: "Email",
  voz_jarvis: "Conversación con JARVIS",
  otro: "Otro",
};

export async function cargarInteracciones(clienteId: string): Promise<Interaccion[]> {
  const { data, error } = await supabase
    .from("interacciones")
    .select("id, cliente_id, vehiculo_id, tipo, resumen, creado_en")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Interaccion[];
}

export async function registrarInteraccion(datos: {
  cliente_id: string;
  tipo: TipoInteraccion;
  resumen: string;
  vehiculo_id?: string | null;
}): Promise<Interaccion> {
  const agencia_id = await miAgenciaId();
  const { data, error } = await supabase
    .from("interacciones")
    .insert({ ...datos, agencia_id })
    .select("id, cliente_id, vehiculo_id, tipo, resumen, creado_en")
    .single();
  if (error) throw error;
  return data as unknown as Interaccion;
}

// Operaciones del cliente — SOLO LECTURA en esta fase. La tabla se creó en la
// Fase 2 y hasta acá no tenía ningún consumidor; mostrarla en el perfil la pone
// en uso sin abrir todavía el módulo Operaciones, que es su propia fase.
export interface Operacion {
  id: string;
  vehiculo_id: string | null;
  tipo: string;
  estado: string;
  monto: number | null;
  creado_en: string;
}

export async function cargarOperaciones(clienteId: string): Promise<Operacion[]> {
  const { data, error } = await supabase
    .from("operaciones")
    .select("id, vehiculo_id, tipo, estado, monto, creado_en")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operacion[];
}

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
