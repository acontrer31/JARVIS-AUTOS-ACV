"use client";

import { useEffect, useRef } from "react";
import type { EstadoVisual } from "@/lib/jarvis/tipos";

// Núcleo animado del JARVIS COMMAND CENTER. Es puramente presentacional: recibe
// el estado visual y anima en consecuencia. La lógica real (voz, conexión) vive
// en components/JarvisCore.tsx; acá solo se pinta.
//
// Render: partículas en <canvas> 2D (livianas, con cap de devicePixelRatio,
// requestAnimationFrame, pausa con pestaña oculta y fallback estático si el
// usuario pide menos movimiento), anillos y glow en CSS. Sin WebGL ni
// dependencias nuevas.

// Ritmo de los anillos/glow por estado (fuera del canvas, en CSS).
const RITMO: Record<EstadoVisual, { spin: number; glow: number }> = {
  idle: { spin: 18, glow: 0.5 },
  listening: { spin: 10, glow: 0.75 },
  thinking: { spin: 8, glow: 0.85 },
  processing: { spin: 4, glow: 0.9 },
  speaking: { spin: 6, glow: 1 },
  error: { spin: 20, glow: 0.4 },
  offline: { spin: 40, glow: 0.15 },
};

// Parámetros del campo de partículas por estado.
const PARTICULAS: Record<
  EstadoVisual,
  { n: number; vel: number; pulso: number; conexiones: boolean; ondas: number; alfa: number }
> = {
  idle: { n: 34, vel: 0.12, pulso: 0.03, conexiones: false, ondas: 0, alfa: 0.55 },
  listening: { n: 44, vel: 0.22, pulso: 0.14, conexiones: false, ondas: 2, alfa: 0.8 },
  thinking: { n: 60, vel: 0.3, pulso: 0.06, conexiones: true, ondas: 0, alfa: 0.85 },
  processing: { n: 52, vel: 0.6, pulso: 0.05, conexiones: false, ondas: 1, alfa: 0.85 },
  speaking: { n: 48, vel: 0.34, pulso: 0.2, conexiones: false, ondas: 2, alfa: 1 },
  error: { n: 28, vel: 0.1, pulso: 0.04, conexiones: false, ondas: 0, alfa: 0.5 },
  offline: { n: 16, vel: 0.03, pulso: 0, conexiones: false, ondas: 0, alfa: 0.2 },
};

const MAX_PARTICULAS = 64;

interface Particula {
  base: number; // radio base como fracción de R
  ang: number; // ángulo actual
  vel: number; // factor de velocidad propio
  size: number;
  fase: number; // desfase del pulso
}

function leerColor(nombre: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || fallback;
}

// hex (#rrggbb) → "r,g,b" para armar rgba con alfa variable.
function rgb(hex: string): string {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const int = parseInt(n, 16);
  if (Number.isNaN(int)) return "212,167,44";
  return `${(int >> 16) & 255},${(int >> 8) & 255},${int & 255}`;
}

