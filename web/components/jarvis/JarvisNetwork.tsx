"use client";

import { useState, type ReactNode } from "react";
import type { ModuloId } from "@/lib/modules";
import type { JarvisModule } from "@/lib/jarvis/tipos";
import JarvisConnection from "@/components/jarvis/JarvisConnection";
import JarvisNode from "@/components/jarvis/JarvisNode";

// Radio del anillo de nodos, como porcentaje del contenedor (centro en 50%).
const RADIO = 43;

// Posición de cada nodo sobre el anillo. El primero arriba (−90°) y en sentido
// horario. Devuelve porcentajes para ubicar el nodo y las coordenadas 0..100
// para dibujar la conexión desde el centro.
function posicion(indice: number, total: number) {
  const ang = ((-90 + (360 / total) * indice) * Math.PI) / 180;
  return {
    x: 50 + RADIO * Math.cos(ang),
    y: 50 + RADIO * Math.sin(ang),
  };
}

// Red de nodos alrededor del núcleo: un nodo por módulo, con líneas de conexión
// que salen del centro. El `centro` es el núcleo (el botón de voz), que se pasa
// como slot para no acoplar la red a la lógica de la conversación.
export default function JarvisNetwork({
  modulos,
  moduloActivo,
  onAbrir,
  centro,
}: {
  modulos: JarvisModule[];
  moduloActivo: ModuloId | null;
  onAbrir: (id: ModuloId) => void;
  centro: ReactNode;
}) {
  const [resaltado, setResaltado] = useState<ModuloId | null>(null);
  const lado = "min(90vw, 76vh, 44rem)";

  return (
    <div className="relative" style={{ width: lado, height: lado }}>
      {/* Capa de conexiones, detrás de todo. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {modulos.map((m, i) => {
          const { x, y } = posicion(i, modulos.length);
          return (
            <JarvisConnection
              key={m.id}
              x={x}
              y={y}
              fuerte={resaltado === m.id || moduloActivo === m.id}
            />
          );
        })}
      </svg>

      {/* Núcleo al centro. */}
      <div className="absolute inset-[29%]">{centro}</div>

      {/* Nodos sobre el anillo. */}
      {modulos.map((m, i) => {
        const { x, y } = posicion(i, modulos.length);
        return (
          <div
            key={m.id}
            className="absolute"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            <JarvisNode
              modulo={m}
              activo={moduloActivo === m.id}
              onAbrir={() => onAbrir(m.id)}
              onHover={(dentro) => setResaltado(dentro ? m.id : null)}
            />
          </div>
        );
      })}
    </div>
  );
}
