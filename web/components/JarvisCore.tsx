"use client";

import { useCallback, useRef, useState } from "react";
import { MODULOS, type ModuloId } from "@/lib/modules";
import type { SpeechRecognitionInstance } from "@/lib/speech";

export type EstadoJarvis = "standby" | "escuchando" | "activando" | "trabajando" | "error";

const ETIQUETA_ESTADO: Record<EstadoJarvis, string> = {
  standby: "STANDBY",
  escuchando: "ESCUCHANDO",
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

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Frases genéricas que solo piden "mostrame las opciones" sin nombrar un
// módulo puntual — revelan la grilla sin abrir nada.
const FRASES_MOSTRAR = ["modulo", "modulos", "opcion", "opciones", "menu"];

export default function JarvisCore({
  estado,
  moduloActivo,
  onActivarModulo,
  onCambiarEstado,
}: {
  estado: EstadoJarvis;
  moduloActivo: ModuloId | null;
  onActivarModulo: (id: ModuloId) => void;
  onCambiarEstado: (estado: EstadoJarvis) => void;
}) {
  const [modulosVisibles, setModulosVisibles] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState("");
  const reconocedorRef = useRef<SpeechRecognitionInstance | null>(null);

  const procesarTranscripcion = useCallback(
    (textoOriginal: string) => {
      const texto = normalizar(textoOriginal);
      const modulo = MODULOS.find((m) => texto.includes(normalizar(m.label)));
      if (modulo) {
        setModulosVisibles(true);
        onActivarModulo(modulo.id);
        return;
      }
      if (FRASES_MOSTRAR.some((f) => texto.includes(f))) {
        setModulosVisibles(true);
        onCambiarEstado("standby");
        return;
      }
      setAvisoVoz(`No reconocí ningún módulo en "${textoOriginal}". Decí el nombre de un módulo (ej. "Vehículos") o "mostrar módulos".`);
      onCambiarEstado("standby");
    },
    [onActivarModulo, onCambiarEstado]
  );

  function escuchar() {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAvisoVoz("El reconocimiento de voz no está disponible en este navegador — probá con Chrome.");
      return;
    }
    setAvisoVoz("");
    const reconocedor = new SpeechRecognition();
    reconocedor.lang = "es-AR";
    reconocedor.interimResults = false;
    reconocedor.maxAlternatives = 1;
    reconocedor.onresult = (event) => {
      const texto = event.results[0][0].transcript;
      onCambiarEstado("activando");
      procesarTranscripcion(texto);
    };
    reconocedor.onerror = () => {
      setAvisoVoz("No te escuché bien, probá de nuevo.");
      onCambiarEstado("standby");
    };
    reconocedor.onend = () => {
      if (estado === "escuchando") onCambiarEstado("standby");
    };
    reconocedorRef.current = reconocedor;
    onCambiarEstado("escuchando");
    reconocedor.start();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
      <div
        className="relative flex items-center justify-center"
        style={{ width: "min(78vw, 60vh, 30rem)", height: "min(78vw, 60vh, 30rem)" }}
      >
        {/* Anillo de estado: gira siempre despacio; más rápido mientras procesa. */}
        <div
          className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{
            borderColor: "var(--dorado)",
            opacity: 0.55,
            animation: `girar ${estado === "trabajando" || estado === "activando" ? 3 : 14}s linear infinite`,
          }}
        />
        <div
          className="absolute inset-4 rounded-full"
          style={{
            boxShadow: `0 0 60px 10px color-mix(in srgb, var(--dorado) ${estado === "escuchando" ? 55 : 35}%, transparent)`,
            transition: "box-shadow 0.4s ease",
          }}
        />
        <div className="absolute inset-8 animate-[girar_22s_linear_infinite_reverse]">
          <LogoCore />
        </div>
      </div>

      <button
        type="button"
        onClick={escuchar}
        disabled={estado === "escuchando" || estado === "activando"}
        className="flex flex-col items-center gap-1 disabled:opacity-70"
      >
        <p className="text-xs tracking-[0.3em]" style={{ color: "var(--muted)" }}>
          {ETIQUETA_ESTADO[estado]}
        </p>
        <h1 className="text-4xl font-semibold tracking-[0.25em] sm:text-5xl">JARVIS</h1>
        <p className="mt-1 text-[0.65rem]" style={{ color: "var(--muted)" }}>
          {modulosVisibles ? "tocá para volver a escuchar" : "tocá o decí un módulo (ej. \"Vehículos\")"}
        </p>
      </button>

      {avisoVoz && (
        <p className="max-w-xs text-center text-xs" style={{ color: "var(--muted)" }}>
          {avisoVoz}
        </p>
      )}

      {modulosVisibles && (
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
      )}

      <style>{`
        @keyframes girar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
