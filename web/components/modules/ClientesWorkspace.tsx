"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESTADOS_LEAD,
  ETIQUETA_ESTADO_LEAD,
  actualizarCliente,
  cambiarEstadoLead,
  cargarClientes,
  cargarVendedores,
  clienteVacio,
  crearCliente,
  eliminarCliente,
  type Cliente,
  type ClienteInput,
  type EstadoLead,
  type Vendedor,
} from "@/lib/clientes";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import ClienteForm from "@/components/modules/ClienteForm";
import PerfilCliente from "@/components/modules/PerfilCliente";

const COLOR_LEAD: Record<EstadoLead, string> = {
  nuevo: "var(--dorado)",
  contactado: "#e8a33d",
  en_negociacion: "#e8a33d",
  ganado: "#7fb069",
  perdido: "var(--muted)",
};

export default function ClientesWorkspace() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoLead | "todos">("todos");
  // null = lista · "nuevo" = alta · Cliente = edición
  const [editando, setEditando] = useState<Cliente | "nuevo" | null>(null);
  const [viendo, setViendo] = useState<Cliente | null>(null);

  useEffect(() => {
    // Los vehículos y vendedores se cargan igual porque el formulario los
    // necesita para sus selectores (vehículo de interés, vendedor asignado).
    Promise.all([cargarClientes(), cargarVehiculos(), cargarVendedores()])
      .then(([c, v, p]) => {
        setClientes(c);
        setVehiculos(v);
        setVendedores(p);
      })
      .catch((err) =>
        // Motivo real, no genérico: si falta correr la migración de la Fase 2,
        // Postgres responde "column ... does not exist" y se ve en pantalla.
        setError(
          "No se pudieron cargar los clientes desde Supabase: " +
            (err instanceof Error ? err.message : String(err))
        )
      );
  }, []);

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    const q = filtro.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtroEstado !== "todos" && c.estado_lead !== filtroEstado) return false;
      if (!q) return true;
      return [c.nombre, c.telefono, c.email].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [clientes, filtro, filtroEstado]);

  function nombreDeVehiculo(id: string | null): string | null {
    if (!id) return null;
    const v = vehiculos.find((x) => x.id === id);
    return v ? nombreVehiculo(v) : null;
  }

  async function guardar(datos: ClienteInput) {
    if (editando === "nuevo") {
      const creado = await crearCliente(datos);
      setClientes((prev) => [creado, ...(prev ?? [])]);
    } else if (editando) {
      const actualizado = await actualizarCliente(editando.id, datos);
      setClientes((prev) => (prev ?? []).map((c) => (c.id === actualizado.id ? actualizado : c)));
      if (viendo?.id === actualizado.id) setViendo(actualizado);
    }
    setEditando(null);
  }

  async function cambiar(c: Cliente, estado_lead: EstadoLead) {
    // Optimista: la fila cambia al instante y se revierte si la base rechaza.
    const previo = c.estado_lead;
    setClientes((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, estado_lead } : x)));
    try {
      await cambiarEstadoLead(c.id, estado_lead);
    } catch {
      setClientes((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, estado_lead: previo } : x)));
      setError("No se pudo cambiar la etapa del lead.");
    }
  }

  async function borrar(c: Cliente) {
    if (!confirm(`¿Eliminar a ${c.nombre}? Se borra también su historial. No se puede deshacer.`)) return;
    try {
      await eliminarCliente(c.id);
      setClientes((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      if (viendo?.id === c.id) setViendo(null);
    } catch {
      setError("No se pudo eliminar el cliente.");
    }
  }

  if (error && !clientes) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!clientes) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando clientes…</p>;

  if (editando) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {editando === "nuevo" ? "Nuevo cliente" : `Editando ${editando.nombre}`}
        </p>
        <ClienteForm
          inicial={editando === "nuevo" ? clienteVacio() : editando}
          vehiculos={vehiculos}
          vendedores={vendedores}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
        />
      </div>
    );
  }

  if (viendo) {
    return (
      <PerfilCliente
        cliente={viendo}
        nombreVehiculoInteres={nombreDeVehiculo(viendo.vehiculo_interes_id)}
        vendedor={vendedores.find((v) => v.id === viendo.vendedor_id)?.nombre ?? null}
        onEditar={() => setEditando(viendo)}
        onVolver={() => setViendo(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {filtrados.length} de {clientes.length} clientes
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoLead | "todos")}
            className="rounded-lg border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          >
            <option value="todos">Todas las etapas</option>
            {ESTADOS_LEAD.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_LEAD[e]}
              </option>
            ))}
          </select>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar nombre, teléfono o email…"
            className="rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          />
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: "var(--dorado)", color: "#0E4D3C" }}
          >
            + Nuevo
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {filtrados.map((c) => {
          const interes = nombreDeVehiculo(c.vehiculo_interes_id);
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <button type="button" onClick={() => setViendo(c)} className="min-w-0 text-left">
                <p className="font-medium underline decoration-dotted underline-offset-4">{c.nombre}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {c.telefono ?? "Sin teléfono"}
                  {interes ? ` · Interés: ${interes}` : ""}
                  {c.presupuesto != null ? ` · ${formatearMoneda(c.presupuesto)}` : ""}
                </p>
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={c.estado_lead}
                  onChange={(e) => cambiar(c, e.target.value as EstadoLead)}
                  aria-label={`Etapa de ${c.nombre}`}
                  className="rounded-md border px-1.5 py-1 text-xs outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--panel)", color: COLOR_LEAD[c.estado_lead] }}
                >
                  {ESTADOS_LEAD.map((e) => (
                    <option key={e} value={e}>
                      {ETIQUETA_ESTADO_LEAD[e]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                  Editar
                </button>
                <button type="button" onClick={() => borrar(c)} aria-label={`Eliminar ${c.nombre}`} className="text-xs" style={{ color: "#c86a6a" }}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        {filtrados.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            {clientes.length === 0 ? "Todavía no hay clientes cargados." : "Sin resultados."}
          </p>
        )}
      </div>
    </div>
  );
}
