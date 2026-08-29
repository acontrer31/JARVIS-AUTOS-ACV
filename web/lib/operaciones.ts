import { miAgenciaId, supabase } from "@/lib/supabase";
import { cambiarEstado as cambiarEstadoVehiculo, type EstadoVehiculo } from "@/lib/vehiculos";

// Operaciones = ventas y trámites: el hub del ERP que une un vehículo (stock),
// un cliente (CRM), un vendedor y el dinero. Mismos valores que los checks del
// esquema (supabase/schema.sql -> operaciones_*_check).
export const TIPOS_OPERACION = ["venta", "reserva", "permuta", "consignacion"] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];

export const ESTADOS_OPERACION = ["abierta", "senada", "entregada", "cancelada"] as const;
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];

export const FORMAS_PAGO = ["contado", "financiado", "permuta", "mixto"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const ETIQUETA_TIPO_OP: Record<TipoOperacion, string> = {
  venta: "Venta",
  reserva: "Reserva",
  permuta: "Permuta",
  consignacion: "Consignación",
};

export const ETIQUETA_ESTADO_OP: Record<EstadoOperacion, string> = {
  abierta: "Abierta",
  senada: "Señada",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const ETIQUETA_FORMA_PAGO: Record<FormaPago, string> = {
  contado: "Contado",
  financiado: "Financiado",
  permuta: "Permuta",
  mixto: "Mixto",
};

export interface Operacion {
  id: string;
  vehiculo_id: string | null;
  cliente_id: string | null;
  vendedor_id: string | null;
  tipo: TipoOperacion;
  estado: EstadoOperacion;
  monto: number | null;
  sena: number | null;
  comision: number | null;
  forma_pago: FormaPago | null;
  notas: string | null;
  creado_en: string;
}

export type OperacionInput = Omit<Operacion, "id" | "creado_en">;

const COLUMNAS =
  "id, vehiculo_id, cliente_id, vendedor_id, tipo, estado, monto, sena, comision, forma_pago, notas, creado_en";

export async function cargarOperaciones(): Promise<Operacion[]> {
  const { data, error } = await supabase
    .from("operaciones")
    .select(COLUMNAS)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operacion[];
}

export async function crearOperacion(datos: OperacionInput): Promise<Operacion> {
  const agencia_id = await miAgenciaId();
  const { data, error } = await supabase
    .from("operaciones")
    .insert({ ...datos, agencia_id })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Operacion;
}

export async function actualizarOperacion(id: string, datos: Partial<OperacionInput>): Promise<Operacion> {
  const { data, error } = await supabase
    .from("operaciones")
    .update(datos)
    .eq("id", id)
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Operacion;
}

export async function eliminarOperacion(id: string): Promise<void> {
  const { error } = await supabase.from("operaciones").delete().eq("id", id);
  if (error) throw error;
}

// El estado de la venta manda sobre el estado del vehículo en el stock (ERP:
// stock y ventas van juntos). Señada -> reservado; Entregada -> vendido;
// Cancelada -> vuelve a disponible. Abierta no toca el stock.
const ESTADO_VEHICULO_SEGUN_OP: Record<EstadoOperacion, EstadoVehiculo | null> = {
  abierta: null,
  senada: "reservado",
  entregada: "vendido",
  cancelada: "disponible",
};

export async function cambiarEstadoOperacion(op: Operacion, estado: EstadoOperacion): Promise<Operacion> {
  const actualizada = await actualizarOperacion(op.id, { estado });
  const nuevoEstadoVehiculo = ESTADO_VEHICULO_SEGUN_OP[estado];
  if (op.vehiculo_id && nuevoEstadoVehiculo) {
    // Si falla (permiso, vehículo borrado), no rompe la operación: la venta ya
    // quedó registrada; el stock se puede corregir a mano.
    try {
      await cambiarEstadoVehiculo(op.vehiculo_id, nuevoEstadoVehiculo);
    } catch {}
  }
  return actualizada;
}

export function operacionVacia(): OperacionInput {
  return {
    vehiculo_id: null,
    cliente_id: null,
    vendedor_id: null,
    tipo: "venta",
    estado: "abierta",
    monto: null,
    sena: null,
    comision: null,
    forma_pago: null,
    notas: null,
  };
}
