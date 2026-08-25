// Motores determinísticos de financiación — mismas fórmulas ya probadas y en
// producción en script.js del sitio estático. Nunca inventan un número: si
// falta un dato (precio, valor tabla), devuelven null y quien llama debe
// avisarlo explícitamente en vez de mostrar cualquier cosa.

export interface SimulacionCuotas {
  cuotas: number;
  valorCuota: number;
}

// Precio ÷ cuotas, sin interés (no hay tasas/condiciones bancarias reales
// cargadas todavía) — siempre orientativo, nunca una cotización oficial.
export function simularCuotas(precio: number | null, cuotas: number): SimulacionCuotas | null {
  if (!precio || precio <= 0) return null;
  const n = Math.max(1, Math.min(60, Math.round(cuotas)));
  return { cuotas: n, valorCuota: Math.round(precio / n) };
}

export interface CostoTransferenciaDNRPA {
  arancel: number;
  fijo: number;
  total: number;
}

// Fórmula real de DNRPA, verificada con 3 ejemplos oficiales (Ford Ka, VW
// Nivus, Fiat Cronos — nacional e importado dan la misma alícuota):
// 1% del Valor Tabla + arancel fijo $1.300 (Res. 314/02).
export function calcularCostoTransferenciaDNRPA(valorTabla: number | null): CostoTransferenciaDNRPA | null {
  if (!valorTabla || valorTabla <= 0) return null;
  const arancel = valorTabla * 0.01;
  const fijo = 1300;
  return { arancel, fijo, total: arancel + fijo };
}

export const DNRPA_DISCLAIMER =
  "Al valor estimado pueden sumarse costos de: formularios de rentas, certificación de firmas, expedición de cédulas adicionales y moras de firma (20% del arancel si se excede el plazo de 90 días desde la certificación del formulario 08). Esto es una estimación, no un presupuesto oficial.";

// Valores de negocio de la agencia para armar el precio final de la operación.
// Se exportan para que la UI los use como default, pero son editables ahí: son
// parámetros comerciales que pueden cambiar y no deberían requerir tocar código.
export const GESTORIA_DEFAULT = 150000;
export const AJUSTE_DEFAULT = 0.025; // 2.5%

export interface TransferenciaTotal {
  valorTablaAjustado: number; // valor tabla + ajuste
  totalDNRPA: number; // el total del presupuesto oficial de DNRPA (1% + arancel fijo)
  gestoria: number;
  total: number;
}

// Precio final de la transferencia que le cobra la agencia:
//   valorTabla × (1 + ajuste) + total del presupuesto DNRPA + gestoría.
// El total DNRPA sale de la fórmula ya verificada (calcularCostoTransferenciaDNRPA);
// se confirmó con un presupuesto oficial real (Ford Ka: 1% de 18.308.800 + 1.300
// = 184.388, idéntico al total que imprime el sitio de DNRPA).
export function calcularTransferenciaTotal(params: {
  valorTabla: number | null;
  ajuste?: number;
  gestoria?: number;
}): TransferenciaTotal | null {
  const dnrpa = calcularCostoTransferenciaDNRPA(params.valorTabla);
  if (!dnrpa || !params.valorTabla) return null;
  const ajuste = params.ajuste ?? AJUSTE_DEFAULT;
  const gestoria = params.gestoria ?? GESTORIA_DEFAULT;
  const valorTablaAjustado = params.valorTabla * (1 + ajuste);
  return {
    valorTablaAjustado,
    totalDNRPA: dnrpa.total,
    gestoria,
    total: valorTablaAjustado + dnrpa.total + gestoria,
  };
}

export interface Prenda {
  montoFinanciado: number; // valor de la cuota × cantidad de meses
  montoAjustado: number; // montoFinanciado + ajuste
  gestoria: number;
  total: number;
}

// Costo de la prenda cuando el cliente financia:
//   (valor de cuota de MG Group × meses) × (1 + ajuste) + gestoría.
// El valor de la cuota lo ingresa el usuario (viene de MG Group) — JARVIS no lo
// inventa: si falta, devuelve null y la UI lo avisa.
export function calcularPrenda(params: {
  valorCuota: number | null;
  meses: number | null;
  ajuste?: number;
  gestoria?: number;
}): Prenda | null {
  if (!params.valorCuota || params.valorCuota <= 0) return null;
  if (!params.meses || params.meses <= 0) return null;
  const ajuste = params.ajuste ?? AJUSTE_DEFAULT;
  const gestoria = params.gestoria ?? GESTORIA_DEFAULT;
  const montoFinanciado = params.valorCuota * params.meses;
  const montoAjustado = montoFinanciado * (1 + ajuste);
  return {
    montoFinanciado,
    montoAjustado,
    gestoria,
    total: montoAjustado + gestoria,
  };
}
