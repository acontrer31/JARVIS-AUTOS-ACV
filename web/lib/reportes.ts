import { cargarOperaciones } from "@/lib/operaciones";
import { cargarMovimientos, calcularSaldo } from "@/lib/caja";
import { cargarTareas } from "@/lib/tareas";
import { formatearMoneda } from "@/lib/vehiculos";

// Reportes / analítica del negocio (base de la Fase 4 del ERP). Todo sobre
// datos reales de Supabase; si una parte falla, se omite en vez de inventar.

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resumen hablado del día para JARVIS: operaciones nuevas de hoy, caja del día
// y tareas pendientes. Pensado para leerse por voz (una sola frase).
export async function resumenDelDia(): Promise<string> {
  const hoy = hoyISO();
  const partes: string[] = [];

  // Operaciones creadas hoy.
  try {
    const ops = await cargarOperaciones();
    const deHoy = ops.filter((o) => (o.creado_en || "").slice(0, 10) === hoy);
    if (deHoy.length) {
      const monto = deHoy.reduce((s, o) => s + (o.monto ?? 0), 0);
      partes.push(
        deHoy.length === 1
          ? `1 operación nueva hoy por ${formatearMoneda(monto)}`
          : `${deHoy.length} operaciones nuevas hoy por ${formatearMoneda(monto)} en total`
      );
    } else {
      partes.push("todavía no hay operaciones nuevas hoy");
    }
  } catch {}

  // Caja del día.
  try {
    const movs = await cargarMovimientos();
    const deHoy = movs.filter((m) => m.fecha === hoy);
    if (deHoy.length) {
      const { ingresos, egresos, saldo } = calcularSaldo(deHoy);
      partes.push(
        `en caja hoy entraron ${formatearMoneda(ingresos)} y salieron ${formatearMoneda(egresos)}, saldo del día ${formatearMoneda(saldo)}`
      );
    }
  } catch {}

  // Tareas pendientes.
  try {
    const tareas = await cargarTareas(true);
    if (tareas.length) {
      partes.push(
        tareas.length === 1 ? "y tenés 1 tarea pendiente" : `y tenés ${tareas.length} tareas pendientes`
      );
    }
  } catch {}

  if (!partes.length) return "No pude armar el resumen del día ahora mismo. Probá de nuevo.";
  return `Resumen del día: ${partes.join("; ")}.`;
}
