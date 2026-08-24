"use client";

import { useEffect, useState } from "react";
import {
  ETIQUETA_ROL,
  ROLES,
  cambiarRol,
  cargarUsuarios,
  miPerfil,
  type Rol,
  type Usuario,
} from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";

export default function AdministracionWorkspace() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [yo, setYo] = useState<Usuario | null>(null);
  const [error, setError] = useState("");

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

  if (error && !usuarios) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!usuarios || !yo) return <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>Cargando usuarios…</p>;

  const esAdmin = yo.rol === "admin";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"} en la agencia
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

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

      <div className="rounded-lg border p-3 text-[0.7rem]" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
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
          Los usuarios nuevos se crean desde Supabase (Authentication → Users); acá se les asigna el rol.
        </p>
      </div>
    </div>
  );
}
