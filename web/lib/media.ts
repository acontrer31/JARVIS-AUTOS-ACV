import { miAgenciaId, supabase } from "@/lib/supabase";

// Bucket de Supabase Storage creado por el usuario desde el dashboard.
// Es público para lectura (las fotos del catálogo tienen que verse sin login,
// igual que en el sitio de la agencia) y la escritura la controlan las policies
// de storage.objects — ver supabase/storage-policies.sql.
const BUCKET = "vehiculos";

// Límite del lado del cliente para no mandar al servidor algo que va a rebotar.
// El bucket tiene su propio límite configurado en Supabase; este es el aviso
// temprano, no la autoridad.
export const MAX_BYTES = 10 * 1024 * 1024;

export interface Foto {
  id: string;
  vehiculo_id: string;
  url: string;
  ruta: string | null;
  orden: number;
}

export async function cargarFotos(vehiculoId: string): Promise<Foto[]> {
  const { data, error } = await supabase
    .from("vehiculo_media")
    .select("id, vehiculo_id, url, ruta, orden")
    .eq("vehiculo_id", vehiculoId)
    .eq("tipo", "foto")
    .order("orden");
  if (error) throw error;
  return (data ?? []) as unknown as Foto[];
}

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "jpg";
}

// La ruta arranca con el agencia_id a propósito: las policies de Storage
// comparan esa primera carpeta contra la agencia del usuario, que es lo que
// impide que una agencia toque los archivos de otra.
export async function subirFoto(vehiculoId: string, archivo: File, orden: number): Promise<Foto> {
  if (!archivo.type.startsWith("image/")) {
    throw new Error("El archivo tiene que ser una imagen.");
  }
  if (archivo.size > MAX_BYTES) {
    throw new Error(`La imagen supera los ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  }

  const agencia_id = await miAgenciaId();
  const ruta = `${agencia_id}/${vehiculoId}/${crypto.randomUUID()}.${extension(archivo.name)}`;

  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    cacheControl: "3600",
    upsert: false,
  });
  if (errorSubida) throw errorSubida;

  const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

  const { data, error } = await supabase
    .from("vehiculo_media")
    .insert({ vehiculo_id: vehiculoId, agencia_id, tipo: "foto", url: publica.publicUrl, ruta, orden })
    .select("id, vehiculo_id, url, ruta, orden")
    .single();
  if (error) {
    // Si la fila no se pudo crear, el archivo quedaría huérfano en el bucket
    // ocupando espacio sin que nada lo referencie. Se limpia.
    await supabase.storage.from(BUCKET).remove([ruta]);
    throw error;
  }
  return data as unknown as Foto;
}

// Los videos pesan bastante más que las fotos; el bucket igual tiene su propio
// límite configurado en Supabase, que manda por encima de este aviso temprano.
export const MAX_BYTES_VIDEO = 50 * 1024 * 1024;

// Sube un video al bucket público y devuelve su URL pública, lista para usar en
// un Reel (Meta descarga el archivo desde esa URL). No crea fila en
// `vehiculo_media`: es un archivo suelto para publicar, no una foto del stock.
// La ruta arranca con el agencia_id, igual que las fotos, para cumplir las
// policies de Storage.
export async function subirVideo(archivo: File): Promise<string> {
  if (!archivo.type.startsWith("video/")) {
    throw new Error("El archivo tiene que ser un video.");
  }
  if (archivo.size > MAX_BYTES_VIDEO) {
    throw new Error(`El video supera los ${Math.round(MAX_BYTES_VIDEO / 1024 / 1024)} MB.`);
  }

  const agencia_id = await miAgenciaId();
  const ruta = `${agencia_id}/videos/${crypto.randomUUID()}.${extension(archivo.name)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

// Sube una imagen generada en el navegador (la pieza de una historia con el
// texto ya dibujado) y devuelve su URL pública para publicarla.
export async function subirImagenGenerada(blob: Blob): Promise<string> {
  const agencia_id = await miAgenciaId();
  const ruta = `${agencia_id}/historias/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

export async function eliminarFoto(foto: Foto): Promise<void> {
  // Primero el archivo, después la fila: al revés, un fallo al borrar el
  // archivo dejaría una foto invisible pero ocupando espacio para siempre.
  if (foto.ruta) {
    const { error } = await supabase.storage.from(BUCKET).remove([foto.ruta]);
    if (error) throw error;
  }
  const { error } = await supabase.from("vehiculo_media").delete().eq("id", foto.id);
  if (error) throw error;
}
