"use client";

import { useEffect, useRef, useState } from "react";
import { ETIQUETA_RED, REDES, publicarEnRedes, type Formato, type Red } from "@/lib/redes";
import { cargarVehiculos, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { cargarFotos, subirVideo } from "@/lib/media";
import { cargarPendientesRetiro, marcarRetirada, registrarPublicacion, type PublicacionRed } from "@/lib/publicacionesRedes";
import { mensajeDeError } from "@/lib/errores";

// Etiqueta de cada red, incluida TikTok (que puede aparecer en pendientes).
const ETIQUETA_PUB: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

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
  const [pendientes, setPendientes] = useState<PublicacionRed[]>([]);
  const [subiendoVideo, setSubiendoVideo] = useState(false);
  const archivoVideo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarVehiculos()
      .then(setVehiculos)
      // Si el stock no carga, avisarlo: una lista vacía sin explicación confunde.
      .catch((err) => setError("No se pudo cargar el stock: " + mensajeDeError(err)));
    cargarPendientesRetiro()
      .then(setPendientes)
      .catch(() => {});
  }, []);

  // Sube un video desde la compu al Storage público y completa la URL sola.
  async function elegirArchivoVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setError("");
    setSubiendoVideo(true);
    try {
      const url = await subirVideo(archivo);
      setVideoUrl(url);
    } catch (err) {
      setError("No se pudo subir el video: " + mensajeDeError(err));
    } finally {
      setSubiendoVideo(false);
    }
  }

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
      const res = await publicarEnRedes(red, esHistoria ? "" : texto.trim(), {
        imagenUrl: imagenUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        formato,
      });
      // Guardar en la memoria de publicaciones (para retirarla al vender el auto).
      try {
        await registrarPublicacion({
          vehiculo_id: vehiculoId || null,
          red,
          formato,
          post_id: res.id,
        });
      } catch {}
      const etiqueta = FORMATOS[red].find(([f]) => f === formato)?.[1] ?? ETIQUETA_RED[red];
      setResultado(`Publicado en ${ETIQUETA_RED[red]} (${etiqueta}) ✓`);
      setTexto("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setPublicando(false);
    }
  }

  async function borrada(p: PublicacionRed) {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    try {
      await marcarRetirada(p.id);
    } catch {
      // si falla, la recargamos para no perderla de vista
      cargarPendientesRetiro().then(setPendientes).catch(() => {});
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
    <div className="flex flex-col gap-4">
      {/* Pendientes de retirar a mano (IG/TikTok de autos vendidos) */}
      {pendientes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--dorado)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dorado)" }}>
            Pendientes de retirar a mano ({pendientes.length})
          </p>
          <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
            Estos avisos son de autos ya vendidos. Instagram y TikTok no se borran por API — abrí el link, borralos en la app y tocá “Ya la borré”.
          </p>
          {pendientes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {ETIQUETA_PUB[p.red]} · {p.formato}
                {p.url && (
                  <>
                    {" · "}
                    <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "var(--dorado)" }}>abrir</a>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => borrada(p)}
                className="rounded-lg border px-2 py-1 text-xs"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Ya la borré
              </button>
            </div>
          ))}
        </div>
      )}

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
          <p className="text-xs" style={{ color: "var(--muted)" }}>Video del Reel (mp4). Vertical 9:16 para que no se recorte.</p>

          <div className="flex items-center gap-2">
            <input
              className={`${input} flex-1`}
              style={campo}
              placeholder="Pegá la URL del video…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />

            {/* Botón dorado colapsado que se expande al pasar el cursor */}
            <button
              type="button"
              onClick={() => archivoVideo.current?.click()}
              disabled={subiendoVideo}
              title="Subir un video desde tu computadora"
              className="group flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
            >
              <span aria-hidden="true">📁</span>
              <span className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width] duration-300 group-hover:max-w-[6rem] group-focus:max-w-[6rem]">
                {subiendoVideo ? "Subiendo…" : "Examinar"}
              </span>
            </button>
            <input
              ref={archivoVideo}
              type="file"
              accept="video/*"
              onChange={elegirArchivoVideo}
              className="hidden"
            />
          </div>

          {subiendoVideo && (
            <p className="text-xs" style={{ color: "var(--dorado)" }}>Subiendo el video…</p>
          )}
          {videoUrl && !subiendoVideo && (
            <video src={videoUrl} controls className="max-h-48 w-auto self-start rounded-lg border" style={{ borderColor: "var(--border)" }} />
          )}
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
        Publica en tus cuentas conectadas (configuradas en el servidor). Los Reels tardan unos segundos porque el video se procesa. Cuando el auto se venda, Facebook se retira solo y el resto queda listado arriba para borrar a mano.
      </p>
      </form>
    </div>
  );
}
