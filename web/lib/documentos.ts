import { extracto, ordenarPorRelevancia, palabrasUtiles } from "@/lib/extracto";
import { miAgenciaId, supabase } from "@/lib/supabase";

// Base de conocimiento de la agencia: lo que hoy está en un cuaderno, en un
// chat o en la cabeza de una sola persona. Un documento es una nota escrita
// acá, un archivo subido, o las dos cosas (el PDF con una explicación arriba).

// Bucket PRIVADO, a diferencia del de fotos: una lista de precios o un contrato
// no tiene por qué leerse sin login. Se abre con URLs firmadas de corta
// duración — ver `urlFirmada`.
const BUCKET = "documentos";

export const MAX_BYTES = 25 * 1024 * 1024;

export const CATEGORIAS = ["tramites", "precios", "politicas", "proveedores", "manuales", "otros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  tramites: "Trámites",
  precios: "Precios y tarifas",
  politicas: "Políticas internas",
  proveedores: "Proveedores",
  manuales: "Manuales",
  otros: "Otros",
};

export interface Documento {
  id: string;
  titulo: string;
  categoria: Categoria;
  contenido: string | null;
  archivo_ruta: string | null;
  archivo_nombre: string | null;
  archivo_tipo: string | null;
  archivo_bytes: number | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

const COLUMNAS =
  "id, titulo, categoria, contenido, archivo_ruta, archivo_nombre, archivo_tipo, archivo_bytes, " +
  "creado_por, creado_en, actualizado_en";

/**
 * Lista los documentos. Con `texto` busca en el servidor por título y
 * contenido (índice de texto completo en castellano), no bajando todo al
 * navegador para filtrar acá.
 */
export async function cargarDocumentos(opciones?: {
  categoria?: Categoria | null;
  texto?: string;
}): Promise<Documento[]> {
  // La consulta base se arma cada vez: el builder de Supabase se va mutando a
  // medida que se le encadenan filtros, así que no se puede reutilizar entre
  // los dos intentos de abajo.
  const base = () => {
    const q = supabase.from("documentos").select(COLUMNAS).order("actualizado_en", { ascending: false });
    return opciones?.categoria ? q.eq("categoria", opciones.categoria) : q;
  };

  const buscar = async (q: ReturnType<typeof base>) => {
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as Documento[];
  };

  const texto = (opciones?.texto ?? "").trim();
  if (!texto) return buscar(base());

  // Primero, la búsqueda exacta. `websearch` entiende lo que la gente escribe
  // de verdad ("transferencia 0km", comillas, -palabra) sin explotar con
  // caracteres sueltos, que es lo que pasa con `plain` cuando alguien tipea un
  // guion. Cuando encuentra algo, es lo más preciso que hay.
  const estricta = await buscar(
    base().textSearch("busqueda", texto, { type: "websearch", config: "spanish" })
  );
  if (estricta.length) return estricta;

  // Si no encontró nada, se busca de nuevo con CUALQUIERA de las palabras.
  //
  // Esto no es un lujo: `websearch` exige TODAS. Preguntar "qué pongo en valor
  // declarado" pedía también "pongo", que no está escrito en ningún lado, y
  // devolvía cero aunque el documento que lo explica estuviera cargado. Por voz
  // eso es peor que inútil — la persona pregunta como habla, y siempre va a
  // meter una palabra que el documento no usa.
  //
  // Lo que entra por acá es más flojo, así que se ordena por pertinencia antes
  // de devolverlo (ver `ordenarPorRelevancia`).
  const palabras = palabrasUtiles(texto);
  if (!palabras.length) return [];

  const amplia = await buscar(
    base().textSearch("busqueda", palabras.join(" or "), { type: "websearch", config: "spanish" })
  );
  return ordenarPorRelevancia(amplia, texto);
}

export interface DocumentoInput {
  titulo: string;
  categoria: Categoria;
  contenido: string | null;
}

function validar(datos: DocumentoInput, tieneArchivo: boolean): void {
  if (!datos.titulo.trim()) throw new Error("El documento necesita un título.");
  if (!datos.contenido?.trim() && !tieneArchivo) {
    throw new Error("Escribí algo o adjuntá un archivo: un documento vacío no sirve para buscar nada.");
  }
}

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "bin";
}

