"use client";

import { useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { supabase } from "@/lib/supabase";
import { MODULOS, type ModuloId } from "@/lib/modules";
import { cargarVehiculos, formatearMoneda, nombreVehiculo } from "@/lib/vehiculos";
import { calcularCostoTransferenciaDNRPA, DNRPA_DISCLAIMER, simularCuotas } from "@/lib/financiacion";
import JarvisNucleus from "@/components/jarvis/JarvisNucleus";
import JarvisNetwork from "@/components/jarvis/JarvisNetwork";
import { estadoDeModulo, type EstadoVisual, type JarvisModule } from "@/lib/jarvis/tipos";

export type EstadoJarvis = "standby" | "escuchando" | "activando" | "trabajando" | "error";

// La máquina de estados real (arriba, atada al SDK de ElevenLabs) manda; el
// núcleo del command center solo necesita una versión visual de cada estado.
const ESTADO_VISUAL: Record<EstadoJarvis, EstadoVisual> = {
  standby: "idle",
  escuchando: "listening",
  activando: "processing",
  trabajando: "speaking",
  error: "error",
};

const ETIQUETA_ESTADO: Record<EstadoJarvis, string> = {
  standby: "STANDBY",
  escuchando: "ESCUCHANDO",
  activando: "ACTIVANDO",
  trabajando: "RESPONDIENDO",
  error: "ERROR",
};

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Componente interno: vive dentro de <ConversationProvider>, que es donde
// useConversation() puede usarse. No se pudo verificar en vivo esta versión
// exacta del SDK contra el agente real en este entorno (sin acceso de red a
// elevenlabs.io) — la forma de las herramientas cliente y de startSession()
// está tomada de los tipos reales del paquete (@elevenlabs/react en
// node_modules), no adivinada, pero probemos juntos la primera vez.
function NucleoConversacional({
  moduloActivo,
  modulos,
  onActivarModulo,
  onCambiarEstado,
}: {
  moduloActivo: ModuloId | null;
  modulos: JarvisModule[];
  onActivarModulo: (id: ModuloId) => void;
  onCambiarEstado: (estado: EstadoJarvis) => void;
}) {
  const conversacion = useConversation();
  const conectado = conversacion.status === "connected";
  // El SDK (conversacion.status) solo sabe de errores DESPUÉS de que
  // startSession() arranca. Los pasos previos (permiso de micrófono, pedir
  // la URL firmada) son nuestros y pueden fallar antes de eso — si no se
  // reflejan acá, la pantalla se queda pegada en "STANDBY" sin avisar nada,
  // que es exactamente el bug que reportó el usuario.
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);

  const estadoActual: EstadoJarvis =
    errorLocal || conversacion.status === "error"
      ? "error"
      : conectando || conversacion.status === "connecting"
        ? "activando"
        : conectado
          ? conversacion.mode === "speaking"
            ? "trabajando"
            : "escuchando"
          : "standby";

  useEffect(() => {
    onCambiarEstado(estadoActual);
  }, [estadoActual, onCambiarEstado]);

  async function alternarConversacion() {
    if (!AGENT_ID) return;
    if (conectado) {
      conversacion.endSession();
      return;
    }
    setErrorLocal(null);
    setConectando(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // El agente exige autenticación para conectarse directo — pedimos una
      // URL firmada de un solo uso al servidor (que sí tiene la clave
      // secreta) en vez de conectar con el agentId público a secas.
      // El token de la sesión va en el header: el endpoint lo exige y lo
      // valida contra Supabase antes de gastar cuota de ElevenLabs.
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) {
        setErrorLocal("Tu sesión venció. Volvé a iniciar sesión para hablar con JARVIS.");
        return;
      }
      const respuesta = await fetch("/api/elevenlabs-signed-url", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const datos = await respuesta.json();
      if (!respuesta.ok || !datos.signedUrl) {
        setErrorLocal(datos.error || "No se pudo conectar con JARVIS. Probá de nuevo.");
        return;
      }
      await conversacion.startSession({ signedUrl: datos.signedUrl });
    } catch (err) {
      setErrorLocal(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "No se pudo usar el micrófono — revisá los permisos del navegador para este sitio."
          : "No se pudo conectar con JARVIS. Probá de nuevo."
      );
    } finally {
      setConectando(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Red de nodos con el núcleo (botón de voz) al centro. */}
      <JarvisNetwork
        modulos={modulos}
        moduloActivo={moduloActivo}
        onAbrir={onActivarModulo}
        centro={
          <button
            type="button"
            onClick={alternarConversacion}
            aria-label={conectado ? "Cortar la conversación con JARVIS" : "Hablar con JARVIS"}
            className="relative h-full w-full select-none"
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
          >
            <JarvisNucleus estado={ESTADO_VISUAL[estadoActual]} />
          </button>
        }
      />

      <p className="text-xs tracking-[0.3em]" style={{ color: "var(--muted)" }}>
        {ETIQUETA_ESTADO[estadoActual]}
      </p>
      <h1 className="text-4xl font-semibold tracking-[0.25em] sm:text-5xl">JARVIS</h1>
      <p className="text-[0.65rem]" style={{ color: "var(--muted)" }}>
        {conectado ? "tocá el núcleo para cortar" : "tocá el núcleo para hablar · tocá un nodo para abrir su módulo"}
      </p>

      {(errorLocal || (conversacion.message && conversacion.status === "error")) && (
        <p className="max-w-xs text-center text-xs" style={{ color: "var(--muted)" }}>
          {errorLocal || conversacion.message}
        </p>
      )}
    </div>
  );
}

export default function JarvisCore({
  moduloActivo,
  onActivarModulo,
  onCambiarEstado = () => {},
}: {
  moduloActivo: ModuloId | null;
  onActivarModulo: (id: ModuloId) => void;
  onCambiarEstado?: (estado: EstadoJarvis) => void;
}) {
  // Métricas reales por módulo (solo las que existen; nunca se inventan). Se
  // leen con conteos livianos que respetan RLS: cada agencia ve solo lo suyo.
  // Si algo falla (sin perfil, sin red), quedan vacías y el nodo no muestra
  // métrica — fail-closed, no rompe la red.
  const [metricas, setMetricas] = useState<Partial<Record<ModuloId, string>>>({});

  useEffect(() => {
    let vivo = true;
    (async () => {
      const nuevas: Partial<Record<ModuloId, string>> = {};
      try {
        const { count } = await supabase.from("vehiculos").select("*", { count: "exact", head: true });
        if (typeof count === "number") nuevas.vehiculos = `${count} en stock`;
      } catch {}
      try {
        const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true });
        if (typeof count === "number") nuevas.clientes = count === 1 ? "1 cliente" : `${count} clientes`;
      } catch {}
      if (vivo) setMetricas(nuevas);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const modulosRed: JarvisModule[] = MODULOS.map((m) => ({
    ...m,
    status: estadoDeModulo(m),
    metrica: metricas[m.id],
  }));

  // Herramientas reales que el agente puede invocar en la conversación —
  // mismos datos y fórmulas ya probados en producción en script.js del
  // sitio estático (consultar_inventario, simular_financiacion,
  // estimar_transferencia_dnrpa), más una nueva (mostrar_modulo) para que
  // la IA pueda abrir paneles de la UI cuando corresponda. Nunca inventan
  // datos: si falta algo, lo dicen explícitamente.
  const clientTools = {
    consultar_inventario: async (parametros: { modelo?: string }) => {
      const vehiculos = await cargarVehiculos();
      const consulta = (parametros?.modelo || "").toLowerCase().trim();
      const lista = consulta
        ? vehiculos.filter((v) => nombreVehiculo(v).toLowerCase().includes(consulta))
        : vehiculos;
      if (!lista.length) {
        return consulta
          ? `No encontré ningún vehículo que coincida con "${parametros?.modelo}" en el stock actual.`
          : "El stock está vacío en este momento.";
      }
      const resumen = lista
        .slice(0, 8)
        .map((v) => `${nombreVehiculo(v)} ${v.anio ?? ""} — ${formatearMoneda(v.precio)}`)
        .join(". ");
      return consulta
        ? `Encontré ${lista.length} coincidencia(s): ${resumen}.`
        : `Hay ${vehiculos.length} vehículos en stock. Algunos ejemplos: ${resumen}.`;
    },
    simular_financiacion: async (parametros: { modelo?: string; cuotas?: number }) => {
      const vehiculos = await cargarVehiculos();
      const consulta = (parametros?.modelo || "").toLowerCase().trim();
      const auto = vehiculos.find((v) => nombreVehiculo(v).toLowerCase().includes(consulta));
      if (!auto) return `No encontré ningún vehículo que coincida con "${parametros?.modelo}" en el stock actual.`;
      const resultado = simularCuotas(auto.precio, Number(parametros?.cuotas) || 12);
      if (!resultado) return `${nombreVehiculo(auto)} todavía no tiene precio cargado, no puedo simular la financiación.`;
      return `${nombreVehiculo(auto)} (${formatearMoneda(auto.precio)}) en ${resultado.cuotas} cuotas darían aproximadamente ${formatearMoneda(resultado.valorCuota)} por cuota, sin interés. Es orientativo, no una cotización oficial.`;
    },
    estimar_transferencia_dnrpa: async (parametros: { modelo?: string }) => {
      const vehiculos = await cargarVehiculos();
      const consulta = (parametros?.modelo || "").toLowerCase().trim();
      const auto = vehiculos.find((v) => nombreVehiculo(v).toLowerCase().includes(consulta));
      if (!auto) return `No encontré ningún vehículo que coincida con "${parametros?.modelo}" en el stock actual.`;
      const resultado = calcularCostoTransferenciaDNRPA(auto.valor_tabla_dnrpa);
      if (!resultado) return `${nombreVehiculo(auto)} todavía no tiene el Valor Tabla de DNRPA cargado, no puedo estimar la transferencia.`;
      return `Transferir ${nombreVehiculo(auto)} costaría aproximadamente ${formatearMoneda(resultado.total)}. ${DNRPA_DISCLAIMER}`;
    },
    mostrar_modulo: async (parametros: { modulo?: string }) => {
      const nombre = normalizar(parametros?.modulo || "");
      const modulo = MODULOS.find((m) => nombre.includes(normalizar(m.label)) || normalizar(m.label).includes(nombre));
      if (!modulo) return `No reconozco un módulo llamado "${parametros?.modulo}".`;
      onActivarModulo(modulo.id);
      return modulo.real
        ? `Abriendo ${modulo.label}.`
        : `${modulo.label} todavía no tiene datos reales conectados — lo abrí igual para que lo veas, pero está marcado como próximamente.`;
    },
  };

  if (!AGENT_ID) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Falta configurar NEXT_PUBLIC_ELEVENLABS_AGENT_ID para activar la voz de JARVIS.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
      <ConversationProvider agentId={AGENT_ID} connectionType="websocket" clientTools={clientTools}>
        <NucleoConversacional
          moduloActivo={moduloActivo}
          modulos={modulosRed}
          onActivarModulo={onActivarModulo}
          onCambiarEstado={onCambiarEstado}
        />
      </ConversationProvider>
    </div>
  );
}
