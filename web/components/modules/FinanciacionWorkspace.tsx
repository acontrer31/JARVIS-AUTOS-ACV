"use client";

import { useEffect, useMemo, useState } from "react";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import {
  AJUSTE_DEFAULT,
  DNRPA_DISCLAIMER,
  GESTORIA_DEFAULT,
  calcularCostoTransferenciaDNRPA,
  calcularPrenda,
  calcularTransferenciaTotal,
  simularCuotas,
} from "@/lib/financiacion";

export default function FinanciacionWorkspace() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[] | null>(null);
  const [error, setError] = useState("");
  const [seleccionId, setSeleccionId] = useState("");
  const [cuotas, setCuotas] = useState(12);

  // Parámetros del valor final de operación, editables (defaults de negocio).
  const [gestoria, setGestoria] = useState(GESTORIA_DEFAULT);
  const [ajustePct, setAjustePct] = useState(AJUSTE_DEFAULT * 100); // se muestra como %
  const [financia, setFinancia] = useState(false);
  const [valorCuotaMG, setValorCuotaMG] = useState<number | null>(null);
  const [mesesPrenda, setMesesPrenda] = useState(24);

  useEffect(() => {
    cargarVehiculos()
      .then(setVehiculos)
      .catch(() => setError("No se pudo cargar el stock real desde Supabase."));
  }, []);

  const seleccionado = useMemo(
    () => vehiculos?.find((v) => v.id === seleccionId) ?? null,
    [vehiculos, seleccionId]
  );

  const cuotasResultado = seleccionado ? simularCuotas(seleccionado.precio, cuotas) : null;
  const dnrpaResultado = seleccionado ? calcularCostoTransferenciaDNRPA(seleccionado.valor_tabla_dnrpa) : null;

  const ajuste = ajustePct / 100;
  const transferencia = seleccionado
    ? calcularTransferenciaTotal({ valorTabla: seleccionado.valor_tabla_dnrpa, ajuste, gestoria })
    : null;
  const prenda = financia ? calcularPrenda({ valorCuota: valorCuotaMG, meses: mesesPrenda, ajuste, gestoria }) : null;
  const totalOperacion =
    transferencia != null ? transferencia.total + (prenda?.total ?? 0) : null;

  if (error) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!vehiculos) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando stock real…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={seleccionId}
          onChange={(e) => setSeleccionId(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <option value="">— Elegí un vehículo del stock —</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {nombreVehiculo(v)} {v.anio ?? ""}
            </option>
          ))}
        </select>
        <select
          value={cuotas}
          onChange={(e) => setCuotas(Number(e.target.value))}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          {[12, 18, 24, 36, 48, 60].map((n) => (
            <option key={n} value={n}>
              {n} cuotas
            </option>
          ))}
        </select>
      </div>

      {!seleccionado && (
        <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          Elegí un vehículo para simular financiación y ver el costo de transferencia.
        </p>
      )}

      {seleccionado && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="mb-1 text-xs tracking-widest" style={{ color: "var(--muted)" }}>
              SIMULACIÓN DE CUOTAS
            </p>
            {cuotasResultado ? (
              <>
                <p className="text-lg font-semibold" style={{ color: "var(--dorado)" }}>
                  {formatearMoneda(cuotasResultado.valorCuota)} / mes
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {nombreVehiculo(seleccionado)} ({formatearMoneda(seleccionado.precio)}) en {cuotasResultado.cuotas}{" "}
                  cuotas, sin interés. Orientativo — no es una cotización oficial; la tasa real se confirma en el
                  portal de financiación de la agencia.
                </p>
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {nombreVehiculo(seleccionado)} todavía no tiene precio cargado, no se puede simular.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="mb-1 text-xs tracking-widest" style={{ color: "var(--muted)" }}>
              COSTO DE TRANSFERENCIA (DNRPA)
            </p>
            {dnrpaResultado ? (
              <>
                <p className="text-lg font-semibold" style={{ color: "var(--dorado)" }}>
                  {formatearMoneda(dnrpaResultado.total)}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  1% del valor tabla ({formatearMoneda(dnrpaResultado.arancel)}) + arancel fijo (
                  {formatearMoneda(dnrpaResultado.fijo)}). {DNRPA_DISCLAIMER}
                </p>
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {nombreVehiculo(seleccionado)} todavía no tiene el Valor Tabla de DNRPA cargado, no se puede
                estimar la transferencia.
              </p>
            )}
          </div>

          {/* Valor final de la operación: transferencia (+ prenda si financia) */}
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--dorado)" }}>
            <p className="mb-2 text-xs tracking-widest" style={{ color: "var(--muted)" }}>
              VALOR FINAL DE LA OPERACIÓN
            </p>

            {/* Parámetros editables */}
            <div className="mb-3 flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Ajuste %</span>
                <input
                  type="number" step="0.1" min={0}
                  value={ajustePct}
                  onChange={(e) => setAjustePct(Number(e.target.value) || 0)}
                  className="w-20 rounded-lg border px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Gestoría</span>
                <input
                  type="number" min={0}
                  value={gestoria}
                  onChange={(e) => setGestoria(Number(e.target.value) || 0)}
                  className="w-32 rounded-lg border px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                />
              </label>
            </div>

            {transferencia ? (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>Valor tabla + {ajustePct}%</span>
                  <span>{formatearMoneda(transferencia.valorTablaAjustado)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>Total presupuesto DNRPA</span>
                  <span>{formatearMoneda(transferencia.totalDNRPA)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>Gestoría</span>
                  <span>{formatearMoneda(transferencia.gestoria)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold" style={{ borderColor: "var(--border)" }}>
                  <span>Transferencia</span>
                  <span style={{ color: "var(--dorado)" }}>{formatearMoneda(transferencia.total)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Falta el Valor Tabla de DNRPA de este vehículo para calcular la transferencia.
              </p>
            )}

            {/* Prenda opcional */}
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={financia} onChange={(e) => setFinancia(e.target.checked)} />
              El cliente financia (agregar prenda)
            </label>

            {financia && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Valor cuota (MG Group)</span>
                    <input
                      type="number" min={0}
                      value={valorCuotaMG ?? ""}
                      onChange={(e) => setValorCuotaMG(e.target.value.trim() === "" ? null : Number(e.target.value))}
                      placeholder="Lo da MG Group"
                      className="w-40 rounded-lg border px-2 py-1 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Meses</span>
                    <input
                      type="number" min={1}
                      value={mesesPrenda}
                      onChange={(e) => setMesesPrenda(Number(e.target.value) || 1)}
                      className="w-20 rounded-lg border px-2 py-1 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </label>
                </div>

                {prenda ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: "var(--muted)" }}>Cuota × {mesesPrenda} meses</span>
                      <span>{formatearMoneda(prenda.montoFinanciado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--muted)" }}>+ {ajustePct}%</span>
                      <span>{formatearMoneda(prenda.montoAjustado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--muted)" }}>Gestoría</span>
                      <span>{formatearMoneda(prenda.gestoria)}</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t pt-1 font-semibold" style={{ borderColor: "var(--border)" }}>
                      <span>Prenda</span>
                      <span style={{ color: "var(--dorado)" }}>{formatearMoneda(prenda.total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Ingresá el valor de la cuota que MG Group le dio al cliente para calcular la prenda.
                  </p>
                )}
              </div>
            )}

            {totalOperacion != null && (!financia || prenda) && (
              <div className="mt-3 flex items-baseline justify-between border-t pt-2" style={{ borderColor: "var(--dorado)" }}>
                <span className="text-sm font-semibold tracking-wide">TOTAL OPERACIÓN</span>
                <span className="text-xl font-bold" style={{ color: "var(--dorado)" }}>{formatearMoneda(totalOperacion)}</span>
              </div>
            )}

            <p className="mt-2 text-[0.7rem]" style={{ color: "var(--muted)" }}>
              El valor de la cuota lo provee MG Group — JARVIS no lo inventa. El ajuste y la gestoría son
              editables acá. Total orientativo para la operación, no un contrato.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
