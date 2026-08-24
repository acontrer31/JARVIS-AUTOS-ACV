"use client";

import { useEffect, useState } from "react";
import { ETIQUETA_ESTADO_LEAD, type Cliente } from "@/lib/clientes";
import {
  ETIQUETA_TIPO,
  TIPOS_INTERACCION,
  cargarInteracciones,
  cargarOperaciones,
  formatearFecha,
  registrarInteraccion,
  type Interaccion,
  type Operacion,
  type TipoInteraccion,
} from "@/lib/interacciones";
import { formatearMoneda } from "@/lib/vehiculos";
import { mensajeDeError } from "@/lib/errores";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {etiqueta}
      </p>
      <p className="text-sm">{valor ?? "—"}</p>
    </div>
  );
}

export default function PerfilCliente({
  cliente,
  nombreVehiculoInteres,
  vendedor,
  onEditar,
  onVolver,
}: {
  cliente: Cliente;
  nombreVehiculoInteres: string | null;
  vendedor: string | null;
  onEditar: () => void;
  onVolver: () => void;
}) {
  const [interacciones, setInteracciones] = useState<Interaccion[] | null>(null);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [error, setError] = useState("");

  // Alta rápida de una interacción, sin salir del perfil.
  const [tipo, setTipo] = useState<TipoInteraccion>("llamada");
  const [resumen, setResumen] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([cargarInteracciones(cliente.id), cargarOperaciones(cliente.id)])
      .then(([i, o]) => {
        setInteracciones(i);
        setOperaciones(o);
      })
      .catch((err) => {
        setError("No se pudo cargar el historial: " + mensajeDeError(err));
        // Igual que en la galería de fotos: sin esto queda "Cargando historial…"
        // para siempre, al lado del error.
        setInteracciones([]);
      });
  }, [cliente.id]);

  async function anotar(e: React.FormEvent) {
    e.preventDefault();
    if (!resumen.trim()) return;
    setGuardando(true);
    try {
      const nueva = await registrarInteraccion({ cliente_id: cliente.id, tipo, resumen: resumen.trim() });
      setInteracciones((prev) => [nueva, ...(prev ?? [])]);
      setResumen("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onVolver} className="text-xs underline" style={{ color: "var(--muted)" }}>
          ← Volver a la lista
        </button>
        <button type="button" onClick={onEditar} className="text-xs underline" style={{ color: "var(--dorado)" }}>
          Editar datos
        </button>
      </div>

      <div>
        <h3 className="text-lg font-semibold">{cliente.nombre}</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {ETIQUETA_ESTADO_LEAD[cliente.estado_lead]} · alta {formatearFecha(cliente.creado_en)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <Dato etiqueta="Teléfono" valor={cliente.telefono} />
        <Dato etiqueta="Email" valor={cliente.email} />
        <Dato etiqueta="Vehículo de interés" valor={nombreVehiculoInteres} />
        <Dato etiqueta="Presupuesto" valor={cliente.presupuesto != null ? formatearMoneda(cliente.presupuesto) : null} />
        <Dato etiqueta="Vendedor asignado" valor={vendedor} />
      </div>

      {cliente.notas && (
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Notas
          </p>
          <p className="whitespace-pre-wrap text-sm">{cliente.notas}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Historial de contacto
        </p>

        <form onSubmit={anotar} className="flex flex-wrap items-center gap-2">
          <select className={input} style={estiloCampo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoInteraccion)}>
            {TIPOS_INTERACCION.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
          <input
            className={`${input} flex-1`}
            style={estiloCampo}
            placeholder="Qué pasó…"
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
          />
          <button
            type="submit"
            disabled={guardando || !resumen.trim()}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--dorado)", color: "#0E4D3C" }}
          >
            {guardando ? "…" : "Anotar"}
          </button>
        </form>

        {interacciones === null ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Cargando historial…</p>
        ) : interacciones.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Sin interacciones registradas todavía.</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {interacciones.map((i) => (
              <div key={i.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {ETIQUETA_TIPO[i.tipo] ?? i.tipo} · {formatearFecha(i.creado_en)}
                </p>
                <p className="whitespace-pre-wrap">{i.resumen}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {operaciones.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Operaciones
          </p>
          {operaciones.map((o) => (
            <div key={o.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              <span>
                {o.tipo} · {o.estado}
              </span>
              <span style={{ color: "var(--dorado)" }}>{formatearMoneda(o.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
