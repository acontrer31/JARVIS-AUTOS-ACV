// Qué pedazo de un documento se le entrega a JARVIS para que conteste.
//
// Vive en su propio archivo, sin importar nada, por dos razones: es la única
// parte de Conocimiento que decide algo (el resto son consultas a Supabase), y
// así se puede testear sin levantar medio sistema.
//
// Por qué importa tanto: el agente contesta con ESTO y nada más. Si el recorte
// no trae la respuesta, el agente no dice "no sé" — completa lo que falta.
// A un procedimiento cortado a la mitad le inventa los pasos que siguen, y lo
// dice con la misma seguridad que si los supiera. Un recorte malo no produce
// una respuesta incompleta: produce una respuesta falsa.

/**
 * Hasta acá el documento se manda ENTERO, sin recortar.
 *
 * Recortar un documento de dos carillas para "no leer tres pantallas en voz
 * alta" era una preocupación equivocada: lo que devuelve esta función no se lee
 * en voz alta, se lo damos al modelo para que arme la respuesta hablada. Tiene
 * contexto de sobra. El costo de mandar 2.000 caracteres es nada; el costo de
 * cortar los 300 que contestaban la pregunta es una respuesta inventada.
 */
const LARGO_COMPLETO = 2000;

/** Ventana para los documentos que sí son largos de verdad. */
const LARGO_VENTANA = 700;

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Las palabras de la consulta que vale la pena buscar (las cortas son ruido). */
function palabrasUtiles(consulta: string): string[] {
  return [...new Set(normal(consulta).split(/[^a-z0-9]+/).filter((p) => p.length > 3))];
}

/** Todas las posiciones donde aparece `palabra` en `cuerpo` (ya normalizado). */
function posiciones(cuerpo: string, palabra: string): number[] {
  const encontradas: number[] = [];
  let desde = cuerpo.indexOf(palabra);
  while (desde !== -1) {
    encontradas.push(desde);
    desde = cuerpo.indexOf(palabra, desde + 1);
  }
  return encontradas;
}

/**
 * El fragmento de `contenido` que mejor contesta `consulta`.
 *
 * Si el documento entra entero, va entero. Si no, se elige la ventana donde se
 * juntan MÁS palabras distintas de la pregunta.
 *
 * Ese "más palabras distintas" es todo el arreglo. Antes se agarraba la primera
 * palabra de la consulta que apareciera en el texto y se recortaba desde ahí.
 * Con el instructivo de DNRPA y la pregunta "¿qué pongo en valor declarado?",
 * enganchaba el primer "Valor" del documento —el de "Valor Tabla", en el
 * renglón uno— y devolvía los primeros 320 caracteres: el paso del valor
 * declarado, que es el renglón veinte, quedaba afuera. La pregunta era
 * literalmente por ese paso.
 */
export function extracto(contenido: string | null, consulta: string, largo = LARGO_VENTANA): string {
  if (!contenido) return "";
  if (contenido.length <= LARGO_COMPLETO) return contenido;

  const cuerpo = normal(contenido);
  const palabras = palabrasUtiles(consulta);

  // Cada aparición de cada palabra propone una ventana. Se prueban todas y gana
  // la que más palabras distintas cubre — no la primera que aparece.
  const candidatas = palabras.flatMap((p) => posiciones(cuerpo, p));
  if (!candidatas.length) return `${contenido.slice(0, largo).trim()}…`;

  let mejorInicio = 0;
  let mejorPuntaje = -1;
  for (const pos of candidatas) {
    // La palabra no va pegada al borde: un poco de contexto antes ayuda a
    // entender qué se está leyendo.
    const inicio = Math.max(0, pos - Math.floor(largo / 3));
    const ventana = cuerpo.slice(inicio, inicio + largo);
    const puntaje = palabras.filter((p) => ventana.includes(p)).length;
    // `>` y no `>=`: ante un empate gana la ventana más temprana, que suele ser
    // donde el documento define las cosas antes de dar por sabido el tema.
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorInicio = inicio;
    }
  }

  return recortar(contenido, mejorInicio, largo);
}

/**
 * Corta respetando las palabras. Un recorte que empieza en "...clarado: 1" no
 * solo se lee mal: al modelo le llega una palabra que no existe y puede tomarla
 * por un dato.
 */
function recortar(contenido: string, inicio: number, largo: number): string {
  let desde = inicio;
  if (desde > 0) {
    // Se retrocede hasta el principio de la línea o de la palabra. El límite de
    // 80 evita irse media pantalla para atrás en un texto sin espacios.
    const atras = contenido.slice(Math.max(0, desde - 80), desde);
    const corte = Math.max(atras.lastIndexOf("\n"), atras.lastIndexOf(". "));
    desde = corte !== -1 ? desde - (atras.length - corte) + 1 : desde - (atras.length - atras.lastIndexOf(" ") - 1);
    desde = Math.max(0, desde);
  }

  let hasta = Math.min(contenido.length, desde + largo);
  if (hasta < contenido.length) {
    const adelante = contenido.slice(hasta, Math.min(contenido.length, hasta + 80));
    const corte = adelante.search(/[\s\n]/);
    if (corte !== -1) hasta += corte;
  }

  const cuerpo = contenido.slice(desde, hasta).trim();
  return `${desde > 0 ? "…" : ""}${cuerpo}${hasta < contenido.length ? "…" : ""}`;
}
