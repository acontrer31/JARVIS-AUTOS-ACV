import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Autenticación, autorización y rate limiting para las rutas /api.
//
// Vive acá y no en cada ruta porque durante la auditoría de septiembre de 2026
// se encontró que cada endpoint repetía el mismo bloque de validación con
// variantes, y en dos de ellos faltaba el paso que importaba: el que ata al
// usuario con SU agencia. Tener sesión no es tener permiso.

export interface Llamante {
  usuarioId: string;
  agenciaId: string;
  rol: "admin" | "vendedor";
}

/** El error ya armado para devolver, o el llamante identificado. */
export type Resultado = { error: Response } | { llamante: Llamante; admin: SupabaseClient };

function fallo(mensaje: string, status: number): { error: Response } {
  return {
    error: new Response(JSON.stringify({ error: mensaje }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  };
}

/**
 * Valida el token de sesión y devuelve QUIÉN llama, con su agencia y su rol
 * leídos de la base — nunca de lo que mande el cliente.
 *
 * Devuelve también un cliente con service_role para que la ruta no tenga que
 * volver a crearlo. Ese cliente saltea RLS: solo se usa del lado del servidor.
 */
export async function identificar(request: Request): Promise<Resultado> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return fallo("Faltan variables de Supabase en el servidor (ver .env.example).", 500);
  }

  // El token va en el header y no en la URL: las URLs quedan en logs, en el
  // historial del navegador y en el Referer que se manda a terceros.
  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return fallo("Hace falta iniciar sesión.", 401);

  // getUser verifica la firma contra el servidor de auth. No alcanza con leer
  // el contenido del JWT: cualquiera puede escribir un JWT que diga lo que
  // quiera, lo que no puede es firmarlo.
  const anon = createClient(url, anonKey);
  const { data: sesion, error: errorSesion } = await anon.auth.getUser(token);
  if (errorSesion || !sesion.user) return fallo("Sesión inválida o vencida.", 401);

  const admin = createClient(url, serviceKey);
  const { data: perfil, error: errorPerfil } = await admin
    .from("perfiles")
    .select("agencia_id, rol")
    .eq("id", sesion.user.id)
    .maybeSingle();

  // Un usuario de Auth sin perfil no pertenece a ninguna agencia. No es un
  // usuario del sistema todavía: no puede hacer nada.
  if (errorPerfil) return fallo("No se pudo verificar tu perfil.", 500);
  if (!perfil) return fallo("Tu usuario no tiene un perfil vinculado a ninguna agencia.", 403);

  const fila = perfil as { agencia_id: string; rol: string };
  return {
    llamante: {
      usuarioId: sesion.user.id,
      agenciaId: fila.agencia_id,
      rol: fila.rol === "admin" ? "admin" : "vendedor",
    },
    admin,
  };
}

export function esError(r: Resultado): r is { error: Response } {
  return "error" in r;
}

/**
 * Comprueba que quien llama pertenezca a la agencia dueña de las credenciales
 * de Meta / ElevenLabs.
 *
 * POR QUÉ HACE FALTA: esas credenciales son variables de entorno, una sola
 * cuenta para todo el despliegue. Sin este control, cualquier usuario logueado
 * de CUALQUIER agencia podía publicar en el Facebook real de Alcover o leer las
 * transcripciones de sus conversaciones con clientes. Tener sesión alcanzaba.
 *
 * Cómo se resuelve quién es la dueña, en orden:
 *   1. `AGENCIA_PROPIETARIA` si está configurada — es lo explícito y lo que hay
 *      que usar el día que haya más de una agencia.
 *   2. Si hay UNA sola agencia en la base, es ella. Mantiene el despliegue de
 *      hoy funcionando sin tocar nada en Vercel.
 *   3. Si hay varias y nadie configuró la variable, DENIEGA. Es preferible que
 *      el módulo deje de publicar y alguien lo note, a que una agencia publique
 *      en la cuenta de otra.
 */
export async function esDelTenantConCredenciales(
  admin: SupabaseClient,
  llamante: Llamante
): Promise<{ ok: true } | { error: Response }> {
  const declarada = process.env.AGENCIA_PROPIETARIA;
  if (declarada) {
    return llamante.agenciaId === declarada
      ? { ok: true }
      : fallo("Tu agencia no tiene cuentas conectadas para esta acción.", 403);
  }

  const { count, error } = await admin.from("agencias").select("id", { count: "exact", head: true });
  if (error) return fallo("No se pudo verificar la agencia.", 500);

  if (count === 1) return { ok: true };

  return fallo(
    "Hay más de una agencia y no está definido a cuál pertenecen las cuentas conectadas. " +
      "Configurá AGENCIA_PROPIETARIA en el servidor.",
    403
  );
}

/**
 * Rate limiting compartido entre instancias.
 *
 * El contador vive en Postgres y no en memoria a propósito: en Vercel cada
 * request puede caer en una instancia distinta, así que un contador en memoria
 * limita por instancia y no limita nada. Una sola sentencia atómica del lado de
 * la base (ver `consumir_rate_limit`) es lo que hace que dos requests
 * simultáneas no se pisen.
 *
 * Si la base falla, DEJA PASAR. Es la decisión deliberada: un problema en el
 * contador no puede dejar a la agencia sin poder trabajar. El rate limit acá es
 * protección contra abuso y contra gasto, no un control de acceso — los
 * controles de acceso están antes y esos sí fallan cerrados.
 */
export async function dentroDelLimite(
  admin: SupabaseClient,
  clave: string,
  maximo: number,
  ventanaSegundos: number
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("consumir_rate_limit", {
      p_clave: clave,
      p_maximo: maximo,
      p_ventana_segundos: ventanaSegundos,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export function demasiadasRequests(segundos: number): Response {
  return new Response(
    JSON.stringify({ error: "Demasiadas solicitudes seguidas. Esperá un momento y probá de nuevo." }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": String(segundos) } }
  );
}

/**
 * Compara el secreto del cron sin filtrar información por el tiempo que tarda.
 *
 * Un `===` corta en el primer caracter distinto, así que tarda un poquito más
 * cuando el principio coincide. Con suficientes intentos eso deja adivinar el
 * secreto caracter por caracter. Por HTTP el ruido de la red lo hace muy poco
 * práctico, pero la comparación constante no cuesta nada y el endpoint que
 * protege publica en las redes reales de la agencia.
 */
export function secretoValido(encabezado: string, secreto: string): boolean {
  const recibido = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  const esperado = secreto;
  // Longitudes distintas ya no coinciden, pero se recorre igual la esperada
  // para no delatar el largo del secreto.
  let iguales = recibido.length === esperado.length ? 0 : 1;
  for (let i = 0; i < esperado.length; i++) {
    iguales |= esperado.charCodeAt(i) ^ (recibido.charCodeAt(i % recibido.length || 0) || 0);
  }
  return iguales === 0;
}
