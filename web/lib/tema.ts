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
