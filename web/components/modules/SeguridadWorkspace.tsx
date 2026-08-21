"use client";

import { useEffect, useMemo, useState } from "react";
import {
  camposCambiados,
  cargarAuditoria,
  cargarUsuarios,
  describirRegistro,
  miPerfil,
  type EntradaAuditoria,
  type Usuario,
} from "@/lib/seguridad";

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

function formatearMomento(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeguridadWorkspace() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[] | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [esAdmin, setEsAdmin] = useState(true);
  const [error, setError] = useState("");
  const [filtroTabla, setFiltroTabla] = useState("todas");

  useEffect(() => {
    Promise.all([miPerfil(), cargarAuditoria(), cargarUsuarios()])
      .then(([perfil, log, gente]) => {
        setEsAdmin(perfil.rol === "admin");
        setEntradas(log);
        setUsuarios(gente);
      })
      .catch((err) =>
        setError(
          "No se pudo cargar el registro de auditoría: " +
            (err instanceof Error ? err.message : String(err))
        )
      );
  }, []);

  const tablas = useMemo(() => {
    if (!entradas) return [];
    return Array.from(new Set(entradas.map((e) => e.tabla))).sort();
  }, [entradas]);

  const filtradas = useMemo(() => {
    if (!entradas) return [];
    return filtroTabla === "todas" ? entradas : entradas.filter((e) => e.tabla === filtroTabla);
  }, [entradas, filtroTabla]);

  function nombreUsuario(id: string | null): string {
    if (!id) return "Sistema";
    return usuarios.find((u) => u.id === id)?.nombre ?? "Usuario desconocido";
  }

  if (error) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!entradas) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando auditoría…</p>;

  // Un vendedor no recibe error: la política simplemente no le devuelve filas.
  // Sin este aviso vería una lista vacía y pensaría que no pasó nada nunca.
  if (!esAdmin) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        El registro de auditoría solo está disponible para administradores de la agencia.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Últimos {filtradas.length} cambios registrados
        </p>
        <select
          value={filtroTabla}
          onChange={(e) => setFiltroTabla(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <option value="todas">Todo</option>
          {tablas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Este registro lo escribe la propia base de datos con cada cambio. No se puede editar ni borrar
        desde la aplicación — tampoco por un administrador.
      </p>

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {filtradas.map((e) => {
          const cambios = camposCambiados(e);
          const cual = describirRegistro(e);
          return (
            <div key={e.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-semibold" style={{ color: COLOR_OPERACION[e.operacion] }}>
                    {ETIQUETA_OPERACION[e.operacion] ?? e.operacion}
                  </span>{" "}
                  en {e.tabla}
                  {cual ? ` · ${cual}` : ""}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {nombreUsuario(e.usuario_id)} · {formatearMomento(e.creado_en)}
                </p>
              </div>
              {e.operacion === "UPDATE" && cambios.length > 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Campos modificados: {cambios.join(", ")}
                </p>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            Todavía no hay cambios registrados.
          </p>
        )}
      </div>
    </div>
  );
}
