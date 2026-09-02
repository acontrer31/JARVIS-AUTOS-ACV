"use client";

import { useEffect, useState } from "react";
import { armarReporte, type Reporte } from "@/lib/reportes";
import { formatearMoneda } from "@/lib/vehiculos";
import { mensajeDeError } from "@/lib/errores";

export default function ReportesWorkspace() {
  const [rep, setRep] = useState<Reporte | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    armarReporte()
      .then(setRep)
      .catch((err) => setError("No se pudo armar el reporte: " + mensajeDeError(err)));
  }, []);

  if (error) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!rep) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Armando reporte…</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        Mes en curso · {rep.mesEtiqueta}
      </p>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-2">
        <Kpi titulo="Ventas del mes" valor={formatearMoneda(rep.ventasMes.monto)} sub={`${rep.ventasMes.cantidad} entregada(s)`} destacado />
        <Kpi titulo="Comisiones del mes" valor={formatearMoneda(rep.ventasMes.comisiones)} sub="a pagar a vendedores" />
        <Kpi
          titulo="Margen del mes"
          valor={rep.margen.cantidad ? formatearMoneda(rep.margen.total) : "—"}
          sub={rep.margen.cantidad ? `sobre ${rep.margen.cantidad} con costo cargado` : "cargá costos en Compras"}
          destacado
        />
        <Kpi titulo="Stock valorizado" valor={formatearMoneda(rep.stock.valorizado)} sub={`${rep.stock.cantidad} disponible(s)`} />
      </div>

      {/* Operaciones en curso */}
      <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--muted)" }}>Operaciones en curso (abiertas + señadas)</span>
          <span className="font-semibold">
            {rep.abiertas.cantidad} · {formatearMoneda(rep.abiertas.monto)}
          </span>
        </div>
      </div>

      {/* Ranking de vendedores */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dorado)" }}>
          Ranking de vendedores — {rep.mesEtiqueta}
        </p>
        {rep.ranking.length === 0 ? (
          <p className="py-3 text-center text-sm" style={{ color: "var(--muted)" }}>
            Todavía no hay entregas este mes. Cuando marques operaciones como “entregada”, aparecen acá.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rep.ranking.map((r, i) => (
              <div
                key={r.nombre + i}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: i === 0 ? "var(--dorado)" : "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold"
                    style={{ background: i === 0 ? "var(--dorado)" : "var(--background)", color: i === 0 ? "var(--verde-core)" : "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium">{r.nombre}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold" style={{ color: "var(--dorado)" }}>{formatearMoneda(r.monto)}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r.cantidad} entrega(s)</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Los números salen en vivo de tus operaciones, vehículos y compras. El margen solo cuenta las
        ventas cuyo vehículo tiene un costo cargado en Compras.
      </p>
    </div>
  );
}

function Kpi({ titulo, valor, sub, destacado }: { titulo: string; valor: string; sub: string; destacado?: boolean }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: destacado ? "var(--dorado)" : "var(--border)" }}>
      <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{titulo}</p>
      <p className="mt-0.5 text-lg font-semibold" style={{ color: destacado ? "var(--dorado)" : "var(--foreground)" }}>{valor}</p>
      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>{sub}</p>
    </div>
  );
}
