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

/**
 * Los items del presupuesto de DNRPA que NO salen del 1%.
 *
 * Hoy son $3.080, la certificación de firmas ("8A adicionales"). Verificado
 * contra un presupuesto oficial de un VW Gol 2013 importado: valor de tabla
 * 7.211.200 → total 75.192, que es exactamente 72.112 (el 1%) + 3.080.
 *
 * Los otros dos items que aparecen en el presupuesto —expedición de título y
 * de cédula— vienen con su bonificación por la misma plata y se anulan de a
 * pares, así que no suman nada.
 *
 * Es un valor por defecto y no una constante escrita en la fórmula porque
 * cambia: DNRPA actualiza los aranceles, y no todos los trámites llevan los
 * mismos items. Un presupuesto anterior (Ford Ka) daba $1.300 en su momento.
 */
export const ARANCEL_FIJO_DEFAULT = 3080;

// Fórmula real de DNRPA: 1% del Valor Tabla + los items fijos del presupuesto.
// El 1% está verificado contra varios presupuestos oficiales (Ford Ka, VW
// Nivus, Fiat Cronos, VW Gol — nacional e importado dan la misma alícuota) y no
// se movió nunca. Lo que sí se mueve es el fijo, por eso se puede pasar.
export function calcularCostoTransferenciaDNRPA(
  valorTabla: number | null,
  fijo: number = ARANCEL_FIJO_DEFAULT
): CostoTransferenciaDNRPA | null {
  if (!valorTabla || valorTabla <= 0) return null;
  // Al peso entero: los presupuestos de DNRPA vienen en pesos enteros, y
  // arrastrar centésimas hace que después los totales no den exactos.
  const arancel = Math.round(valorTabla * 0.01);
  return { arancel, fijo, total: arancel + fijo };
}

/**
 * Cómo se saca el presupuesto en el sitio del registro.
 *
 * Esto no es un detalle de implementación: es el paso que hace que toda la
 * cuenta sea real. JARVIS no puede entrar a DNRPA —no hay API pública y el
 * trámite es por formulario— así que el Valor Tabla y el total del presupuesto
 * los trae una persona. Si esa persona no está, o no sabe que "valor declarado"
 * va siempre en 1, la cotización sale mal o no sale.
 *
 * Confirmado por la agencia en septiembre de 2026. Está escrito acá y también
 * cargado como documento en el módulo Conocimiento, que es donde lo va a
 * buscar alguien que no lee el código.
 */
export const CONSULTA_DNRPA_PASOS = [
  "Entrá al sitio del registro (dnrpa.gov.ar) y abrí la consulta de aranceles.",
  "Tipo de trámite: Transferencia.",
  "Patente: el dominio del vehículo.",
  "Valor declarado: 1. Siempre 1 — el arancel se calcula sobre el valor de tabla, no sobre lo que se declare.",
  "Provincia: Salta.",
  "De la respuesta anotá dos números: el Valor Tabla y el TOTAL del presupuesto.",
] as const;

export const DNRPA_DISCLAIMER =
  "Al valor estimado pueden sumarse costos de: formularios de rentas, certificación de firmas, expedición de cédulas adicionales y moras de firma (20% del arancel si se excede el plazo de 90 días desde la certificación del formulario 08). Esto es una estimación, no un presupuesto oficial.";

// Valores de negocio de la agencia para armar el precio final de la operación.
// Se exportan para que la UI los use como default, pero son editables ahí: son
// parámetros comerciales que pueden cambiar y no deberían requerir tocar código.
export const GESTORIA_DEFAULT = 200000;
export const AJUSTE_DEFAULT = 0.025; // 2.5%

export interface TransferenciaTotal {
  /** El 2,5% del valor de tabla: el honorario de la agencia por el trámite. */
  honorario: number;
  /** El total del presupuesto oficial de DNRPA (1% + los items fijos). */
  totalDNRPA: number;
  gestoria: number;
  /** Lo que la agencia le cobra al cliente por la transferencia. */
  total: number;
}

/**
 * Lo que la agencia le cobra al cliente por hacerle la transferencia:
 *   2,5% del valor de tabla + total del presupuesto DNRPA + gestoría.
 *
 * OJO con el 2,5%: es un HONORARIO sobre el valor de tabla, no un recargo que
 * arrastre el valor del auto. Hasta septiembre de 2026 esta función calculaba
 * `valorTabla × 1,025`, así que metía el auto entero adentro del costo del
 * trámite: para un Ford Ka de 18,3 millones devolvía una transferencia de
 * 19.150.908. La cuenta correcta da 842.108.
 *
 * Es la misma forma que `calcularPrenda`, y la agencia las explica igual:
 * "se multiplica por el 2,5% y se suma la gestoría".
 */
