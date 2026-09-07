"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  auditoriaCSV,
  cargarAuditoria,
  cargarConexiones,
  cargarUsuarios,
  describirRegistro,
  miPerfil,
  resumenPorUsuario,
  valoresCambiados,
  type EntradaAuditoria,
  type EventoSesion,
  type FiltroAuditoria,
  type Usuario,
} from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";
import TemaToggle from "@/components/TemaToggle";

const ETIQUETA_OPERACION: Record<EntradaAuditoria["operacion"], string> = {
  INSERT: "Alta",
  UPDATE: "Cambio",
  DELETE: "Baja",
};

const COLOR_OPERACION: Record<EntradaAuditoria["operacion"], string> = {
  INSERT: "#7fb069",
  UPDATE: "#e8a33d",
  DELETE: "#c86a6a",
};

// Nombres de tabla en castellano, para no mostrarle al usuario el nombre
// técnico de la base.
const ETIQUETA_TABLA: Record<string, string> = {
  vehiculos: "Vehículos",
  vehiculo_costos: "Costos de vehículo",
  vehiculo_media: "Fotos de vehículo",
  vehiculo_documentacion: "Checklist de vehículo",
  clientes: "Clientes",
  interacciones: "Contactos con clientes",
  operaciones: "Operaciones",
  movimientos_caja: "Caja",
  compras: "Compras",
  proveedores: "Proveedores",
  tareas: "Tareas",
  publicaciones_redes: "Publicaciones en redes",
  perfiles: "Usuarios y roles",
};

function nombreTabla(tabla: string): string {
  return ETIQUETA_TABLA[tabla] ?? tabla;
}

