"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// Confirmación antes de actuar, para toda la app. Un solo modal montado una vez
// en la página; cualquier módulo pide la confirmación con:
//
//   if (!(await confirmar({ titulo: "¿Guardar los cambios?" }))) return;
//
// Se hizo con promesa en vez de callbacks para que el código del módulo se lea
// en el orden en que pasan las cosas, sin partir la función en dos.

export interface OpcionesConfirmacion {
  titulo: string;
  /** Detalle opcional: qué se está por hacer, o qué se pierde. */
  detalle?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** "peligro" pinta el botón en rojo. Para borrar. */
  tono?: "normal" | "peligro";
}

type Pedido = OpcionesConfirmacion & { resolver: (valor: boolean) => void };

const Contexto = createContext<((o: OpcionesConfirmacion) => Promise<boolean>) | null>(null);

export function useConfirmar() {
  const confirmar = useContext(Contexto);
  if (!confirmar) {
    throw new Error("useConfirmar() necesita estar dentro de <ProveedorConfirmacion>.");
  }
  return confirmar;
}

export function ProveedorConfirmacion({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  // El pedido en curso también en una ref: al cerrar hay que resolver la promesa
  // sí o sí, incluso si el estado ya se limpió. Una promesa que nunca resuelve
  // deja al módulo esperando para siempre.
  const pendiente = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback((opciones: OpcionesConfirmacion) => {
    return new Promise<boolean>((resolver) => {
      // Si ya había una confirmación abierta, se la cierra en "no" antes de
      // abrir la nueva. Sin esto su promesa quedaba sin resolver nunca y quien
      // la estaba esperando se colgaba en silencio.
      pendiente.current?.(false);
      pendiente.current = resolver;
      setPedido({ ...opciones, resolver });
    });
  }, []);

  const cerrar = useCallback((valor: boolean) => {
    pendiente.current?.(valor);
    pendiente.current = null;
    setPedido(null);
  }, []);

  const valor = useMemo(() => confirmar, [confirmar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {pedido && <Dialogo pedido={pedido} onCerrar={cerrar} />}
    </Contexto.Provider>
  );
}

function Dialogo({ pedido, onCerrar }: { pedido: Pedido; onCerrar: (valor: boolean) => void }) {
  const peligro = pedido.tono === "peligro";
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      onClick={() => onCerrar(false)}
      onKeyDown={(e) => e.key === "Escape" && onCerrar(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-5"
        style={{ borderColor: peligro ? "#c86a6a" : "var(--dorado)", background: "var(--panel)" }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={pedido.titulo}
      >
        <p className="text-sm font-semibold">{pedido.titulo}</p>
        {pedido.detalle && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {pedido.detalle}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onCerrar(false)}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {pedido.textoCancelar ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => onCerrar(true)}
            autoFocus
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={
              peligro
                ? { background: "#c86a6a", color: "#fff" }
                : { background: "var(--dorado)", color: "var(--verde-core)" }
            }
          >
            {pedido.textoConfirmar ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
