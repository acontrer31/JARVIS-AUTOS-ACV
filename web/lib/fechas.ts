// Fechas en hora local, no en UTC.
//
// `new Date().toISOString().slice(0, 10)` parece la forma obvia de sacar "hoy",
// pero devuelve el día en UTC. En Argentina (UTC−3) eso significa que a partir
// de las 21:00 ya dice el día siguiente: un movimiento de caja cargado a las
// 22:00 quedaba fechado mañana, y el último día del mes a las 21:00 el reporte
// mensual saltaba al mes que viene.
//
// Estas funciones usan la fecha local del navegador, que es la hora que el
// usuario tiene en la cabeza.

export function aISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Hoy en formato AAAA-MM-DD, según la hora local. */
export function hoyISO(): string {
  return aISO(new Date());
}
