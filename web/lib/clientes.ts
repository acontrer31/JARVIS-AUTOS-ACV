import { miAgenciaId, supabase } from "@/lib/supabase";

// Mismos campos que supabase/schema.sql -> public.clientes, sin inventar
// columnas. Los de lead (estado_lead, vehiculo_interes_id, presupuesto,
// vendedor_id) se agregaron en la Fase 2.
export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  estado_lead: EstadoLead;
  vehiculo_interes_id: string | null;
  presupuesto: number | null;
  vendedor_id: string | null;
  creado_en: string;
}

// Mismos valores que el check `clientes_estado_lead_check` — si acá hubiera uno
// de más, Postgres rechazaría el guardado.
export const ESTADOS_LEAD = ["nuevo", "contactado", "en_negociacion", "ganado", "perdido"] as const;
export type EstadoLead = (typeof ESTADOS_LEAD)[number];

export const ETIQUETA_ESTADO_LEAD: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  en_negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

export type ClienteInput = Omit<Cliente, "id" | "creado_en">;

const COLUMNAS =
  "id, nombre, telefono, email, notas, estado_lead, vehiculo_interes_id, presupuesto, vendedor_id, creado_en";

export async function cargarClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select(COLUMNAS)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Cliente[];
}

export async function crearCliente(datos: ClienteInput): Promise<Cliente> {
  const agencia_id = await miAgenciaId();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ ...datos, agencia_id })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Cliente;
}

export async function actualizarCliente(id: string, datos: Partial<ClienteInput>): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update(datos)
    .eq("id", id)
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Cliente;
}

export async function cambiarEstadoLead(id: string, estado_lead: EstadoLead): Promise<Cliente> {
  return actualizarCliente(id, { estado_lead });
}

export async function eliminarCliente(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}

// Vendedores de la agencia, para el selector de "vendedor asignado". Depende de
// la política RLS "ver perfiles de mi agencia" agregada en la Fase 5: antes de
// eso cada usuario solo veía su propia fila y este listado devolvía uno solo.
export interface Vendedor {
  id: string;
  nombre: string | null;
}

export async function cargarVendedores(): Promise<Vendedor[]> {
  const { data, error } = await supabase.from("perfiles").select("id, nombre").order("nombre");
  if (error) throw error;
  return (data ?? []) as Vendedor[];
}

export function clienteVacio(): ClienteInput {
  return {
    nombre: "",
    telefono: null,
    email: null,
    notas: null,
    estado_lead: "nuevo",
    vehiculo_interes_id: null,
    presupuesto: null,
    vendedor_id: null,
  };
}
