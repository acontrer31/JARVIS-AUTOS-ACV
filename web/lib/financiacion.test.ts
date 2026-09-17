import { describe, expect, it } from "vitest";
import {
  AJUSTE_DEFAULT,
  ARANCEL_FIJO_DEFAULT,
  calcularCostoTransferenciaDNRPA,
  calcularOperacion,
  calcularPrenda,
  calcularTransferenciaTotal,
  CONSULTA_DNRPA_PASOS,
  GESTORIA_DEFAULT,
  simularCuotas,
} from "./financiacion";

// Estas cuentas son las únicas del sistema donde un error le cuesta plata a un
// cliente real: con un número mal, alguien cotiza una operación de diecinueve
// millones y se entera tarde. Todo lo demás, si falla, muestra un dato feo.
//
// Los casos no son inventados: son dos presupuestos OFICIALES de DNRPA. Si
// alguien toca una fórmula y estos números dejan de salir, se rompe el test
// antes que la cotización.
//
// La fórmula que cobra la agencia, confirmada por ella en septiembre de 2026:
//   transferencia = valor de tabla × 2,5% + total del presupuesto + gestoría
//   prenda        = (cuota × meses) × 2,5% + gestoría
// Y la gestoría se cobra UNA SOLA VEZ por operación, aunque haya prenda.
// En los dos casos el 2,5% es un HONORARIO, no un recargo que arrastre el valor
// del auto ni el del crédito.
//
// El caso vigente: presupuesto oficial de un VW Gol 1.4 2013 importado, de
// septiembre de 2026. Valor de tabla 7.211.200 → total 75.192.
const GOL_VALOR_TABLA = 7_211_200;

// El otro presupuesto oficial verificado, de cuando el arancel fijo era $1.300.
// Se conserva —pasándole ese valor a mano— porque prueba que la fórmula del 1%
// no se movió: lo único que cambia con el tiempo es el fijo.
const FORD_KA_VALOR_TABLA = 18_308_800;

describe("simularCuotas", () => {
  it("sin precio no inventa una cuota", () => {
    expect(simularCuotas(null, 12)).toBeNull();
    expect(simularCuotas(0, 12)).toBeNull();
    expect(simularCuotas(-500, 12)).toBeNull();
  });

  it("divide el precio en cuotas y redondea al peso", () => {
    expect(simularCuotas(12_000_000, 12)).toEqual({ cuotas: 12, valorCuota: 1_000_000 });
    // 10.000.000 / 3 = 3.333.333,33 → al peso entero.
    expect(simularCuotas(10_000_000, 3)).toEqual({ cuotas: 3, valorCuota: 3_333_333 });
  });

  it("acota la cantidad de cuotas entre 1 y 60", () => {
    expect(simularCuotas(1_200_000, 0)?.cuotas).toBe(1);
    expect(simularCuotas(1_200_000, -5)?.cuotas).toBe(1);
    expect(simularCuotas(1_200_000, 999)?.cuotas).toBe(60);
  });

  it("redondea una cantidad de cuotas fraccionaria", () => {
    expect(simularCuotas(1_200_000, 12.4)?.cuotas).toBe(12);
    expect(simularCuotas(1_200_000, 12.6)?.cuotas).toBe(13);
  });
});

describe("calcularCostoTransferenciaDNRPA", () => {
  it("sin valor de tabla no inventa un costo", () => {
    expect(calcularCostoTransferenciaDNRPA(null)).toBeNull();
    expect(calcularCostoTransferenciaDNRPA(0)).toBeNull();
  });

  it("reproduce el presupuesto oficial del VW Gol", () => {
    expect(calcularCostoTransferenciaDNRPA(GOL_VALOR_TABLA)).toEqual({
      arancel: 72_112, // 1% del valor de tabla — el item "TRANSFERENCIA IMPORTADO"
      fijo: ARANCEL_FIJO_DEFAULT, // 3.080: la certificación de firmas (8A adicionales)
      total: 75_192, // idéntico al total que imprime el sitio de DNRPA
    });
  });

  it("reproduce el presupuesto histórico del Ford Ka con el fijo de su época", () => {
    expect(calcularCostoTransferenciaDNRPA(FORD_KA_VALOR_TABLA, 1_300)).toEqual({
      arancel: 183_088,
      fijo: 1_300,
      total: 184_388,
    });
  });

  it("el arancel es siempre el 1% del valor de tabla", () => {
    expect(calcularCostoTransferenciaDNRPA(10_000_000)?.arancel).toBe(100_000);
  });
});

