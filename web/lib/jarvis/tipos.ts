// Tipos del JARVIS COMMAND CENTER — la capa visual del núcleo y su red de
// nodos. Son de presentación: no reemplazan la lógica ni la máquina de estados
// real (esa vive en components/JarvisCore.tsx, atada al SDK de ElevenLabs).
import type { Modulo, ModuloId } from "@/lib/modules";

// Estados visuales del núcleo. Son un mapeo de presentación de la máquina real
// (EstadoJarvis en JarvisCore.tsx), no una fuente de verdad paralela: cada uno
// tiene su propia animación en JarvisNucleus.
export type EstadoVisual =
  | "idle" // en reposo: pulso lento
  | "listening" // escuchando: ondas que se expanden
  | "thinking" // procesando previo: partículas densas + conexiones
  | "processing" // energía circulando (conectando)
  | "speaking" // hablando: ondas sincronizadas
  | "error" // error: tinte rojo tenue, sin romper identidad
  | "offline"; // apagado / sin agente

// Estado real de un nodo/módulo. Los colores los resuelve la UI con las CSS
// vars actuales (online=dorado, processing=pulso, warning=ámbar, error=rojo,
// offline=muted) — acá solo va el dato, no el color.
export type NodeStatus = "online" | "processing" | "warning" | "error" | "offline";

// Un módulo tal como lo consume la red visual: el registro real (lib/modules)
// más su estado y una métrica opcional (solo cuando hay dato real).
export interface JarvisModule {
  id: ModuloId;
  label: string;
  descripcion: string;
  real: boolean;
  status: NodeStatus;
  // Métrica breve para mostrar en el nodo/panel (ej. "32 en stock"). Nunca se
  // inventa: si no hay dato real, queda undefined y la UI no muestra nada.
  metrica?: string;
}

// Evento del núcleo, para reacciones visuales puntuales (pulso al abrir un
// módulo, destello ante un error). Se usa desde el orquestador.
export interface JarvisEvent {
  tipo: "modulo-abierto" | "estado" | "error";
  moduloId?: ModuloId;
  estado?: EstadoVisual;
  ts: number;
}

// Contexto de tenant/organización — preparación para SaaS multi-empresa. Hoy
// solo se conoce el nombre de la agencia (ya dinámico en page.tsx); el resto
// queda listo para cuando el modelo de organización exista en la base.
export interface JarvisTenant {
  agenciaId?: string;
  nombre?: string;
}

// Un placeholder (real:false) no está "roto": está online como parte del
// sistema, pero sin datos conectados. Se marca aparte para el estilo, sin
// mentir que hay algo detrás.
export function estadoDeModulo(modulo: Pick<Modulo, "real">): NodeStatus {
  return modulo.real ? "online" : "offline";
}