export default function JarvisNucleus({ estado }: { estado: EstadoVisual }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const estadoRef = useRef<EstadoVisual>(estado);

  // El loop lee el estado más nuevo por ref, sin reiniciarse en cada cambio.
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const contenedor = contenedorRef.current;
    if (!canvas || !contenedor) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dorado = rgb(leerColor("--dorado", "#d4a72c"));
    const crema = rgb(leerColor("--core-text", "#f5f0e6"));
    const rojo = "220,80,70";

    // Partículas base (se usan las primeras n según el estado).
    const parts: Particula[] = Array.from({ length: MAX_PARTICULAS }, (_, i) => ({
      base: 0.32 + Math.random() * 0.5,
      ang: (i / MAX_PARTICULAS) * Math.PI * 2 + Math.random() * 0.4,
      vel: 0.4 + Math.random() * 1.1,
      size: 0.8 + Math.random() * 1.8,
      fase: Math.random() * Math.PI * 2,
    }));

    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let R = 0;
    let dpr = 1;

    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = contenedor!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.max(1, Math.round(w * dpr));
      canvas!.height = Math.max(1, Math.round(h * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = h / 2;
      R = Math.min(w, h) / 2;
    }
    medir();

    const ro = new ResizeObserver(medir);
    ro.observe(contenedor);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let ultimo = performance.now();

    function pintar(now: number) {
      const dt = Math.min((now - ultimo) / 1000, 0.05);
      ultimo = now;
      const t = now / 1000;
      const p = PARTICULAS[estadoRef.current];
      const color = estadoRef.current === "error" ? rojo : dorado;

      ctx!.clearRect(0, 0, w, h);

      // Ondas concéntricas (escucha / habla / proceso): círculos que se
      // expanden y se desvanecen desde el núcleo.
      for (let k = 0; k < p.ondas; k++) {
        const fase = (t * (0.35 + 0.15 * k) + k / p.ondas) % 1;
        const rr = R * (0.35 + fase * 0.6);
        ctx!.beginPath();
        ctx!.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${color},${(1 - fase) * 0.25 * p.alfa})`;
        ctx!.lineWidth = 1.2;
        ctx!.stroke();
      }

      // Partículas en órbita, con respiración radial según el pulso del estado.
      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i < p.n; i++) {
        const part = parts[i];
        part.ang += part.vel * p.vel * dt;
        const pulso = Math.sin(t * 2.2 + part.fase) * p.pulso;
        const r = (part.base + pulso) * R;
        const x = cx + Math.cos(part.ang) * r;
        const y = cy + Math.sin(part.ang) * r;

        if (p.conexiones && i > 0) {
          ctx!.beginPath();
          ctx!.moveTo(prevX, prevY);
          ctx!.lineTo(x, y);
          ctx!.strokeStyle = `rgba(${color},${0.12 * p.alfa})`;
          ctx!.lineWidth = 0.6;
          ctx!.stroke();
        }
        prevX = x;
        prevY = y;

        ctx!.beginPath();
        ctx!.arc(x, y, part.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${i % 5 === 0 ? crema : color},${p.alfa})`;
        ctx!.fill();
      }

      if (!reduce) raf = requestAnimationFrame(pintar);
    }

    // Con movimiento reducido: un solo cuadro estático.
    if (reduce) pintar(performance.now());
    else raf = requestAnimationFrame(pintar);

    function onVisibilidad() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        ultimo = performance.now();
        raf = requestAnimationFrame(pintar);
      }
    }
    document.addEventListener("visibilitychange", onVisibilidad);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, []);

  const ritmo = RITMO[estado];

  return (
    <div ref={contenedorRef} className="absolute inset-0">
      {/* Glow radial detrás de todo, pulsando según el estado. */}
      <div
        className="absolute inset-[8%] rounded-full"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, var(--dorado) ${Math.round(
            ritmo.glow * 22
          )}%, transparent) 0%, transparent 68%)`,
          boxShadow: `0 0 70px 12px color-mix(in srgb, ${
            estado === "error" ? "#dc5046" : "var(--dorado)"
          } ${Math.round(ritmo.glow * 45)}%, transparent)`,
          transition: "box-shadow 0.5s ease",
          animation: `jarvis-latido ${estado === "speaking" ? 1.4 : 3.4}s ease-in-out infinite`,
        }}
      />

      {/* Campo de partículas. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Anillo punteado exterior. */}
      <div
        className="absolute inset-0 rounded-full border-2 border-dashed"
        style={{
          borderColor: estado === "error" ? "#dc5046" : "var(--dorado)",
          opacity: 0.5,
          animation: `jarvis-girar ${ritmo.spin}s linear infinite`,
        }}
      />
      {/* Anillo interior fino, girando al revés. */}
      <div
        className="absolute inset-[7%] rounded-full border"
        style={{
          borderColor: "var(--dorado)",
          opacity: 0.28,
          animation: `jarvis-girar ${ritmo.spin * 1.7}s linear infinite reverse`,
        }}
      />

      {/* Isologo de marca en el centro: círculo verde inglés, anillo dorado,
          letras "AA" en crema (Plastik). Recreado en SVG con las CSS vars de
          identidad — nunca colores fuera del verde/dorado. Cuando el usuario
          suba el archivo real del isologo, se cambia solo esta parte. */}
      <div className="absolute inset-[33%] flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Isologo">
          <defs>
            <radialGradient id="jarvis-nucleo-relleno" cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--verde-core) 78%, #000)" />
              <stop offset="100%" stopColor="var(--verde-core)" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill="url(#jarvis-nucleo-relleno)" stroke="var(--dorado)" strokeWidth="4" />
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
      </div>
    </div>
  );
}
