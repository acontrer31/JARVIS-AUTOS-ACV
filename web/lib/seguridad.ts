import { supabase } from "@/lib/supabase";

// Mismos valores que el check `perfiles_rol_check` del esquema.
export const ROLES = ["admin", "vendedor"] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
};

export interface Usuario {
  id: string;
  nombre: string | null;
  rol: Rol;
}

export interface EntradaAuditoria {
  id: number;
  tabla: string;
  operacion: "INSERT" | "UPDATE" | "DELETE";
  registro_id: string | null;
  usuario_id: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  creado_en: string;
}

export async function miPerfil(): Promise<Usuario> {
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion) throw errorSesion;
  if (!sesion.user) throw new Error("No hay sesión activa.");

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, rol")
    .eq("id", sesion.user.id)
    .single();
  if (error) throw error;
  return data as Usuario;
}

export async function cargarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("perfiles").select("id, nombre, rol").order("nombre");
  if (error) throw error;
  return (data ?? []) as Usuario[];
}

// Solo un admin puede hacerlo: la política "administrar perfiles de mi agencia"
// rechaza el update si quien lo pide no lo es. La UI igual esconde el control,
// pero la que manda es la base.
export async function cambiarRol(id: string, rol: Rol): Promise<void> {
  const { error } = await supabase.from("perfiles").update({ rol }).eq("id", id);
  if (error) throw error;
}

// Crea un usuario nuevo para la agencia del admin. El alta real la hace el
// endpoint del servidor (app/api/crear-usuario), que es el único que puede usar
// la clave de administración de Supabase; acá solo se le manda el token de la
// sesión para que el servidor verifique que quien pide es admin.
export async function crearUsuario(datos: {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
}): Promise<Usuario> {
  const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
  if (errorSesion) throw errorSesion;
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Volvé a iniciar sesión.");

  const respuesta = await fetch("/api/crear-usuario", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(datos),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo crear el usuario.");
  return cuerpo as Usuario;
}

// El registro de auditoría es de solo lectura desde el cliente (no hay
// políticas de insert/update/delete a propósito) y solo lo ven los admin.
export async function cargarAuditoria(limite = 100): Promise<EntradaAuditoria[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, tabla, operacion, registro_id, usuario_id, datos_antes, datos_despues, creado_en")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as unknown as EntradaAuditoria[];
}

// Campos que realmente cambiaron en un UPDATE. Sirve para que el registro diga
// "cambió el precio" en vez de volcar dos JSON enteros que nadie lee.
export function camposCambiados(entrada: EntradaAuditoria): string[] {
  const { datos_antes: antes, datos_despues: despues } = entrada;
  if (!antes || !despues) return [];
  return Object.keys(despues).filter(
    (campo) => JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo])
  );
}

// Etiqueta legible de la fila afectada, sacada del propio JSON auditado: el
// nombre del cliente o la marca/modelo del vehículo, según la tabla.
export function describirRegistro(entrada: EntradaAuditoria): string {
  const datos = entrada.datos_despues ?? entrada.datos_antes;
  if (!datos) return "";
  const texto = (campo: string) => (typeof datos[campo] === "string" ? (datos[campo] as string) : "");
  const nombre = [texto("marca"), texto("modelo"), texto("version")].filter(Boolean).join(" ");
  return nombre || texto("nombre") || texto("tipo") || "";
}
