import { supabase } from "@/lib/supabase";

// Mismos campos que supabase/schema.sql -> public.vehiculos, sin inventar
// columnas nuevas ni renombrarlas (para no divergir del esquema real).
export interface Vehiculo {
  id: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number | null;
  km: number | null;
  es_cero: boolean;
  precio: number | null;
  condicion: string | null;
  destacado: boolean;
  valor_tabla_dnrpa: number | null;
}

export async function cargarVehiculos(): Promise<Vehiculo[]> {
  const { data, error } = await supabase
    .from("vehiculos")
    .select("id, marca, modelo, version, anio, km, es_cero, precio, condicion, destacado, valor_tabla_dnrpa")
    .order("precio", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function nombreVehiculo(v: Vehiculo): string {
  return [v.marca, v.modelo, v.version].filter(Boolean).join(" ");
}

export function formatearMoneda(valor: number | null): string {
  if (!valor) return "Consultar precio";
  return "$ " + valor.toLocaleString("es-AR");
}
