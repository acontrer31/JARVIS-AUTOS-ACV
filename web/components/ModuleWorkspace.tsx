"use client";

import { MODULOS, type ModuloId } from "@/lib/modules";
import VehiculosWorkspace from "@/components/modules/VehiculosWorkspace";
import FinanciacionWorkspace from "@/components/modules/FinanciacionWorkspace";
import ClientesWorkspace from "@/components/modules/ClientesWorkspace";
import TareasWorkspace from "@/components/modules/TareasWorkspace";
import OperacionesWorkspace from "@/components/modules/OperacionesWorkspace";
import CajaWorkspace from "@/components/modules/CajaWorkspace";
import SeguridadWorkspace from "@/components/modules/SeguridadWorkspace";
import AdministracionWorkspace from "@/components/modules/AdministracionWorkspace";
import PlaceholderWorkspace from "@/components/modules/PlaceholderWorkspace";

export default function ModuleWorkspace({
  moduloId,
  onCerrar,
}: {
  moduloId: ModuloId;
  onCerrar: () => void;
}) {
  const modulo = MODULOS.find((m) => m.id === moduloId);
  if (!modulo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        className="mt-8 w-full max-w-2xl rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: "var(--dorado)", background: "var(--panel)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[0.2em]">{modulo.label.toUpperCase()}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-lg leading-none"
            style={{ color: "var(--muted)" }}
          >
            ×
          </button>
        </div>

        {modulo.id === "vehiculos" && <VehiculosWorkspace />}
        {modulo.id === "financiacion" && <FinanciacionWorkspace />}
        {modulo.id === "clientes" && <ClientesWorkspace />}
        {modulo.id === "tareas" && <TareasWorkspace />}
        {modulo.id === "operaciones" && <OperacionesWorkspace />}
        {modulo.id === "caja" && <CajaWorkspace />}
        {modulo.id === "seguridad" && <SeguridadWorkspace />}
        {modulo.id === "administracion" && <AdministracionWorkspace />}
        {!modulo.real && <PlaceholderWorkspace modulo={modulo} />}
      </div>
    </div>
  );
}
