"use client";

import { useEffect, useMemo, useState } from "react";
import { cargarVehiculos, formatearMoneda, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";

export default function VehiculosWorkspace() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[] | null>(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    cargarVehiculos()
      .then(setVehiculos)
      .catch(() => setError("No se pudo cargar el stock real desde Supabase."));
  }, []);

  const filtrados = useMemo(() => {
    if (!vehiculos) return [];
    const q = filtro.trim().toLowerCase();
    if (!q) return vehiculos;
    return vehiculos.filter((v) => nombreVehiculo(v).toLowerCase().includes(q));
  }, [vehiculos, filtro]);

  if (error) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!vehiculos) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando stock real…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted)" }}>{vehiculos.length} vehículos en stock</p>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar marca o modelo…"
          className="rounded-lg border px-3 py-1.5 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        />
      </div>
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {filtrados.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <p className="font-medium">
                {nombreVehiculo(v)} {v.anio ?? ""}
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {v.es_cero ? "0km" : v.km != null ? `${v.km.toLocaleString("es-AR")} km` : "Km s/d"}
                {v.condicion ? ` · ${v.condicion}` : ""}
              </p>
            </div>
            <p className="font-semibold" style={{ color: "var(--dorado)" }}>
              {formatearMoneda(v.precio)}
            </p>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            Sin resultados para &quot;{filtro}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
