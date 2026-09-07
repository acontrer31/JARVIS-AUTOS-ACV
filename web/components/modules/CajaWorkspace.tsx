"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ETIQUETA_FORMA_PAGO_CAJA,
  FORMAS_PAGO_CAJA,
  calcularSaldo,
  cargarMovimientos,
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  movimientoVacio,
  type FormaPagoCaja,
  type Movimiento,
  type MovimientoInput,
  type TipoMovimiento,
} from "@/lib/caja";
import { formatearMoneda } from "@/lib/vehiculos";
import { mensajeDeError } from "@/lib/errores";
import { useConfirmar } from "@/lib/confirmar";

export default function CajaWorkspace() {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<MovimientoInput>(movimientoVacio());
  const [guardando, setGuardando] = useState(false);
  // Si hay un movimiento en edición, el mismo formulario corrige en vez de crear.
  const [editando, setEditando] = useState<Movimiento | null>(null);

  useEffect(() => {
    cargarMovimientos()
      .then(setMovs)
      .catch((err) => setError("No se pudo cargar la caja: " + mensajeDeError(err)));
  }, []);

  const totales = useMemo(() => calcularSaldo(movs ?? []), [movs]);

  const confirmar = useConfirmar();

  async function alta(e: React.FormEvent) {
    e.preventDefault();
    if (!form.concepto.trim() || !form.monto) return;
    if (
      !(await confirmar({
        titulo: editando
          ? "¿Guardar la corrección?"
          : `¿Registrar un ${form.tipo} de ${formatearMoneda(form.monto)}?`,
        detalle: editando ? "Queda registrado en la auditoría con lo que decía antes." : form.concepto,
      }))
    ) {
      return;
    }
    setError("");
    setGuardando(true);
    try {
      if (editando) {
        const corregido = await actualizarMovimiento(editando.id, form);
        setMovs((prev) => (prev ?? []).map((m) => (m.id === corregido.id ? corregido : m)));
        setEditando(null);
      } else {
        const creado = await crearMovimiento(form);
        setMovs((prev) => [creado, ...(prev ?? [])]);
      }
      setForm(movimientoVacio());
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function corregir(m: Movimiento) {
    setEditando(m);
    setForm({
      operacion_id: m.operacion_id,
      tipo: m.tipo,
      concepto: m.concepto,
      monto: m.monto,
      forma_pago: m.forma_pago,
      fecha: m.fecha,
    });
  }

  async function borrar(m: Movimiento) {
    if (
      !(await confirmar({
        titulo: "¿Borrar el movimiento?",
        detalle: `${m.concepto} — ${formatearMoneda(m.monto)}. No se puede deshacer.`,
        textoConfirmar: "Borrar",
        tono: "peligro",
      }))
    ) {
      return;
    }
    const antes = movs ?? [];
    setMovs((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    try {
      await eliminarMovimiento(m.id);
    } catch {
      setMovs(antes);
      setError("No se pudo borrar el movimiento.");
    }
  }

  if (error && !movs) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!movs) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando caja…</p>;

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      {/* Resumen de saldo */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Ingresos</p>
          <p className="text-sm font-semibold" style={{ color: "#7fb069" }}>{formatearMoneda(totales.ingresos)}</p>
        </div>
        <div className="rounded-lg border p-2 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Egresos</p>
          <p className="text-sm font-semibold" style={{ color: "#c86a6a" }}>{formatearMoneda(totales.egresos)}</p>
        </div>
        <div className="rounded-lg border p-2 text-center" style={{ borderColor: "var(--dorado)" }}>
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Saldo</p>
          <p className="text-sm font-semibold" style={{ color: "var(--dorado)" }}>{formatearMoneda(totales.saldo)}</p>
        </div>
      </div>

      {/* Alta de movimiento */}
      <form onSubmit={alta} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="grid grid-cols-2 gap-2">
          <select className={input} style={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovimiento })}>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
          <input className={input} style={campo} type="number" min="1" placeholder="Monto" value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: e.target.value ? Number(e.target.value) : 0 })} />
          <input className={`${input} col-span-2`} style={campo} placeholder="Concepto (ej. seña Ford Ka, gestoría, publicidad…)" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          <select className={input} style={campo} value={form.forma_pago ?? ""} onChange={(e) => setForm({ ...form, forma_pago: (e.target.value || null) as FormaPagoCaja | null })}>
            <option value="">Forma de pago…</option>
            {FORMAS_PAGO_CAJA.map((f) => (
              <option key={f} value={f}>{ETIQUETA_FORMA_PAGO_CAJA[f]}</option>
            ))}
          </select>
          <input className={input} style={campo} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} aria-label="Fecha" />
        </div>
        <div className="flex items-center justify-end gap-2">
          {editando && (
            <button
              type="button"
              onClick={() => {
                setEditando(null);
                setForm(movimientoVacio());
              }}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Cancelar
            </button>
          )}
          <button type="submit" disabled={guardando || !form.concepto.trim() || !form.monto} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--dorado)", color: "var(--verde-core)" }}>
            {guardando ? "Guardando…" : editando ? "Guardar corrección" : "Registrar movimiento"}
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Lista */}
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {movs.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="min-w-0">
              <p className="truncate font-medium">{m.concepto}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {new Date(m.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                {m.forma_pago ? ` · ${ETIQUETA_FORMA_PAGO_CAJA[m.forma_pago]}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: m.tipo === "ingreso" ? "#7fb069" : "#c86a6a" }}>
                {m.tipo === "ingreso" ? "+" : "−"} {formatearMoneda(m.monto)}
              </span>
              <button
                type="button"
                onClick={() => corregir(m)}
                aria-label={`Corregir ${m.concepto}`}
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                Corregir
              </button>
              <button type="button" onClick={() => borrar(m)} aria-label="Borrar movimiento" className="text-base leading-none" style={{ color: "var(--muted)" }}>×</button>
            </div>
          </div>
        ))}
        {movs.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            No hay movimientos de caja todavía. Registrá el primero arriba.
          </p>
        )}
      </div>
    </div>
  );
}
