"use client";

import { useCallback, useEffect, useState } from "react";
import { armarPipeline, type Pipeline } from "@/lib/crm";
import {
  asignarVendedor,
  cambiarEstadoLead,
  cargarVendedores,
  fijarProximoContacto,
  ESTADOS_LEAD,
  ETIQUETA_ESTADO_LEAD,
  type Cliente,
  type EstadoLead,
  type Vendedor,
} from "@/lib/clientes";
import { formatearMoneda } from "@/lib/vehiculos";
import { mensajeDeError } from "@/lib/errores";

// Color por etapa del embudo: del dorado (arranque) al verde (ganado) y gris
// (perdido). No inventa datos: todo sale de `clientes`.
const COLOR_ETAPA: Record<EstadoLead, string> = {
  nuevo: "var(--dorado)",
  contactado: "var(--dorado)",
  en_negociacion: "var(--dorado)",
  ganado: "#7fb069",
  perdido: "var(--muted)",
};

export default function CrmWorkspace() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<EstadoLead | null>("nuevo");

  const recargar = useCallback(() => {
    armarPipeline()
      .then(setPipeline)
      .catch((err) => setError("No se pudo cargar el CRM: " + mensajeDeError(err)));
  }, []);

  useEffect(() => {
    recargar();
    cargarVendedores()
      .then(setVendedores)
      .catch(() => {}); // sin vendedores igual se puede usar el embudo
  }, [recargar]);

  async function moverEtapa(cliente: Cliente, estado: EstadoLead) {
    try {
      await cambiarEstadoLead(cliente.id, estado);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function cambiarVendedor(cliente: Cliente, vendedor_id: string) {
    try {
      await asignarVendedor(cliente.id, vendedor_id || null);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function agendar(cliente: Cliente, fecha: string) {
    try {
      await fijarProximoContacto(cliente.id, fecha || null);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  if (error && !pipeline) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!pipeline) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando el embudo…</p>;

  const input = "rounded-lg border px-2 py-1 text-xs outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;
  const nombreVendedor = (id: string | null) =>
    id ? vendedores.find((v) => v.id === id)?.nombre ?? "Sin nombre" : "Sin asignar";

  // Ficha de un lead dentro de una etapa.
  const Ficha = ({ c }: { c: Cliente }) => (
    <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{c.nombre}</p>
        {c.presupuesto ? (
          <p className="text-xs font-semibold" style={{ color: "var(--dorado)" }}>{formatearMoneda(c.presupuesto)}</p>
        ) : null}
      </div>
      {c.telefono && <p className="text-xs" style={{ color: "var(--muted)" }}>{c.telefono}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className={input}
          style={campo}
          value={c.estado_lead}
          onChange={(e) => moverEtapa(c, e.target.value as EstadoLead)}
          aria-label="Etapa"
        >
          {ESTADOS_LEAD.map((e) => (
            <option key={e} value={e}>{ETIQUETA_ESTADO_LEAD[e]}</option>
          ))}
        </select>
        <select
          className={input}
          style={campo}
          value={c.vendedor_id ?? ""}
          onChange={(e) => cambiarVendedor(c, e.target.value)}
          aria-label="Vendedor"
        >
          <option value="">Sin asignar</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre ?? "Sin nombre"}</option>
          ))}
        </select>
        <input
          type="date"
          className={input}
          style={campo}
          value={c.proximo_contacto ?? ""}
          onChange={(e) => agendar(c, e.target.value)}
          aria-label="Próximo contacto"
        />
      </div>
    </div>
  );

  const pendientes = [...pipeline.vencidos, ...pipeline.hoy];

  return (
    <div className="flex flex-col gap-4">
      {/* Agenda de seguimiento */}
      {pendientes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--dorado)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dorado)" }}>
            Para contactar ({pendientes.length})
          </p>
          {pipeline.vencidos.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {c.nombre} · <span className="text-red-400">vencido {c.proximo_contacto}</span>
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>{nombreVendedor(c.vendedor_id)}</span>
            </div>
          ))}
          {pipeline.hoy.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{c.nombre} · <span style={{ color: "var(--dorado)" }}>hoy</span></span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>{nombreVendedor(c.vendedor_id)}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Embudo por etapas */}
      <div className="flex flex-col gap-2">
        {pipeline.etapas.map((et) => (
          <div key={et.estado} className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={() => setAbierta(abierta === et.estado ? null : et.estado)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_ETAPA[et.estado] }} />
                {ETIQUETA_ESTADO_LEAD[et.estado]}
                <span style={{ color: "var(--muted)" }}>({et.leads.length})</span>
              </span>
              <span className="text-xs font-semibold" style={{ color: "var(--dorado)" }}>
                {et.valor ? formatearMoneda(et.valor) : ""}
              </span>
            </button>
            {abierta === et.estado && (
              <div className="flex flex-col gap-2 px-3 pb-3">
                {et.leads.length === 0 ? (
                  <p className="py-2 text-center text-xs" style={{ color: "var(--muted)" }}>
                    No hay leads en esta etapa.
                  </p>
                ) : (
                  et.leads.map((c) => <Ficha key={c.id} c={c} />)
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        {pipeline.total} cliente(s) en total. Los leads se cargan desde el módulo Clientes o por voz; acá se mueven de
        etapa, se asigna vendedor y se agenda el próximo contacto.
      </p>
    </div>
  );
}
