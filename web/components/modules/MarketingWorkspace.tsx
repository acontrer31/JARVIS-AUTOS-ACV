"use client";

import { useEffect, useState } from "react";
import { cargarVehiculos, type Vehiculo } from "@/lib/vehiculos";
import {
  armarPieza,
  cargarRendimiento,
  DESCRIPCION_TONO,
  ETIQUETA_TONO,
  refrescarMetricas,
  TONOS,
  type RendimientoVehiculo,
  type Tono,
} from "@/lib/marketing";
import { ETIQUETA_RED } from "@/lib/redes";
import { mensajeDeError } from "@/lib/errores";
import { supabase } from "@/lib/supabase";

const ETIQUETA_ESTADO_PUB: Record<string, string> = {
  publicada: "Viva",
  eliminada: "Retirada",
  pendiente_retiro: "Retirar a mano",
  error: "Con error",
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function MarketingWorkspace() {
  const [solapa, setSolapa] = useState<"pieza" | "rendimiento">("pieza");

  const [vehiculos, setVehiculos] = useState<Vehiculo[] | null>(null);
  const [agencia, setAgencia] = useState<string | null>(null);
  const [elegido, setElegido] = useState("");
  const [tono, setTono] = useState<Tono>("aviso");
  const [copiado, setCopiado] = useState(false);

  const [rendimiento, setRendimiento] = useState<RendimientoVehiculo[] | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [avisoRefresco, setAvisoRefresco] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    cargarVehiculos()
      .then((lista) => {
        setVehiculos(lista);
        // El primero disponible: es el que uno quiere publicar, no el que
        // encabeza la lista por precio si ya está vendido.
        setElegido(lista.find((v) => v.estado === "disponible")?.id ?? lista[0]?.id ?? "");
      })
      .catch((err) => setError("No se pudo cargar el stock: " + mensajeDeError(err)));

    // La firma del texto. Si no se puede leer, la pieza sale sin firma en vez
    // de con un nombre inventado.
    supabase
      .from("perfiles")
      .select("agencias(nombre)")
      .single()
      .then(({ data }) => {
        const nombre = (data as { agencias?: { nombre?: string } | null } | null)?.agencias?.nombre;
        setAgencia(nombre ?? null);
      });
  }, []);

  useEffect(() => {
    if (solapa !== "rendimiento" || !vehiculos) return;
    cargarRendimiento(vehiculos)
      .then(setRendimiento)
      .catch((err) => setError("No se pudo leer el historial: " + mensajeDeError(err)));
  }, [solapa, vehiculos]);

  const vehiculo = (vehiculos ?? []).find((v) => v.id === elegido) ?? null;
  const pieza = vehiculo ? armarPieza(vehiculo, tono, agencia) : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pieza);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("El navegador no dejó copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  async function refrescar() {
    setRefrescando(true);
    setAvisoRefresco("");
    setError("");
    try {
      const r = await refrescarMetricas();
      setAvisoRefresco(
        r.revisadas === 0
          ? "No hay publicaciones vivas para actualizar."
          : `${r.actualizadas} de ${r.revisadas} actualizadas${r.sin_datos ? ` · ${r.sin_datos} sin respuesta de Meta` : ""}.`
      );
      if (vehiculos) setRendimiento(await cargarRendimiento(vehiculos));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setRefrescando(false);
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["pieza", "rendimiento"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSolapa(s)}
            className="flex-1 rounded-lg border py-1.5 text-sm"
            style={{
              borderColor: solapa === s ? "var(--dorado)" : "var(--border)",
              color: solapa === s ? "var(--dorado)" : "var(--muted)",
            }}
          >
            {s === "pieza" ? "Armar la pieza" : "Qué rindió"}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {solapa === "pieza" && (
        <>
          {!vehiculos && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Cargando stock…
            </p>
          )}

          {vehiculos?.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              No hay vehículos cargados todavía. El texto se arma con la ficha, así que primero va el auto.
            </p>
          )}

          {vehiculos && vehiculos.length > 0 && (
            <>
              <select
                className={input}
                style={estiloCampo}
                value={elegido}
                onChange={(e) => setElegido(e.target.value)}
                aria-label="Vehículo"
              >
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.marca, v.modelo, v.version].filter(Boolean).join(" ")}
                    {v.estado !== "disponible" ? ` (${v.estado})` : ""}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                {TONOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTono(t)}
                    title={DESCRIPCION_TONO[t]}
                    className="rounded-lg border px-3 py-1 text-xs"
                    style={{
                      borderColor: tono === t ? "var(--dorado)" : "var(--border)",
                      color: tono === t ? "var(--dorado)" : "var(--muted)",
                    }}
                  >
                    {ETIQUETA_TONO[t]}
                  </button>
                ))}
              </div>
              <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
                {DESCRIPCION_TONO[tono]}
              </p>

              <textarea
                readOnly
                value={pieza}
                className={`${input} min-h-44 font-mono text-xs`}
                style={estiloCampo}
                aria-label="Texto de la pieza"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copiar}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                  style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
                >
                  {copiado ? "Copiado" : "Copiar"}
                </button>
                <span className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
                  Pegalo en Redes, en WhatsApp o donde lo necesites. Se arma solo con lo que tiene la ficha:
                  lo que no está cargado, no se menciona.
                </span>
              </div>
            </>
          )}
        </>
      )}

      {solapa === "rendimiento" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refrescar}
              disabled={refrescando}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--dorado)", color: "var(--dorado)" }}
            >
              {refrescando ? "Consultando a Meta…" : "Actualizar números"}
            </button>
            {avisoRefresco && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {avisoRefresco}
              </span>
            )}
          </div>

          {!rendimiento && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Leyendo el historial…
            </p>
          )}

          {rendimiento?.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Todavía no publicaste nada. Cuando publiques desde Redes, acá vas a ver qué rindió cada auto.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {(rendimiento ?? []).map((r) => (
              <div
                key={r.vehiculo_id ?? "sueltas"}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{r.nombre}</p>
                  <p className="text-xs" style={{ color: "var(--dorado)" }}>
                    {r.likes} me gusta · {r.comentarios} comentarios
                  </p>
                </div>
                <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                  {r.publicaciones.length} publicación{r.publicaciones.length === 1 ? "" : "es"} · {r.vivas} viva
                  {r.vivas === 1 ? "" : "s"}
                </p>

                <div className="mt-2 flex flex-col gap-1">
                  {r.publicaciones.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-2 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      <span>{ETIQUETA_RED[p.red as "facebook" | "instagram"] ?? p.red}</span>
                      <span>· {p.formato}</span>
                      <span>· {fecha(p.publicado_en)}</span>
                      <span>· {ETIQUETA_ESTADO_PUB[p.estado] ?? p.estado}</span>
                      {/* Sin métricas no se pone un cero: querría decir "nadie
                          lo tocó", cuando en realidad nunca se preguntó. */}
                      <span>
                        ·{" "}
                        {p.likes == null && p.comentarios == null
                          ? "sin datos todavía"
                          : `${p.likes ?? 0} me gusta, ${p.comentarios ?? 0} comentarios`}
                      </span>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                          ver
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            Los números los trae Meta cuando tocás &ldquo;Actualizar&rdquo;, de a 25 publicaciones por vez. Las
            retiradas quedan en la lista a propósito: saber que un auto necesitó seis publicaciones antes de
            venderse es el dato que sirve para el próximo parecido.
          </p>
        </>
      )}
    </div>
  );
}
