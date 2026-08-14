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
