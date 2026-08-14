"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import JarvisCore, { type EstadoJarvis } from "@/components/JarvisCore";
import ModuleWorkspace from "@/components/ModuleWorkspace";
import type { ModuloId } from "@/lib/modules";

export default function Home() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [agencia, setAgencia] = useState<string | null>(null);
  const [moduloActivo, setModuloActivo] = useState<ModuloId | null>(null);
  const [estado, setEstado] = useState<EstadoJarvis>("standby");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("perfiles")
      .select("agencia_id, agencias(nombre)")
      .single()
      .then(({ data }) => {
        const nombreAgencia = (data as { agencias?: { nombre?: string } | null } | null)?.agencias?.nombre;
        setAgencia(nombreAgencia ?? null);
      });
  }, [session]);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setCargando(false);
  }

  function activarModulo(id: ModuloId) {
    setEstado("activando");
    setModuloActivo(id);
    window.setTimeout(() => setEstado("trabajando"), 200);
  }

  function cerrarModulo() {
    setModuloActivo(null);
    setEstado("standby");
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6">
      {session === null && (
        <p className="mt-20 text-sm" style={{ color: "var(--muted)" }}>
          Verificando sesión…
        </p>
      )}

      {session === false && (
        <form onSubmit={iniciarSesion} className="mt-20 flex w-72 flex-col gap-3">
          <h1 className="mb-2 text-center text-sm tracking-[0.25em]" style={{ color: "var(--dorado)" }}>
            JARVIS CORE
          </h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Ingresá con tu cuenta de agencia.
          </p>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            required
          />
          <input
            type="password"
            placeholder="contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            required
          />
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg border py-2 text-sm font-semibold transition disabled:opacity-50"
            style={{ borderColor: "var(--dorado)", color: "var(--dorado)" }}
          >
            {cargando ? "INGRESANDO…" : "INGRESAR"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {session === true && (
        <>
          <div className="flex w-full max-w-3xl items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
            <span>{agencia ?? "…"}</span>
            <button onClick={() => supabase.auth.signOut()} className="underline">
              cerrar sesión
            </button>
          </div>
          <JarvisCore estado={estado} moduloActivo={moduloActivo} onActivarModulo={activarModulo} />
          {moduloActivo && <ModuleWorkspace moduloId={moduloActivo} onCerrar={cerrarModulo} />}
        </>
      )}
    </div>
  );
}
