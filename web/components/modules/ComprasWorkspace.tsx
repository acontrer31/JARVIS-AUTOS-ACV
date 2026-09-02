"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ETIQUETA_ORIGEN,
  ETIQUETA_TIPO_PROVEEDOR,
  ORIGENES_COMPRA,
  TIPOS_PROVEEDOR,
  cargarCompras,
  cargarProveedores,
  compraVacia,
  crearCompra,
  crearProveedor,
  eliminarCompra,
  type Compra,
  type CompraInput,
  type OrigenCompra,
  type Proveedor,
  type TipoProveedor,
} from "@/lib/compras";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { mensajeDeError } from "@/lib/errores";

export default function ComprasWorkspace() {
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CompraInput>(compraVacia());
  const [guardando, setGuardando] = useState(false);

  // Alta rápida de proveedor.
  const [nuevoProv, setNuevoProv] = useState(false);
  const [provNombre, setProvNombre] = useState("");
  const [provTipo, setProvTipo] = useState<TipoProveedor>("particular");

  useEffect(() => {
    Promise.all([cargarCompras(), cargarProveedores(), cargarVehiculos()])
      .then(([c, p, v]) => {
        setCompras(c);
        setProveedores(p);
        setVehiculos(v);
      })
      .catch((err) => setError("No se pudieron cargar las compras: " + mensajeDeError(err)));
  }, []);

  const nombreVeh = useMemo(() => {
    const m = new Map(vehiculos.map((v) => [v.id, nombreVehiculo(v)]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vehiculos]);
  const nombreProv = useMemo(() => {
    const m = new Map(proveedores.map((p) => [p.id, p.nombre]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [proveedores]);

  async function alta(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const creada = await crearCompra(form);
      setCompras((prev) => [creada, ...(prev ?? [])]);
      setForm(compraVacia());
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function altaProveedor() {
    if (!provNombre.trim()) return;
    try {
      const p = await crearProveedor({ nombre: provNombre, tipo: provTipo });
      setProveedores((prev) => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm((f) => ({ ...f, proveedor_id: p.id }));
      setProvNombre("");
      setNuevoProv(false);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function borrar(c: Compra) {
    const antes = compras ?? [];
    setCompras((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    try {
      await eliminarCompra(c.id);
    } catch {
      setCompras(antes);
      setError("No se pudo borrar la compra.");
    }
  }

  if (error && !compras) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!compras) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando compras…</p>;

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{compras.length} ingresos de stock registrados</p>

      <form onSubmit={alta} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="grid grid-cols-2 gap-2">
          <select className={input} style={campo} value={form.vehiculo_id ?? ""} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value || null })}>
            <option value="">Vehículo…</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>{nombreVehiculo(v)}</option>
            ))}
          </select>
          <select className={input} style={campo} value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value as OrigenCompra })}>
            {ORIGENES_COMPRA.map((o) => (
              <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>
            ))}
          </select>
          <select className={input} style={campo} value={form.proveedor_id ?? ""} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value || null })}>
            <option value="">Proveedor…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{p.tipo ? ` (${ETIQUETA_TIPO_PROVEEDOR[p.tipo]})` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => setNuevoProv((v) => !v)} className="rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {nuevoProv ? "Cancelar" : "+ Nuevo proveedor"}
          </button>
          <input className={input} style={campo} type="number" min="0" placeholder="Costo" value={form.costo ?? ""} onChange={(e) => setForm({ ...form, costo: e.target.value ? Number(e.target.value) : null })} />
          <input className={input} style={campo} type="number" min="0" placeholder="Gastos (acondicionamiento)" value={form.gastos ?? ""} onChange={(e) => setForm({ ...form, gastos: e.target.value ? Number(e.target.value) : null })} />
          <input className={input} style={campo} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} aria-label="Fecha" />
          <input className={input} style={campo} placeholder="Notas (opcional)" value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value || null })} />
        </div>

        {nuevoProv && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--dorado)" }}>
            <input className={`${input} flex-1`} style={campo} placeholder="Nombre del proveedor" value={provNombre} onChange={(e) => setProvNombre(e.target.value)} />
            <select className={input} style={campo} value={provTipo} onChange={(e) => setProvTipo(e.target.value as TipoProveedor)}>
              {TIPOS_PROVEEDOR.map((t) => (
                <option key={t} value={t}>{ETIQUETA_TIPO_PROVEEDOR[t]}</option>
              ))}
            </select>
            <button type="button" onClick={altaProveedor} disabled={!provNombre.trim()} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--dorado)", color: "var(--verde-core)" }}>Guardar proveedor</button>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--dorado)", color: "var(--verde-core)" }}>
            {guardando ? "Guardando…" : "Registrar ingreso de stock"}
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {compras.map((c) => (
          <div key={c.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{ETIQUETA_ORIGEN[c.origen]} · {nombreVeh(c.vehiculo_id)}</p>
              <p className="font-semibold" style={{ color: "var(--dorado)" }}>
                {formatearMoneda((c.costo ?? 0) + (c.gastos ?? 0))}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <span>
                {nombreProv(c.proveedor_id)}
                {c.costo != null ? ` · costo ${formatearMoneda(c.costo)}` : ""}
                {c.gastos != null ? ` · gastos ${formatearMoneda(c.gastos)}` : ""}
                {" · "}
                {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
              <button type="button" onClick={() => borrar(c)} aria-label="Borrar compra" className="text-base leading-none" style={{ color: "var(--muted)" }}>×</button>
            </div>
          </div>
        ))}
        {compras.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            Todavía no registraste ingresos de stock. Cargá el primero arriba.
          </p>
        )}
      </div>
    </div>
  );
}
