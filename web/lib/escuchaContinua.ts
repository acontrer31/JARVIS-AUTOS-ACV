import { useEffect, useRef } from "react";

// Escucha continua "manos libres": usa el reconocimiento de voz del navegador
// (Web Speech API) para detectar una palabra de activación y recién ahí arrancar
// la conversación con ElevenLabs. Así el micrófono escucha localmente y NO se
// gasta cuota de ElevenLabs mientras hay silencio.
//
// Es best-effort y depende del navegador (anda en Chrome; Firefox/Safari puede
// no soportarlo). Degrada elegante: si no hay soporte, el hook no hace nada y la
// UI se queda solo con el click.

// Variantes con las que el ASR en español suele transcribir "Jarvis".
const FRASES_ACTIVACION = ["jarvis", "yarvis", "jarbis", "yarbis", "arvis"];

interface EventoResultado {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Reconocedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: EventoResultado) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: EventoError) => void) | null;
}
interface EventoError {
  error?: string;
}
type CtorReconocedor = new () => Reconocedor;

function obtenerCtor(): CtorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: CtorReconocedor;
    webkitSpeechRecognition?: CtorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ¿El navegador soporta la escucha continua?
export function soportaEscucha(): boolean {
  return obtenerCtor() !== null;
}

// Mantiene el reconocedor corriendo mientras `activa` y no `pausada` (hay que
// pausarlo durante la conversación, que usa el mismo micrófono). Al detectar la
// palabra de activación, corta y llama `onWake`.
export function useEscuchaContinua({
  activa,
  pausada,
  onWake,
}: {
  activa: boolean;
  pausada: boolean;
  onWake: () => void;
}) {
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    if (!activa || pausada) return;
    const Ctor = obtenerCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "es-AR";
    rec.continuous = true;
    rec.interimResults = true;
    let detenido = false;

    rec.onresult = (e) => {
      // El reconocedor emite varios resultados (interinos); una vez detectada la
      // palabra ya se llamó a stop(), pero stop() es asíncrono y podría entrar
      // otro onresult antes de frenar. El guard evita disparar onWake dos veces
      // (dos conversaciones).
      if (detenido) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const texto = (e.results[i][0]?.transcript || "").toLowerCase();
        if (FRASES_ACTIVACION.some((f) => texto.includes(f))) {
          detenido = true;
          try {
            rec.stop();
          } catch {}
          onWakeRef.current();
          return;
        }
      }
    };
    // Chrome corta el reconocimiento cada tanto: se reanuda mientras siga activo.
    rec.onend = () => {
      if (!detenido) {
        try {
          rec.start();
        } catch {}
      }
    };
    // La mayoría de los errores son no fatales (p. ej. "no-speech"): onend
    // reanuda. Pero si el permiso de micrófono está denegado ("not-allowed" /
    // "service-not-allowed"), hay que dejar de reanudar: si no, onend
    // reintentaría en un loop infinito golpeando el permiso.
    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        detenido = true;
        try {
          rec.stop();
        } catch {}
      }
    };

    try {
      rec.start();
    } catch {}

    return () => {
      detenido = true;
      try {
        rec.stop();
      } catch {}
    };
  }, [activa, pausada]);
}
