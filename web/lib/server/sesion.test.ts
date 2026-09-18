import { describe, expect, it } from "vitest";
import { secretoValido } from "./sesion";

// `secretoValido` es la ÚNICA puerta de los dos endpoints de cron. Del otro
// lado no hay usuario ni sesión: si esta función dice que sí, el que llamó
// publica en el Facebook real de la agencia y crea tareas en todas las cuentas.
//
// Está escrita a mano para comparar en tiempo constante, así que se prueba a
// mano: una comparación "ingeniosa" que acepta de más es peor que un `===`.

const SECRETO = "secreto-de-prueba-largo-123";

describe("secretoValido", () => {
  it("acepta el secreto correcto", () => {
    expect(secretoValido(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
  });

  it("rechaza uno distinto del mismo largo", () => {
    const otro = "x".repeat(SECRETO.length);
    expect(otro.length).toBe(SECRETO.length);
    expect(secretoValido(`Bearer ${otro}`, SECRETO)).toBe(false);
  });

  // El caso que rompe una comparación caracter a caracter mal escrita: que el
  // prefijo coincida no puede alcanzar.
  it("rechaza un prefijo correcto", () => {
    expect(secretoValido(`Bearer ${SECRETO.slice(0, -1)}`, SECRETO)).toBe(false);
    expect(secretoValido("Bearer s", SECRETO)).toBe(false);
  });

  it("rechaza uno más largo que empieza igual", () => {
    expect(secretoValido(`Bearer ${SECRETO}x`, SECRETO)).toBe(false);
  });

  it("rechaza el header vacío o sin Bearer", () => {
    expect(secretoValido("", SECRETO)).toBe(false);
    expect(secretoValido("Bearer ", SECRETO)).toBe(false);
    expect(secretoValido(SECRETO, SECRETO)).toBe(false);
    expect(secretoValido(`Basic ${SECRETO}`, SECRETO)).toBe(false);
  });

  // Un secreto que se repite no puede colar por el módulo del índice.
  it("no se deja engañar por repeticiones", () => {
    expect(secretoValido("Bearer abab", "abab")).toBe(true);
    expect(secretoValido("Bearer abab", "aabb")).toBe(false);
    expect(secretoValido("Bearer ab", "abab")).toBe(false);
  });

  it("distingue mayúsculas", () => {
    expect(secretoValido(`Bearer ${SECRETO.toUpperCase()}`, SECRETO)).toBe(false);
  });
});
