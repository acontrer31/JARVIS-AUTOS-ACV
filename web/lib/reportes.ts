import { cargarOperaciones } from "@/lib/operaciones";
import { cargarMovimientos, calcularSaldo } from "@/lib/caja";
import { cargarTareas } from "@/lib/tareas";
import { cargarCompras } from "@/lib/compras";
import { cargarVendedores } from "@/lib/clientes";
import { cargarVehiculos, formatearMoneda } from "@/lib/vehiculos";

// Reportes / analítica del negocio (Fase 4 del ERP). Todo sobre datos reales de
// Supabase; si una parte falla, se omite en vez de inventar.

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function mismoMes(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
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

// --- Reporte para el módulo Reportes (UI) ---------------------------------

export interface RankingVendedor {
  nombre: string;
  cantidad: number;
  monto: number;
}

export interface Reporte {
  mesEtiqueta: string; // "septiembre 2026"
  ventasMes: { cantidad: number; monto: number; comisiones: number };
  abiertas: { cantidad: number; monto: number };
  stock: { cantidad: number; valorizado: number };
  margen: { cantidad: number; total: number }; // entregadas del mes con costo cargado
  ranking: RankingVendedor[];
}

// Arma todo el reporte del mes en curso a partir de operaciones, vehículos,
// compras y vendedores. El margen solo cuenta las entregadas cuyo vehículo
// tiene una compra con costo cargado (no inventa: si no hay costo, no suma).
export async function armarReporte(): Promise<Reporte> {
  const ref = new Date();
  const [ops, vehiculos, compras, vendedores] = await Promise.all([
    cargarOperaciones(),
    cargarVehiculos(),
    cargarCompras().catch(() => []),
    cargarVendedores().catch(() => []),
  ]);

  const entregadasMes = ops.filter((o) => o.estado === "entregada" && mismoMes(o.creado_en, ref));
  const ventasMes = {
    cantidad: entregadasMes.length,
    monto: entregadasMes.reduce((s, o) => s + (o.monto ?? 0), 0),
    comisiones: entregadasMes.reduce((s, o) => s + (o.comision ?? 0), 0),
  };

  const enCurso = ops.filter((o) => o.estado === "abierta" || o.estado === "senada");
  const abiertas = {
    cantidad: enCurso.length,
    monto: enCurso.reduce((s, o) => s + (o.monto ?? 0), 0),
  };

  const disponibles = vehiculos.filter((v) => v.estado === "disponible");
  const stock = {
    cantidad: disponibles.length,
    valorizado: disponibles.reduce((s, v) => s + (v.precio ?? 0), 0),
  };

  // Margen = venta − costo − gastos, por vehículo (primera compra que matchee).
  const compraDe = new Map<string, { costo: number | null; gastos: number | null }>();
  for (const c of compras) {
    if (c.vehiculo_id && !compraDe.has(c.vehiculo_id)) {
      compraDe.set(c.vehiculo_id, { costo: c.costo, gastos: c.gastos });
    }
  }
  let margenCantidad = 0;
  let margenTotal = 0;
  for (const o of entregadasMes) {
    const c = o.vehiculo_id ? compraDe.get(o.vehiculo_id) : undefined;
    if (c && c.costo != null) {
      margenCantidad += 1;
      margenTotal += (o.monto ?? 0) - (c.costo ?? 0) - (c.gastos ?? 0);
    }
  }

  // Ranking de vendedores por entregas del mes.
  const nombreDe = new Map(vendedores.map((v) => [v.id, v.nombre || "Sin nombre"]));
  const acum = new Map<string, { nombre: string; cantidad: number; monto: number }>();
  for (const o of entregadasMes) {
    const clave = o.vendedor_id ?? "sin";
    const nombre = o.vendedor_id ? nombreDe.get(o.vendedor_id) ?? "Sin nombre" : "Sin asignar";
    const prev = acum.get(clave) ?? { nombre, cantidad: 0, monto: 0 };
    prev.cantidad += 1;
    prev.monto += o.monto ?? 0;
    acum.set(clave, prev);
  }
  const ranking = [...acum.values()].sort((a, b) => b.monto - a.monto);

  const mesEtiqueta = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(ref);

  return {
    mesEtiqueta: mesEtiqueta.charAt(0).toUpperCase() + mesEtiqueta.slice(1),
    ventasMes,
    abiertas,
    stock,
    margen: { cantidad: margenCantidad, total: margenTotal },
    ranking,
  };
}
