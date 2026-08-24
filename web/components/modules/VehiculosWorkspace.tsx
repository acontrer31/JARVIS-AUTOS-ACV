"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  actualizarVehiculo,
  cambiarEstado,
  cargarCostos,
  cargarVehiculos,
  crearVehiculo,
  eliminarVehiculo,
  formatearMoneda,
  guardarCosto,
  nombreVehiculo,
  vehiculoVacio,
  type EstadoVehiculo,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/vehiculos";
import VehiculoForm from "@/components/modules/VehiculoForm";
import DetalleVehiculo from "@/components/modules/DetalleVehiculo";
import { miPerfil } from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";

const COLOR_ESTADO: Record<EstadoVehiculo, string> = {
  borrador: "var(--muted)",
  disponible: "var(--dorado)",
  reservado: "#e8a33d",
  vendido: "#7fb069",
  no_disponible: "var(--muted)",
};

export default function VehiculosWorkspace() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[] | null>(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoVehiculo | "todos">("todos");
  // null = formulario cerrado · "nuevo" = alta · Vehiculo = edición
  const [editando, setEditando] = useState<Vehiculo | "nuevo" | null>(null);
  // Ficha de solo lectura que se abre al clickear un vehículo.
  const [viendo, setViendo] = useState<Vehiculo | null>(null);
  // El costo interno solo lo ven los admin: vive en otra tabla, con su propia
  // política RLS. Para un vendedor este objeto queda vacío.
  const [esAdmin, setEsAdmin] = useState(false);
  const [costos, setCostos] = useState<Record<string, number | null>>({});

  useEffect(() => {
    cargarVehiculos()
      .then(async (lista) => {
        setVehiculos(lista);
        const perfil = await miPerfil();
        setEsAdmin(perfil.rol === "admin");
        if (perfil.rol === "admin") setCostos(await cargarCostos());
      })
      .catch((err) =>
        // Se muestra el motivo real (no un genérico): si falta correr la
        // migración de la Fase 2, Postgres responde "column ... does not
        // exist" y así se ve de una en pantalla en vez de adivinar.
        setError(
          "No se pudo cargar el stock real desde Supabase: " +
            mensajeDeError(err)
        )
      );
  }, []);

  const filtrados = useMemo(() => {
    if (!vehiculos) return [];
    const q = filtro.trim().toLowerCase();
    return vehiculos.filter((v) => {
      if (filtroEstado !== "todos" && v.estado !== filtroEstado) return false;
      if (!q) return true;
      return (nombreVehiculo(v) + " " + (v.dominio ?? "")).toLowerCase().includes(q);
    });
  }, [vehiculos, filtro, filtroEstado]);

  async function guardar(datos: VehiculoInput, costo: number | null) {
    let id: string;
    if (editando === "nuevo") {
      const creado = await crearVehiculo(datos);
      setVehiculos((prev) => [creado, ...(prev ?? [])]);
      id = creado.id;
    } else if (editando) {
      const actualizado = await actualizarVehiculo(editando.id, datos);
      setVehiculos((prev) => (prev ?? []).map((v) => (v.id === actualizado.id ? actualizado : v)));
      id = actualizado.id;
    } else {
      return;
    }
    // Segunda escritura, a otra tabla: si el usuario no es admin ni siquiera se
    // intenta — la base la rechazaría igual.
    if (esAdmin && costo !== (costos[id] ?? null)) {
      await guardarCosto(id, costo);
      setCostos((prev) => ({ ...prev, [id]: costo }));
    }
    setEditando(null);
  }

  async function cambiar(v: Vehiculo, estado: EstadoVehiculo) {
    // Optimista: la fila cambia al instante y se revierte si la base rechaza.
    const previo = v.estado;
    setVehiculos((prev) => (prev ?? []).map((x) => (x.id === v.id ? { ...x, estado } : x)));
    try {
      await cambiarEstado(v.id, estado);
    } catch {
      setVehiculos((prev) => (prev ?? []).map((x) => (x.id === v.id ? { ...x, estado: previo } : x)));
      setError("No se pudo cambiar el estado.");
    }
  }

  async function borrar(v: Vehiculo) {
    if (!confirm(`¿Eliminar ${nombreVehiculo(v)}? No se puede deshacer.`)) return;
    try {
      await eliminarVehiculo(v.id);
      setVehiculos((prev) => (prev ?? []).filter((x) => x.id !== v.id));
    } catch {
      setError("No se pudo eliminar el vehículo.");
    }
  }

  if (error && !vehiculos) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!vehiculos) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando stock real…</p>;

  if (editando) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {editando === "nuevo" ? "Nuevo vehículo" : `Editando ${nombreVehiculo(editando)}`}
        </p>
        <VehiculoForm
          inicial={editando === "nuevo" ? vehiculoVacio() : editando}
          vehiculoId={editando === "nuevo" ? null : editando.id}
          costoInicial={editando === "nuevo" ? null : costos[editando.id] ?? null}
          puedeVerCosto={esAdmin}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {viendo && (
        <DetalleVehiculo
          vehiculo={viendo}
          costo={costos[viendo.id] ?? null}
          puedeVerCosto={esAdmin}
          onEditar={() => {
            const v = viendo;
            setViendo(null);
            setEditando(v);
          }}
          onCerrar={() => setViendo(null)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {filtrados.length} de {vehiculos.length} vehículos
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoVehiculo | "todos")}
            className="rounded-lg border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar marca, modelo o dominio…"
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
        {filtrados.map((v) => (
          <div
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <button type="button" onClick={() => setViendo(v)} className="min-w-0 text-left">
              <p className="font-medium underline decoration-dotted underline-offset-4">
                {nombreVehiculo(v)} {v.anio ?? ""}
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {v.es_cero ? "0km" : v.km != null ? `${v.km.toLocaleString("es-AR")} km` : "Km s/d"}
                {v.condicion ? ` · ${v.condicion}` : ""}
                {v.dominio ? ` · ${v.dominio}` : ""}
              </p>
            </button>
            <div className="flex items-center gap-2">
              <select
                value={v.estado}
                onChange={(e) => cambiar(v, e.target.value as EstadoVehiculo)}
                aria-label={`Estado de ${nombreVehiculo(v)}`}
                className="rounded-md border px-1.5 py-1 text-xs outline-none"
                style={{ borderColor: "var(--border)", background: "var(--panel)", color: COLOR_ESTADO[v.estado] }}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e]}
                  </option>
                ))}
              </select>
              <p className="font-semibold" style={{ color: "var(--dorado)" }}>
                {formatearMoneda(v.precio)}
              </p>
              <button type="button" onClick={() => setEditando(v)} aria-label={`Editar ${nombreVehiculo(v)}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                Editar
              </button>
              <button type="button" onClick={() => borrar(v)} aria-label={`Eliminar ${nombreVehiculo(v)}`} className="text-xs" style={{ color: "#c86a6a" }}>
                ✕
              </button>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            Sin resultados.
          </p>
        )}
      </div>
    </div>
  );
}
