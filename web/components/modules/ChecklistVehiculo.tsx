"use client";

import { useEffect, useState } from "react";
import {
  ITEMS_ACCESORIOS,
  ITEMS_DOCUMENTACION,
  URL_DNRPA,
  URL_DNRPA_HISTORICO,
  cargarDocumentacion,
  documentacionVacia,
  guardarDocumentacion,
  type Documentacion,
} from "@/lib/documentacion";
import { mensajeDeError } from "@/lib/errores";

// Un ítem tildable. Vive fuera del componente principal a propósito: definirlo
// adentro crearía un componente nuevo en cada render.
function Tilde({
  label,
  marcado,
  onCambiar,
}: {
  label: string;
  marcado: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => onCambiar(e.target.checked)}
        style={{ accentColor: "var(--dorado)" }}
      />
      <span>{label}</span>
    </label>
  );
}

// Checklist de papeles y accesorios del vehículo. Se usa sobre todo cuando un
// auto entra en consignación, para dejar constancia de qué entregó el dueño.
export default function ChecklistVehiculo({
  vehiculoId,
  dominio,
}: {
  vehiculoId: string;
  dominio?: string | null;
}) {
  const [doc, setDoc] = useState<Documentacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarDocumentacion(vehiculoId)
      .then(setDoc)
      .catch((err) => {
        setError("No se pudo cargar la checklist: " + mensajeDeError(err));
        setDoc(documentacionVacia(vehiculoId));
      });
  }, [vehiculoId]);

  function tildar(campo: keyof Documentacion, valor: boolean) {
    setDoc((d) => (d ? { ...d, [campo]: valor } : d));
    setGuardado(false);
  }

  async function guardar() {
    if (!doc) return;
    setError("");
    setGuardando(true);
    try {
      await guardarDocumentacion(doc);
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  if (!doc) {
    return <p className="py-3 text-center text-xs" style={{ color: "var(--muted)" }}>Cargando checklist…</p>;
  }

  const input = "rounded-lg border px-2 py-1 text-xs outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  // Cuántos ítems están tildados, para ver de un vistazo si falta algo.
  const todos = [...ITEMS_DOCUMENTACION, ...ITEMS_ACCESORIOS];
  const completos = todos.filter(([k]) => doc[k] === true).length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dorado)" }}>
          Documentación y accesorios
        </p>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{completos}/{todos.length}</span>
      </div>

      <div>
        <p className="mb-1 text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Papeles</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ITEMS_DOCUMENTACION.map(([k, label]) => (
            <Tilde key={k} label={label} marcado={doc[k] === true} onCambiar={(v) => tildar(k, v)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Accesorios</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ITEMS_ACCESORIOS.map(([k, label]) => (
            <Tilde key={k} label={label} marcado={doc[k] === true} onCambiar={(v) => tildar(k, v)} />
          ))}
        </div>
      </div>

      {/* Informe de dominio: el trámite se hace en el DNRPA, acá queda el registro */}
      <div className="flex flex-col gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
        <Tilde
          label="Requiere informe de dominio (DNRPA)"
          marcado={doc.informe_dominio_necesario}
          onCambiar={(v) => tildar("informe_dominio_necesario", v)}
        />
        {doc.informe_dominio_necesario && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                className={input}
                style={campo}
                type="date"
                value={doc.informe_dominio_pedido ?? ""}
                onChange={(e) => setDoc({ ...doc, informe_dominio_pedido: e.target.value || null })}
                aria-label="Fecha del pedido"
              />
              <input
                className={input}
                style={campo}
                placeholder="DNI del consignante"
                value={doc.dni_consignante ?? ""}
                onChange={(e) => setDoc({ ...doc, dni_consignante: e.target.value || null })}
              />
            </div>
            <input
              className={input}
              style={campo}
              placeholder="Resultado (libre, con embargo, secuestro…)"
              value={doc.informe_dominio_resultado ?? ""}
              onChange={(e) => setDoc({ ...doc, informe_dominio_resultado: e.target.value || null })}
            />
            <div className="flex flex-wrap gap-3">
              <a
                href={URL_DNRPA}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
                style={{ color: "var(--dorado)" }}
              >
                Pedir informe de dominio ↗
              </a>
              <a
                href={URL_DNRPA_HISTORICO}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
                style={{ color: "var(--dorado)" }}
              >
                Pedir informe histórico ↗
              </a>
            </div>
            <p className="text-[0.68rem]" style={{ color: "var(--muted)" }}>
              Trámite oficial y pago del DNRPA: no se puede consultar automáticamente. En el sitio se pide con CUIL/CUIT
              y la patente
              {dominio ? ` (${dominio})` : ""}, se paga online y el informe llega por mail. Volvé y anotá acá el
              resultado.
            </p>
          </>
        )}
      </div>

      <input
        className={input}
        style={campo}
        placeholder="Notas (faltantes, observaciones…)"
        value={doc.notas ?? ""}
        onChange={(e) => setDoc({ ...doc, notas: e.target.value || null })}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {guardado && <span className="text-xs" style={{ color: "var(--dorado)" }}>Guardado ✓</span>}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          {guardando ? "Guardando…" : "Guardar checklist"}
        </button>
      </div>
    </div>
  );
}
