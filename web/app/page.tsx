"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Página de prueba de la Fase 0: no es una pantalla de producto, es la
// verificación end-to-end de que Next.js habla con el mismo proyecto de
// Supabase que ya usa el sitio estático (RLS exige sesión real, así que
// hace falta loguearse para ver el conteo — igual que en index.html hoy).
export default function Home() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [agencia, setAgencia] = useState<string | null>(null);
  const [totalVehiculos, setTotalVehiculos] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("agencia_id, agencias(nombre)")
        .single();
      const nombreAgencia = (perfil as { agencias?: { nombre?: string } | null } | null)?.agencias
        ?.nombre;
      setAgencia(nombreAgencia ?? null);
      const { count } = await supabase
        .from("vehiculos")
        .select("*", { count: "exact", head: true });
      setTotalVehiculos(count ?? 0);
    })();
  }, [session]);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setCargando(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-8 font-mono text-zinc-100">
      <h1 className="text-lg tracking-widest text-cyan-400">JARVIS AUTO — FASE 0 (PRUEBA DE CONEXIÓN)</h1>

      {session === null && <p className="text-zinc-400">Verificando sesión…</p>}

      {session === false && (
        <form onSubmit={iniciarSesion} className="flex w-72 flex-col gap-3">
          <p className="text-xs text-zinc-400">
            Iniciá sesión con la misma cuenta del panel actual para confirmar que esta app nueva lee
            los datos reales de Supabase (no hay nada mockeado).
          </p>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
            required
          />
          <input
            type="password"
            placeholder="contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
            required
          />
          <button
            type="submit"
            disabled={cargando}
            className="rounded border border-cyan-400 py-2 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-400/10 disabled:opacity-50"
          >
            {cargando ? "INGRESANDO…" : "INGRESAR"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {session === true && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-zinc-400">Agencia:</p>
          <p className="text-xl">{agencia ?? "…"}</p>
          <p className="mt-4 text-sm text-zinc-400">Vehículos reales en stock:</p>
          <p className="text-4xl text-cyan-400">{totalVehiculos ?? "…"}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-xs text-zinc-500 underline hover:text-zinc-300"
          >
            cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
