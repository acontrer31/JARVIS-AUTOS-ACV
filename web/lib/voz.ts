import { supabase } from "@/lib/supabase";

// El módulo Voz responde dos cosas que hasta ahora no tenían dónde mirarse:
// qué le puedo pedir a JARVIS, y qué pasó en las conversaciones que ya hubo.
//
// Lo segundo importa más de lo que parece: cuando la cuota de ElevenLabs se
// agotó, la conversación cortaba a los dos segundos y desde la app no había
// forma de saber por qué — había que entrar al panel de ElevenLabs. Ahora el
// motivo se ve acá.

// ---------- Catálogo ----------

export const NOMBRES_TOOL = [
  "consultar_inventario",
  "simular_financiacion",
  "estimar_transferencia_dnrpa",
  "mostrar_modulo",
  "cambiar_tema",
  "consultar_clima",
  "consultar_conocimiento",
  "mis_tareas",
  "agregar_tarea",
  "datos_cliente",
  "resumen_del_dia",
  "estado_caja",
  "registrar_movimiento_caja",
  "agregar_cliente",
  "publicar_en_redes",
  "cambiar_estado_vehiculo",
  "cambiar_estado_operacion",
  "reporte_del_mes",
  "publicar_vehiculo_en_redes",
  "registrar_operacion",
  "cambiar_estado_lead",
  "agendar_seguimiento",
  "mis_seguimientos",
  "auditoria_usuario",
] as const;

export type NombreTool = (typeof NOMBRES_TOOL)[number];

export type GrupoTool = "consulta" | "accion" | "interfaz";

export const ETIQUETA_GRUPO: Record<GrupoTool, string> = {
  consulta: "Preguntar",
  accion: "Hacer",
  interfaz: "Manejar la pantalla",
};

export interface FichaTool {
  nombre: NombreTool;
  grupo: GrupoTool;
  /** Qué hace, en una línea. */
  hace: string;
  /** Una frase que de verdad la dispara, para leer y copiar. */
  ejemplo: string;
}

