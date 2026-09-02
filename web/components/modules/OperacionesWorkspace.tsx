"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESTADOS_OPERACION,
  ETIQUETA_ESTADO_OP,
  ETIQUETA_FORMA_PAGO,
  ETIQUETA_TIPO_OP,
  FORMAS_PAGO,
  TIPOS_OPERACION,
  cambiarEstadoOperacion,
  cargarOperaciones,
  crearOperacion,
  eliminarOperacion,
  operacionVacia,
  type EstadoOperacion,
  type FormaPago,
  type Operacion,
  type OperacionInput,
  type TipoOperacion,
} from "@/lib/operaciones";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { cargarClientes, cargarVendedores, type Cliente, type Vendedor } from "@/lib/clientes";
import { mensajeDeError } from "@/lib/errores";

const COLOR_ESTADO: Record<EstadoOperacion, string> = {
  abierta: "var(--muted)",
  senada: "#e8a33d",
  entregada: "#7fb069",
  cancelada: "#c86a6a",
};

export default function OperacionesWorkspace() {
  const [ops, setOps] = useState<Operacion[] | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<OperacionInput>(operacionVacia());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([cargarOperaciones(), cargarVehiculos(), cargarClientes(), cargarVendedores()])
      .then(([o, v, c, ve]) => {
        setOps(o);
        setVehiculos(v);
        setClientes(c);
        setVendedores(ve);
      })
      .catch((err) => setError("No se pudieron cargar las operaciones: " + mensajeDeError(err)));
  }, []);

  const nombreVeh = useMemo(() => {
    const m = new Map(vehiculos.map((v) => [v.id, nombreVehiculo(v)]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vehiculos]);
  const nombreCli = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nombre]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [clientes]);
  const nombreVend = useMemo(() => {
    const m = new Map(vendedores.map((v) => [v.id, v.nombre ?? "—"]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vendedores]);

  async function alta(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const creada = await crearOperacion(form);
      setOps((prev) => [creada, ...(prev ?? [])]);
      setForm(operacionVacia());
      setCreando(false);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiar(op: Operacion, estado: EstadoOperacion) {
    const previo = op.estado;
    setOps((prev) => (prev ?? []).map((x) => (x.id === op.id ? { ...x, estado } : x)));
    try {
      await cambiarEstadoOperacion(op, estado);
    } catch {
      setOps((prev) => (prev ?? []).map((x) => (x.id === op.id ? { ...x, estado: previo } : x)));
      setError("No se pudo cambiar el estado de la operación.");
    }
  }

  async function borrar(op: Operacion) {
    const antes = ops ?? [];
    setOps((prev) => (prev ?? []).filter((x) => x.id !== op.id));
    try {
      await eliminarOperacion(op.id);
    } catch {
      setOps(antes);
      setError("No se pudo borrar la operación.");
    }
  }

  if (error && !ops) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!ops) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando operaciones…</p>;

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;
  const abiertas = ops.filter((o) => o.estado === "abierta" || o.estado === "senada").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {ops.length} operaciones · {abiertas} en curso
        </p>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
          >
            + Nueva operación
          </button>
        )}
      </div>

      {creando && (
        <form onSubmit={alta} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--dorado)" }}>
          <div className="grid grid-cols-2 gap-2">
            <select className={input} style={campo} value={form.vehiculo_id ?? ""} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value || null })}>
              <option value="">Vehículo…</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>{nombreVehiculo(v)}</option>
              ))}
            </select>
            <select className={input} style={campo} value={form.cliente_id ?? ""} onChange={(e) => setForm({ ...form, cliente_id: e.target.value || null })}>
              <option value="">Cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <select className={input} style={campo} value={form.vendedor_id ?? ""} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value || null })}>
              <option value="">Vendedor…</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre ?? "—"}</option>
              ))}
            </select>
            <select className={input} style={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoOperacion })}>
              {TIPOS_OPERACION.map((t) => (
                <option key={t} value={t}>{ETIQUETA_TIPO_OP[t]}</option>
              ))}
            </select>
            <select className={input} style={campo} value={form.forma_pago ?? ""} onChange={(e) => setForm({ ...form, forma_pago: (e.target.value || null) as FormaPago | null })}>
              <option value="">Forma de pago…</option>
              {FORMAS_PAGO.map((f) => (
                <option key={f} value={f}>{ETIQUETA_FORMA_PAGO[f]}</option>
              ))}
            </select>
            <input className={input} style={campo} type="number" min="0" placeholder="Monto" value={form.monto ?? ""} onChange={(e) => setForm({ ...form, monto: e.target.value ? Number(e.target.value) : null })} />
            <input className={input} style={campo} type="number" min="0" placeholder="Seña" value={form.sena ?? ""} onChange={(e) => setForm({ ...form, sena: e.target.value ? Number(e.target.value) : null })} />
            <input className={input} style={campo} type="number" min="0" placeholder="Comisión" value={form.comision ?? ""} onChange={(e) => setForm({ ...form, comision: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <input className={input} style={campo} placeholder="Notas (opcional)" value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value || null })} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setCreando(false); setForm(operacionVacia()); }} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>Cancelar</button>
            <button type="submit" disabled={guardando} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--dorado)", color: "var(--verde-core)" }}>
              {guardando ? "Guardando…" : "Registrar operación"}
            </button>
          </div>
        </form>
      )}

      {error && ops && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        {ops.map((op) => (
          <div key={op.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {ETIQUETA_TIPO_OP[op.tipo]} · {nombreVeh(op.vehiculo_id)}
                <span style={{ color: "var(--muted)" }}> — {nombreCli(op.cliente_id)}</span>
              </p>
              <p className="font-semibold" style={{ color: "var(--dorado)" }}>{formatearMoneda(op.monto)}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <span>
                Vendedor: {nombreVend(op.vendedor_id)}
                {op.forma_pago ? ` · ${ETIQUETA_FORMA_PAGO[op.forma_pago]}` : ""}
                {op.sena ? ` · seña ${formatearMoneda(op.sena)}` : ""}
                {op.comision ? ` · comisión ${formatearMoneda(op.comision)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR_ESTADO[op.estado] }} />
                <select
                  value={op.estado}
                  onChange={(e) => cambiar(op, e.target.value as EstadoOperacion)}
                  aria-label="Estado de la operación"
                  className="rounded-md border px-1.5 py-1 text-xs outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--panel)" }}
                >
                  {ESTADOS_OPERACION.map((es) => (
                    <option key={es} value={es}>{ETIQUETA_ESTADO_OP[es]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => borrar(op)} aria-label="Borrar operación" className="text-base leading-none" style={{ color: "var(--muted)" }}>×</button>
              </div>
            </div>
          </div>
        ))}
        {ops.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            Todavía no hay operaciones. Registrá la primera con &quot;+ Nueva operación&quot;.
          </p>
        )}
      </div>

      <p className="rounded-lg border p-2 text-[0.7rem]" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Al cambiar el estado, el vehículo se sincroniza en el stock: <strong>Señada</strong> lo marca reservado,
        <strong> Entregada</strong> lo marca vendido y <strong>Cancelada</strong> lo vuelve a disponible.
      </p>
    </div>
  );
}
