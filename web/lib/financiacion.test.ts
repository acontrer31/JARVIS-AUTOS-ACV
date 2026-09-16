import { describe, expect, it } from "vitest";
import {
  AJUSTE_DEFAULT,
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

  it("reproduce el presupuesto oficial del Ford Ka", () => {
    expect(calcularCostoTransferenciaDNRPA(FORD_KA_VALOR_TABLA)).toEqual({
      arancel: 183_088, // 1% del valor de tabla
      fijo: 1_300, // Res. 314/02
      total: 184_388, // idéntico al total que imprime el sitio de DNRPA
    });
  });

  it("el arancel es siempre el 1% del valor de tabla", () => {
    expect(calcularCostoTransferenciaDNRPA(10_000_000)?.arancel).toBe(100_000);
  });
});

describe("calcularTransferenciaTotal", () => {
  it("reproduce la operación completa del Ford Ka", () => {
    expect(calcularTransferenciaTotal({ valorTabla: FORD_KA_VALOR_TABLA })).toEqual({
      valorTablaAjustado: 18_766_520, // 18.308.800 × 1,025
      totalDNRPA: 184_388,
      gestoria: GESTORIA_DEFAULT,
      total: 19_100_908, // el número que la agencia le cobra al cliente
    });
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
    expect(r?.total).toBe(10_500_000 + 101_300 + 200_000);
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

  it("es cuota × meses, más el ajuste, más la gestoría", () => {
    expect(calcularPrenda({ valorCuota: 850_000, meses: 48 })).toEqual({
      montoFinanciado: 40_800_000,
      montoAjustado: 41_820_000, // × 1,025
      gestoria: GESTORIA_DEFAULT,
      total: 41_970_000,
    });
  });

  it("un ajuste y una gestoría en cero se respetan", () => {
    const r = calcularPrenda({ valorCuota: 100_000, meses: 12, ajuste: 0, gestoria: 0 });
    expect(r?.montoAjustado).toBe(1_200_000);
    expect(r?.total).toBe(1_200_000);
  });
});
