"use client";

import { useState } from "react";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  type EstadoVehiculo,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/vehiculos";

// Validación en el cliente contra los MISMOS checks que tiene la base
// (vehiculos_precio_check, vehiculos_km_check, vehiculos_costo_interno_check,
// vehiculos_valor_tabla_dnrpa_check). No reemplaza a la base — Postgres sigue
// siendo la autoridad — pero evita el viaje de ida y vuelta para un error obvio.
function validar(v: VehiculoInput): string {
  if (!v.marca.trim()) return "La marca es obligatoria.";
  if (!v.modelo.trim()) return "El modelo es obligatorio.";
  const noNegativos: [string, number | null][] = [
    ["El precio", v.precio],
    ["Los km", v.km],
    ["El valor de tabla DNRPA", v.valor_tabla_dnrpa],
  ];
  for (const [etiqueta, valor] of noNegativos) {
    if (valor != null && valor < 0) return `${etiqueta} no puede ser negativo.`;
  }
  if (v.anio != null && (v.anio < 1900 || v.anio > 2100)) return "El año no parece válido.";
  return "";
}

const estiloCampo = {
  borderColor: "var(--border)",
  background: "var(--background)",
} as const;

function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

export default function VehiculoForm({
  inicial,
  costoInicial,
  puedeVerCosto,
  onGuardar,
  onCancelar,
}: {
  inicial: VehiculoInput | Vehiculo;
  // El costo interno viaja aparte del resto del vehículo porque vive en otra
  // tabla (`vehiculo_costos`), con su propia política RLS solo para admin.
  costoInicial: number | null;
  puedeVerCosto: boolean;
  onGuardar: (datos: VehiculoInput, costo: number | null) => Promise<void>;
  onCancelar: () => void;
}) {
  const [v, setV] = useState<VehiculoInput>(() => {
    const { ...resto } = inicial as Vehiculo;
    delete (resto as Partial<Vehiculo>).id;
    return resto as VehiculoInput;
  });
  const [costo, setCosto] = useState<number | null>(costoInicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function set<K extends keyof VehiculoInput>(campo: K, valor: VehiculoInput[K]) {
    setV((prev) => ({ ...prev, [campo]: valor }));
  }

  // Un input numérico vacío es "sin dato" (null), no 0 — la diferencia importa:
  // 0 km es un auto nuevo, sin dato es que no se sabe.
  function setNumero(campo: keyof VehiculoInput, texto: string) {
    const limpio = texto.trim();
    set(campo, (limpio === "" ? null : Number(limpio)) as VehiculoInput[typeof campo]);
  }

  function setTexto(campo: keyof VehiculoInput, texto: string) {
    set(campo, (texto.trim() === "" ? null : texto) as VehiculoInput[typeof campo]);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validar(v);
    if (problema) {
      setError(problema);
      return;
    }
    if (costo != null && costo < 0) {
      setError("El costo interno no puede ser negativo.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar(v, puedeVerCosto ? costo : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Marca *">
          <input className={input} style={estiloCampo} value={v.marca} onChange={(e) => set("marca", e.target.value)} />
        </Campo>
        <Campo etiqueta="Modelo *">
          <input className={input} style={estiloCampo} value={v.modelo} onChange={(e) => set("modelo", e.target.value)} />
        </Campo>
        <Campo etiqueta="Versión">
          <input className={input} style={estiloCampo} value={v.version ?? ""} onChange={(e) => setTexto("version", e.target.value)} />
        </Campo>
        <Campo etiqueta="Dominio">
          <input className={input} style={estiloCampo} value={v.dominio ?? ""} onChange={(e) => setTexto("dominio", e.target.value)} />
        </Campo>
        <Campo etiqueta="Año">
          <input type="number" className={input} style={estiloCampo} value={v.anio ?? ""} onChange={(e) => setNumero("anio", e.target.value)} />
        </Campo>
        <Campo etiqueta="Kilómetros">
          <input type="number" min={0} className={input} style={estiloCampo} value={v.km ?? ""} onChange={(e) => setNumero("km", e.target.value)} />
        </Campo>
        <Campo etiqueta="Precio de venta">
          <input type="number" min={0} className={input} style={estiloCampo} value={v.precio ?? ""} onChange={(e) => setNumero("precio", e.target.value)} />
        </Campo>
        {puedeVerCosto && (
          <Campo etiqueta="Costo interno (solo administradores)">
            <input
              type="number"
              min={0}
              className={input}
              style={estiloCampo}
              value={costo ?? ""}
              onChange={(e) => {
                const t = e.target.value.trim();
                setCosto(t === "" ? null : Number(t));
              }}
            />
          </Campo>
        )}
        <Campo etiqueta="Estado">
          <select
            className={input}
            style={estiloCampo}
            value={v.estado}
            onChange={(e) => set("estado", e.target.value as EstadoVehiculo)}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Condición">
          <input className={input} style={estiloCampo} placeholder="Agencia / Consignación" value={v.condicion ?? ""} onChange={(e) => setTexto("condicion", e.target.value)} />
        </Campo>
        <Campo etiqueta="Motor">
          <input className={input} style={estiloCampo} value={v.motor ?? ""} onChange={(e) => setTexto("motor", e.target.value)} />
        </Campo>
        <Campo etiqueta="Caja">
          <input className={input} style={estiloCampo} value={v.caja ?? ""} onChange={(e) => setTexto("caja", e.target.value)} />
        </Campo>
        <Campo etiqueta="Tracción">
          <input className={input} style={estiloCampo} value={v.traccion ?? ""} onChange={(e) => setTexto("traccion", e.target.value)} />
        </Campo>
        <Campo etiqueta="Carrocería">
          <select className={input} style={estiloCampo} value={v.carroceria ?? ""} onChange={(e) => setTexto("carroceria", e.target.value)}>
            <option value="">Sin especificar</option>
            <option value="pickup">Pickup</option>
            <option value="suv">SUV</option>
            <option value="sedan">Sedán</option>
            <option value="hatch">Hatch</option>
          </select>
        </Campo>
        <Campo etiqueta="Valor tabla DNRPA">
          <input type="number" min={0} className={input} style={estiloCampo} value={v.valor_tabla_dnrpa ?? ""} onChange={(e) => setNumero("valor_tabla_dnrpa", e.target.value)} />
        </Campo>
      </div>

      <Campo etiqueta="Equipamiento (uno por línea)">
        <textarea
          rows={3}
          className={input}
          style={estiloCampo}
          value={v.specs.join("\n")}
          onChange={(e) => set("specs", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        />
      </Campo>

      <Campo etiqueta="Notas internas">
        <textarea rows={2} className={input} style={estiloCampo} value={v.notas ?? ""} onChange={(e) => setTexto("notas", e.target.value)} />
      </Campo>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.es_cero} onChange={(e) => set("es_cero", e.target.checked)} />
          0 km
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.destacado} onChange={(e) => set("destacado", e.target.checked)} />
          Destacado
        </label>
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Las fotos todavía se cargan como archivos en <code>/images/&lt;dominio&gt;/</code> — subirlas desde
        acá necesita un bucket de Storage (ver <code>docs/phases/pendientes.md</code>).
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "#0E4D3C" }}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
