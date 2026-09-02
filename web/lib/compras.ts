import { miAgenciaId, supabase } from "@/lib/supabase";

// Compras / ingreso de stock + proveedores. Mismos valores que los checks del
// esquema (supabase/schema.sql).
export const ORIGENES_COMPRA = ["compra", "permuta", "consignacion"] as const;
export type OrigenCompra = (typeof ORIGENES_COMPRA)[number];

export const ETIQUETA_ORIGEN: Record<OrigenCompra, string> = {
  compra: "Compra",
  permuta: "Permuta",
  consignacion: "Consignación",
};

export const TIPOS_PROVEEDOR = ["particular", "agencia", "gestoria", "taller", "mayorista", "otro"] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

export const ETIQUETA_TIPO_PROVEEDOR: Record<TipoProveedor, string> = {
  particular: "Particular",
  agencia: "Agencia",
  gestoria: "Gestoría",
  taller: "Taller",
  mayorista: "Mayorista",
  otro: "Otro",
};

export interface Proveedor {
  id: string;
  nombre: string;
  tipo: TipoProveedor | null;
  telefono: string | null;
  notas: string | null;
}

export interface Compra {
  id: string;
  vehiculo_id: string | null;
  proveedor_id: string | null;
  origen: OrigenCompra;
  costo: number | null;
  gastos: number | null;
  fecha: string;
  notas: string | null;
  creado_en: string;
}

export type CompraInput = Omit<Compra, "id" | "creado_en">;

const COLS_COMPRA = "id, vehiculo_id, proveedor_id, origen, costo, gastos, fecha, notas, creado_en";
const COLS_PROV = "id, nombre, tipo, telefono, notas";

export async function cargarProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase.from("proveedores").select(COLS_PROV).order("nombre");
  if (error) throw error;
  return (data ?? []) as unknown as Proveedor[];
}

export async function crearProveedor(datos: { nombre: string; tipo?: TipoProveedor | null; telefono?: string | null }): Promise<Proveedor> {
  const nombre = (datos.nombre || "").trim();
  if (!nombre) throw new Error("El proveedor necesita un nombre.");
  const agencia_id = await miAgenciaId();
  const { data, error } = await supabase
    .from("proveedores")
    .insert({ nombre, tipo: datos.tipo ?? null, telefono: datos.telefono ?? null, agencia_id })
    .select(COLS_PROV)
    .single();
  if (error) throw error;
  return data as unknown as Proveedor;
}

export async function cargarCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from("compras")
    .select(COLS_COMPRA)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Compra[];
}

export async function crearCompra(datos: CompraInput): Promise<Compra> {
  const agencia_id = await miAgenciaId();
  const { data: sesion } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("compras")
    .insert({ ...datos, agencia_id, creado_por: sesion.user?.id ?? null })
    .select(COLS_COMPRA)
    .single();
  if (error) throw error;
  return data as unknown as Compra;
}

export async function eliminarCompra(id: string): Promise<void> {
  const { error } = await supabase.from("compras").delete().eq("id", id);
  if (error) throw error;
}

export function compraVacia(): CompraInput {
  return {
    vehiculo_id: null,
    proveedor_id: null,
    origen: "compra",
    costo: null,
    gastos: null,
    fecha: new Date().toISOString().slice(0, 10),
    notas: null,
  };
}
