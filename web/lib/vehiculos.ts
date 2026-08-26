import { miAgenciaId, supabase } from "@/lib/supabase";

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
  dominio: string | null;
  precio: number | null;
  condicion: string | null;
  motor: string | null;
  caja: string | null;
  traccion: string | null;
  carroceria: string | null;
  specs: string[];
  destacado: boolean;
  estado: EstadoVehiculo;
  notas: string | null;
  valor_tabla_dnrpa: number | null;
}

// Mismos valores que el check `vehiculos_estado_check` en el esquema — si acá
// hubiera uno de más, Postgres rechazaría el guardado.
export const ESTADOS = ["borrador", "disponible", "reservado", "vendido", "no_disponible"] as const;
export type EstadoVehiculo = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<EstadoVehiculo, string> = {
  borrador: "Borrador",
  disponible: "Disponible",
  reservado: "Reservado",
  vendido: "Vendido",
  no_disponible: "No disponible",
};

// Lo que se manda al insertar/actualizar: todo menos el id (que lo genera la
// base) y la agencia (que se resuelve del perfil logueado, no la elige la UI).
export type VehiculoInput = Omit<Vehiculo, "id">;

const COLUMNAS =
  "id, marca, modelo, version, anio, km, es_cero, dominio, precio, condicion, motor, caja, traccion, carroceria, specs, destacado, estado, notas, valor_tabla_dnrpa";

export async function cargarVehiculos(): Promise<Vehiculo[]> {
  const { data, error } = await supabase
    .from("vehiculos")
    .select(COLUMNAS)
    .order("precio", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Vehiculo[];
}

export async function crearVehiculo(datos: VehiculoInput): Promise<Vehiculo> {
  const agencia_id = await miAgenciaId();
  const { data, error } = await supabase
    .from("vehiculos")
    .insert({ ...datos, agencia_id })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Vehiculo;
}

export async function actualizarVehiculo(id: string, datos: Partial<VehiculoInput>): Promise<Vehiculo> {
  const { data, error } = await supabase
    .from("vehiculos")
    .update(datos)
    .eq("id", id)
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data as unknown as Vehiculo;
}

export async function cambiarEstado(id: string, estado: EstadoVehiculo): Promise<Vehiculo> {
  return actualizarVehiculo(id, { estado });
}

export async function eliminarVehiculo(id: string): Promise<void> {
  const { error } = await supabase.from("vehiculos").delete().eq("id", id);
  if (error) throw error;
}

// El costo interno vive en `vehiculo_costos`, no en `vehiculos`, y su política
// RLS solo deja entrar a los admin. Para un vendedor esta consulta devuelve
// vacío — no un error — así que la UI simplemente no muestra el dato.
// Ver docs/architecture/decisiones.md ("Costo interno").
export async function cargarCostos(): Promise<Record<string, number | null>> {
  const { data, error } = await supabase.from("vehiculo_costos").select("vehiculo_id, costo_interno");
  if (error) throw error;
  const mapa: Record<string, number | null> = {};
  for (const fila of data ?? []) mapa[fila.vehiculo_id as string] = fila.costo_interno as number | null;
  return mapa;
}

export async function guardarCosto(vehiculoId: string, costo: number | null): Promise<void> {
  const agencia_id = await miAgenciaId();
  const { error } = await supabase
    .from("vehiculo_costos")
    .upsert({ vehiculo_id: vehiculoId, agencia_id, costo_interno: costo, actualizado_en: new Date().toISOString() });
  if (error) throw error;
}

export function vehiculoVacio(): VehiculoInput {
  return {
    marca: "",
    modelo: "",
    version: null,
    anio: null,
    km: null,
    es_cero: false,
    dominio: null,
    precio: null,
    condicion: null,
    motor: null,
    caja: null,
    traccion: null,
    carroceria: null,
    specs: [],
    destacado: false,
    estado: "borrador",
    notas: null,
    valor_tabla_dnrpa: null,
  };
}

export function nombreVehiculo(v: Pick<Vehiculo, "marca" | "modelo" | "version">): string {
  return [v.marca, v.modelo, v.version].filter(Boolean).join(" ");
}

export function formatearMoneda(valor: number | null): string {
  if (!valor) return "Consultar precio";
  // Redondeado a peso entero, sin centavos: los cálculos de financiación (2.5%,
  // 1% de DNRPA) producen decimales, y la agencia trabaja en montos redondos.
  return "$ " + Math.round(valor).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
