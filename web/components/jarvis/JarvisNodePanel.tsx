"use client";

import type { JarvisModule, NodeStatus } from "@/lib/jarvis/tipos";

// Etiqueta legible del estado de un módulo. Sin inventar: un placeholder está
// "sin datos aún", no "operativo".
const ETIQUETA_ESTADO: Record<NodeStatus, string> = {
  online: "Operativo",
  processing: "Procesando",
  warning: "Atención",
  error: "Con error",
  offline: "Sin datos aún",
};

const COLOR_ESTADO: Record<NodeStatus, string> = {
  online: "var(--dorado)",
  processing: "var(--dorado)",
  warning: "#d9a441",
  error: "#dc5046",
  offline: "var(--muted)",
};

// Panel contextual que aparece al hacer click en un nodo: nombre del módulo,
// estado, descripción, métrica real (si hay) y el botón para abrir el módulo
// (que dispara el mismo ModuleWorkspace de siempre). Se ancla abajo-centro de
// la red, deslizándose desde abajo.
export default function JarvisNodePanel({
  modulo,
  onAbrir,
  onCerrar,
}: {
  modulo: JarvisModule;
  onAbrir: () => void;
  onCerrar: () => void;
}) {
  const color = COLOR_ESTADO[modulo.status];
  return (
    <div
      className="absolute bottom-[4%] left-1/2 z-20 w-[min(20rem,82vw)] rounded-2xl border p-4 shadow-xl backdrop-blur"
      style={{
        borderColor: "var(--dorado)",
        background: "var(--panel)",
        transform: "translateX(-50%)",
        animation: "jarvis-subir 0.25s ease-out",
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <h3 className="text-sm font-semibold tracking-wide">{modulo.label}</h3>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-lg leading-none"
          style={{ color: "var(--muted)" }}
        >
          ×
        </button>
      </div>

      <p className="mb-2 text-[0.7rem]" style={{ color: "var(--muted)" }}>
        <span style={{ color }}>{ETIQUETA_ESTADO[modulo.status]}</span>
        {modulo.metrica && <span> · {modulo.metrica}</span>}
      </p>

      <p className="mb-3 text-xs leading-snug">{modulo.descripcion}</p>

      <button
        type="button"
        onClick={onAbrir}
        className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
        style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
      >
        {modulo.real ? "Abrir módulo" : "Abrir (todavía sin datos)"}
      </button>
    </div>
  );
}
