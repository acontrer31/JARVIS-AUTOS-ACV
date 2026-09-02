"use client";

import { useEffect, useState } from "react";
import { ETIQUETA_RED, REDES, publicarEnRedes, type Formato, type Red } from "@/lib/redes";
import { cargarVehiculos, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { cargarFotos } from "@/lib/media";
import { mensajeDeError } from "@/lib/errores";

// Formatos disponibles por red.
const FORMATOS: Record<Red, [Formato, string][]> = {
  facebook: [
    ["feed", "Post"],
    ["reel", "Reel"],
  ],
  instagram: [
    ["feed", "Feed"],
    ["historia", "Historia"],
    ["reel", "Reel"],
  ],
};

export default function RedesWorkspace() {
  const [red, setRed] = useState<Red>("facebook");
  const [formato, setFormato] = useState<Formato>("feed");
  const [texto, setTexto] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculoId, setVehiculoId] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    cargarVehiculos()
      .then(setVehiculos)
      .catch(() => {}); // el stock es opcional acá
  }, []);

  const esVideo = formato === "reel";
  const esHistoria = red === "instagram" && formato === "historia";

  function cambiarRed(r: Red) {
    setRed(r);
    setError("");
    setResultado("");
    // Si el formato actual no existe en la nueva red, volvé a feed.
    if (!FORMATOS[r].some(([f]) => f === formato)) setFormato("feed");
  }

  // Al elegir un vehículo, autocompleta la imagen con su primera foto pública.
  async function elegirVehiculo(id: string) {
    setVehiculoId(id);
    setError("");
    if (!id) return;
    try {
      const fotos = await cargarFotos(id);
      if (fotos[0]?.url) setImagenUrl(fotos[0].url);
      else setError("Ese vehículo no tiene fotos cargadas.");
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResultado("");

    if (esVideo && !videoUrl.trim()) {
      setError("El Reel necesita la URL pública de un video.");
      return;
    }
    if (!esVideo && red === "instagram" && !imagenUrl.trim()) {
      setError("Instagram necesita una imagen. Elegí un vehículo o pegá una URL.");
      return;
    }
    if (formato === "feed" && red === "facebook" && !texto.trim() && !imagenUrl.trim()) {
      setError("Escribí un texto o elegí una imagen.");
      return;
    }

    setPublicando(true);
    try {
      await publicarEnRedes(red, esHistoria ? "" : texto.trim(), {
        imagenUrl: imagenUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        formato,
      });
      const etiqueta = FORMATOS[red].find(([f]) => f === formato)?.[1] ?? ETIQUETA_RED[red];
      setResultado(`Publicado en ${ETIQUETA_RED[red]} (${etiqueta}) ✓`);
      setTexto("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setPublicando(false);
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  function botones<T extends string>(
    opciones: [T, string][],
    activo: T,
    onPick: (v: T) => void,
    chico = false
  ) {
    return (
      <div className="flex gap-2">
        {opciones.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`flex-1 rounded-lg border font-semibold ${chico ? "py-1 text-xs" : "py-1.5 text-sm"}`}
            style={{
              borderColor: activo === v ? "var(--dorado)" : "var(--border)",
              color: activo === v ? "var(--dorado)" : "var(--muted)",
              background: activo === v ? "color-mix(in srgb, var(--dorado) 12%, transparent)" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={publicar} className="flex flex-col gap-3">
      {/* Red */}
      {botones(
        REDES.map((r) => [r, ETIQUETA_RED[r]] as [Red, string]),
        red,
        cambiarRed
      )}

      {/* Formato */}
      {botones(FORMATOS[red], formato, setFormato, true)}

      {/* Texto */}
      <textarea
        className={`${input} min-h-24 resize-y disabled:opacity-50`}
        style={campo}
        placeholder={
          esHistoria
            ? "La historia no lleva texto (Instagram lo ignora)…"
            : esVideo
              ? "Descripción del Reel…"
              : red === "instagram"
                ? "Epígrafe del posteo…"
                : "Texto del posteo…"
        }
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={esHistoria}
      />

      {/* Video (Reel) o Imagen (resto) */}
      {esVideo ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>URL pública del video (mp4). Vertical 9:16 para que no se recorte.</p>
          <input
            className={input}
            style={campo}
            placeholder="https://…/video.mp4"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {red === "instagram" ? "Imagen (obligatoria)" : "Imagen (opcional)"}
          </p>
          <select className={input} style={campo} value={vehiculoId} onChange={(e) => elegirVehiculo(e.target.value)}>
            <option value="">Elegí un vehículo del stock…</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>{nombreVehiculo(v)}</option>
            ))}
          </select>
          <input
            className={input}
            style={campo}
            placeholder="…o pegá una URL de imagen pública"
            value={imagenUrl}
            onChange={(e) => setImagenUrl(e.target.value)}
          />
          {imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagenUrl} alt="Vista previa" className="max-h-40 w-auto self-start rounded-lg border" style={{ borderColor: "var(--border)" }} />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {resultado && <p className="text-sm" style={{ color: "var(--dorado)" }}>{resultado}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={publicando}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          {publicando ? "Publicando…" : `Publicar ${FORMATOS[red].find(([f]) => f === formato)?.[1] ?? ""} en ${ETIQUETA_RED[red]}`}
        </button>
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Publica en tus cuentas conectadas (configuradas en el servidor). Los Reels tardan unos segundos porque el video se procesa.
      </p>
    </form>
  );
}
