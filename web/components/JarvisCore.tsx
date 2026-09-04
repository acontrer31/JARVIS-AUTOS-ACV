"use client";

import { useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { supabase } from "@/lib/supabase";
import { MODULOS, type ModuloId } from "@/lib/modules";
import { cambiarEstado as cambiarEstadoVehiculo, cargarVehiculos, formatearMoneda, nombreVehiculo, type EstadoVehiculo } from "@/lib/vehiculos";
import { calcularCostoTransferenciaDNRPA, DNRPA_DISCLAIMER, simularCuotas } from "@/lib/financiacion";
import JarvisNucleus from "@/components/jarvis/JarvisNucleus";
import JarvisNetwork from "@/components/jarvis/JarvisNetwork";
import { estadoDeModulo, type EstadoVisual, type JarvisModule } from "@/lib/jarvis/tipos";
import { fijarTema, temaActual, type Tema } from "@/lib/tema";
import { soportaEscucha, useEscuchaContinua } from "@/lib/escuchaContinua";
import { consultarClima } from "@/lib/clima";
import { cargarTareas, crearTarea } from "@/lib/tareas";
import { cargarClientes, crearCliente, clienteVacio, ETIQUETA_ESTADO_LEAD } from "@/lib/clientes";
import {
  cambiarEstadoOperacion,
  cargarOperaciones,
  crearOperacion,
  operacionVacia,
  ETIQUETA_TIPO_OP,
  ETIQUETA_ESTADO_OP,
  type EstadoOperacion,
} from "@/lib/operaciones";
import { cargarMovimientos, calcularSaldo, crearMovimiento, movimientoVacio, type TipoMovimiento } from "@/lib/caja";
import { armarReporte, resumenDelDia } from "@/lib/reportes";
import { publicarEnRedes, type Red } from "@/lib/redes";
import { cargarFotos } from "@/lib/media";
import { registrarPublicacion } from "@/lib/publicacionesRedes";

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
  agencia,
}: {
  moduloActivo: ModuloId | null;
  modulos: JarvisModule[];
  onActivarModulo: (id: ModuloId) => void;
  onCambiarEstado: (estado: EstadoJarvis) => void;
  agencia?: string | null;
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

  // Escucha continua ("manos libres"): si el navegador la soporta y el usuario
  // la activa, JARVIS escucha la palabra "Jarvis" y arranca la conversación
  // solo. El click sigue funcionando igual. La preferencia se recuerda.
  const [soportaManos] = useState(soportaEscucha);
  const [manosLibres, setManosLibres] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jarvis-manos-libres") === "1";
    } catch {
      return false;
    }
  });

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

  // Mientras "manos libres" esté activo y no haya conversación en curso, el
  // navegador escucha la palabra de activación y arranca la charla solo.
  useEscuchaContinua({
    activa: manosLibres && soportaManos,
    pausada: conectado || conectando,
    onWake: () => {
      if (!conectado && !conectando) void alternarConversacion();
    },
  });

  function alternarManos() {
    setManosLibres((v) => {
      const nuevo = !v;
      try {
        localStorage.setItem("jarvis-manos-libres", nuevo ? "1" : "0");
      } catch {}
      return nuevo;
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Red de nodos con el núcleo (botón de voz) al centro. */}
      <JarvisNetwork
        modulos={modulos}
        moduloActivo={moduloActivo}
        onAbrir={onActivarModulo}
        estado={ESTADO_VISUAL[estadoActual]}
        agencia={agencia}
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
        {conectado
          ? "tocá el núcleo para cortar"
          : manosLibres && soportaManos
            ? 'escuchando… decí «JARVIS» para activar · o tocá el núcleo'
            : "tocá el núcleo para hablar · tocá un nodo para abrir su módulo"}
      </p>

      {soportaManos && (
        <button
          type="button"
          onClick={alternarManos}
          aria-pressed={manosLibres}
          className="flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] transition"
          style={{
            borderColor: manosLibres ? "var(--dorado)" : "var(--border)",
            color: manosLibres ? "var(--dorado)" : "var(--muted)",
            background: manosLibres ? "color-mix(in srgb, var(--dorado) 10%, transparent)" : "transparent",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: manosLibres ? "var(--dorado)" : "var(--muted)",
              animation: manosLibres && !conectado ? "jarvis-latido 2s ease-in-out infinite" : undefined,
            }}
          />
          Manos libres {manosLibres ? "activado" : "desactivado"}
        </button>
      )}

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
  agencia,
}: {
  moduloActivo: ModuloId | null;
  onActivarModulo: (id: ModuloId) => void;
  onCambiarEstado?: (estado: EstadoJarvis) => void;
  agencia?: string | null;
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
    // Cambia entre modo día y noche por voz. Sin un modo explícito, alterna.
    cambiar_tema: async (parametros: { modo?: string }) => {
      const pedido = normalizar(parametros?.modo || "");
      let tema: Tema;
      if (pedido.includes("dia") || pedido.includes("claro") || pedido.includes("blanco")) {
        tema = "dia";
      } else if (pedido.includes("noche") || pedido.includes("oscuro") || pedido.includes("negro")) {
        tema = "noche";
      } else {
        tema = temaActual() === "noche" ? "dia" : "noche";
      }
      fijarTema(tema);
      return `Listo, cambié a modo ${tema}.`;
    },
    // Clima actual de una ciudad (Open-Meteo, sin API key). Si no se dice la
    // ciudad, JARVIS la pregunta.
    consultar_clima: async (parametros: { ciudad?: string }) => {
      return await consultarClima(parametros?.ciudad || "");
    },
    // Tareas pendientes del usuario (las lee de su lista en JARVIS; la RLS ya
    // limita a las propias).
    mis_tareas: async () => {
      try {
        const tareas = await cargarTareas(true);
        if (!tareas.length) return "No tenés tareas pendientes, todo al día.";
        const lista = tareas.slice(0, 10).map((t) => t.titulo).join("; ");
        return tareas.length === 1
          ? `Tenés una tarea pendiente: ${lista}.`
          : `Tenés ${tareas.length} tareas pendientes: ${lista}.`;
      } catch {
        return "No pude leer tus tareas ahora mismo. Probá de nuevo.";
      }
    },
    // Agrega una tarea nueva por voz.
    agregar_tarea: async (parametros: { titulo?: string }) => {
      const titulo = (parametros?.titulo || "").trim();
      if (!titulo) return "¿Qué tarea querés que agregue?";
      try {
        await crearTarea(titulo);
        return `Listo, agregué la tarea: ${titulo}.`;
      } catch {
        return "No pude agregar la tarea ahora mismo. Probá de nuevo.";
      }
    },
    // Ficha hablada de un cliente: estado del lead, teléfono, presupuesto y su
    // última operación. Solo datos reales; la RLS ya limita a la agencia.
    datos_cliente: async (parametros: { nombre?: string }) => {
      const consulta = normalizar(parametros?.nombre || "").trim();
      if (!consulta) return "¿De qué cliente querés que te cuente?";
      try {
        const clientes = await cargarClientes();
        const cliente = clientes.find((c) => normalizar(c.nombre).includes(consulta));
        if (!cliente) return `No encontré ningún cliente que coincida con "${parametros?.nombre}".`;
        const partes: string[] = [`${cliente.nombre}, lead ${ETIQUETA_ESTADO_LEAD[cliente.estado_lead].toLowerCase()}`];
        if (cliente.telefono) partes.push(`teléfono ${cliente.telefono}`);
        if (cliente.presupuesto) partes.push(`presupuesto ${formatearMoneda(cliente.presupuesto)}`);
        try {
          const ops = await cargarOperaciones();
          const suya = ops.find((o) => o.cliente_id === cliente.id);
          if (suya) {
            partes.push(
              `última operación: ${ETIQUETA_TIPO_OP[suya.tipo].toLowerCase()} ${ETIQUETA_ESTADO_OP[suya.estado].toLowerCase()}${suya.monto ? ` por ${formatearMoneda(suya.monto)}` : ""}`
            );
          }
        } catch {}
        return partes.join("; ") + ".";
      } catch {
        return "No pude leer los datos del cliente ahora mismo. Probá de nuevo.";
      }
    },
    // Resumen hablado del día: operaciones, caja y tareas (Fase 4 del ERP).
    resumen_del_dia: async () => {
      try {
        return await resumenDelDia();
      } catch {
        return "No pude armar el resumen del día ahora mismo. Probá de nuevo.";
      }
    },
    // Estado de la caja: ingresos, egresos y saldo acumulados.
    estado_caja: async () => {
      try {
        const movs = await cargarMovimientos();
        if (!movs.length) return "Todavía no hay movimientos de caja cargados.";
        const { ingresos, egresos, saldo } = calcularSaldo(movs);
        return `Caja: ingresos por ${formatearMoneda(ingresos)}, egresos por ${formatearMoneda(egresos)}, saldo ${formatearMoneda(saldo)}.`;
      } catch {
        return "No pude leer la caja ahora mismo. Probá de nuevo.";
      }
    },
    // Carga un ingreso o egreso de caja por voz.
    registrar_movimiento_caja: async (parametros: { tipo?: string; monto?: number; concepto?: string }) => {
      const monto = Number(parametros?.monto);
      if (!monto || monto <= 0) return "¿De qué monto es el movimiento?";
      const concepto = (parametros?.concepto || "").trim();
      if (!concepto) return "¿Qué concepto le pongo al movimiento?";
      const tipo: TipoMovimiento = normalizar(parametros?.tipo || "").includes("egres") ? "egreso" : "ingreso";
      try {
        await crearMovimiento({ ...movimientoVacio(), tipo, monto, concepto });
        return `Listo, registré un ${tipo} de ${formatearMoneda(monto)} por ${concepto}.`;
      } catch {
        return "No pude registrar el movimiento ahora mismo. Probá de nuevo.";
      }
    },
    // Alta rápida de cliente / lead por voz.
    agregar_cliente: async (parametros: { nombre?: string; telefono?: string; interes?: string }) => {
      const nombre = (parametros?.nombre || "").trim();
      if (!nombre) return "¿Cómo se llama el cliente que querés anotar?";
      const interes = (parametros?.interes || "").trim();
      try {
        await crearCliente({
          ...clienteVacio(),
          nombre,
          telefono: (parametros?.telefono || "").trim() || null,
          notas: interes ? `Interés: ${interes}` : null,
        });
        return `Listo, agregué a ${nombre} como lead nuevo.`;
      } catch {
        return "No pude agregar el cliente ahora mismo. Probá de nuevo.";
      }
    },
    // Publica un texto en Facebook por voz. Instagram necesita una imagen, así
    // que para fotos de vehículos se usa el módulo Redes (con selector de auto).
    publicar_en_redes: async (parametros: { red?: string; texto?: string }) => {
      const texto = (parametros?.texto || "").trim();
      if (!texto) return "¿Qué querés que publique?";
      const pedido = normalizar(parametros?.red || "");
      if (pedido.includes("insta")) {
        return "Para Instagram necesito una imagen. Abrí el módulo Redes y elegí el vehículo para publicar la foto.";
      }
      try {
        await publicarEnRedes("facebook", texto);
        return `Listo, lo publiqué en Facebook: ${texto}`;
      } catch (err) {
        return "No pude publicar ahora mismo. " + (err instanceof Error ? err.message : "Probá de nuevo.");
      }
    },
    // Cambia el estado de un auto en el stock. Al pasarlo a "vendido" se dispara
    // solo el retiro de sus publicaciones en redes (ver lib/vehiculos.ts).
    cambiar_estado_vehiculo: async (parametros: { modelo?: string; estado?: string }) => {
      const consulta = normalizar(parametros?.modelo || "").trim();
      if (!consulta) return "¿De qué vehículo querés cambiar el estado?";
      const pedido = normalizar(parametros?.estado || "");
      let estado: EstadoVehiculo;
      if (pedido.includes("vend")) estado = "vendido";
      else if (pedido.includes("reserv") || pedido.includes("sena")) estado = "reservado";
      else if (pedido.includes("disponible") || pedido.includes("libre")) estado = "disponible";
      else if (pedido.includes("no disponible") || pedido.includes("baja")) estado = "no_disponible";
      else return 'No entendí el estado. Puede ser disponible, reservado, vendido o no disponible.';
      try {
        const vehiculos = await cargarVehiculos();
        const auto = vehiculos.find((v) => normalizar(nombreVehiculo(v)).includes(consulta));
        if (!auto) return `No encontré ningún vehículo que coincida con "${parametros?.modelo}".`;
        await cambiarEstadoVehiculo(auto.id, estado);
        return estado === "vendido"
          ? `Listo, marqué ${nombreVehiculo(auto)} como vendido. Estoy retirando sus publicaciones de las redes.`
          : `Listo, ${nombreVehiculo(auto)} quedó como ${estado.replace("_", " ")}.`;
      } catch {
        return "No pude cambiar el estado del vehículo ahora mismo.";
      }
    },
    // Cambia el estado de una operación; el stock del vehículo se sincroniza solo.
    cambiar_estado_operacion: async (parametros: { cliente?: string; estado?: string }) => {
      const pedido = normalizar(parametros?.estado || "");
      let estado: EstadoOperacion;
      if (pedido.includes("entreg")) estado = "entregada";
      else if (pedido.includes("sena") || pedido.includes("señ")) estado = "senada";
      else if (pedido.includes("cancel")) estado = "cancelada";
      else if (pedido.includes("abiert")) estado = "abierta";
      else return "No entendí el estado. Puede ser abierta, señada, entregada o cancelada.";
      try {
        const [ops, clientes] = await Promise.all([cargarOperaciones(), cargarClientes()]);
        const consulta = normalizar(parametros?.cliente || "").trim();
        let op = ops.find((o) => o.estado !== "entregada" && o.estado !== "cancelada");
        if (consulta) {
          const cliente = clientes.find((c) => normalizar(c.nombre).includes(consulta));
          if (!cliente) return `No encontré ningún cliente que coincida con "${parametros?.cliente}".`;
          op = ops.find((o) => o.cliente_id === cliente.id);
          if (!op) return `${cliente.nombre} no tiene operaciones registradas.`;
        }
        if (!op) return "No encontré operaciones abiertas para cambiar.";
        await cambiarEstadoOperacion(op, estado);
        return `Listo, la operación quedó como ${ETIQUETA_ESTADO_OP[estado].toLowerCase()}${
          estado === "entregada" ? " y el vehículo pasó a vendido." : "."
        }`;
      } catch {
        return "No pude cambiar el estado de la operación ahora mismo.";
      }
    },
    // Reporte del mes: ventas, comisiones, margen, stock valorizado y ranking.
    reporte_del_mes: async () => {
      try {
        const r = await armarReporte();
        const partes = [
          `En ${r.mesEtiqueta} llevás ${r.ventasMes.cantidad} entrega(s) por ${formatearMoneda(r.ventasMes.monto)}`,
        ];
        if (r.ventasMes.comisiones) partes.push(`comisiones por ${formatearMoneda(r.ventasMes.comisiones)}`);
        if (r.margen.cantidad) partes.push(`margen de ${formatearMoneda(r.margen.total)}`);
        partes.push(`stock valorizado en ${formatearMoneda(r.stock.valorizado)} con ${r.stock.cantidad} disponible(s)`);
        if (r.abiertas.cantidad) partes.push(`${r.abiertas.cantidad} operación(es) en curso`);
        if (r.ranking[0]) partes.push(`el primero del ranking es ${r.ranking[0].nombre} con ${formatearMoneda(r.ranking[0].monto)}`);
        return partes.join("; ") + ".";
      } catch {
        return "No pude armar el reporte del mes ahora mismo.";
      }
    },
    // Publica la foto de un vehículo del stock en Facebook o Instagram.
    publicar_vehiculo_en_redes: async (parametros: { modelo?: string; red?: string; texto?: string }) => {
      const consulta = normalizar(parametros?.modelo || "").trim();
      if (!consulta) return "¿Qué vehículo querés publicar?";
      const red: Red = normalizar(parametros?.red || "").includes("insta") ? "instagram" : "facebook";
      try {
        const vehiculos = await cargarVehiculos();
        const auto = vehiculos.find((v) => normalizar(nombreVehiculo(v)).includes(consulta));
        if (!auto) return `No encontré ningún vehículo que coincida con "${parametros?.modelo}".`;
        const fotos = await cargarFotos(auto.id);
        const foto = fotos[0]?.url;
        if (!foto) return `${nombreVehiculo(auto)} no tiene fotos cargadas, así que no puedo publicarlo.`;
        const texto =
          (parametros?.texto || "").trim() ||
          `${nombreVehiculo(auto)}${auto.anio ? ` ${auto.anio}` : ""} — ${formatearMoneda(auto.precio)}`;
        const res = await publicarEnRedes(red, texto, { imagenUrl: foto, formato: "feed" });
        try {
          await registrarPublicacion({ vehiculo_id: auto.id, red, formato: "feed", post_id: res.id });
        } catch {}
        return `Listo, publiqué ${nombreVehiculo(auto)} en ${red === "instagram" ? "Instagram" : "Facebook"}.`;
      } catch (err) {
        return "No pude publicar el vehículo. " + (err instanceof Error ? err.message : "Probá de nuevo.");
      }
    },
    // Registra una operación de venta uniendo vehículo, cliente y monto.
    registrar_operacion: async (parametros: { modelo?: string; cliente?: string; monto?: number }) => {
      const modelo = normalizar(parametros?.modelo || "").trim();
      const nombreCliente = normalizar(parametros?.cliente || "").trim();
      if (!modelo) return "¿Sobre qué vehículo es la operación?";
      if (!nombreCliente) return "¿A nombre de qué cliente la registro?";
      try {
        const [vehiculos, clientes] = await Promise.all([cargarVehiculos(), cargarClientes()]);
        const auto = vehiculos.find((v) => normalizar(nombreVehiculo(v)).includes(modelo));
        if (!auto) return `No encontré ningún vehículo que coincida con "${parametros?.modelo}".`;
        const cliente = clientes.find((c) => normalizar(c.nombre).includes(nombreCliente));
        if (!cliente) return `No encontré ningún cliente que coincida con "${parametros?.cliente}".`;
        const monto = Number(parametros?.monto) || auto.precio || null;
        await crearOperacion({
          ...operacionVacia(),
          vehiculo_id: auto.id,
          cliente_id: cliente.id,
          monto,
        });
        return `Listo, registré una operación de ${nombreVehiculo(auto)} para ${cliente.nombre}${
          monto ? ` por ${formatearMoneda(monto)}` : ""
        }. Queda abierta.`;
      } catch {
        return "No pude registrar la operación ahora mismo.";
      }
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
          agencia={agencia}
        />
      </ConversationProvider>
    </div>
  );
}