// El nombre tiene que coincidir EXACTO con la declaración en el dashboard de
// ElevenLabs y con la clave del objeto `clientTools` de JarvisCore. Lo segundo
// lo garantiza el compilador (ver la guarda al final de ese archivo); lo
// primero no puede garantizarlo nadie desde acá, y por eso el panel muestra la
// lista: es contra esto que se revisa el dashboard.
export const CATALOGO_VOZ: FichaTool[] = [
  {
    nombre: "consultar_inventario",
    grupo: "consulta",
    hace: "Busca autos en el stock real de la agencia.",
    ejemplo: "¿Qué Corollas tenemos?",
  },
  {
    nombre: "simular_financiacion",
    grupo: "consulta",
    hace: "Divide el precio en cuotas. Es orientativo y lo aclara: todavía no hay tasas reales cargadas.",
    ejemplo: "Simulame el Ka en 12 cuotas.",
  },
  {
    nombre: "estimar_transferencia_dnrpa",
    grupo: "consulta",
    hace: "Estima el costo de la transferencia según el valor de tabla.",
    ejemplo: "¿Cuánto sale transferir un auto de ocho millones?",
  },
  {
    nombre: "consultar_conocimiento",
    grupo: "consulta",
    hace: "Busca en la base de conocimiento de la agencia (módulo Conocimiento).",
    ejemplo: "¿Qué papeles pide la compañía para una prenda?",
  },
  {
    nombre: "datos_cliente",
    grupo: "consulta",
    hace: "Cuenta quién es un cliente, en qué etapa está y su última operación.",
    ejemplo: "Contame de Martínez.",
  },
  {
    nombre: "resumen_del_dia",
    grupo: "consulta",
    hace: "El resumen del día: ventas, caja y pendientes.",
    ejemplo: "¿Cómo venimos hoy?",
  },
  {
    nombre: "estado_caja",
    grupo: "consulta",
    hace: "Saldo de caja y movimientos del día.",
    ejemplo: "¿Cómo está la caja?",
  },
  {
    nombre: "reporte_del_mes",
    grupo: "consulta",
    hace: "Ventas del mes, margen, stock valorizado y ranking de vendedores.",
    ejemplo: "Pasame el reporte del mes.",
  },
  {
    nombre: "mis_tareas",
    grupo: "consulta",
    hace: "Tus tareas pendientes.",
    ejemplo: "¿Qué tengo pendiente?",
  },
  {
    nombre: "mis_seguimientos",
    grupo: "consulta",
    hace: "Los leads que hay que contactar hoy y los que ya se pasaron de fecha.",
    ejemplo: "¿A quién tengo que llamar hoy?",
  },
  {
    nombre: "auditoria_usuario",
    grupo: "consulta",
    hace: "Qué hizo un usuario en el sistema y cuándo. Solo para administradores.",
    ejemplo: "¿Qué hizo Agustín hoy?",
  },
  {
    nombre: "consultar_clima",
    grupo: "consulta",
    hace: "El clima de una ciudad.",
    ejemplo: "¿Cómo está el clima en Salta?",
  },
  {
    nombre: "agregar_tarea",
    grupo: "accion",
    hace: "Anota una tarea nueva en tu lista.",
    ejemplo: "Anotá: llamar al gestor.",
  },
  {
    nombre: "agregar_cliente",
    grupo: "accion",
    hace: "Carga un cliente nuevo con lo que le dictes.",
    ejemplo: "Cargá a Laura Gómez, teléfono 387 555 1234.",
  },
  {
    nombre: "registrar_movimiento_caja",
    grupo: "accion",
    hace: "Registra un ingreso o un egreso de caja.",
    ejemplo: "Registrá un egreso de cincuenta mil por la grúa.",
  },
  {
    nombre: "registrar_operacion",
    grupo: "accion",
    hace: "Registra una venta o un trámite.",
    ejemplo: "Registrá la venta del Ka a Martínez por doce millones.",
  },
  {
    nombre: "cambiar_estado_vehiculo",
    grupo: "accion",
    hace: "Pasa un auto a disponible, reservado o vendido. Al venderlo, se retira solo de redes.",
    ejemplo: "Marcá el Ka como vendido.",
  },
  {
    nombre: "cambiar_estado_operacion",
    grupo: "accion",
    hace: "Mueve una operación de etapa.",
    ejemplo: "Pasá la operación de Martínez a cerrada.",
  },
  {
    nombre: "cambiar_estado_lead",
    grupo: "accion",
    hace: "Mueve un lead en el embudo.",
    ejemplo: "Pasá a Laura a en negociación.",
  },
  {
    nombre: "agendar_seguimiento",
    grupo: "accion",
    hace: "Agenda cuándo volver a contactar a un lead. Si no entiende la fecha, pregunta.",
    ejemplo: "Recordame llamar a Laura el jueves.",
  },
  {
    nombre: "publicar_en_redes",
    grupo: "accion",
    hace: "Publica un texto en Facebook o Instagram.",
    ejemplo: "Publicá en Facebook: abrimos sábado hasta las 13.",
  },
  {
    nombre: "publicar_vehiculo_en_redes",
    grupo: "accion",
    hace: "Publica un auto del stock con su foto.",
    ejemplo: "Publicá el Ka en Instagram.",
  },
  {
    nombre: "mostrar_modulo",
    grupo: "interfaz",
    hace: "Abre un módulo en pantalla.",
    ejemplo: "Abrime Caja.",
  },
  {
    nombre: "cambiar_tema",
    grupo: "interfaz",
    hace: "Cambia entre modo día y modo noche.",
    ejemplo: "Poné modo noche.",
  },
];

// ---------- Conversaciones ----------

export interface Conversacion {
  id: string;
  /** Instante de inicio en ISO, o null si ElevenLabs no lo mandó. */
  inicio: string | null;
  duracionSegundos: number | null;
  mensajes: number | null;
  /** Estado crudo de ElevenLabs (done, failed, in-progress…). */
  estado: string | null;
  /** success | failure | unknown, según la evaluación del agente. */
  resultado: string | null;
}

export interface Transcripcion {
  quien: "agente" | "usuario";
  texto: string;
}

export interface EstadoVoz {
  /** false cuando falta NEXT_PUBLIC_ELEVENLABS_AGENT_ID o la API key. */
  configurado: boolean;
  motivo?: string;
  conversaciones: Conversacion[];
}

async function tokenSesion(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Volvé a iniciar sesión.");
  return token;
}

export async function cargarConversaciones(): Promise<EstadoVoz> {
  const resp = await fetch("/api/voz/conversaciones", {
    headers: { Authorization: `Bearer ${await tokenSesion()}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "No se pudo leer el historial de voz.");
  return data as EstadoVoz;
}

export async function cargarTranscripcion(id: string): Promise<Transcripcion[]> {
  const resp = await fetch(`/api/voz/conversaciones?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${await tokenSesion()}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "No se pudo leer la conversación.");
  return (data.transcripcion ?? []) as Transcripcion[];
}

export function duracionLegible(segundos: number | null): string {
  if (segundos == null) return "—";
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  return `${min} min ${segundos % 60} s`;
}
