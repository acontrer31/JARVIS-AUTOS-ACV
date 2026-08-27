"use client";

import type { EstadoVisual, JarvisModule } from "@/lib/jarvis/tipos";

// Etiqueta legible del estado del núcleo para el HUD.
const ETIQUETA: Record<EstadoVisual, string> = {
  idle: "En espera",
  listening: "Escuchando",
  thinking: "Procesando",
  processing: "Conectando",
  speaking: "Respondiendo",
  error: "Error",
  offline: "Fuera de línea",
};

// Barra de estado del command center: un punto que late con el color del núcleo,
// la agencia (tenant) actual y un resumen honesto de cuántos módulos tienen
// datos reales conectados. Sin inventar métricas: cuenta los que están marcados
// como reales. El nombre de la agencia sale del perfil logueado (multi-tenant),
// nunca hardcodeado.
export default function JarvisStatus({
  estado,
  modulos,
  agencia,
}: {
  estado: EstadoVisual;
  modulos: JarvisModule[];
  agencia?: string | null;
}) {
  const operativos = modulos.filter((m) => m.real).length;
  const color = estado === "error" ? "#dc5046" : estado === "offline" ? "var(--muted)" : "var(--dorado)";

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.2em]"
      style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--muted)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: color,
          animation: estado === "offline" ? undefined : "jarvis-latido 2.4s ease-in-out infinite",
        }}
      />
      {agencia && (
        <>
          <span className="max-w-[10rem] truncate" style={{ color: "var(--dorado)" }}>
            {agencia}
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
        </>
      )}
      <span>{ETIQUETA[estado]}</span>
      <span style={{ color: "var(--border)" }}>|</span>
      <span>
        {operativos}/{modulos.length} módulos activos
      </span>
    </div>
  );
}
