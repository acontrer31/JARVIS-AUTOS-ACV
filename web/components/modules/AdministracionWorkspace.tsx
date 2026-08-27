"use client";

import { useEffect, useState } from "react";
import {
  ETIQUETA_ROL,
  ROLES,
  cambiarRol,
  cargarUsuarios,
  crearUsuario,
  miPerfil,
  type Rol,
  type Usuario,
} from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";

export default function AdministracionWorkspace() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [yo, setYo] = useState<Usuario | null>(null);
  const [error, setError] = useState("");

  // Formulario de alta de usuario (solo admin).
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevaPass, setNuevaPass] = useState("");
  const [nuevoRol, setNuevoRol] = useState<Rol>("vendedor");
  const [guardando, setGuardando] = useState(false);

  // El recuadro de ayuda de roles arranca colapsado como un botón "Info": se
  // abre al pasar el cursor (group-hover) y, para pantallas táctiles sin hover,
  // también al tocarlo (infoAbierta).
  const [infoAbierta, setInfoAbierta] = useState(false);

  useEffect(() => {
    Promise.all([cargarUsuarios(), miPerfil()])
      .then(([gente, perfil]) => {
        setUsuarios(gente);
        setYo(perfil);
      })
      .catch((err) =>
        setError(
          "No se pudieron cargar los usuarios: " + mensajeDeError(err)
        )
      );
  }, []);

  async function cambiar(u: Usuario, rol: Rol) {
    // Optimista: se revierte si la base rechaza (por ejemplo, si quien lo pide
    // dejó de ser admin entre que cargó la pantalla y tocó el selector).
    const previo = u.rol;
    setUsuarios((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, rol } : x)));
    try {
      await cambiarRol(u.id, rol);
      if (yo?.id === u.id) setYo({ ...yo, rol });
    } catch {
      setUsuarios((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, rol: previo } : x)));
      setError("No se pudo cambiar el rol.");
    }
  }

  async function altaUsuario(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const creado = await crearUsuario({
        nombre: nuevoNombre,
        email: nuevoEmail,
        password: nuevaPass,
        rol: nuevoRol,
      });
      setUsuarios((prev) => [...(prev ?? []), creado]);
      setNuevoNombre("");
      setNuevoEmail("");
      setNuevaPass("");
      setNuevoRol("vendedor");
      setCreando(false);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  if (error && !usuarios) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!usuarios || !yo) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando usuarios…</p>;

  const esAdmin = yo.rol === "admin";
  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"} en la agencia
        </p>
        {esAdmin && !creando && (
          // Por defecto es solo un botón redondo con "+"; al pasar el cursor se
          // ensancha y aparece "Nuevo usuario". Mismo patrón que el botón
          // Editar de la ficha del vehículo. En pantallas táctiles (sin hover)
          // el "+" sigue siendo clickeable.
          <button
            type="button"
            onClick={() => setCreando(true)}
            title="Nuevo usuario"
            aria-label="Nuevo usuario"
            className="group flex h-8 w-8 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 hover:w-40"
            style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
          >
            <span className="text-base leading-none">+</span>
            <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Nuevo usuario
            </span>
          </button>
        )}
      </div>

      {esAdmin && creando && (
        <form onSubmit={altaUsuario} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--dorado)" }}>
          <p className="text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Nuevo usuario</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} style={estiloCampo} placeholder="Nombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
            <select className={input} style={estiloCampo} value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
              ))}
            </select>
            <input type="email" className={input} style={estiloCampo} placeholder="Email" value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} />
            <input type="password" className={input} style={estiloCampo} placeholder="Contraseña (mín. 8)" value={nuevaPass} onChange={(e) => setNuevaPass(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreando(false)} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--dorado)", color: "#0E4D3C" }}
            >
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      )}

      {error && usuarios && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <p className="font-medium">
                {u.nombre ?? "Sin nombre"}
                {u.id === yo.id && <span style={{ color: "var(--muted)" }}> · vos</span>}
              </p>
            </div>
            {esAdmin ? (
              <select
                value={u.rol}
                onChange={(e) => cambiar(u, e.target.value as Rol)}
                aria-label={`Rol de ${u.nombre ?? "usuario"}`}
                className="rounded-md border px-1.5 py-1 text-xs outline-none"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETA_ROL[r]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {ETIQUETA_ROL[u.rol]}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* La ayuda de roles queda colapsada tras un botón "Info" (colores
          invertidos: fondo verde, letras doradas). Se despliega al pasar el
          cursor, y al tocarlo en pantallas táctiles. */}
      <div className="group relative self-start">
        <button
          type="button"
          onClick={() => setInfoAbierta((v) => !v)}
          aria-expanded={infoAbierta}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--verde-core)", color: "var(--dorado)" }}
        >
          Info
        </button>
        <div
          className={`${infoAbierta ? "block" : "hidden group-hover:block"} absolute bottom-full left-0 z-10 mb-2 w-80 max-w-[85vw] rounded-lg border p-3 text-[0.7rem] shadow-lg`}
          style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--muted)" }}
        >
          <p className="mb-1">Qué puede hacer cada rol:</p>
          <p>
            <strong>Administrador</strong>: todo — dar de alta y eliminar vehículos, borrar clientes y
            operaciones, cambiar roles y ver el registro de auditoría.
          </p>
          <p>
            <strong>Vendedor</strong>: trabajar el día a día — cargar y editar clientes, registrar
            interacciones y operaciones, y actualizar vehículos (por ejemplo marcarlos como reservados),
            pero sin dar de alta ni eliminar stock.
          </p>
          <p className="mt-1">
            Con &quot;+ Nuevo usuario&quot; das de alta gente de tu agencia acá mismo. Quedan vinculados a tu
            agencia automáticamente y entran con el email y la contraseña que les pongas.
          </p>
        </div>
      </div>
    </div>
  );
}
