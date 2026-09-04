import { miAgenciaId, supabase } from "@/lib/supabase";

// Checklist de documentación y accesorios del vehículo. Pensado sobre todo para
// los autos en consignación: deja constancia de qué papeles y accesorios
// entregó el consignante. Relación 1 a 1 con el vehículo.

export interface Documentacion {
  vehiculo_id: string;
  // Documentación
  titulo: boolean;
  libre_deuda_municipal: boolean;
  formulario_08: boolean;
  /** Formulario 12: la verificación policial. */
  formulario_12: boolean;
  /** RTV — la "revesa": revisación técnica vehicular. */
  revisacion: boolean;
  seguro: boolean;
  // Accesorios
  gato: boolean;
  auxilio: boolean;
  llave_cruz: boolean;
  duplicado_llave: boolean;
  balizas: boolean;
  matafuego: boolean;
  kit_seguridad: boolean;
  // Informe de dominio (DNRPA)
  informe_dominio_necesario: boolean;
  informe_dominio_pedido: string | null;
  informe_dominio_resultado: string | null;
  dni_consignante: string | null;
  notas: string | null;
}

// Los ítems en el orden en que se muestran, con su etiqueta. Separados en dos
// grupos porque en la práctica se revisan por separado.
export const ITEMS_DOCUMENTACION: [keyof Documentacion, string][] = [
  ["titulo", "Título"],
  ["libre_deuda_municipal", "Libre deuda municipal"],
  ["formulario_08", "Formulario 08"],
  // El 12 es la verificación policial; "revesa" es la RTV.
  ["formulario_12", "Formulario 12 (verificación policial)"],
  ["revisacion", "Revisación Técnica Vehicular (RTV)"],
  ["seguro", "Seguro"],
];

export const ITEMS_ACCESORIOS: [keyof Documentacion, string][] = [
  ["gato", "Gato"],
  ["auxilio", "Auxilio"],
  ["llave_cruz", "Llave cruz"],
  ["duplicado_llave", "Duplicado de llave"],
  ["balizas", "Balizas"],
  ["matafuego", "Matafuego"],
  ["kit_seguridad", "Kit de seguridad"],
];

const COLUMNAS =
  "vehiculo_id, titulo, libre_deuda_municipal, formulario_08, formulario_12, revisacion, seguro, " +
  "gato, auxilio, llave_cruz, duplicado_llave, balizas, matafuego, kit_seguridad, " +
  "informe_dominio_necesario, informe_dominio_pedido, informe_dominio_resultado, dni_consignante, notas";

export function documentacionVacia(vehiculo_id: string): Documentacion {
  return {
    vehiculo_id,
    titulo: false,
    libre_deuda_municipal: false,
    formulario_08: false,
    formulario_12: false,
    revisacion: false,
    seguro: false,
    gato: false,
    auxilio: false,
    llave_cruz: false,
    duplicado_llave: false,
    balizas: false,
    matafuego: false,
    kit_seguridad: false,
    informe_dominio_necesario: false,
    informe_dominio_pedido: null,
    informe_dominio_resultado: null,
    dni_consignante: null,
    notas: null,
  };
}

// Devuelve la checklist del vehículo, o una vacía si todavía no se cargó nada.
export async function cargarDocumentacion(vehiculoId: string): Promise<Documentacion> {
  const { data, error } = await supabase
    .from("vehiculo_documentacion")
    .select(COLUMNAS)
    .eq("vehiculo_id", vehiculoId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Documentacion) ?? documentacionVacia(vehiculoId);
}

// Guarda toda la checklist de una (upsert por vehiculo_id).
export async function guardarDocumentacion(doc: Documentacion): Promise<void> {
  const agencia_id = await miAgenciaId();
  const { error } = await supabase
    .from("vehiculo_documentacion")
    .upsert({ ...doc, agencia_id, actualizado_en: new Date().toISOString() }, { onConflict: "vehiculo_id" });
  if (error) throw error;
}

// El informe de dominio del DNRPA es un trámite oficial y pago: no hay API
// pública para consultarlo, así que desde acá solo se abre el sitio para
// pedirlo a mano y después se registra el resultado en la checklist.
export const URL_DNRPA = "https://www.dnrpa.gov.ar/portal_dnrpa/informes.php";
