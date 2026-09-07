"use client";

// El ojito para ver u ocultar lo que se está tipeando. Abierto = se ve;
// cerrado (tachado) = está oculto.
export default function OjoPassword({
  visible,
  onAlternar,
}: {
  visible: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
      title={visible ? "Ocultar contraseña" : "Ver contraseña"}
      className="absolute right-2 top-1/2 -translate-y-1/2"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
          stroke="var(--muted)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.8" stroke="var(--muted)" strokeWidth="1.6" />
        {/* La barra tachada aparece cuando está oculta. */}
        {!visible && (
          <path d="M4 20 20 4" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
