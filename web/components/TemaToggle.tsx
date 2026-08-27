"use client";

import { useSyncExternalStore } from "react";
import { alternarTema, EVENTO_TEMA, temaActual, type Tema } from "@/lib/tema";

// Se suscribe al tema real del documento vía useSyncExternalStore (el patrón de
// React para leer un estado externo): así se mantiene en sincronía y se
// actualiza al instante aunque el cambio lo haya pedido la voz, sin hidratación
// inconsistente ni setState dentro de un efecto.
function suscribir(alCambiar: () => void) {
  window.addEventListener(EVENTO_TEMA, alCambiar);
  return () => window.removeEventListener(EVENTO_TEMA, alCambiar);
}

export default function TemaToggle() {
  const tema = useSyncExternalStore<Tema>(
    suscribir,
    () => temaActual(),
    () => "dia"
  );
  const esNoche = tema === "noche";

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-sm font-medium">Modo {esNoche ? "noche" : "día"}</p>
        <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
          Cambialo con un click, o pedíselo a JARVIS por voz. Tu elección se recuerda; si no elegís,
          va solo según la hora.
        </p>
      </div>
      <button
        type="button"
        onClick={() => alternarTema()}
        aria-label={`Cambiar a modo ${esNoche ? "día" : "noche"}`}
        className="rounded-full px-3 py-1.5 text-sm font-semibold"
        style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
      >
        {esNoche ? "Ir a modo día" : "Ir a modo noche"}
      </button>
    </div>
  );
}
