"use client";

import { MODULOS, type ModuloId } from "@/lib/modules";

export type EstadoJarvis = "standby" | "activando" | "trabajando" | "error";

const ETIQUETA_ESTADO: Record<EstadoJarvis, string> = {
  standby: "STANDBY",
  activando: "ACTIVANDO",
  trabajando: "TRABAJANDO",
  error: "ERROR",
};

// Recreación del isologo real (círculo con anillo dorado, relleno verde
// inglés oscuro, letras "AA" en Plastik Regular — la tipografía real del
// logo, licencia GPL v2, ver web/app/fonts/LICENSE-Plastik.txt) mientras el
// usuario sube el archivo de imagen real del isologo completo — apenas lo
// suba, este SVG se reemplaza por la imagen real en <img>, sin tocar el
// resto del componente.
function LogoCore() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Isologo Alcover Automotores">
      <circle cx="50" cy="50" r="47" fill="var(--verde-core)" stroke="var(--dorado)" strokeWidth="4" />
      <text
        x="50"
        y="61"
        textAnchor="middle"
        fontSize="40"
        fill="var(--core-text)"
        stroke="var(--core-text)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fontFamily="var(--font-plastik, sans-serif)"
      >
        AA
      </text>
    </svg>
  );
}

export default function JarvisCore({
  estado,
  moduloActivo,
  onActivarModulo,
}: {
  estado: EstadoJarvis;
  moduloActivo: ModuloId | null;
  onActivarModulo: (id: ModuloId) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 py-10">
      <div className="relative flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
        {/* Anillo de estado: gira siempre despacio; más rápido cuando está "trabajando". */}
        <div
          className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{
            borderColor: "var(--dorado)",
            opacity: 0.55,
            animation: `girar ${estado === "trabajando" ? 3 : 14}s linear infinite`,
          }}
        />
        <div
          className="absolute inset-3 rounded-full"
          style={{ boxShadow: "0 0 40px 6px color-mix(in srgb, var(--dorado) 35%, transparent)" }}
        />
        <div className="absolute inset-6 animate-[girar_22s_linear_infinite_reverse]">
          <LogoCore />
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs tracking-[0.3em]" style={{ color: "var(--muted)" }}>
          {ETIQUETA_ESTADO[estado]}
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-[0.2em]">JARVIS CORE</h1>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-3 gap-3 px-4 sm:grid-cols-4 md:grid-cols-5">
        {MODULOS.map((modulo) => {
          const activo = moduloActivo === modulo.id;
          return (
            <button
              key={modulo.id}
              type="button"
              onClick={() => onActivarModulo(modulo.id)}
              className="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition"
              style={{
                borderColor: activo ? "var(--dorado)" : "var(--border)",
                background: activo ? "color-mix(in srgb, var(--dorado) 12%, transparent)" : "var(--panel)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: modulo.real ? "var(--dorado)" : "var(--muted)" }}
              />
              <span className="text-[0.7rem] font-medium">{modulo.label}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes girar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
