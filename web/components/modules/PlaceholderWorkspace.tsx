import type { Modulo } from "@/lib/modules";

// Ningún módulo sin datos reales simula tener contenido — este aviso siempre
// es honesto sobre lo que falta, en vez de mostrar información inventada o
// un botón que no hace nada sin explicarlo ("no fake buttons").
export default function PlaceholderWorkspace({ modulo }: { modulo: Modulo }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span
        className="rounded-full px-3 py-1 text-[0.65rem] tracking-widest"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
      >
        PRÓXIMAMENTE
      </span>
      <p className="max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        El módulo <strong style={{ color: "var(--foreground)" }}>{modulo.label}</strong> ({modulo.descripcion}) todavía
        no tiene datos ni lógica reales conectados. Se suma en una fase futura del roadmap, cuando tenga
        información real detrás.
      </p>
    </div>
  );
}
