"use client";

import { useEffect } from "react";
import { esDeDia } from "@/lib/tema";

// Solo efecto secundario: mantiene document.documentElement.dataset.tema
// sincronizado con la hora real en Argentina mientras la pestaña sigue
// abierta (por si alguien la deja abierta cruzando el amanecer/atardecer).
// El primer pintado ya viene correcto gracias al script inline en layout.tsx
// (evita el flash del tema equivocado antes de que React hidrate).
export default function TemaHorario() {
  useEffect(() => {
    function aplicar() {
      document.documentElement.dataset.tema = esDeDia() ? "dia" : "noche";
    }
    aplicar();
    const id = setInterval(aplicar, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
