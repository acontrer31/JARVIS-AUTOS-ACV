"use client";

import { useEffect, useMemo, useState } from "react";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { calcularCostoTransferenciaDNRPA, DNRPA_DISCLAIMER, simularCuotas } from "@/lib/financiacion";

export default function FinanciacionWorkspace() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[] | null>(null);
  const [error, setError] = useState("");
  const [seleccionId, setSeleccionId] = useState("");
  const [cuotas, setCuotas] = useState(12);

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
        </div>
      )}
    </div>
  );
}
