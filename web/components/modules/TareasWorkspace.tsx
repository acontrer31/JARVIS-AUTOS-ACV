"use client";

import { useEffect, useState } from "react";
import { cargarTareas, crearTarea, eliminarTarea, marcarHecha, type Tarea } from "@/lib/tareas";
import { mensajeDeError } from "@/lib/errores";

export default function TareasWorkspace() {
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [error, setError] = useState("");
  const [nueva, setNueva] = useState("");
  const [vence, setVence] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarTareas()
      .then(setTareas)
      .catch((err) => setError("No se pudieron cargar las tareas: " + mensajeDeError(err)));
  }, []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nueva.trim()) return;
    setError("");
    setGuardando(true);
    try {
      const creada = await crearTarea(nueva, vence || null);
      setTareas((prev) => [...(prev ?? []), creada]);
      setNueva("");
      setVence("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(t: Tarea) {
    const previo = t.hecha;
    setTareas((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, hecha: !previo } : x)));
    try {
      await marcarHecha(t.id, !previo);
    } catch {
      setTareas((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, hecha: previo } : x)));
      setError("No se pudo actualizar la tarea.");
    }
  }

  async function borrar(t: Tarea) {
    const antes = tareas ?? [];
    setTareas((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    try {
      await eliminarTarea(t.id);
    } catch {
      setTareas(antes);
      setError("No se pudo borrar la tarea.");
    }
  }

  if (error && !tareas) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!tareas) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando tareas…</p>;

  const pendientes = tareas.filter((t) => !t.hecha).length;
  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {pendientes} {pendientes === 1 ? "tarea pendiente" : "tareas pendientes"}
      </p>

      <form onSubmit={agregar} className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} flex-1`}
          style={estiloCampo}
          placeholder="Nueva tarea…"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <input
          type="date"
          className={input}
          style={estiloCampo}
          value={vence}
          onChange={(e) => setVence(e.target.value)}
          aria-label="Fecha de vencimiento (opcional)"
        />
        <button
          type="submit"
          disabled={guardando || !nueva.trim()}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          {guardando ? "Agregando…" : "Agregar"}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        {tareas.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <label className="flex flex-1 items-center gap-2">
              <input type="checkbox" checked={t.hecha} onChange={() => alternar(t)} aria-label={`Marcar "${t.titulo}"`} />
              <span style={{ textDecoration: t.hecha ? "line-through" : "none", color: t.hecha ? "var(--muted)" : "inherit" }}>
                {t.titulo}
              </span>
              {t.vence && (
                <span className="text-[0.65rem]" style={{ color: "var(--muted)" }}>
                  · vence {new Date(t.vence + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={() => borrar(t)}
              aria-label={`Borrar "${t.titulo}"`}
              className="text-lg leading-none"
              style={{ color: "var(--muted)" }}
            >
              ×
            </button>
          </div>
        ))}
        {tareas.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            No tenés tareas cargadas. Agregá una arriba, o pedíselo a JARVIS por voz.
          </p>
        )}
      </div>
    </div>
  );
}