export function calcularTransferenciaTotal(params: {
  valorTabla: number | null;
  ajuste?: number;
  gestoria?: number;
  /** Los items fijos del presupuesto de DNRPA (ver ARANCEL_FIJO_DEFAULT). */
  arancelFijo?: number;
  /**
   * El total del presupuesto tal como lo imprime el sitio del registro. Si
   * viene, MANDA sobre la estimación de `1% + fijo`.
   *
   * La estimación acierta casi siempre, pero el fijo cambia y no todos los
   * trámites llevan los mismos items —un presupuesto viejo daba $1.300 donde
   * hoy hay $3.080—, así que el único número que no discute nadie es el que
   * quien consultó leyó en la pantalla. Ver CONSULTA_DNRPA_PASOS.
   */
  totalDNRPA?: number | null;
}): TransferenciaTotal | null {
  if (!params.valorTabla || params.valorTabla <= 0) return null;
  const estimado = calcularCostoTransferenciaDNRPA(params.valorTabla, params.arancelFijo);
  // `>= 0` y no `> 0`: un presupuesto en cero no existe, pero tampoco hay que
  // taparlo con la estimación. Lo que sí se ignora es un número negativo, que
  // solo puede ser un error de tipeo.
  const totalDNRPA =
    params.totalDNRPA != null && params.totalDNRPA >= 0 ? params.totalDNRPA : estimado?.total;
  if (totalDNRPA == null) return null;
  const ajuste = params.ajuste ?? AJUSTE_DEFAULT;
  const gestoria = params.gestoria ?? GESTORIA_DEFAULT;
  const honorario = Math.round(params.valorTabla * ajuste);
  return {
    honorario,
    totalDNRPA,
    gestoria,
    total: honorario + totalDNRPA + gestoria,
  };
}

export interface Prenda {
  /** Cuota × meses: lo que el cliente termina devolviéndole a MG Group. */
  totalADevolver: number;
  /** El costo de inscribir la prenda: el ajuste sobre lo anterior. */
  costoPrenda: number;
  gestoria: number;
  /** Lo que la agencia le cobra al cliente por la prenda. */
  total: number;
}

/**
 * Costo de inscribir la prenda cuando el cliente financia.
 *
 * Es el 2,5% del TOTAL A DEVOLVER del crédito, más la gestoría. Con 12 cuotas
 * de $100.000: se devuelven $1.200.000, la prenda cuesta $30.000, y con
 * gestoría el cliente paga $230.000.
 *
 * OJO con lo que devuelve: es el COSTO del trámite, no el crédito. Hasta
 * septiembre de 2026 esta función sumaba el crédito entero más el 2,5% más la
 * gestoría, así que para ese mismo ejemplo devolvía $1.380.000 en vez de
 * $230.000 — confundía "el crédito con su recargo" con "lo que cuesta
 * inscribir la prenda". Son cosas distintas.
 *
 * El valor de la cuota lo ingresa el usuario (viene de MG Group) — JARVIS no lo
 * inventa: si falta, devuelve null y la UI lo avisa.
 */
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
  const totalADevolver = params.valorCuota * params.meses;
  const costoPrenda = Math.round(totalADevolver * ajuste);
  return {
    totalADevolver,
    costoPrenda,
    gestoria,
    total: costoPrenda + gestoria,
  };
}

export interface Operacion {
  /** Transferencia SIN gestoría: honorario + presupuesto de DNRPA. */
  transferencia: TransferenciaTotal;
  /** Prenda SIN gestoría, o null si el cliente no financia. */
  prenda: Prenda | null;
  /** Una sola vez, aunque la operación tenga transferencia y prenda. */
  gestoria: number;
  total: number;
}

/**
 * La operación completa: transferencia, la prenda si el cliente financia, y la
 * gestoría UNA SOLA VEZ.
 *
 * Existe justamente por eso último. Antes la pantalla sumaba
 * `transferencia.total + prenda.total`, y como las dos traían su gestoría
 * adentro, una operación financiada cobraba $400.000 de gestoría en vez de
 * $200.000. La regla vivía en el armado de la vista, que es donde nadie la
 * busca; ahora vive acá, con un test que la cuida.
 *
 * A las dos funciones internas se les pasa `gestoria: 0` y se suma una sola al
 * final.
 */
export function calcularOperacion(params: {
  valorTabla: number | null;
  ajuste?: number;
  gestoria?: number;
  arancelFijo?: number;
  /** El total real del presupuesto, si quien consultó lo copió. */
  totalDNRPA?: number | null;
  /** Financiación: si no se pasan, la operación va sin prenda. */
  valorCuota?: number | null;
  meses?: number | null;
}): Operacion | null {
  const transferencia = calcularTransferenciaTotal({
    valorTabla: params.valorTabla,
    ajuste: params.ajuste,
    arancelFijo: params.arancelFijo,
    totalDNRPA: params.totalDNRPA,
    gestoria: 0,
  });
  if (!transferencia) return null;

  const prenda = calcularPrenda({
    valorCuota: params.valorCuota ?? null,
    meses: params.meses ?? null,
    ajuste: params.ajuste,
    gestoria: 0,
  });

  const gestoria = params.gestoria ?? GESTORIA_DEFAULT;
  return {
    transferencia,
    prenda,
    gestoria,
    total: transferencia.total + (prenda?.total ?? 0) + gestoria,
  };
}
