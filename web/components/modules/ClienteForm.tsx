"use client";

import { useState } from "react";
import {
  ESTADOS_LEAD,
  ETIQUETA_ESTADO_LEAD,
  type Cliente,
  type ClienteInput,
  type EstadoLead,
  type Vendedor,
} from "@/lib/clientes";
import { nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";

// Validación contra los MISMOS checks que tiene la base
// (clientes_estado_lead_check, clientes_presupuesto_check). No reemplaza a
// Postgres, que sigue siendo la autoridad — evita el viaje para un error obvio.
function validar(c: ClienteInput): string {
  if (!c.nombre.trim()) return "El nombre es obligatorio.";
  if (c.presupuesto != null && c.presupuesto < 0) return "El presupuesto no puede ser negativo.";
  if (c.email && !c.email.includes("@")) return "El email no parece válido.";
  return "";
}

const estiloCampo = {
  borderColor: "var(--border)",
  background: "var(--background)",
} as const;

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

export default function ClienteForm({
  inicial,
  vehiculos,
  vendedores,
  onGuardar,
  onCancelar,
}: {
  inicial: ClienteInput | Cliente;
  vehiculos: Vehiculo[];
  vendedores: Vendedor[];
  onGuardar: (datos: ClienteInput) => Promise<void>;
  onCancelar: () => void;
}) {
  const [c, setC] = useState<ClienteInput>(() => {
    const resto = { ...inicial } as Partial<Cliente>;
    delete resto.id;
    delete resto.creado_en;
    return resto as ClienteInput;
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function set<K extends keyof ClienteInput>(campo: K, valor: ClienteInput[K]) {
    setC((prev) => ({ ...prev, [campo]: valor }));
  }

  // Un campo vacío es "sin dato" (null), no un string vacío: la diferencia
  // importa al consultar después ("clientes sin teléfono" tiene que dar bien).
  function setTexto(campo: keyof ClienteInput, texto: string) {
    set(campo, (texto.trim() === "" ? null : texto) as ClienteInput[typeof campo]);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validar(c);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar(c);
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
        <Campo etiqueta="Nombre *">
          <input className={input} style={estiloCampo} value={c.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <input className={input} style={estiloCampo} value={c.telefono ?? ""} onChange={(e) => setTexto("telefono", e.target.value)} />
        </Campo>
        <Campo etiqueta="Email">
          <input type="email" className={input} style={estiloCampo} value={c.email ?? ""} onChange={(e) => setTexto("email", e.target.value)} />
        </Campo>
        <Campo etiqueta="Etapa">
          <select
            className={input}
            style={estiloCampo}
            value={c.estado_lead}
            onChange={(e) => set("estado_lead", e.target.value as EstadoLead)}
          >
            {ESTADOS_LEAD.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_LEAD[e]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Vehículo de interés">
          <select
            className={input}
            style={estiloCampo}
            value={c.vehiculo_interes_id ?? ""}
            onChange={(e) => setTexto("vehiculo_interes_id", e.target.value)}
          >
            <option value="">Sin definir</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {nombreVehiculo(v)} {v.anio ?? ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Presupuesto">
          <input
            type="number"
            min={0}
            className={input}
            style={estiloCampo}
            value={c.presupuesto ?? ""}
            onChange={(e) => {
              const t = e.target.value.trim();
              set("presupuesto", t === "" ? null : Number(t));
            }}
          />
        </Campo>
        <Campo etiqueta="Vendedor asignado">
          <select
            className={input}
            style={estiloCampo}
            value={c.vendedor_id ?? ""}
            onChange={(e) => setTexto("vendedor_id", e.target.value)}
          >
            <option value="">Sin asignar</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre ?? "Sin nombre"}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo etiqueta="Notas">
        <textarea rows={3} className={input} style={estiloCampo} value={c.notas ?? ""} onChange={(e) => setTexto("notas", e.target.value)} />
      </Campo>

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
