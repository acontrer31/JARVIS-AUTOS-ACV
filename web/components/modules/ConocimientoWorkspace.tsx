"use client";

import { useEffect, useRef, useState } from "react";
import {
  actualizarDocumento,
  cargarDocumentos,
  CATEGORIAS,
  crearDocumento,
  eliminarDocumento,
  ETIQUETA_CATEGORIA,
  MAX_BYTES,
  tamanioLegible,
  urlFirmada,
  type Categoria,
  type Documento,
} from "@/lib/documentos";
import { mensajeDeError } from "@/lib/errores";
import { useConfirmar } from "@/lib/confirmar";

const VACIO = { titulo: "", categoria: "otros" as Categoria, contenido: "" };

export default function ConocimientoWorkspace() {
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<Categoria | "">("");

  const [editando, setEditando] = useState<Documento | "nuevo" | null>(null);
  const [form, setForm] = useState(VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const campoArchivo = useRef<HTMLInputElement>(null);

  const confirmar = useConfirmar();

  // Una consulta por cambio de filtro, con espera: escribir "transferencia"
  // dispararía trece búsquedas si saliera con cada tecla.
  useEffect(() => {
    let vigente = true;
    const timer = setTimeout(() => {
      cargarDocumentos({ texto: busqueda, categoria: categoria || null })
        .then((lista) => {
          if (vigente) {
            setDocs(lista);
            setError("");
          }
        })
        .catch((err) => {
          if (vigente) setError("No se pudo buscar: " + mensajeDeError(err));
        });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [busqueda, categoria]);

  function abrirNuevo() {
    setForm(VACIO);
    setArchivo(null);
    setEditando("nuevo");
  }

  function abrirCorreccion(doc: Documento) {
    setForm({ titulo: doc.titulo, categoria: doc.categoria, contenido: doc.contenido ?? "" });
    setArchivo(null);
    setEditando(doc);
  }

  function cerrarForm() {
    setEditando(null);
    setArchivo(null);
    if (campoArchivo.current) campoArchivo.current.value = "";
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const esNuevo = editando === "nuevo";
    if (
      !(await confirmar({
        titulo: esNuevo ? "¿Guardar el documento?" : "¿Guardar la corrección?",
        detalle: form.titulo.trim() || "Sin título",
      }))
    ) {
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const datos = { titulo: form.titulo, categoria: form.categoria, contenido: form.contenido || null };
      if (esNuevo) {
        const creado = await crearDocumento(datos, archivo);
        setDocs((prev) => [creado, ...(prev ?? [])]);
      } else if (editando) {
        const actualizado = await actualizarDocumento(editando, datos, archivo);
        setDocs((prev) => (prev ?? []).map((d) => (d.id === actualizado.id ? actualizado : d)));
      }
      cerrarForm();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(doc: Documento) {
    if (
      !(await confirmar({
        titulo: "¿Borrar el documento?",
        detalle: `${doc.titulo}${doc.archivo_nombre ? ` y su archivo ${doc.archivo_nombre}` : ""}. No se puede deshacer.`,
        textoConfirmar: "Borrar",
        tono: "peligro",
      }))
    ) {
      return;
    }
    const antes = docs ?? [];
    setDocs((prev) => (prev ?? []).filter((d) => d.id !== doc.id));
    try {
      await eliminarDocumento(doc);
    } catch (err) {
      setDocs(antes);
      setError(mensajeDeError(err));
    }
  }

  // El bucket es privado: no hay URL fija que pegar en un href. Se firma al
  // tocar y se abre esa, que vence a los cinco minutos.
  async function abrirArchivo(doc: Documento) {
    if (!doc.archivo_ruta) return;
    try {
      const url = await urlFirmada(doc.archivo_ruta);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError("No se pudo abrir el archivo: " + mensajeDeError(err));
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} flex-1 min-w-40`}
          style={estiloCampo}
          placeholder="Buscar en el conocimiento…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar documentos"
        />
        <select
          className={input}
          style={estiloCampo}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as Categoria | "")}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={abrirNuevo}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          Agregar
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {editando && (
        <form
          onSubmit={guardar}
          className="flex flex-col gap-2 rounded-lg border p-3"
          style={{ borderColor: "var(--dorado)" }}
        >
          <div className="flex flex-wrap gap-2">
            <input
              className={`${input} flex-1 min-w-40`}
              style={estiloCampo}
              placeholder="Título (ej: Costo de transferencia 0 km)"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              aria-label="Título del documento"
              autoFocus
            />
            <select
              className={input}
              style={estiloCampo}
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as Categoria })}
              aria-label="Categoría"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className={`${input} min-h-28`}
            style={estiloCampo}
            placeholder="Escribí acá lo que hay que recordar. Esto es lo que se busca por texto y lo que JARVIS puede leer en voz alta."
            value={form.contenido}
            onChange={(e) => setForm({ ...form, contenido: e.target.value })}
            aria-label="Contenido"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <input
              ref={campoArchivo}
              type="file"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="max-w-full text-xs"
              aria-label="Adjuntar archivo"
            />
            <span>
              Opcional, hasta {Math.round(MAX_BYTES / 1024 / 1024)} MB.
              {editando !== "nuevo" && editando.archivo_nombre
                ? ` Hoy tiene ${editando.archivo_nombre}; si elegís otro, lo reemplaza.`
                : ""}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cerrarForm}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!docs && (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          Buscando…
        </p>
      )}

      {docs?.length === 0 && (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          {busqueda || categoria
            ? "No hay nada que coincida con esa búsqueda."
            : "Todavía no hay nada cargado. Empezá por lo que más te preguntan: costos de trámites, qué papeles pide cada compañía, cómo se toma un usado."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(docs ?? []).map((doc) => {
          const desplegado = abierto === doc.id;
          return (
            <div key={doc.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAbierto(desplegado ? null : doc.id)}
                  className="flex-1 text-left"
                  aria-expanded={desplegado}
                >
                  <p className="text-sm font-semibold">{doc.titulo}</p>
                  <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                    {ETIQUETA_CATEGORIA[doc.categoria]} · actualizado{" "}
                    {new Date(doc.actualizado_en).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    {doc.archivo_nombre ? ` · ${doc.archivo_nombre} (${tamanioLegible(doc.archivo_bytes)})` : ""}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => abrirCorreccion(doc)}
                  className="text-xs underline"
                  style={{ color: "var(--muted)" }}
                  aria-label={`Corregir "${doc.titulo}"`}
                >
                  Corregir
                </button>
                <button
                  type="button"
                  onClick={() => borrar(doc)}
                  className="text-lg leading-none"
                  style={{ color: "var(--muted)" }}
                  aria-label={`Borrar "${doc.titulo}"`}
                >
                  ×
                </button>
              </div>

              {desplegado && (
                <div className="mt-2 flex flex-col gap-2">
                  {doc.contenido && (
                    <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--muted)" }}>
                      {doc.contenido}
                    </p>
                  )}
                  {doc.archivo_ruta && (
                    <button
                      type="button"
                      onClick={() => abrirArchivo(doc)}
                      className="self-start rounded-lg border px-3 py-1 text-xs"
                      style={{ borderColor: "var(--dorado)", color: "var(--dorado)" }}
                    >
                      Abrir {doc.archivo_nombre ?? "el archivo"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
        Los archivos van a un depósito privado: solo se abren con un enlace firmado que vence a los cinco
        minutos, y nadie de otra agencia los ve. Preguntale a JARVIS por voz — busca acá antes de contestar.
      </p>
    </div>
  );
}
