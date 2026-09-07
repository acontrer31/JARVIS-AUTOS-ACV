"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { miPerfil, registrarEventoSesion, type Usuario } from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";
import { REGLA_PASSWORD, validarPassword } from "@/lib/password";
import { useConfirmar } from "@/lib/confirmar";
import OjoPassword from "@/components/OjoPassword";

// Menú de la cuenta: quién está conectado, con qué rol, cambiar la contraseña
// y —al final, separado del resto— cerrar sesión.
export default function MenuUsuario({ agencia }: { agencia?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const confirmar = useConfirmar();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    miPerfil()
      .then(setPerfil)
      .catch(() => {}); // el menú sirve igual sin el rol
  }, []);

  // Escape cierra el menú.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarPassword(password);
    if (problema) {
      setError(problema);
      return;
    }
    if (!(await confirmar({ titulo: "¿Cambiar tu contraseña?", textoConfirmar: "Cambiar" }))) return;
    setError("");
    setGuardando(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setListo(true);
      setPassword("");
      setCambiando(false);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function salir() {
    if (!(await confirmar({ titulo: "¿Cerrar sesión?", textoConfirmar: "Cerrar sesión" }))) return;
    // Primero el registro, después el cierre: sin sesión no hay token con qué
    // autenticar el pedido.
    await registrarEventoSesion("salida");
    await supabase.auth.signOut();
  }

  const input = "w-full rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    // Fijo en la esquina superior izquierda, por encima de todo: es el acceso
    // a la cuenta y tiene que estar siempre en el mismo lugar.
    <div className="fixed left-3 top-3 z-50">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Menú de la cuenta"
        aria-expanded={abierto}
        className="flex flex-col justify-center gap-[3px] p-1"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-[2px] w-5 rounded" style={{ background: "var(--dorado)" }} />
        ))}
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar tocando afuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} role="presentation" />
          <div
            className="absolute left-0 z-50 mt-2 w-64 rounded-xl border p-3"
            style={{ borderColor: "var(--dorado)", background: "var(--panel)" }}
          >
            {/* Primero: quién está conectado. */}
            <p className="text-sm font-medium break-all">{email ?? "…"}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {perfil?.nombre ? `${perfil.nombre} · ` : ""}
              {perfil ? (perfil.rol === "admin" ? "Administrador" : "Vendedor") : "…"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "#7fb069" }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#7fb069" }} />
              Conectado{agencia ? ` · ${agencia}` : ""}
            </p>

            <div className="my-3 h-px" style={{ background: "var(--border)" }} />

            {listo && (
              <p className="mb-2 text-xs" style={{ color: "var(--dorado)" }}>
                Contraseña actualizada ✓
              </p>
            )}

            {!cambiando ? (
              <button
                type="button"
                onClick={() => {
                  setCambiando(true);
                  setListo(false);
                  setError("");
                }}
                className="w-full rounded-lg border px-2 py-1.5 text-left text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                Cambiar contraseña
              </button>
            ) : (
              <form onSubmit={cambiarPassword} className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type={verPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña nueva"
                    maxLength={10}
                    autoFocus
                    className={input + " pr-8"}
                    style={estiloCampo}
                  />
                  <OjoPassword visible={verPassword} onAlternar={() => setVerPassword((v) => !v)} />
                </div>
                <p className="text-[0.65rem]" style={{ color: "var(--muted)" }}>
                  {REGLA_PASSWORD}
                </p>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCambiando(false);
                      setPassword("");
                      setError("");
                    }}
                    className="rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
                  >
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            )}

            <div className="my-3 h-px" style={{ background: "var(--border)" }} />

            {/* Último, separado del resto para no apretarlo sin querer. */}
            <button
              type="button"
              onClick={salir}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs"
              style={{ color: "#c86a6a" }}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
