"use client";

import { useEffect, useState } from "react";
import { cargarFotos, type Foto } from "@/lib/media";
import { mensajeDeError } from "@/lib/errores";
import {
  ETIQUETA_ESTADO,
  formatearMoneda,
  nombreVehiculo,
  type EstadoVehiculo,
  type Vehiculo,
} from "@/lib/vehiculos";

const COLOR_ESTADO: Record<EstadoVehiculo, string> = {
  borrador: "var(--muted)",
  disponible: "var(--dorado)",
  reservado: "#e8a33d",
  vendido: "#7fb069",
  no_disponible: "var(--muted)",
};

// Un dato con etiqueta arriba y valor abajo. Si no hay valor, no se renderiza,
// para que la ficha no se llene de guiones.
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  if (valor == null || valor === "") return null;
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {etiqueta}
      </p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

export default function DetalleVehiculo({
  vehiculo,
  costo,
  puedeVerCosto,
  onEditar,
  onCerrar,
}: {
  vehiculo: Vehiculo;
  costo: number | null;
  puedeVerCosto: boolean;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [principal, setPrincipal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarFotos(vehiculo.id)
      .then((lista) => {
        setFotos(lista);
        setPrincipal(0);
      })
      .catch((err) => {
        setError("No se pudieron cargar las fotos: " + mensajeDeError(err));
        // Falla cerrado: lista vacía, no null, para no dejar "Cargando…" pegado
        // al error (mismo criterio que FotosVehiculo).
        setFotos([]);
      });
  }, [vehiculo.id]);

  const km = vehiculo.es_cero
    ? "0 km"
    : vehiculo.km != null
      ? `${vehiculo.km.toLocaleString("es-AR")} km`
      : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "color-mix(in srgb, var(--background) 92%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border p-5 sm:p-7"
        style={{ borderColor: "var(--dorado)", background: "var(--panel)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {nombreVehiculo(vehiculo)} {vehiculo.anio ?? ""}
            </h2>
            <p className="text-sm" style={{ color: COLOR_ESTADO[vehiculo.estado] }}>
              {ETIQUETA_ESTADO[vehiculo.estado]}
              {vehiculo.dominio ? ` · ${vehiculo.dominio}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Por defecto es solo un punto dorado; al pasar el mouse por encima
                se ensancha y muestra "Editar". En pantallas táctiles (sin hover)
                el punto sigue siendo clickeable y edita igual. */}
            <button
              type="button"
              onClick={onEditar}
              title="Editar"
              aria-label="Editar"
              className="group flex h-6 w-6 items-center justify-center overflow-hidden whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 hover:w-24"
              style={{ background: "var(--dorado)", color: "#0E4D3C" }}
            >
              <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Editar
              </span>
            </button>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="text-2xl leading-none"
              style={{ color: "var(--muted)" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Fotos */}
          <div className="flex flex-col gap-2">
            {fotos === null ? (
              <div
                className="flex h-[28rem] items-center justify-center rounded-xl text-sm"
                style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                Cargando fotos…
              </div>
            ) : fotos.length === 0 ? (
              <div
                className="flex h-[28rem] items-center justify-center rounded-xl text-sm"
                style={{ border: "1px dashed var(--border)", color: "var(--muted)" }}
              >
                Sin fotos cargadas en Supabase.
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- URLs del
                    bucket de Supabase, no declarado en el optimizador de Next. */}
                <img
                  src={fotos[principal]?.url}
                  alt={`Foto de ${nombreVehiculo(vehiculo)}`}
                  className="h-[28rem] w-full rounded-xl object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
                {fotos.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {fotos.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPrincipal(i)}
                        aria-label={`Ver foto ${i + 1}`}
                        className="overflow-hidden rounded-lg"
                        style={{
                          border: i === principal ? "2px solid var(--dorado)" : "1px solid var(--border)",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- ídem */}
                        <img src={f.url} alt="" className="h-14 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          {/* Datos */}
          <div className="flex flex-col gap-4">
            <p className="text-2xl font-semibold" style={{ color: "var(--dorado)" }}>
              {formatearMoneda(vehiculo.precio)}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Kilómetros" valor={km} />
              <Dato etiqueta="Condición" valor={vehiculo.condicion} />
              <Dato etiqueta="Motor" valor={vehiculo.motor} />
              <Dato etiqueta="Caja" valor={vehiculo.caja} />
              <Dato etiqueta="Tracción" valor={vehiculo.traccion} />
              <Dato etiqueta="Carrocería" valor={vehiculo.carroceria} />
              <Dato
                etiqueta="Valor tabla DNRPA"
                valor={vehiculo.valor_tabla_dnrpa != null ? formatearMoneda(vehiculo.valor_tabla_dnrpa) : null}
              />
              {puedeVerCosto && (
                <Dato etiqueta="Costo interno" valor={costo != null ? formatearMoneda(costo) : null} />
              )}
            </div>

            {vehiculo.specs.length > 0 && (
              <div>
                <p className="mb-1 text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Equipamiento
                </p>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {vehiculo.specs.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {vehiculo.notas && (
              <div>
                <p className="mb-1 text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Notas internas
                </p>
                <p className="whitespace-pre-wrap text-sm">{vehiculo.notas}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
