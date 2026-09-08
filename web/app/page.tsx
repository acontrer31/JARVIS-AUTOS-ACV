"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import JarvisCore from "@/components/JarvisCore";
import ModuleWorkspace from "@/components/ModuleWorkspace";
import RelojClima from "@/components/RelojClima";
import { registrarEventoSesion } from "@/lib/seguridad";
import { ProveedorConfirmacion } from "@/lib/confirmar";
import MenuUsuario from "@/components/MenuUsuario";
import OjoPassword from "@/components/OjoPassword";
import { mensajeDeError } from "@/lib/errores";
import { pedirRecuperacion, REGLA_PASSWORD, validarPassword } from "@/lib/password";
import type { ModuloId } from "@/lib/modules";

// Qué muestra la pantalla de entrada.
//   entrar    → email + contraseña
//   recuperar → pedir el correo con el enlace
//   enviado   → aviso de que el correo salió
//   nueva     → poner la contraseña nueva (se llega volviendo del correo)
type Pantalla = "entrar" | "recuperar" | "enviado" | "nueva";

export default function Home() {
  const [session, setSession] = useState<boolean | null>(null);
  const [pantalla, setPantalla] = useState<Pantalla>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [verPassword, setVerPassword] = useState(false);
  const [agencia, setAgencia] = useState<string | null>(null);
  const [moduloActivo, setModuloActivo] = useState<ModuloId | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(!!s);
      // El enlace del correo abre la app con una sesión temporal ya iniciada.
      // Sin atender este evento, el usuario entraría derecho al sistema y nunca
      // llegaría a poner la contraseña nueva: se quedaría con la vieja, que es
      // justamente la que no recuerda.
      if (evento === "PASSWORD_RECOVERY") {
        setPantalla("nueva");
        setPassword("");
        setError("");
      }
    });
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
    // Deja constancia en el registro de conexiones. Cubre los ingresos hechos
    // desde esta pantalla: si el navegador retoma una sesión guardada no hubo
    // un ingreso nuevo y no se inventa uno.
    else await registrarEventoSesion("ingreso");
    setCargando(false);
  }

  async function enviarEnlace(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await pedirRecuperacion(email);
      setPantalla("enviado");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function guardarNueva(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarPassword(password);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    setCargando(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      // Queda en el registro de conexiones como cualquier otro ingreso: si
      // alguien recuperó su contraseña, tiene que poder verse cuándo.
      await registrarEventoSesion("ingreso");
      setPassword("");
      setPantalla("entrar");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  const campo = "rounded-lg border px-3 py-2 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--panel)" } as const;
  const boton = "rounded-lg border py-2 text-sm font-semibold transition disabled:opacity-50";
  const estiloBoton = { borderColor: "var(--dorado)", color: "var(--dorado)" } as const;

  // La pantalla de contraseña nueva le gana a la sesión: al volver del correo
  // ya hay sesión (temporal), y sin esta precedencia el sistema se abriría sin
  // haber cambiado nada.
  const enRecuperacion = pantalla === "nueva";

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6">
      {session === null && !enRecuperacion && (
        <p className="mt-20 text-sm" style={{ color: "var(--muted)" }}>
          Verificando sesión…
        </p>
      )}

      {enRecuperacion && (
        <form onSubmit={guardarNueva} className="mt-20 flex w-72 flex-col gap-3">
          <h1 className="mb-2 text-center text-sm tracking-[0.25em]" style={{ color: "var(--dorado)" }}>
            NUEVA CONTRASEÑA
          </h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Elegí la contraseña con la que vas a entrar de ahora en adelante.
          </p>
          <div className="relative">
            <input
              type={verPassword ? "text" : "password"}
              placeholder="contraseña nueva"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${campo} w-full pr-9`}
              style={estiloCampo}
              autoFocus
              required
            />
            <OjoPassword visible={verPassword} onAlternar={() => setVerPassword((v) => !v)} />
          </div>
          <p className="text-[0.65rem]" style={{ color: "var(--muted)" }}>
            {REGLA_PASSWORD}
          </p>
          <button type="submit" disabled={cargando} className={boton} style={estiloBoton}>
            {cargando ? "GUARDANDO…" : "GUARDAR"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {session === false && !enRecuperacion && (
        <div className="mt-20 flex w-72 flex-col gap-3">
          <h1 className="mb-2 text-center text-sm tracking-[0.25em]" style={{ color: "var(--dorado)" }}>
            JARVIS CORE
          </h1>

          {pantalla === "entrar" && (
            <form onSubmit={iniciarSesion} className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Ingresá con tu cuenta de agencia.
              </p>
              <input
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
                style={estiloCampo}
                required
              />
              <div className="relative">
                <input
                  type={verPassword ? "text" : "password"}
                  placeholder="contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${campo} w-full pr-9`}
                  style={estiloCampo}
                  required
                />
                <OjoPassword visible={verPassword} onAlternar={() => setVerPassword((v) => !v)} />
              </div>
              <button type="submit" disabled={cargando} className={boton} style={estiloBoton}>
                {cargando ? "INGRESANDO…" : "INGRESAR"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setPantalla("recuperar");
                  setError("");
                }}
                className="text-center text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          {pantalla === "recuperar" && (
            <form onSubmit={enviarEnlace} className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Poné tu email y te mandamos un enlace para elegir una contraseña nueva.
              </p>
              <input
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
                style={estiloCampo}
                autoFocus
                required
              />
              <button type="submit" disabled={cargando} className={boton} style={estiloBoton}>
                {cargando ? "ENVIANDO…" : "ENVIAR ENLACE"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setPantalla("entrar");
                  setError("");
                }}
                className="text-center text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                Volver
              </button>
            </form>
          )}

          {pantalla === "enviado" && (
            <div className="flex flex-col gap-3">
              {/* Dice "si existe una cuenta" a propósito: confirmar que el email
                  está registrado le serviría a cualquiera para averiguar qué
                  direcciones tienen usuario en el sistema. */}
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Si existe una cuenta con <strong>{email}</strong>, va a llegar un correo con el enlace. Revisá
                también la carpeta de spam.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPantalla("entrar");
                  setError("");
                }}
                className={boton}
                style={estiloBoton}
              >
                VOLVER
              </button>
            </div>
          )}
        </div>
      )}

      {session === true && !enRecuperacion && (
        <ProveedorConfirmacion>
          <RelojClima />
          {/* El menú va fijo arriba a la izquierda; el nombre de la agencia
              queda a la derecha para no chocar con él. */}
          <MenuUsuario agencia={agencia} />
          <div className="flex w-full max-w-3xl items-center justify-end text-xs" style={{ color: "var(--muted)" }}>
            <span>{agencia ?? "…"}</span>
          </div>
          <JarvisCore moduloActivo={moduloActivo} onActivarModulo={setModuloActivo} agencia={agencia} />
          {moduloActivo && <ModuleWorkspace moduloId={moduloActivo} onCerrar={() => setModuloActivo(null)} />}
        </ProveedorConfirmacion>
      )}
    </div>
  );
}