// La ruta arranca con el agencia_id: es lo que comparan las policies de Storage
// para que una agencia no lea los papeles de otra.
async function subirArchivo(archivo: File): Promise<{ ruta: string }> {
  if (archivo.size > MAX_BYTES) {
    throw new Error(`El archivo supera los ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  }
  const agencia_id = await miAgenciaId();
  const ruta = `${agencia_id}/${crypto.randomUUID()}.${extension(archivo.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return { ruta };
}

export async function crearDocumento(datos: DocumentoInput, archivo?: File | null): Promise<Documento> {
  validar(datos, !!archivo);
  const agencia_id = await miAgenciaId();
  const { data: sesion } = await supabase.auth.getSession();

  const subido = archivo ? await subirArchivo(archivo) : null;

  const { data, error } = await supabase
    .from("documentos")
    .insert({
      agencia_id,
      titulo: datos.titulo.trim(),
      categoria: datos.categoria,
      contenido: datos.contenido?.trim() || null,
      archivo_ruta: subido?.ruta ?? null,
      archivo_nombre: archivo?.name ?? null,
      archivo_tipo: archivo?.type ?? null,
      archivo_bytes: archivo?.size ?? null,
      creado_por: sesion.session?.user?.id ?? null,
    })
    .select(COLUMNAS)
    .single();

  if (error) {
    // Sin la fila, el archivo queda huérfano en el bucket ocupando espacio sin
    // que nada lo referencie. Mismo criterio que las fotos del stock.
    if (subido) await supabase.storage.from(BUCKET).remove([subido.ruta]);
    throw error;
  }
  return data as unknown as Documento;
}

/**
 * Corrige un documento. `archivo` reemplaza el adjunto; el anterior se borra
 * recién cuando el update salió bien, para no quedarse sin ninguno de los dos
 * si algo falla en el medio.
 */
export async function actualizarDocumento(
  documento: Documento,
  datos: DocumentoInput,
  archivo?: File | null
): Promise<Documento> {
  validar(datos, !!archivo || !!documento.archivo_ruta);
  const subido = archivo ? await subirArchivo(archivo) : null;

  const { data, error } = await supabase
    .from("documentos")
    .update({
      titulo: datos.titulo.trim(),
      categoria: datos.categoria,
      contenido: datos.contenido?.trim() || null,
      actualizado_en: new Date().toISOString(),
      ...(subido
        ? {
            archivo_ruta: subido.ruta,
            archivo_nombre: archivo?.name ?? null,
            archivo_tipo: archivo?.type ?? null,
            archivo_bytes: archivo?.size ?? null,
          }
        : {}),
    })
    .eq("id", documento.id)
    .select(COLUMNAS)
    .single();

  if (error) {
    if (subido) await supabase.storage.from(BUCKET).remove([subido.ruta]);
    throw error;
  }
  if (subido && documento.archivo_ruta) {
    await supabase.storage.from(BUCKET).remove([documento.archivo_ruta]);
  }
  return data as unknown as Documento;
}

export async function eliminarDocumento(documento: Documento): Promise<void> {
  // Primero el archivo, después la fila: al revés, un fallo borrando el archivo
  // dejaría un adjunto invisible ocupando espacio para siempre.
  if (documento.archivo_ruta) {
    const { error } = await supabase.storage.from(BUCKET).remove([documento.archivo_ruta]);
    if (error) throw error;
  }
  const { error } = await supabase.from("documentos").delete().eq("id", documento.id);
  if (error) throw error;
}

/**
 * URL temporal para abrir un adjunto. El bucket es privado, así que no hay URL
 * pública: se firma en el momento y vence a los 5 minutos, lo suficiente para
 * abrirlo y no tanto como para que el link sirva pegado en otro lado.
 */
export async function urlFirmada(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function tamanioLegible(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lo que le contesta JARVIS por voz: los documentos que mejor coinciden, con
 * el pedazo que de verdad contesta la pregunta.
 *
 * Lo que devuelve esto NO se lee en voz alta: se lo damos al modelo para que
 * arme la respuesta hablada. Por eso conviene mandarle de mas y no de menos
 * —ver `extracto`, que es donde vive esa decision y el test que la cuida—.
 */
export async function buscarParaVoz(texto: string, tope = 3): Promise<{ titulo: string; extracto: string }[]> {
  const docs = await cargarDocumentos({ texto });
  return docs.slice(0, tope).map((d) => ({
    titulo: d.titulo,
    extracto: extracto(d.contenido, texto) || (d.archivo_nombre ? `Está en el archivo ${d.archivo_nombre}.` : ""),
  }));
}