function formatearMomento(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// El user-agent completo es ilegible. Se reduce a lo único que sirve de un
// vistazo: desde qué tipo de aparato entró.
function resumirDispositivo(ua: string | null): string {
  if (!ua) return "dispositivo desconocido";
  const sistema = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone/iPad"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "otro sistema";
  const navegador = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "otro navegador";
  return `${sistema} · ${navegador}`;
}

type Solapa = "actividad" | "conexiones" | "resumen";

const SOLAPAS: [Solapa, string][] = [
  ["actividad", "Actividad"],
  ["conexiones", "Conexiones"],
  ["resumen", "Resumen"],
];

export default function SeguridadWorkspace() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[] | null>(null);
  const [conexiones, setConexiones] = useState<EventoSesion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [esAdmin, setEsAdmin] = useState(true);
  const [error, setError] = useState("");
  const [solapa, setSolapa] = useState<Solapa>("actividad");

  // Filtros. Se aplican en la consulta, no en el navegador.
  const [usuarioId, setUsuarioId] = useState("");
  const [tabla, setTabla] = useState("");
  const [operacion, setOperacion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const filtros: FiltroAuditoria = useMemo(
    () => ({
      usuarioId: usuarioId || undefined,
      tabla: tabla || undefined,
      operacion: (operacion || undefined) as EntradaAuditoria["operacion"] | undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    [usuarioId, tabla, operacion, desde, hasta]
  );

  // Se vuelve a consultar cada vez que cambia un filtro: los filtros viajan a
  // la base, no se aplican sobre lo que ya está en pantalla.
  useEffect(() => {
    Promise.all([miPerfil(), cargarAuditoria(filtros), cargarConexiones(filtros), cargarUsuarios()])
      .then(([perfil, log, sesiones, gente]) => {
        setEsAdmin(perfil.rol === "admin");
        setEntradas(log);
        setConexiones(sesiones);
        setUsuarios(gente);
        setError("");
      })
      .catch((err) => {
        setError("No se pudo cargar la auditoría: " + mensajeDeError(err));
        setEntradas([]);
      });
  }, [filtros]);

  const nombreUsuario = useCallback(
    (id: string | null): string => {
      if (!id) return "Sistema";
      return usuarios.find((u) => u.id === id)?.nombre ?? "Usuario desconocido";
    },
    [usuarios]
  );

  // Las tablas realmente presentes en el log, para no ofrecer filtros vacíos.
  const tablas = useMemo(() => {
    if (!entradas) return [];
    return Array.from(new Set(entradas.map((e) => e.tabla))).sort();
  }, [entradas]);

  const resumen = useMemo(() => resumenPorUsuario(entradas ?? []), [entradas]);

  // El último ingreso de cada persona, que es lo primero que uno quiere ver.
  const ultimoIngreso = useMemo(() => {
    const porUsuario = new Map<string, EventoSesion>();
    for (const c of conexiones) {
      if (c.tipo === "ingreso" && !porUsuario.has(c.usuario_id)) porUsuario.set(c.usuario_id, c);
    }
    return [...porUsuario.values()];
  }, [conexiones]);

  function exportar() {
    if (!entradas?.length) return;
    const csv = auditoriaCSV(entradas, nombreUsuario);
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    enlace.download = `auditoria-jarvis-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  if (error) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!entradas)
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        Cargando auditoría…
      </p>
    );

  // Un vendedor no recibe error: la política simplemente no le devuelve filas.
  // Sin este aviso vería una lista vacía y pensaría que no pasó nada nunca.
  // El cambio de tema sí lo puede usar cualquiera (es una preferencia visual).
  if (!esAdmin) {
    return (
      <div className="flex flex-col gap-3">
        <TemaToggle />
        <p className="py-2 text-center text-sm" style={{ color: "var(--muted)" }}>
          El registro de auditoría solo está disponible para administradores de la agencia.
        </p>
      </div>
    );
  }

  const campo = "rounded-lg border px-2 py-1.5 text-xs outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--panel)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <TemaToggle />

      <div className="flex gap-1">
        {SOLAPAS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSolapa(id)}
            className="rounded-lg px-3 py-1 text-xs font-semibold"
            style={
              solapa === id
                ? { background: "var(--dorado)", color: "var(--verde-core)" }
                : { color: "var(--muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros: valen para las tres solapas */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <select
          className={campo}
          style={estiloCampo}
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value)}
          aria-label="Usuario"
        >
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre ?? "Sin nombre"}
            </option>
          ))}
        </select>
        <input
          className={campo}
          style={estiloCampo}
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          aria-label="Desde"
        />
        <input
          className={campo}
          style={estiloCampo}
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          aria-label="Hasta"
        />
        {solapa === "actividad" && (
          <>
            <select
              className={campo}
              style={estiloCampo}
              value={tabla}
              onChange={(e) => setTabla(e.target.value)}
              aria-label="Módulo"
            >
              <option value="">Todos los módulos</option>
              {tablas.map((t) => (
                <option key={t} value={t}>
                  {nombreTabla(t)}
                </option>
              ))}
            </select>
            <select
              className={campo}
              style={estiloCampo}
              value={operacion}
              onChange={(e) => setOperacion(e.target.value)}
              aria-label="Acción"
            >
              <option value="">Todas las acciones</option>
              <option value="INSERT">Altas</option>
              <option value="UPDATE">Cambios</option>
              <option value="DELETE">Bajas</option>
            </select>
          </>
        )}
      </div>

      {solapa === "actividad" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {entradas.length} movimiento(s)
            </p>
            <button
              type="button"
              onClick={exportar}
              disabled={!entradas.length}
              className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-40"
              style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
            >
              Exportar a Excel
            </button>
          </div>

          <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
            Este registro lo escribe la propia base de datos con cada cambio. No se puede editar ni borrar
            desde la aplicación — tampoco por un administrador.
          </p>

          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {entradas.map((e) => {
              const cambios = valoresCambiados(e);
              const cual = describirRegistro(e);
              return (
                <div
                  key={e.id}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p>
                      <span className="font-semibold" style={{ color: COLOR_OPERACION[e.operacion] }}>
                        {ETIQUETA_OPERACION[e.operacion] ?? e.operacion}
                      </span>{" "}
                      en {nombreTabla(e.tabla)}
                      {cual ? ` · ${cual}` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {nombreUsuario(e.usuario_id)} · {formatearMomento(e.creado_en)}
                    </p>
                  </div>
                  {/* El antes → después es lo que deja ver el error humano. */}
                  {cambios.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {cambios.map((c) => (
                        <li key={c.campo} className="text-xs" style={{ color: "var(--muted)" }}>
                          {c.campo}: {c.antes} → <span style={{ color: "var(--dorado)" }}>{c.despues}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {entradas.length === 0 && (
              <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
                No hay movimientos con esos filtros.
              </p>
            )}
          </div>
        </>
      )}

      {solapa === "conexiones" && (
        <>
          {ultimoIngreso.length > 0 && (
            <div className="rounded-lg border p-2" style={{ borderColor: "var(--dorado)" }}>
              <p
                className="mb-1 text-[0.7rem] uppercase tracking-wider"
                style={{ color: "var(--dorado)" }}
              >
                Último ingreso de cada uno
              </p>
              {ultimoIngreso.map((c) => (
                <p key={c.id} className="text-xs">
                  {nombreUsuario(c.usuario_id)} · {formatearMomento(c.creado_en)}
                </p>
              ))}
            </div>
          )}

          <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
            Se registra cada ingreso y cada salida hechos desde la pantalla de acceso, con la IP y el
            dispositivo. Si el navegador retoma una sesión ya iniciada no es un ingreso nuevo y no
            aparece acá.
          </p>

          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {conexiones.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span
                      className="font-semibold"
                      style={{ color: c.tipo === "ingreso" ? "#7fb069" : "var(--muted)" }}
                    >
                      {c.tipo === "ingreso" ? "Ingreso" : "Salida"}
                    </span>{" "}
                    · {nombreUsuario(c.usuario_id)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {formatearMomento(c.creado_en)}
                  </p>
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {resumirDispositivo(c.dispositivo)}
                  {c.ip ? ` · IP ${c.ip}` : ""}
                </p>
              </div>
            ))}
            {conexiones.length === 0 && (
              <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
                Todavía no hay conexiones registradas. Se empiezan a guardar desde el próximo ingreso.
              </p>
            )}
          </div>
        </>
      )}

      {solapa === "resumen" && (
        <>
          <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
            Cuánto hizo cada uno en el período filtrado.
          </p>
          <div className="flex flex-col gap-2">
            {resumen.map((r) => (
              <div
                key={r.usuarioId ?? "sistema"}
                className="rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{nombreUsuario(r.usuarioId)}</p>
                  <p className="text-sm" style={{ color: "var(--dorado)" }}>
                    {r.total} movimiento(s)
                  </p>
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {r.altas} alta(s) · {r.cambios} cambio(s) · {r.bajas} baja(s)
                </p>
              </div>
            ))}
            {resumen.length === 0 && (
              <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
                No hay movimientos con esos filtros.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
