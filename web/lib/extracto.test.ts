import { describe, expect, it } from "vitest";
import { extracto, ordenarPorRelevancia, palabrasUtiles } from "./extracto";

// Lo que se prueba acá es qué material recibe JARVIS antes de contestar.
//
// Es la misma clase de riesgo que las cuentas de financiación, por un camino
// distinto: si el recorte no trae la respuesta, el agente no dice "no sé" —
// completa. A un procedimiento cortado a la mitad le inventa los pasos que
// siguen. La persona escucha una respuesta con la seguridad de siempre y no
// tiene forma de saber que la mitad salió de la nada.

// El documento real de la base, tal como está cargado en Conocimiento.
const DNRPA = `Los dos números que hacen falta para cotizar una transferencia (el Valor Tabla y el TOTAL del presupuesto) salen de la consulta de aranceles del sitio del registro, dnrpa.gov.ar. JARVIS no puede entrar solo: es un formulario, no una API. Los trae una persona.

CÓMO SE HACE LA CONSULTA
1. Entrar a dnrpa.gov.ar y abrir la consulta de aranceles.
2. Tipo de trámite: Transferencia.
3. Patente: el dominio del vehículo.
4. Valor declarado: 1. SIEMPRE 1. El arancel se calcula sobre el valor de tabla, no sobre lo que se declare. Este es el paso que nadie adivina.
5. Provincia: Salta.
6. De la respuesta anotar dos números: el Valor Tabla y el TOTAL del presupuesto.

QUÉ SE HACE CON ESOS NÚMEROS
En el módulo Financiación, elegir el vehículo y pegarlos en los campos "Valor Tabla" y "Total presupuesto". Con eso la pantalla calcula:

  transferencia = Valor Tabla x 2,5% + total del presupuesto + 200.000 de gestoría

Si el cliente además financia, se suma la prenda:

  prenda = (valor de la cuota x cantidad de meses) x 2,5%

Ejemplo de prenda: 12 cuotas de 100.000 son 1.200.000 a devolver; el 2,5% de eso son 30.000. Eso es lo que cuesta inscribir la prenda, NO el crédito.

La gestoría se cobra UNA SOLA VEZ por operación, aunque haya transferencia y prenda juntas.`;

describe("extracto: el caso que rompió", () => {
  // Regresión del bug encontrado en septiembre de 2026. La versión vieja
  // agarraba la PRIMERA palabra de la consulta que aparecía en el texto: con
  // "valor declarado" enganchaba el "Valor" de "Valor Tabla" —renglón uno— y
  // devolvía 320 caracteres desde ahí. El paso del valor declarado es el
  // renglón veinte: quedaba afuera. La pregunta era literalmente por ese paso.
  it("preguntar por el valor declarado trae el paso del valor declarado", () => {
    const r = extracto(DNRPA, "que pongo en valor declarado");
    expect(r).toContain("Valor declarado: 1");
  });

  it("y también preguntándolo de otras formas", () => {
    for (const pregunta of [
      "como consulto el presupuesto de transferencia",
      "cuanto sale una transferencia",
      "que tipo de tramite elijo en el registro",
      "que provincia pongo",
    ]) {
      expect(extracto(DNRPA, pregunta), `falló con: ${pregunta}`).toContain("Valor declarado: 1");
    }
  });

  // La razón de fondo por la que ahora pasan todas: este documento entra
  // entero. Recortar un texto de dos carillas no ahorraba nada —no se lee en
  // voz alta, se lo damos al modelo— y costaba la respuesta.
  it("un documento de este tamaño va entero, sin recortar", () => {
    expect(DNRPA.length).toBeLessThan(2000);
    expect(extracto(DNRPA, "valor declarado")).toBe(DNRPA);
    expect(extracto(DNRPA, "cualquier cosa")).toBe(DNRPA);
  });
});

// Un documento largo de verdad: el pasaje que contesta está al final, y la
// primera aparición suelta de una de las palabras está al principio. Es la
// misma trampa del caso real, pero pasando el umbral del documento entero.
const relleno = (n: number) => "Texto de relleno sobre la agencia. ".repeat(n);
const LARGO =
  `El valor de una unidad se define en la tabla interna.\n\n` +
  relleno(70) +
  `\n\nPARA INSCRIBIR LA PRENDA: el valor declarado en el formulario va siempre en 1.\n\n` +
  relleno(20);