describe("calcularTransferenciaTotal", () => {
  it("cobra el 2,5% del valor de tabla, más el presupuesto y la gestoría", () => {
    expect(calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA })).toEqual({
      honorario: 180_280, // 7.211.200 × 2,5%
      totalDNRPA: 75_192,
      gestoria: 200_000,
      total: 455_472,
    });
  });

  it("también sobre el Ford Ka, con el arancel fijo de su época", () => {
    expect(
      calcularTransferenciaTotal({ valorTabla: FORD_KA_VALOR_TABLA, arancelFijo: 1_300 })
    ).toEqual({
      honorario: 457_720, // 18.308.800 × 2,5%
      totalDNRPA: 184_388,
      gestoria: 200_000,
      total: 842_108,
    });
  });

  // Regresión del error más caro que tuvo el sistema: `valorTabla × 1,025`
  // metía el auto entero adentro del costo del trámite. Para este Ford Ka
  // devolvía una transferencia de 19.150.908 sobre un auto de 18,3 millones.
  // El costo del trámite SIEMPRE es una fracción del valor del auto.
  it("el costo del trámite nunca se acerca al valor del auto", () => {
    const r = calcularTransferenciaTotal({ valorTabla: FORD_KA_VALOR_TABLA });
    expect(r!.total).toBeLessThan(FORD_KA_VALOR_TABLA / 10);
    expect(r?.total).not.toBe(19_150_908);
  });

  it("sin valor de tabla no devuelve un total", () => {
    expect(calcularTransferenciaTotal({ valorTabla: null })).toBeNull();
    expect(calcularTransferenciaTotal({ valorTabla: 0 })).toBeNull();
  });

  it("respeta el ajuste y la gestoría que se le pasen", () => {
    const r = calcularTransferenciaTotal({
      valorTabla: 10_000_000,
      ajuste: 0.05,
      gestoria: 200_000,
    });
    expect(r?.honorario).toBe(500_000); // 10.000.000 × 5%
    expect(r?.total).toBe(500_000 + 103_080 + 200_000);
  });

  // Regresión: el código usa `??` y no `||` para los valores por defecto. Con
  // `||`, un ajuste del 0% o una gestoría en cero —los dos son casos reales, el
  // formulario deja ponerlos— se reemplazarían en silencio por el 2,5% y los
  // $150.000, y TODA cotización saldría inflada sin que nadie lo note.
  it("un ajuste en cero es cero, no el ajuste por defecto", () => {
    const r = calcularTransferenciaTotal({ valorTabla: 10_000_000, ajuste: 0 });
    expect(r?.honorario).toBe(0);
    expect(AJUSTE_DEFAULT).toBeGreaterThan(0); // si no, el test no probaría nada
  });

  it("una gestoría en cero es cero, no la gestoría por defecto", () => {
    const r = calcularTransferenciaTotal({ valorTabla: 10_000_000, gestoria: 0 });
    expect(r?.gestoria).toBe(0);
    expect(GESTORIA_DEFAULT).toBeGreaterThan(0);
  });

  // El presupuesto que se copia del sitio del registro le gana a la estimación.
  // El 1% no se movió nunca, pero el fijo sí —$1.300 antes, $3.080 hoy— y no
  // todos los trámites llevan los mismos items. Si alguien se tomó el trabajo
  // de consultar, ese número vale más que cualquier cuenta nuestra.
  it("el total real del presupuesto le gana a la estimación", () => {
    const r = calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA, totalDNRPA: 91_400 });
    expect(r?.totalDNRPA).toBe(91_400);
    expect(r?.total).toBe(180_280 + 91_400 + 200_000);
  });

  it("sin total cargado sigue estimando 1% + fijo", () => {
    expect(calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA, totalDNRPA: null })?.totalDNRPA).toBe(
      75_192
    );
    expect(calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA })?.totalDNRPA).toBe(75_192);
  });

  // Un negativo solo puede ser un tipeo; ahí sí conviene la estimación.
  it("ignora un total negativo", () => {
    expect(calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA, totalDNRPA: -5 })?.totalDNRPA).toBe(
      75_192
    );
  });

  // El valor de tabla sigue haciendo falta aunque venga el presupuesto: el
  // honorario del 2,5% sale de ahí, no del presupuesto.
  it("el presupuesto solo no alcanza: sin valor de tabla no hay cotización", () => {
    expect(calcularTransferenciaTotal({ valorTabla: null, totalDNRPA: 75_192 })).toBeNull();
  });
});

