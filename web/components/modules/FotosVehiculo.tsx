"use client";

import { useEffect, useRef, useState } from "react";
import { cargarFotos, eliminarFoto, subirFoto, type Foto } from "@/lib/media";

export default function FotosVehiculo({ vehiculoId }: { vehiculoId: string }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarFotos(vehiculoId)
      .then(setFotos)
      .catch((err) =>
        setError("No se pudieron cargar las fotos: " + (err instanceof Error ? err.message : String(err)))
      );
  }, [vehiculoId]);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    if (archivos.length === 0) return;
    setError("");
    setSubiendo(true);
    try {
      let orden = (fotos?.length ?? 0);
      for (const archivo of archivos) {
        const nueva = await subirFoto(vehiculoId, archivo, orden);
        setFotos((prev) => [...(prev ?? []), nueva]);
        orden += 1;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      // Se limpia el input para poder volver a elegir el mismo archivo si hizo falta reintentar.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function borrar(foto: Foto) {
    if (!confirm("¿Eliminar esta foto? No se puede deshacer.")) return;
    try {
      await eliminarFoto(foto);
      setFotos((prev) => (prev ?? []).filter((f) => f.id !== foto.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la foto.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Fotos {fotos ? `(${fotos.length})` : ""}
        </span>
        <label
          className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", opacity: subiendo ? 0.5 : 1 }}
        >
          {subiendo ? "Subiendo…" : "+ Agregar fotos"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={subiendo}
            onChange={elegir}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {fotos === null ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Cargando fotos…</p>
      ) : fotos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Este vehículo todavía no tiene fotos cargadas acá.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <div key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- las URLs son
                  del bucket de Supabase, que no está declarado en next.config para
                  el optimizador de imágenes. */}
              <img
                src={f.url}
                alt="Foto del vehículo"
                className="h-20 w-28 rounded-lg object-cover"
                style={{ border: "1px solid var(--border)" }}
              />
              <button
                type="button"
                onClick={() => borrar(f)}
                aria-label="Eliminar foto"
                className="absolute right-1 top-1 rounded-full px-1.5 text-xs"
                style={{ background: "rgba(0,0,0,0.6)", color: "#c86a6a" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Estas fotos son las nuevas, guardadas en Supabase. Las del sitio actual siguen siendo archivos en{" "}
        <code>/images/&lt;dominio&gt;/</code> hasta que se migren.
      </p>
    </div>
  );
}
