// Tema día/noche atado a la hora real en Argentina (no al huso horario del
// navegador de quien mira la pantalla, ni a prefers-color-scheme del SO) —
// pedido explícito del usuario: blanco de día, negro de noche, según la hora
// en Argentina. Argentina no tiene horario de verano desde 2009, así que el
// offset es fijo (UTC-3) y este cálculo no necesita ajustes estacionales.
export function horaArgentina(fecha: Date = new Date()): number {
  const hora = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "numeric",
    hour12: false,
  }).format(fecha);
  return parseInt(hora, 10) % 24;
}

// Rango de "día" 7:00–19:59. Fuera de eso, noche.
export function esDeDia(fecha: Date = new Date()): boolean {
  const hora = horaArgentina(fecha);
  return hora >= 7 && hora < 20;
}

// --- Elección manual del tema -------------------------------------------------
// Por defecto el tema es automático por hora (arriba). Pero el usuario puede
// fijarlo a mano (desde Seguridad o por voz). Esa elección se guarda en el
// navegador y, mientras exista, gana sobre el automático.

export type Tema = "dia" | "noche";

const CLAVE_TEMA = "jarvis-tema";
// Evento propio para que la UI (el toggle) se entere cuando el tema cambia por
// otra vía —por ejemplo, cuando el cambio lo pide la voz.
export const EVENTO_TEMA = "jarvis-tema";

// Preferencia manual guardada, o null si sigue en automático por hora.
export function temaGuardado(): Tema | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CLAVE_TEMA);
    return v === "dia" || v === "noche" ? v : null;
  } catch {
    return null;
  }
}

// Tema que se está mostrando ahora (leído del <html>).
export function temaActual(): Tema {
  if (typeof document === "undefined") return "dia";
  return document.documentElement.dataset.tema === "noche" ? "noche" : "dia";
}

// Aplica un tema al documento, sin guardarlo.
export function aplicarTema(tema: Tema): void {
  if (typeof document !== "undefined") document.documentElement.dataset.tema = tema;
}

// Fija un tema manual: lo aplica, lo guarda y avisa a quien escuche (para que el
// toggle de la UI se actualice al instante cuando el cambio viene de la voz).
export function fijarTema(tema: Tema): void {
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema);
  } catch {}
  aplicarTema(tema);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: tema }));
  }
}

// Alterna día <-> noche y devuelve el nuevo.
export function alternarTema(): Tema {
  const nuevo: Tema = temaActual() === "noche" ? "dia" : "noche";
  fijarTema(nuevo);
  return nuevo;
}
