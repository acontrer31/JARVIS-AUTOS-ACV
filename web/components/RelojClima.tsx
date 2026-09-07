"use client";

import { useEffect, useRef, useState } from "react";
import { climaSaltaActual, iconoClima, type ClimaResumen } from "@/lib/clima";

// Reloj digital + clima de Salta, Argentina, sobre el dashboard. Flotante,
// arrastrable a cualquier parte de la pantalla y ocultable: al ocultarse queda
// un sol dorado con la palabra "clima" que al tocarlo lo despliega de nuevo.
// La hora se actualiza cada segundo; el clima cada 15 min (Open-Meteo, sin key).
//
// Se monta solo del lado del cliente (session === true), nunca en SSR, así que
// leer localStorage / window en el inicializador es seguro y no hay salto de
// hidratación.

const ZONA = "America/Argentina/Salta";
const CLAVE_POS = "jarvis-reloj-pos";
const CLAVE_OCULTO = "jarvis-reloj-oculto";

// Posición inicial: pegado a la izquierda, a la altura aproximada del módulo
// Administración (segundo anillo de nodos). Después es arrastrable.
// Arranca por debajo del panel del menú de cuenta, que ahora vive en la esquina
// superior izquierda: si no, al abrir el menú le tapa el reloj. Igual se puede
// arrastrar a donde cada uno quiera, y esa posición queda guardada.
const POS_DEFECTO = { x: 16, y: 250 };

const fmtHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  weekday: "long",
  day: "2-digit",
  month: "long",
});


function leerPos(): { x: number; y: number } {
  if (typeof window === "undefined") return POS_DEFECTO;
  try {
    const guardado = window.localStorage.getItem(CLAVE_POS);
    if (guardado) {
      const p = JSON.parse(guardado);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    }
  } catch {}
  return POS_DEFECTO;
}

function leerOculto(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLAVE_OCULTO) === "1";
  } catch {}
  return false;
}

export default function RelojClima() {
  const [ahora, setAhora] = useState<Date>(() => new Date());
  const [clima, setClima] = useState<ClimaResumen | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => leerPos());
  const [oculto, setOculto] = useState<boolean>(() => leerOculto());
  const arrastre = useRef<{ dx: number; dy: number; movido: boolean } | null>(null);
  // Si el último gesto fue un arrastre, el click que viene después no tiene que
  // desplegar el reloj: mover el sol y abrirlo son dos cosas distintas.
  const arrastrado = useRef(false);

  // Reloj: tick cada segundo.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Clima: al montar y cada 15 minutos.
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      climaSaltaActual().then((c) => {
        if (vivo && c) setClima(c);
      });
    };
    cargar();
    const id = setInterval(cargar, 15 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  function guardarPos(p: { x: number; y: number }) {
    try {
      window.localStorage.setItem(CLAVE_POS, JSON.stringify(p));
    } catch {}
  }

  function fijarOculto(v: boolean) {
    setOculto(v);
    try {
      window.localStorage.setItem(CLAVE_OCULTO, v ? "1" : "0");
    } catch {}
  }

  // --- Arrastre (mouse + touch, vía Pointer Events) ---
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a) return;
    a.movido = true;
    const max = 44; // margen mínimo visible
    const x = Math.min(Math.max(e.clientX - a.dx, 0), window.innerWidth - max);
    const y = Math.min(Math.max(e.clientY - a.dy, 0), window.innerHeight - max);
    setPos({ x, y });
  }
  function onPointerUp() {
    arrastrado.current = arrastre.current?.movido === true;
    if (arrastrado.current) guardarPos(pos);
    arrastre.current = null;
  }

  const hora = fmtHora.format(ahora);
  const fecha = fmtFecha.format(ahora);
  const fechaTitulo = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  // Números en fuente digital (Orbitron), sin recuadro: flotan sobre la escena.
  const digital = {
    fontFamily: "var(--font-orbitron), ui-monospace, monospace",
    color: "var(--dorado)",
    textShadow: "0 0 16px color-mix(in srgb, var(--dorado) 55%, transparent), 0 1px 3px rgba(0,0,0,.45)",
  } as const;

  const contenedor =
    "fixed z-40 select-none touch-none cursor-grab active:cursor-grabbing";

  // --- Colapsado: sol + "clima" ---
  if (oculto) {
    return (
      <div
        className={`${contenedor} flex flex-col items-center gap-0.5`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Sin data-no-drag a propósito: el sol se arrastra igual que el reloj.
            El click solo despliega si el gesto no fue un arrastre. */}
        <button
          type="button"
          onClick={() => {
            if (arrastrado.current) return;
            fijarOculto(false);
          }}
          aria-label={clima ? `Mostrar reloj y clima: ${clima.descripcion}` : "Mostrar reloj y clima"}
          className="flex flex-col items-center gap-0.5"
          style={{ background: "none", border: "none", cursor: "inherit", padding: 0 }}
        >
          {/* El ícono sigue al clima real: sol si está despejado, nube si
              está nublado, nube con lluvia si llueve. Mientras no cargó,
              sale el sol. */}
          <span className="text-3xl leading-none" aria-hidden="true">
            {iconoClima(clima?.codigo)}
          </span>
          <span className="text-[0.62rem] uppercase tracking-[0.22em]" style={digital}>
            clima
          </span>
        </button>
      </div>
    );
  }

  // --- Desplegado: reloj + fecha + temperatura ---
  return (
    <div
      className={contenedor}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Hora y clima de Salta, Argentina"
    >
      <div className="relative pr-6">
        <button
          type="button"
          data-no-drag
          onClick={() => fijarOculto(true)}
          aria-label="Ocultar"
          title="Ocultar"
          className="absolute right-0 top-0 leading-none"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dorado)", fontSize: "1rem", opacity: 0.7, padding: 0 }}
        >
          –
        </button>
        <div className="text-4xl font-semibold leading-none tabular-nums tracking-[0.12em] sm:text-5xl" style={digital}>
          {hora}
        </div>
        <div className="mt-1.5 text-[0.72rem] uppercase tracking-[0.18em] sm:text-sm" style={digital}>
          {fechaTitulo}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-sm" style={digital}>
          {clima ? (
            <>
              <span aria-hidden="true" style={{ textShadow: "none" }}>{iconoClima(clima.codigo)}</span>
              <span className="tabular-nums">{clima.temperatura}°</span>
              <span className="text-[0.72rem] opacity-80">· Salta</span>
            </>
          ) : (
            <span className="text-[0.72rem] opacity-70">Salta · —°</span>
          )}
        </div>
      </div>
    </div>
  );
}
