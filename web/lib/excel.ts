// Exportación a Excel para toda la app. La idea es que cualquier módulo que
// mañana quiera exportar algo llame a esta función y salga con la misma cara,
// sin repetir el formato ni improvisar uno nuevo cada vez.
//
// Antes se armaba un CSV a mano. Un CSV no puede llevar ancho de columna,
// negrita, fila fija ni filtros: se ve crudo por más que uno lo escriba bien.
// Por eso acá se genera un .xlsx de verdad.

import { VERDE_CORE, DORADO, CREMA } from "@/lib/marca";

export interface ColumnaExcel {
  titulo: string;
  /** Ancho en caracteres. Sin esto Excel deja todo apretado en la columna. */
  ancho: number;
  /** Para textos largos: los muestra en varias líneas dentro de la celda. */
  ajustar?: boolean;
}

export type CeldaExcel = string | number | Date | null;

export interface HojaExcel {
  archivo: string;
  hoja?: string;
  columnas: ColumnaExcel[];
  filas: CeldaExcel[][];
}

// Genera el archivo y lo descarga. La librería se carga recién acá, dentro del
// click: así no pesa en el arranque de la app, que es lo que abre todo el mundo
// aunque no exporte nunca.
export async function exportarExcel({ archivo, hoja, columnas, filas }: HojaExcel): Promise<void> {
  const { default: escribirExcel } = await import("write-excel-file/browser");

  const encabezado = columnas.map((c) => ({
    value: c.titulo,
    fontWeight: "bold" as const,
    color: CREMA,
    backgroundColor: VERDE_CORE,
    borderColor: DORADO,
    align: "left" as const,
  }));

  const cuerpo = filas.map((fila) =>
    fila.map((valor, i) => {
      const ajustar = columnas[i]?.ajustar === true;
      if (valor instanceof Date) {
        return { type: Date, value: valor, format: "dd/mm/yyyy", wrap: ajustar };
      }
      if (typeof valor === "number") {
        return { type: Number, value: valor, wrap: ajustar };
      }
      // null y "" van como celda vacía: Excel los trata igual y no ensucia.
      return { type: String, value: valor ? String(valor) : "", wrap: ajustar };
    })
  );

  const salida = await escribirExcel([encabezado, ...cuerpo], {
    sheet: hoja ?? "Hoja 1",
    columns: columnas.map((c) => ({ width: c.ancho })),
    // La fila de títulos queda fija al hacer scroll: es lo que hace revisable
    // una lista larga. (Los filtros no los pone la librería; en Excel se
    // activan con Ctrl+Shift+L sobre esa misma fila.)
    stickyRowsCount: 1,
  });
  await salida.toFile(archivo.endsWith(".xlsx") ? archivo : `${archivo}.xlsx`);
}