describe("extracto: documentos largos", () => {
  it("elige la ventana con más palabras de la pregunta, no la primera coincidencia", () => {
    expect(LARGO.length).toBeGreaterThan(2000);
    const r = extracto(LARGO, "donde pongo el valor declarado de la prenda");
    expect(r).toContain("valor declarado en el formulario va siempre en 1");
  });

  it("marca con puntos suspensivos que hay texto alrededor", () => {
    const r = extracto(LARGO, "valor declarado prenda");
    expect(r.startsWith("…")).toBe(true);
  });

  it("no corta por la mitad de una palabra", () => {
    const r = extracto(LARGO, "valor declarado prenda").replace(/^…|…$/g, "");
    // Si cortara a ciegas, el borde caería dentro de una palabra. Se compara
    // contra el documento: los extremos del recorte tienen que coincidir con
    // límites de palabra.
    const pos = LARGO.indexOf(r);
    expect(pos).toBeGreaterThanOrEqual(0);
    if (pos > 0) expect(LARGO[pos - 1]).toMatch(/\s/);
    const fin = pos + r.length;
    if (fin < LARGO.length) expect(LARGO[fin]).toMatch(/\s/);
  });

  it("sin ninguna coincidencia devuelve el principio, no vacío", () => {
    const r = extracto(LARGO, "berenjena");
    expect(r.length).toBeGreaterThan(100);
    expect(r.startsWith("El valor de una unidad")).toBe(true);
  });
});

describe("extracto: los bordes", () => {
  it("sin contenido no inventa nada", () => {
    expect(extracto(null, "transferencia")).toBe("");
    expect(extracto("", "transferencia")).toBe("");
  });

  it("una consulta vacía no rompe", () => {
    expect(extracto(DNRPA, "")).toBe(DNRPA);
    expect(extracto(LARGO, "").length).toBeGreaterThan(100);
  });

  // Las palabras de tres letras o menos ("de", "que", "1") aparecen en
  // cualquier lado y no dicen nada sobre dónde está la respuesta.
  it("ignora las palabras cortas al elegir el pasaje", () => {
    const r = extracto(LARGO, "de la que el en prenda declarado");
    expect(r).toContain("valor declarado en el formulario");
  });
});

// La búsqueda amplia existe porque la exacta exige TODAS las palabras.
// Preguntar "qué pongo en valor declarado" pedía también "pongo" —que no está
// escrito en ningún lado— y devolvía cero, aunque el documento que lo explica
// estuviera cargado. Ese cero fue el que hizo que JARVIS contestara de su
// propia cabeza en vez de decir "no lo tengo".
//
// Pero al buscar con CUALQUIERA de las palabras entra de todo, y lo que entra
// hay que ordenarlo. De eso se trata lo que sigue.
describe("ordenarPorRelevancia", () => {
  const dnrpa = {
    titulo: "Cómo consultar el presupuesto de transferencia en el registro (DNRPA)",
    contenido: "Valor declarado: 1. SIEMPRE 1. El arancel se calcula sobre el valor de tabla.",
  };
  const formulario = {
    titulo: "Formulario 012",
    contenido: "La verificación policial se hace con el vehículo presente.",
  };
  const suelto = {
    titulo: "Política de vacaciones",
    contenido: "El personal declara sus días antes de noviembre.",
  };

  it("pone primero el documento que contesta la pregunta", () => {
    const r = ordenarPorRelevancia([formulario, suelto, dnrpa], "que pongo en valor declarado");
    expect(r[0].titulo).toContain("DNRPA");
  });

  it("el título pesa más que el cuerpo", () => {
    // "transferencia" está en el título de uno y en el cuerpo del otro.
    const enElCuerpo = { titulo: "Notas varias", contenido: "Sobre la transferencia conviene avisar." };
    const r = ordenarPorRelevancia([enElCuerpo, dnrpa], "transferencia");
    expect(r[0].titulo).toContain("DNRPA");
  });

  it("ante un empate respeta el orden que venía (el más actualizado primero)", () => {
    const a = { titulo: "Uno", contenido: "transferencia" };
    const b = { titulo: "Dos", contenido: "transferencia" };
    expect(ordenarPorRelevancia([a, b], "transferencia").map((d) => d.titulo)).toEqual(["Uno", "Dos"]);
    expect(ordenarPorRelevancia([b, a], "transferencia").map((d) => d.titulo)).toEqual(["Dos", "Uno"]);
  });

  it("sin palabras útiles no reordena nada", () => {
    const lista = [formulario, dnrpa];
    expect(ordenarPorRelevancia(lista, "de la que")).toEqual(lista);
    expect(ordenarPorRelevancia(lista, "")).toEqual(lista);
  });

  it("un documento sin contenido no rompe", () => {
    const vacio = { titulo: "Solo un PDF", contenido: null };
    expect(() => ordenarPorRelevancia([vacio], "transferencia")).not.toThrow();
  });
});

describe("palabrasUtiles", () => {
  // Es lo que se le manda a Postgres como búsqueda amplia, así que importa
  // que no se cuelen palabras que aparecen en cualquier documento.
  it("descarta las palabras cortas y repetidas", () => {
    expect(palabrasUtiles("que pongo en el valor declarado del valor")).toEqual([
      "pongo",
      "valor",
      "declarado",
    ]);
  });

  it("ignora los acentos y la puntuación", () => {
    expect(palabrasUtiles("¿Cuánto sale la transferencia?")).toEqual(["cuanto", "sale", "transferencia"]);
  });
});
