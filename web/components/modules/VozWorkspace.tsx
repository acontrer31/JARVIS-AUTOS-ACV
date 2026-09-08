"use client";

import { useEffect, useState } from "react";
import {
  cargarConversaciones,
  cargarTranscripcion,
  CATALOGO_VOZ,
  duracionLegible,
  ETIQUETA_GRUPO,
  type Conversacion,
  type EstadoVoz,
  type GrupoTool,
  type Transcripcion,
} from "@/lib/voz";
import { soportaEscucha } from "@/lib/escuchaContinua";
import { mensajeDeError } from "@/lib/errores";

const GRUPOS: GrupoTool[] = ["consulta", "accion", "interfaz"];

// Lo que dice ElevenLabs, en castellano. Si aparece un estado nuevo se muestra
// crudo: preferible un valor raro a traducirlo mal.
const ETIQUETA_ESTADO: Record<string, string> = {
  done: "Terminada",
  failed: "Falló",
  "in-progress": "En curso",
  initiated: "Iniciada",
  processing: "Procesando",
};

const ETIQUETA_RESULTADO: Record<string, string> = {
  success: "Salió bien",
  failure: "Salió mal",
  unknown: "Sin evaluar",
};

function fechaHora(iso: string | null): string {
  if (!iso) return "sin fecha";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VozWorkspace() {
  const [solapa, setSolapa] = useState<"comandos" | "historial">("comandos");
  const [estado, setEstado] = useState<EstadoVoz | null>(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [transcripcion, setTranscripcion] = useState<Transcripcion[] | null>(null);

  // Se lee una sola vez, en el primer render, y no en un efecto: el soporte de
  // micrófono del navegador no cambia mientras la pantalla está abierta.
  const [escucha] = useState(() => soportaEscucha());

  useEffect(() => {
    if (solapa !== "historial" || estado) return;
    cargarConversaciones()
      .then(setEstado)
      .catch((err) => setError(mensajeDeError(err)));
  }, [solapa, estado]);

  async function abrir(c: Conversacion) {
    if (abierta === c.id) {
      setAbierta(null);
      return;
    }
    setAbierta(c.id);
    setTranscripcion(null);
    try {
      setTranscripcion(await cargarTranscripcion(c.id));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["comandos", "historial"] as const).map((s) => (
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
            {s === "comandos" ? "Qué le puedo pedir" : "Conversaciones"}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {solapa === "comandos" && (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {CATALOGO_VOZ.length} cosas que JARVIS sabe hacer por voz. Todas trabajan sobre datos reales: si
            falta un dato, lo dice — no lo inventa.
            {escucha
              ? ""
              : " Este navegador no soporta escucha continua, así que hay que apretar para hablar."}
          </p>

          {GRUPOS.map((grupo) => {
            const tools = CATALOGO_VOZ.filter((t) => t.grupo === grupo);
            return (
              <div key={grupo} className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold tracking-wide" style={{ color: "var(--dorado)" }}>
                  {ETIQUETA_GRUPO[grupo].toUpperCase()}
                </p>
                {tools.map((t) => (
                  <div
                    key={t.nombre}
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="text-sm">&ldquo;{t.ejemplo}&rdquo;</p>
                    <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      {t.hace} <span className="font-mono">({t.nombre})</span>
                    </p>
                  </div>
                ))}
              </div>
            );
          })}

          <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            Los nombres entre paréntesis son los que tienen que estar declarados igual en el panel de
            ElevenLabs. Esta lista sale del código: si una herramienta se agrega o se saca, acá cambia sola.
          </p>
        </>
      )}

      {solapa === "historial" && (
        <>
          {!estado && !error && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Leyendo el historial…
            </p>
          )}

          {estado && !estado.configurado && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              {estado.motivo}
            </p>
          )}

          {estado?.configurado && estado.conversaciones.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Todavía no hay conversaciones registradas con el agente.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {(estado?.conversaciones ?? []).map((c) => {
              const fallo = c.estado === "failed" || c.resultado === "failure";
              return (
                <div key={c.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={() => abrir(c)} className="w-full text-left" aria-expanded={abierta === c.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {/* El resumen manda sobre la fecha: dice de qué se habló,
                          que es lo que uno busca al recorrer la lista. */}
                      <span className="text-sm">{c.titulo || fechaHora(c.inicio)}</span>
                      <span className="text-xs" style={{ color: fallo ? "#f87171" : "var(--muted)" }}>
                        {ETIQUETA_ESTADO[c.estado ?? ""] ?? c.estado ?? "—"}
                        {c.resultado ? ` · ${ETIQUETA_RESULTADO[c.resultado] ?? c.resultado}` : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      {c.titulo ? `${fechaHora(c.inicio)} · ` : ""}
                      {duracionLegible(c.duracionSegundos)}
                      {c.mensajes != null ? ` · ${c.mensajes} intervenciones` : ""}
                    </p>
                    {/* El motivo del corte solo se muestra cuando algo salió
                        mal: en una llamada normal dice "el usuario colgó" y
                        sería ruido en cada fila. */}
                    {fallo && c.motivoCorte && (
                      <p className="mt-0.5 text-[0.7rem]" style={{ color: "#f87171" }}>
                        Cortó por: {c.motivoCorte}
                      </p>
                    )}
                  </button>

                  {abierta === c.id && (
                    <div className="mt-2 flex flex-col gap-1">
                      {!transcripcion && (
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          Trayendo la conversación…
                        </p>
                      )}
                      {transcripcion?.length === 0 && (
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          Esta conversación no dejó texto. Suele pasar cuando cortó antes de que alguien
                          llegara a decir algo.
                        </p>
                      )}
                      {(transcripcion ?? []).map((t, i) => (
                        <p key={i} className="text-xs">
                          <span style={{ color: t.quien === "agente" ? "var(--dorado)" : "var(--muted)" }}>
                            {t.quien === "agente" ? "JARVIS: " : "Vos: "}
                          </span>
                          {t.texto}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            Sale del historial real de ElevenLabs, las 30 más recientes. Sirve sobre todo cuando la voz corta
            sola: en las que fallaron se muestra el motivo del corte —una cuota agotada, por ejemplo— sin
            tener que entrar al panel de ElevenLabs a buscarlo.
          </p>
        </>
      )}
    </div>
  );
}
