import { describe, expect, it } from "vitest";
import {
  AJUSTE_DEFAULT,
  ARANCEL_FIJO_DEFAULT,
  calcularCostoTransferenciaDNRPA,
  calcularPrenda,
  calcularTransferenciaTotal,
  GESTORIA_DEFAULT,
  simularCuotas,
} from "./financiacion";

// Estas cuentas son las únicas del sistema donde un error le cuesta plata a un
// cliente real: con un número mal, alguien cotiza una operación de diecinueve
// millones y se entera tarde. Todo lo demás, si falla, muestra un dato feo.
//
// El caso central no es inventado: es el presupuesto OFICIAL de DNRPA de un Ford
// Ka que ya está verificado en docs/phases/roadmap.md — valor de tabla
// 18.308.800, total de transferencia 19.100.908. Si alguien toca una fórmula y
// este número deja de salir, se rompe el test antes que la cotización.
// El caso vigente: presupuesto oficial de un VW Gol 1.4 2013 importado, de
// septiembre de 2026. Valor de tabla 7.211.200 → total 75.192.
const GOL_VALOR_TABLA = 7_211_200;

// El caso histórico, de cuando el arancel fijo era $1.300 y la gestoría
// $150.000. Se conserva —pasándole esos valores a mano— porque prueba que la
// fórmula del 1% no se movió: lo único que cambia con el tiempo es el fijo.
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
  it("reproduce la operación histórica del Ford Ka con los valores de su época", () => {
    expect(
      calcularTransferenciaTotal({
        valorTabla: FORD_KA_VALOR_TABLA,
        arancelFijo: 1_300,
        gestoria: 150_000,
      })
    ).toEqual({
      valorTablaAjustado: 18_766_520, // 18.308.800 × 1,025
      totalDNRPA: 184_388,
      gestoria: 150_000,
      total: 19_100_908, // el número que la agencia le cobró en su momento
    });
  });

  it("usa el arancel fijo y la gestoría vigentes cuando no se le pasan", () => {
    const r = calcularTransferenciaTotal({ valorTabla: GOL_VALOR_TABLA });
    expect(r?.totalDNRPA).toBe(75_192);
    expect(r?.gestoria).toBe(200_000);
    expect(r?.total).toBe(7_391_480 + 75_192 + 200_000); // 7.211.200 × 1,025
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
    expect(r?.valorTablaAjustado).toBe(10_500_000);
    expect(r?.total).toBe(10_500_000 + 103_080 + 200_000);
  });

  // Regresión: el código usa `??` y no `||` para los valores por defecto. Con
  // `||`, un ajuste del 0% o una gestoría en cero —los dos son casos reales, el
  // formulario deja ponerlos— se reemplazarían en silencio por el 2,5% y los
  // $150.000, y TODA cotización saldría inflada sin que nadie lo note.
  it("un ajuste en cero es cero, no el ajuste por defecto", () => {
    const r = calcularTransferenciaTotal({ valorTabla: 10_000_000, ajuste: 0 });
    expect(r?.valorTablaAjustado).toBe(10_000_000);
    expect(AJUSTE_DEFAULT).toBeGreaterThan(0); // si no, el test no probaría nada
  });

  it("una gestoría en cero es cero, no la gestoría por defecto", () => {
    const r = calcularTransferenciaTotal({ valorTabla: 10_000_000, gestoria: 0 });
    expect(r?.gestoria).toBe(0);
    expect(GESTORIA_DEFAULT).toBeGreaterThan(0);
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
