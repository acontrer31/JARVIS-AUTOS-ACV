"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CARRUSEL_MAX,
  CARRUSEL_MIN,
  ETIQUETA_RED,
  REDES,
  publicarEnRedes,
  type Formato,
  type Red,
} from "@/lib/redes";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { cargarFotos, subirImagenGenerada, subirVideo } from "@/lib/media";
import { componerHistoria } from "@/lib/historiaImagen";
import { cargarPendientesRetiro, marcarRetirada, registrarPublicacion, type PublicacionRed } from "@/lib/publicacionesRedes";
import { mensajeDeError } from "@/lib/errores";
import { useConfirmar } from "@/lib/confirmar";
import {
  aInstante,
  cancelarProgramada,
  cargarProgramadas,
  programarPublicacion,
  ETIQUETA_ESTADO_PROGRAMADA,
  type Programada,
} from "@/lib/programadas";

// Etiqueta de cada red, incluida TikTok (que puede aparecer en pendientes).
const ETIQUETA_PUB: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

// Formatos disponibles por red.
const FORMATOS: Record<Red, [Formato, string][]> = {
  facebook: [
    ["feed", "Post"],
    ["carrusel", "Carrusel"],
    ["reel", "Reel"],
  ],
  instagram: [
    ["feed", "Feed"],
    ["carrusel", "Carrusel"],
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
  // Fotos del vehículo elegido y cuáles entran al carrusel, en orden de tildado.
  const [fotosVehiculo, setFotosVehiculo] = useState<{ id: string; url: string }[]>([]);
  const [fotosElegidas, setFotosElegidas] = useState<string[]>([]);
  const [publicando, setPublicando] = useState(false);
  // Cuándo publicarla. Vacío = ahora mismo, que es el caso normal.
  const [cuando, setCuando] = useState("");
  const [programadas, setProgramadas] = useState<Programada[]>([]);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");
  const [pendientes, setPendientes] = useState<PublicacionRed[]>([]);
  const [medioHistoria, setMedioHistoria] = useState<"foto" | "video">("foto");
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
  const confirmar = useConfirmar();

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

  const esHistoria = red === "instagram" && formato === "historia";
  const esCarrusel = formato === "carrusel";
  // El Reel es siempre video; la historia puede ser foto o video.
  const esVideo = formato === "reel" || (esHistoria && medioHistoria === "video");

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
      setFotosVehiculo(fotos.map((f) => ({ id: f.id, url: f.url })));
      // El carrusel arranca con todas tildadas (hasta el tope): es lo que uno
      // quiere el 90% de las veces, y destildar es más rápido que tildar ocho.
      setFotosElegidas(fotos.slice(0, CARRUSEL_MAX).map((f) => f.url));
      if (fotos[0]?.url) setImagenUrl(fotos[0].url);
      else setError("Ese vehículo no tiene fotos cargadas.");
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  const recargarProgramadas = useCallback(() => {
    cargarProgramadas()
      .then(setProgramadas)
      .catch(() => {}); // el resto del módulo funciona igual sin la agenda
  }, []);

  useEffect(() => {
    recargarProgramadas();
  }, [recargarProgramadas]);

  async function cancelar(p: Programada) {
    if (!(await confirmar({
      titulo: "¿Cancelar la publicación agendada?",
      detalle: `Estaba para el ${new Date(p.programada_para).toLocaleString("es-AR")}.`,
      textoConfirmar: "Cancelar la publicación",
      textoCancelar: "Dejarla",
      tono: "peligro",
    }))) {
      return;
    }
    try {
      await cancelarProgramada(p.id);
      recargarProgramadas();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  // Tildar suma al final; destildar saca y los que siguen se corren solos.
  function alternarFoto(url: string) {
    setFotosElegidas((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= CARRUSEL_MAX) return prev;
      return [...prev, url];
    });
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResultado("");

    // Publicar es hacia afuera y en Instagram no se puede borrar por API: la
    // confirmación acá vale más que en cualquier otro módulo.
    if (
      !(await confirmar({
        titulo: `¿Publicar en ${red === "instagram" ? "Instagram" : "Facebook"}?`,
        detalle: "Sale publicado en la cuenta real de la agencia.",
        textoConfirmar: "Publicar",
      }))
    ) {
      return;
    }

    if (esVideo && !videoUrl.trim()) {
      setError("Falta el video: subilo con “Examinar” o pegá su URL.");
      return;
    }
    if (esCarrusel && fotosElegidas.length < CARRUSEL_MIN) {
      setError(`Un carrusel necesita al menos ${CARRUSEL_MIN} fotos. Elegí un vehículo y tildá las que quieras.`);
      return;
    }
    if (!esVideo && !esCarrusel && red === "instagram" && !imagenUrl.trim()) {
      setError("Instagram necesita una imagen. Elegí un vehículo o pegá una URL.");
      return;
    }
    if (formato === "feed" && red === "facebook" && !texto.trim() && !imagenUrl.trim()) {
      setError("Escribí un texto o elegí una imagen.");
      return;
    }

    // Con fecha elegida no se publica ahora: se guarda para que el cron la
    // levante cuando venza. El texto y las fotos quedan congelados en la fila,
    // así lo que sale es lo que se aprobó y no una versión cambiada después.
    if (cuando) {
      if (new Date(cuando).getTime() <= Date.now()) {
        setError("Esa fecha ya pasó. Elegí un momento futuro o dejá el campo vacío para publicar ahora.");
        return;
      }
      if (!(await confirmar({
        titulo: "¿Programar la publicación?",
        detalle: `Se va a publicar sola el ${new Date(cuando).toLocaleString("es-AR")}.`,
        textoConfirmar: "Programar",
      }))) {
        return;
      }
      setPublicando(true);
      try {
        await programarPublicacion({
          vehiculo_id: vehiculoId || null,
          red,
          formato,
          texto: texto.trim() || null,
          imagen_url: imagenUrl.trim() || null,
          imagen_urls: esCarrusel ? fotosElegidas : [],
          video_url: videoUrl.trim() || null,
          programada_para: aInstante(cuando),
        });
        setResultado(`Programada para el ${new Date(cuando).toLocaleString("es-AR")} ✓`);
        setCuando("");
        recargarProgramadas();
      } catch (err) {
        setError(mensajeDeError(err));
      } finally {
        setPublicando(false);
      }
      return;
    }

    setPublicando(true);
    try {
      let imagenFinal = imagenUrl.trim() || null;

      // Instagram ignora el texto de las historias, así que si el usuario
      // escribió algo lo "quemamos" sobre la imagen antes de publicar.
      if (esHistoria && medioHistoria === "foto" && texto.trim() && imagenFinal) {
        const v = vehiculos.find((x) => x.id === vehiculoId);
        const datos = v
          ? [nombreVehiculo(v), v.anio, v.km ? `${v.km.toLocaleString("es-AR")} km` : null, formatearMoneda(v.precio)]
              .filter(Boolean)
              .join(" · ")
          : undefined;
        const pieza = await componerHistoria({
          fotoUrl: imagenFinal,
          texto: texto.trim(),
          datosVehiculo: datos,
        });
        imagenFinal = await subirImagenGenerada(pieza);
      }

      const res = await publicarEnRedes(red, esHistoria ? "" : texto.trim(), {
        imagenUrl: imagenFinal,
        imagenUrls: esCarrusel ? fotosElegidas : [],
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
    if (
      !(await confirmar({
        titulo: "¿Ya la borraste de la red?",
        detalle: "Se saca de la lista de pendientes. La publicación en sí la borrás vos desde la app de la red.",
        textoConfirmar: "Sí, ya la borré",
      }))
    ) {
      return;
    }
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

      {/* La historia de Instagram puede ser foto o video */}
      {esHistoria &&
        botones(
          [
            ["foto", "Foto"],
            ["video", "Video"],
          ] as ["foto" | "video", string][],
          medioHistoria,
          setMedioHistoria,
          true
        )}

      {/* Texto */}
      <textarea
        className={`${input} min-h-24 resize-y disabled:opacity-50`}
        style={campo}
        placeholder={
          esHistoria && medioHistoria === "foto"
            ? "Leyenda sobre la historia (ej. VENDO · financiación · 387 510-5956)…"
            : esHistoria
              ? "La historia en video no lleva leyenda…"
              : esVideo
                ? "Descripción del Reel…"
                : red === "instagram"
                  ? "Epígrafe del posteo…"
                  : "Texto del posteo…"
        }
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={esHistoria && medioHistoria === "video"}
      />
      {esHistoria && medioHistoria === "foto" && (
        <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
          Instagram no acepta texto en las historias por API, así que la leyenda se <strong>dibuja sobre la imagen</strong> junto con los datos del auto y tu marca.
        </p>
      )}

      {/* Video (Reel) o Imagen (resto) */}
      {esVideo ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {formato === "reel" ? "Video del Reel" : "Video de la historia"} (mp4). Vertical 9:16 para que no se recorte.
          </p>

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

          {/* Carrusel: se tildan las fotos y el orden de tildado es el orden en
              que se van a ver. El número sobre la foto lo hace explícito. */}
          {esCarrusel && (
            <div className="flex flex-col gap-1.5">
              {fotosVehiculo.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Elegí un vehículo para ver sus fotos.
                </p>
              ) : (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {fotosElegidas.length} de {fotosVehiculo.length} elegidas · entre {CARRUSEL_MIN} y{" "}
                    {CARRUSEL_MAX} · tocá para ordenar
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {fotosVehiculo.map((f) => {
                      const orden = fotosElegidas.indexOf(f.url);
                      const elegida = orden >= 0;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => alternarFoto(f.url)}
                          aria-label={elegida ? `Sacar del carrusel (posición ${orden + 1})` : "Sumar al carrusel"}
                          aria-pressed={elegida}
                          className="relative overflow-hidden rounded-lg"
                          style={{
                            border: elegida ? "2px solid var(--dorado)" : "1px solid var(--border)",
                            opacity: elegida ? 1 : 0.5,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- Storage de Supabase */}
                          <img src={f.url} alt="" className="h-16 w-24 object-cover" />
                          {elegida && (
                            <span
                              className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold"
                              style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
                            >
                              {orden + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* El carrusel arma su lista con los tildes de arriba; el campo de URL
              suelta solo tiene sentido para los otros formatos. */}
          {!esCarrusel && (
            <>
              <input
                className={input}
                style={campo}
                placeholder="…o pegá una URL de imagen pública"
                value={imagenUrl}
                onChange={(e) => setImagenUrl(e.target.value)}
              />
              {imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagenUrl}
                  alt="Vista previa"
                  className="max-h-40 w-auto self-start rounded-lg border"
                  style={{ borderColor: "var(--border)" }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Agenda: lo que está esperando su turno y lo que salió mal. Las ya
          publicadas no se listan acá, viven en el historial. */}
      {programadas.some((p) => p.estado === "pendiente" || p.estado === "fallida") && (
        <div className="flex flex-col gap-1.5 rounded-lg border p-2" style={{ borderColor: "var(--dorado)" }}>
          <p className="text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--dorado)" }}>
            Agendadas
          </p>
          {programadas
            .filter((p) => p.estado === "pendiente" || p.estado === "fallida")
            .map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  {ETIQUETA_RED[p.red]} · {FORMATOS[p.red].find(([f]) => f === p.formato)?.[1] ?? p.formato} ·{" "}
                  {new Date(p.programada_para).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {p.estado === "fallida" && (
                    <span className="ml-1.5" style={{ color: "#c86a6a" }}>
                      · {ETIQUETA_ESTADO_PROGRAMADA.fallida}
                      {p.error ? `: ${p.error}` : ""}
                    </span>
                  )}
                </span>
                {p.estado === "pendiente" && (
                  <button
                    type="button"
                    onClick={() => cancelar(p)}
                    className="underline"
                    style={{ color: "var(--muted)" }}
                  >
                    cancelar
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {resultado && <p className="text-sm" style={{ color: "var(--dorado)" }}>{resultado}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Programar para
          <input
            type="datetime-local"
            className={input}
            style={campo}
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            aria-label="Fecha y hora de publicación"
          />
        </label>
        {cuando && (
          <button
            type="button"
            onClick={() => setCuando("")}
            className="text-xs underline"
            style={{ color: "var(--muted)" }}
          >
            publicar ahora
          </button>
        )}
        <button
          type="submit"
          disabled={publicando}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          {publicando
            ? cuando
              ? "Programando…"
              : "Publicando…"
            : cuando
              ? "Programar"
              : `Publicar ${FORMATOS[red].find(([f]) => f === formato)?.[1] ?? ""} en ${ETIQUETA_RED[red]}`}
        </button>
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Publica en tus cuentas conectadas (configuradas en el servidor). Los Reels tardan unos segundos porque el video se procesa. Cuando el auto se venda, Facebook se retira solo y el resto queda listado arriba para borrar a mano.
      </p>
      </form>
    </div>
  );
}
