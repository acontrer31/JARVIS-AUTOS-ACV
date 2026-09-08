import { supabase } from "@/lib/supabase";
import { formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import type { EstadoPub, RedPub } from "@/lib/publicacionesRedes";

// Marketing = las dos preguntas que Redes no contesta: qué escribo, y qué pasó
// con lo que ya publiqué.
//
// Nada de esto inventa datos. El texto se arma con la ficha del auto (si no hay
// kilometraje, no se menciona el kilometraje) y los números salen de la API de
// Meta, no de una estimación.

// ---------- Piezas ----------

export const TONOS = ["ficha", "aviso", "historia"] as const;
export type Tono = (typeof TONOS)[number];

export const ETIQUETA_TONO: Record<Tono, string> = {
  ficha: "Ficha técnica",
  aviso: "Aviso de venta",
  historia: "Historia (corto)",
};

export const DESCRIPCION_TONO: Record<Tono, string> = {
  ficha: "Los datos secos, uno por línea. Para quien ya está decidiendo.",
  aviso: "Con gancho arriba y un llamado a escribir abajo. Para el feed.",
  historia: "Dos líneas y el precio. Para una historia o un estado.",
};

/**
 * Arma el texto del posteo con lo que la ficha realmente tiene.
 *
 * Cada dato se agrega solo si está cargado: un aviso que dice "0 km" sobre un
 * usado sin kilometraje cargado es peor que uno que no lo menciona.
 */
export function armarPieza(v: Vehiculo, tono: Tono, agencia?: string | null): string {
  const titulo = nombreVehiculo(v);
  const precio = v.precio ? formatearMoneda(v.precio) : null;

  const datos: string[] = [];
  if (v.anio) datos.push(`Año ${v.anio}`);
  if (v.es_cero) datos.push("0 km");
  else if (v.km != null) datos.push(`${v.km.toLocaleString("es-AR")} km`);
  if (v.motor) datos.push(`Motor ${v.motor}`);
  if (v.caja) datos.push(`Caja ${v.caja}`);
  if (v.traccion) datos.push(`Tracción ${v.traccion}`);
  if (v.carroceria) datos.push(v.carroceria);

  const extras = (v.specs ?? []).filter((s) => s.trim());
  const firma = agencia ? `\n\n${agencia}` : "";

  if (tono === "ficha") {
    const lineas = [titulo, ...datos.map((d) => `• ${d}`)];
    if (extras.length) lineas.push(`• ${extras.join(" · ")}`);
    if (precio) lineas.push("", `Precio: ${precio}`);
    return lineas.join("\n") + firma;
  }

  if (tono === "historia") {
    // Una historia se lee en tres segundos: título, un dato y el precio.
    const dato = datos[0] ? ` · ${datos[0]}` : "";
    return `${titulo}${dato}${precio ? `\n${precio}` : ""}${firma}`;
  }

  // aviso
  const cuerpo = datos.length ? `${datos.join(" · ")}.` : "";
  const detalle = extras.length ? `\nIncluye: ${extras.join(", ")}.` : "";
  const cierre = precio
    ? `\n\n${precio}. Escribinos por privado y coordinamos para verlo.`
    : "\n\nEscribinos por privado y te pasamos el precio y la financiación.";
  return `${titulo}\n${cuerpo}${detalle}${cierre}${firma}`;
}

// ---------- Rendimiento ----------

export interface PublicacionConMetricas {
  id: string;
  red: RedPub;
  formato: string;
  estado: EstadoPub;
  url: string | null;
  publicado_en: string;
  likes: number | null;
  comentarios: number | null;
  compartidos: number | null;
  metricas_actualizadas_en: string | null;
}

export interface RendimientoVehiculo {
  vehiculo_id: string | null;
  /** Null cuando el vehículo se borró: la publicación igual existió. */
  nombre: string;
  publicaciones: PublicacionConMetricas[];
  likes: number;
  comentarios: number;
  vivas: number;
}

interface FilaPub {
  id: string;
  vehiculo_id: string | null;
  red: RedPub;
  formato: string;
  estado: EstadoPub;
  url: string | null;
  metricas: Record<string, unknown> | null;
  metricas_actualizadas_en: string | null;
  publicado_en: string;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" ? valor : null;
}

/**
 * Agrupa el historial de publicaciones por vehículo.
 *
 * Incluye las retiradas a propósito: saber que un auto tuvo seis publicaciones
 * antes de venderse es justamente el dato que sirve para el próximo parecido.
 */
export async function cargarRendimiento(vehiculos: Vehiculo[]): Promise<RendimientoVehiculo[]> {
  const { data, error } = await supabase
    .from("publicaciones_redes")
    .select("id, vehiculo_id, red, formato, estado, url, metricas, metricas_actualizadas_en, publicado_en")
    .order("publicado_en", { ascending: false })
    .limit(300);
  if (error) throw error;

  const porId = new Map(vehiculos.map((v) => [v.id, v]));
  const grupos = new Map<string, RendimientoVehiculo>();

  for (const fila of (data ?? []) as FilaPub[]) {
    const clave = fila.vehiculo_id ?? "sueltas";
    if (!grupos.has(clave)) {
      const v = fila.vehiculo_id ? porId.get(fila.vehiculo_id) : undefined;
      grupos.set(clave, {
        vehiculo_id: fila.vehiculo_id,
        // Si el auto ya no está, no se inventa un nombre: se dice qué pasó.
        nombre: v ? nombreVehiculo(v) : fila.vehiculo_id ? "Vehículo dado de baja" : "Publicaciones sueltas",
        publicaciones: [],
        likes: 0,
        comentarios: 0,
        vivas: 0,
      });
    }

    const grupo = grupos.get(clave)!;
    const likes = numero(fila.metricas?.likes);
    const comentarios = numero(fila.metricas?.comentarios);

    grupo.publicaciones.push({
      id: fila.id,
      red: fila.red,
      formato: fila.formato,
      estado: fila.estado,
      url: fila.url,
      publicado_en: fila.publicado_en,
      likes,
      comentarios,
      compartidos: numero(fila.metricas?.compartidos),
      metricas_actualizadas_en: fila.metricas_actualizadas_en,
    });
    grupo.likes += likes ?? 0;
    grupo.comentarios += comentarios ?? 0;
    if (fila.estado === "publicada") grupo.vivas += 1;
  }

  // Más interacción primero; a igualdad, el que tiene más publicaciones vivas.
  return [...grupos.values()].sort(
    (a, b) => b.likes + b.comentarios - (a.likes + a.comentarios) || b.vivas - a.vivas
  );
}

export interface ResultadoRefresco {
  revisadas: number;
  actualizadas: number;
  sin_datos: number;
}

/** Pide al servidor que traiga de Meta los contadores de lo que sigue publicado. */
export async function refrescarMetricas(): Promise<ResultadoRefresco> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Volvé a iniciar sesión.");

  const resp = await fetch("/api/redes/metricas", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(data.error || "No se pudieron actualizar las métricas.");
  return data as ResultadoRefresco;
}
