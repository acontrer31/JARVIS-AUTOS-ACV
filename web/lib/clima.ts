// Clima por voz. Usa Open-Meteo (open-meteo.com): gratis, sin API key y con CORS
// abierto, así que se puede llamar directo desde el navegador (client tool de la
// voz). Dos pasos: geocodificar el nombre de la ciudad a lat/lon, y pedir el
// clima actual. Nunca inventa: si no encuentra la ciudad o falla la red, lo dice.

// Mapa de códigos WMO (weather_code de Open-Meteo) a una descripción en español.
const CODIGOS_CLIMA: Record<number, string> = {
  0: "despejado",
  1: "mayormente despejado",
  2: "parcialmente nublado",
  3: "nublado",
  45: "con niebla",
  48: "con niebla y escarcha",
  51: "con llovizna leve",
  53: "con llovizna",
  55: "con llovizna intensa",
  56: "con llovizna helada",
  57: "con llovizna helada intensa",
  61: "con lluvia leve",
  63: "con lluvia",
  65: "con lluvia intensa",
  66: "con lluvia helada",
  67: "con lluvia helada intensa",
  71: "con nevada leve",
  73: "con nevada",
  75: "con nevada intensa",
  77: "con granos de nieve",
  80: "con chaparrones leves",
  81: "con chaparrones",
  82: "con chaparrones fuertes",
  85: "con chaparrones de nieve",
  86: "con chaparrones de nieve intensos",
  95: "con tormenta",
  96: "con tormenta y granizo",
  99: "con tormenta y granizo fuerte",
};

interface Lugar {
  latitude: number;
  longitude: number;
  name: string;
  admin1?: string;
  country?: string;
}

interface ClimaActual {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  weather_code: number;
  wind_speed_10m: number;
}

// Devuelve una frase lista para que JARVIS la lea. `ciudad` es lo que dijo el
// usuario ("Córdoba", "Buenos Aires", "Rosario", …).
export async function consultarClima(ciudad: string): Promise<string> {
  const nombre = (ciudad || "").trim();
  if (!nombre) return "¿De qué ciudad querés el clima?";

  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        nombre
      )}&count=1&language=es&format=json`
    );
    const geo = (await geoResp.json()) as { results?: Lugar[] };
    const lugar = geo.results?.[0];
    if (!lugar) return `No encontré la ciudad "${ciudad}". ¿Podés repetir el nombre?`;

    const climaResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
    );
    const clima = (await climaResp.json()) as { current?: ClimaActual };
    const c = clima.current;
    if (!c) return `No pude obtener el clima de ${lugar.name} en este momento. Probá de nuevo.`;

    const desc = CODIGOS_CLIMA[c.weather_code] ?? "con condiciones variables";
    const temp = Math.round(c.temperature_2m);
    const sensacion = Math.round(c.apparent_temperature);
    const viento = Math.round(c.wind_speed_10m);
    const humedad = Math.round(c.relative_humidity_2m);
    const ubicacion = [lugar.name, lugar.admin1, lugar.country].filter(Boolean).join(", ");

    return (
      `En ${ubicacion} está ${desc}, ${temp} grados` +
      (sensacion !== temp ? ` (sensación ${sensacion})` : "") +
      `, humedad ${humedad}% y viento a ${viento} kilómetros por hora.`
    );
  } catch {
    return "No pude consultar el clima ahora mismo. Probá de nuevo en un momento.";
  }
}
