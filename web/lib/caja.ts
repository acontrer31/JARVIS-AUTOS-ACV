import { miAgenciaId, supabase } from "@/lib/supabase";

// Caja: ingresos y egresos de dinero. Mismos valores que los checks del esquema
// (supabase/schema.sql -> movimientos_caja_*_check).
export const TIPOS_MOVIMIENTO = ["ingreso", "egreso"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const FORMAS_PAGO_CAJA = ["efectivo", "transferencia", "cheque", "tarjeta", "otro"] as const;
export type FormaPagoCaja = (typeof FORMAS_PAGO_CAJA)[number];

export const ETIQUETA_FORMA_PAGO_CAJA: Record<FormaPagoCaja, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export interface Movimiento {
  id: string;
  operacion_id: string | null;
  tipo: TipoMovimiento;
  concepto: string;
  monto: number;
  forma_pago: FormaPagoCaja | null;
  fecha: string; // YYYY-MM-DD
  creado_en: string;
}

export type MovimientoInput = Omit<Movimiento, "id" | "creado_en">;

const COLUMNAS = "id, operacion_id, tipo, concepto, monto, forma_pago, fecha, creado_en";

export async function cargarMovimientos(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from("movimientos_caja")
    .select(COLUMNAS)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Movimiento[];
}

export async function crearMovimiento(datos: MovimientoInput): Promise<Movimiento> {
  const agencia_id = await miAgenciaId();
  const { data: sesion } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("movimientos_caja")
    .insert({ ...datos, agencia_id, creado_por: sesion.user?.id ?? null })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Movimiento;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const { error } = await supabase.from("movimientos_caja").delete().eq("id", id);
  if (error) throw error;
}

// Totales de un conjunto de movimientos: ingresos, egresos y saldo (ingresos −
// egresos).
export function calcularSaldo(movimientos: Movimiento[]): {
  ingresos: number;
  egresos: number;
  saldo: number;
} {
  let ingresos = 0;
  let egresos = 0;
  for (const m of movimientos) {
    if (m.tipo === "ingreso") ingresos += m.monto;
    else egresos += m.monto;
  }
  return { ingresos, egresos, saldo: ingresos - egresos };
}

export function movimientoVacio(): MovimientoInput {
  return {
    operacion_id: null,
    tipo: "ingreso",
    concepto: "",
    monto: 0,
    forma_pago: "efectivo",
    fecha: new Date().toISOString().slice(0, 10),
  };
}
