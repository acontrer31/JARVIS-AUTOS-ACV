"use client";

import { useEffect } from "react";
import { esDeDia, EVENTO_TEMA, temaGuardado } from "@/lib/tema";

// Solo efecto secundario: mantiene document.documentElement.dataset.tema
// sincronizado con la hora real en Argentina mientras la pestaña sigue
// abierta (por si alguien la deja abierta cruzando el amanecer/atardecer).
// El primer pintado ya viene correcto gracias al script inline en layout.tsx
// (evita el flash del tema equivocado antes de que React hidrate).
//
// Si el usuario fijó un modo a mano (desde Seguridad o por voz), esa elección
// gana y el automático por hora no la pisa.
export default function TemaHorario() {
  useEffect(() => {
    function aplicar() {
      const manual = temaGuardado();
      const nuevo = manual ?? (esDeDia() ? "dia" : "noche");
      if (document.documentElement.dataset.tema !== nuevo) {
        document.documentElement.dataset.tema = nuevo;
        // Avisar a los suscriptores (el toggle de Seguridad) para que reflejen
        // el cambio automático por hora, no solo los manuales.
        window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: nuevo }));
      }
    }
    aplicar();
    const id = setInterval(aplicar, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
