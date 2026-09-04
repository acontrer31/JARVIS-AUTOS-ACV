// Instagram ignora el texto/epígrafe de las historias publicadas por API: no
// existe el "sticker de texto" como en la app. La única forma de que la historia
// salga con una leyenda es DIBUJARLA sobre la imagen antes de publicar. Esto
// compone, en el navegador, una pieza 1080x1920 con la identidad de JARVIS:
// la foto del auto de fondo, una banda verde abajo y el texto en dorado.

const ANCHO = 1080;
const ALTO = 1920;

const DORADO = "#d4a72c";
const CREMA = "#f5f0e6";
// El verde de marca va con alfa sobre la foto, así que se usa como rgba abajo.
const VERDE_BANDA = "rgba(14,77,60,0.92)";

// Corta un texto en líneas que entren en `maxAncho` con la fuente ya aplicada.
function enLineas(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Necesario para poder exportar el canvas: sin esto queda "tainted" y
    // toBlob falla. El bucket de Supabase es público y responde con CORS.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la foto del vehículo."));
    img.src = url;
  });
}

export interface DatosHistoria {
  fotoUrl: string;
  /** Lo que escribe el usuario: "VENDO", el teléfono, lo que sea. */
  texto: string;
  /** Línea con los datos del auto que arma JARVIS (modelo, año, km, precio). */
  datosVehiculo?: string;
  /** Nombre de la agencia, al pie. */
  agencia?: string;
}

// Devuelve la pieza lista para subir y publicar como historia.
export async function componerHistoria({
  fotoUrl,
  texto,
  datosVehiculo,
  agencia,
}: DatosHistoria): Promise<Blob> {
  const img = await cargarImagen(fotoUrl);

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo preparar la imagen.");

  // Fondo y foto "cover" (llena la pantalla sin deformarse).
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const escala = Math.max(ANCHO / img.width, ALTO / img.height);
  const ancho = img.width * escala;
  const alto = img.height * escala;
  ctx.drawImage(img, (ANCHO - ancho) / 2, (ALTO - alto) / 2, ancho, alto);

  // Degradado inferior para que el texto se lea siempre.
  const grad = ctx.createLinearGradient(0, ALTO * 0.45, 0, ALTO);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, ALTO * 0.45, ANCHO, ALTO * 0.55);

  // Banda verde de marca.
  const bandaAlto = 420;
  const bandaY = ALTO - bandaAlto;
  ctx.fillStyle = VERDE_BANDA;
  ctx.fillRect(0, bandaY, ANCHO, bandaAlto);
  ctx.fillStyle = DORADO;
  ctx.fillRect(0, bandaY, ANCHO, 6);

  const margen = 72;
  let y = bandaY + 110;

  // Texto del usuario, en dorado y grande.
  if (texto.trim()) {
    ctx.font = "bold 72px system-ui, sans-serif";
    ctx.fillStyle = DORADO;
    ctx.textAlign = "left";
    const lineas = enLineas(ctx, texto.trim(), ANCHO - margen * 2).slice(0, 3);
    for (const linea of lineas) {
      ctx.fillText(linea, margen, y);
      y += 86;
    }
  }

  // Datos del auto que completa JARVIS.
  if (datosVehiculo) {
    ctx.font = "500 44px system-ui, sans-serif";
    ctx.fillStyle = CREMA;
    const lineas = enLineas(ctx, datosVehiculo, ANCHO - margen * 2).slice(0, 2);
    for (const linea of lineas) {
      ctx.fillText(linea, margen, y);
      y += 56;
    }
  }

  // Isologo "AA" + agencia, al pie.
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillStyle = DORADO;
  ctx.textAlign = "right";
  ctx.fillText("AA", ANCHO - margen, ALTO - 72);
  if (agencia) {
    ctx.font = "500 32px system-ui, sans-serif";
    ctx.fillStyle = CREMA;
    ctx.fillText(agencia, ANCHO - margen, ALTO - 128);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen de la historia."))),
      "image/jpeg",
      0.92
    );
  });
}
