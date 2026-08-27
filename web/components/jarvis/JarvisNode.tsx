"use client";

import type { JarvisModule, NodeStatus } from "@/lib/jarvis/tipos";

// Color del punto de estado, siempre dentro de la identidad (dorado/verde) más
// un rojo tenue reservado para error. Nada de neón fuera de marca.
const COLOR_ESTADO: Record<NodeStatus, string> = {
  online: "var(--dorado)",
  processing: "var(--dorado)",
  warning: "#d9a441",
  error: "#dc5046",
  offline: "var(--muted)",
};

// Un nodo de la red = un módulo. Punto de estado + etiqueta (y una métrica real
// si existe). Al pasar el cursor se agranda y avisa al padre para resaltar su
// conexión; al hacer click abre el módulo. En mobile la etiqueta se oculta para
// no amontonar; el punto sigue clickeable.
export default function JarvisNode({
  modulo,
  activo,
  onAbrir,
  onHover,
}: {
  modulo: JarvisModule;
  activo: boolean;
  onAbrir: () => void;
  onHover: (dentro: boolean) => void;
}) {
  const color = COLOR_ESTADO[modulo.status];
  return (
    <button
      type="button"
      onClick={onAbrir}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      title={modulo.descripcion}
      aria-label={`${modulo.label}${modulo.metrica ? ` — ${modulo.metrica}` : ""}`}
      className="group flex flex-col items-center gap-1 outline-none transition-transform duration-200 hover:scale-110 focus-visible:scale-110"
      style={{ transformOrigin: "center" }}
    >
      <span
        className="flex items-center justify-center rounded-full border"
        style={{
          width: activo ? 18 : 14,
          height: activo ? 18 : 14,
          borderColor: color,
          background: activo
            ? color
            : `color-mix(in srgb, ${color} 22%, transparent)`,
          boxShadow: activo
            ? `0 0 12px 2px color-mix(in srgb, ${color} 60%, transparent)`
            : "none",
          transition: "all 0.25s ease",
        }}
      />
      <span
        className="hidden max-w-[6rem] truncate text-[0.62rem] font-medium leading-tight sm:block"
        style={{ color: activo ? "var(--dorado)" : "var(--foreground)" }}
      >
        {modulo.label}
      </span>
      {modulo.metrica && (
        <span className="hidden text-[0.55rem] leading-none sm:block" style={{ color: "var(--muted)" }}>
          {modulo.metrica}
        </span>
      )}
    </button>
  );
}