describe("calcularPrenda", () => {
  it("sin el valor de cuota de MG Group no inventa nada", () => {
    expect(calcularPrenda({ valorCuota: null, meses: 48 })).toBeNull();
    expect(calcularPrenda({ valorCuota: 0, meses: 48 })).toBeNull();
  });

  it("sin cantidad de meses tampoco", () => {
    expect(calcularPrenda({ valorCuota: 850_000, meses: null })).toBeNull();
    expect(calcularPrenda({ valorCuota: 850_000, meses: 0 })).toBeNull();
  });

  // El ejemplo que dio la agencia, textual: 12 cuotas de $100.000 son
  // $1.200.000 a devolver, y la prenda es el 2,5% de ese número.
  it("es el 2,5% del total a devolver, más la gestoría", () => {
    expect(calcularPrenda({ valorCuota: 100_000, meses: 12 })).toEqual({
      totalADevolver: 1_200_000,
      costoPrenda: 30_000,
      gestoria: 200_000,
      total: 230_000,
    });
  });

  // Regresión del error que se arregló en septiembre de 2026: la función sumaba
  // el crédito entero más el 2,5% más la gestoría, y para este mismo caso
  // devolvía $1.380.000. Devolvía el crédito, no lo que cuesta el trámite.
  it("NO devuelve el crédito: devuelve lo que cuesta inscribir la prenda", () => {
    const r = calcularPrenda({ valorCuota: 100_000, meses: 12 });
    expect(r?.total).toBeLessThan(r!.totalADevolver);
    expect(r?.total).not.toBe(1_380_000);
  });

  it("un ajuste y una gestoría en cero se respetan", () => {
    const r = calcularPrenda({ valorCuota: 100_000, meses: 12, ajuste: 0, gestoria: 0 });
    expect(r?.costoPrenda).toBe(0);
    expect(r?.total).toBe(0);
  });
});

describe("calcularOperacion", () => {
  it("sin vehículo con valor de tabla no devuelve nada", () => {
    expect(calcularOperacion({ valorTabla: null })).toBeNull();
  });

  it("sin financiación es la transferencia más la gestoría", () => {
    const r = calcularOperacion({ valorTabla: GOL_VALOR_TABLA });
    expect(r?.prenda).toBeNull();
    expect(r?.total).toBe(180_280 + 75_192 + 200_000); // 455.472
  });

  // La regla que da nombre a esta función. Antes la pantalla sumaba
  // `transferencia.total + prenda.total` y cada uno traía su gestoría adentro:
  // una operación financiada cobraba $400.000 de gestoría en vez de $200.000.
  it("con financiación cobra UNA sola gestoría, no dos", () => {
    const r = calcularOperacion({
      valorTabla: GOL_VALOR_TABLA,
      valorCuota: 100_000,
      meses: 12,
    });
    expect(r?.prenda?.costoPrenda).toBe(30_000);
    expect(r?.gestoria).toBe(200_000);
    expect(r?.total).toBe(180_280 + 75_192 + 30_000 + 200_000); // 485.472
    expect(r?.total).not.toBe(685_472); // lo que cobraba antes
  });

  it("financiar suma exactamente el costo de la prenda, nada más", () => {
    const sin = calcularOperacion({ valorTabla: GOL_VALOR_TABLA });
    const con = calcularOperacion({ valorTabla: GOL_VALOR_TABLA, valorCuota: 100_000, meses: 12 });
    expect(con!.total - sin!.total).toBe(30_000);
  });

  it("también acepta el total real del presupuesto", () => {
    const r = calcularOperacion({ valorTabla: GOL_VALOR_TABLA, totalDNRPA: 91_400 });
    expect(r?.transferencia.totalDNRPA).toBe(91_400);
    expect(r?.total).toBe(180_280 + 91_400 + 200_000);
  });
});

// El instructivo de la consulta es contenido, no decoración: si se pierde, se
// pierde el único camino por el que entran el valor de tabla y el presupuesto.
describe("CONSULTA_DNRPA_PASOS", () => {
  it("dice el único paso que nadie adivina: valor declarado en 1", () => {
    expect(CONSULTA_DNRPA_PASOS.join(" ")).toMatch(/[Vv]alor declarado: 1\b/);
  });

  it("nombra el tipo de trámite y la provincia", () => {
    const texto = CONSULTA_DNRPA_PASOS.join(" ");
    expect(texto).toContain("Transferencia");
    expect(texto).toContain("Salta");
  });
});
