"use client";

import { useEffect, useState } from "react";
import { climaSaltaActual, type ClimaResumen } from "@/lib/clima";

// Reloj digital + clima de Salta, Argentina, en la esquina superior izquierda
// del dashboard. En dorado, sobre el estilo del command center. La hora se
// actualiza cada segundo; el clima cada 15 minutos (Open-Meteo, sin API key).
//
// Se renderiza solo del lado del cliente (empieza en null hasta montar) para
// no chocar con la hidratación del servidor, que tendría otra hora.

const ZONA = "America/Argentina/Salta";

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

function iconoClima(codigo: number): string {
  if (codigo === 0) return "☀️";
  if (codigo === 1 || codigo === 2) return "🌤️";
  if (codigo === 3) return "☁️";
  if (codigo >= 45 && codigo <= 48) return "🌫️";
  if (codigo >= 51 && codigo <= 67) return "🌧️";
  if (codigo >= 71 && codigo <= 77) return "🌨️";
  if (codigo >= 80 && codigo <= 82) return "🌦️";
  if (codigo >= 85 && codigo <= 86) return "🌨️";
  if (codigo >= 95) return "⛈️";
  return "🌡️";
}

export default function RelojClima() {
  // Inicializador perezoso: este widget solo se monta del lado cliente (después
  // del login, con session === true), nunca en SSR, así que no hay salto de
  // hidratación y evitamos el setState sincrónico dentro del efecto.
  const [ahora, setAhora] = useState<Date>(() => new Date());
  const [clima, setClima] = useState<ClimaResumen | null>(null);

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

  const hora = fmtHora.format(ahora);
  const fecha = fmtFecha.format(ahora);
  // "lunes 01 de septiembre" con la primera letra en mayúscula.
  const fechaTitulo = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  // Números en fuente digital (Orbitron), sin recuadro ni borde: flotan sobre
  // la escena. El brillo dorado + una sombra sutil los despegan del fondo tanto
  // de día como de noche.
  const digital = {
    fontFamily: "var(--font-orbitron), ui-monospace, monospace",
    color: "var(--dorado)",
    textShadow: "0 0 16px color-mix(in srgb, var(--dorado) 55%, transparent), 0 1px 3px rgba(0,0,0,.45)",
  } as const;

  return (
    <div
      className="pointer-events-none fixed left-4 top-4 z-40 select-none"
      aria-label="Hora y clima de Salta, Argentina"
    >
      <div className="text-4xl font-semibold leading-none tabular-nums tracking-[0.12em] sm:text-5xl" style={digital}>
        {hora}
      </div>
      <div
        className="mt-1.5 text-[0.72rem] uppercase tracking-[0.18em] sm:text-sm"
        style={digital}
      >
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
  );
}
