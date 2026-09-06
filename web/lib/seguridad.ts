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

// Un ingreso o una salida del sistema. Las filas las escribe /api/sesion con la
// clave de servicio: desde el navegador la tabla es de solo lectura.
export interface EventoSesion {
  id: number;
  usuario_id: string;
  tipo: "ingreso" | "salida";
  ip: string | null;
  dispositivo: string | null;
  creado_en: string;
}

export interface FiltroAuditoria {
  usuarioId?: string;
  tabla?: string;
  operacion?: EntradaAuditoria["operacion"];
  /** Fecha AAAA-MM-DD inclusive. */
  desde?: string;
  /** Fecha AAAA-MM-DD inclusive: se toma hasta el final de ese día. */
  hasta?: string;
  limite?: number;
}

export async function miPerfil(): Promise<Usuario> {
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion) throw errorSesion;
  if (!sesion.user) throw new Error("No hay sesión activa.");

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, rol")
    .eq("id", sesion.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // El usuario existe en Auth pero no tiene perfil vinculado a una agencia.
    // Sin eso no puede usar nada (todas las políticas RLS dependen del perfil).
    throw new Error(
      "Tu usuario no tiene un perfil vinculado a ninguna agencia. Hay que crearlo en Supabase (ver README, sección de Supabase)."
    );
  }
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
// Los filtros van en la consulta, no en el navegador: filtrar acá sobre las
// últimas 100 filas daría una respuesta falsa apenas el log crezca.
export async function cargarAuditoria(filtros: FiltroAuditoria = {}): Promise<EntradaAuditoria[]> {
  let consulta = supabase
    .from("audit_log")
    .select("id, tabla, operacion, registro_id, usuario_id, datos_antes, datos_despues, creado_en");

  if (filtros.usuarioId) consulta = consulta.eq("usuario_id", filtros.usuarioId);
  if (filtros.tabla) consulta = consulta.eq("tabla", filtros.tabla);
  if (filtros.operacion) consulta = consulta.eq("operacion", filtros.operacion);
  if (filtros.desde) consulta = consulta.gte("creado_en", filtros.desde);
  // `hasta` es un día entero: sin esto, "hasta el 5" dejaría afuera todo lo del
  // día 5 salvo lo ocurrido exactamente a las 00:00.
  if (filtros.hasta) consulta = consulta.lt("creado_en", finDelDia(filtros.hasta));

  const { data, error } = await consulta
    .order("creado_en", { ascending: false })
    .limit(filtros.limite ?? 300);
  if (error) throw error;
  return (data ?? []) as unknown as EntradaAuditoria[];
}

// El día siguiente a las 00:00, para usar con "<" y así incluir todo el día.
function finDelDia(dia: string): string {
  const [anio, mes, d] = dia.split("-").map(Number);
  const siguiente = new Date(anio, mes - 1, d + 1);
  const mm = String(siguiente.getMonth() + 1).padStart(2, "0");
  const dd = String(siguiente.getDate()).padStart(2, "0");
  return `${siguiente.getFullYear()}-${mm}-${dd}`;
}

// Historial de conexiones de la agencia. Misma política que el log: solo admin.
export async function cargarConexiones(filtros: FiltroAuditoria = {}): Promise<EventoSesion[]> {
  let consulta = supabase
    .from("eventos_sesion")
    .select("id, usuario_id, tipo, ip, dispositivo, creado_en");

  if (filtros.usuarioId) consulta = consulta.eq("usuario_id", filtros.usuarioId);
  if (filtros.desde) consulta = consulta.gte("creado_en", filtros.desde);
  if (filtros.hasta) consulta = consulta.lt("creado_en", finDelDia(filtros.hasta));

  const { data, error } = await consulta
    .order("creado_en", { ascending: false })
    .limit(filtros.limite ?? 200);
  if (error) throw error;
  return (data ?? []) as unknown as EventoSesion[];
}

// Deja constancia de un ingreso o una salida. Lo escribe el servidor, que es el
// único que puede: acá solo se avisa. Nunca lanza — si el registro falla, el
// usuario tiene que poder entrar o salir igual.
export async function registrarEventoSesion(tipo: "ingreso" | "salida"): Promise<void> {
  try {
    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;
    if (!token) return;
    await fetch("/api/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo }),
      // La salida se dispara junto con el cierre de sesión: keepalive hace que
      // el pedido llegue aunque la página se esté descargando.
      keepalive: true,
    });
  } catch {
    // Silencio a propósito.
  }
}

// Campos que realmente cambiaron en un UPDATE, con su valor antes y después.
// Saber que "cambió el precio" no alcanza para detectar el error humano; lo que
// se ve acá es "precio: 1.500.000 → 15.000.000", que es lo que lo delata.
export interface CampoCambiado {
  campo: string;
  antes: string;
  despues: string;
}

export function valoresCambiados(entrada: EntradaAuditoria): CampoCambiado[] {
  const { datos_antes: antes, datos_despues: despues } = entrada;
  if (!antes || !despues) return [];
  return Object.keys(despues)
    .filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo]))
    .map((campo) => ({
      campo,
      antes: mostrarValor(antes[campo]),
      despues: mostrarValor(despues[campo]),
    }));
}

function mostrarValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vacío";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (typeof valor === "number") return valor.toLocaleString("es-AR");
  if (typeof valor === "string") return valor.length > 80 ? valor.slice(0, 80) + "…" : valor;
  return JSON.stringify(valor).slice(0, 80);
}

export interface ResumenUsuario {
  usuarioId: string | null;
  altas: number;
  cambios: number;
  bajas: number;
  total: number;
}

// Cuánto hizo cada persona en el período consultado, de más activo a menos.
export function resumenPorUsuario(entradas: EntradaAuditoria[]): ResumenUsuario[] {
  const porUsuario = new Map<string, ResumenUsuario>();
  for (const e of entradas) {
    const clave = e.usuario_id ?? "sistema";
    const fila =
      porUsuario.get(clave) ??
      { usuarioId: e.usuario_id, altas: 0, cambios: 0, bajas: 0, total: 0 };
    if (e.operacion === "INSERT") fila.altas++;
    else if (e.operacion === "UPDATE") fila.cambios++;
    else fila.bajas++;
    fila.total++;
    porUsuario.set(clave, fila);
  }
  return [...porUsuario.values()].sort((a, b) => b.total - a.total);
}

// CSV para abrir en Excel. Separador ';' y BOM al principio: es lo que espera
// el Excel en español, sin eso las tildes salen rotas y todo cae en una columna.
export function auditoriaCSV(
  entradas: EntradaAuditoria[],
  nombreDe: (id: string | null) => string
): string {
  const escapar = (texto: string) => `"${texto.replace(/"/g, '""')}"`;
  const filas = [["Fecha y hora", "Usuario", "Acción", "Tabla", "Registro", "Cambios"]];
  for (const e of entradas) {
    const cambios = valoresCambiados(e)
      .map((c) => `${c.campo}: ${c.antes} -> ${c.despues}`)
      .join(" | ");
    filas.push([
      new Date(e.creado_en).toLocaleString("es-AR"),
      nombreDe(e.usuario_id),
      e.operacion,
      e.tabla,
      describirRegistro(e),
      cambios,
    ]);
  }
  return "﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n");
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
