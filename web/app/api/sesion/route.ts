import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Registra un ingreso o una salida del sistema en `eventos_sesion`.
//
// Corre SOLO en el servidor y escribe con SUPABASE_SERVICE_ROLE_KEY a
// propósito: la tabla no tiene política de insert, así que desde el navegador
// nadie puede escribirla. Es lo que hace que el registro sirva — un usuario no
// puede inventarse una conexión que no hizo ni tapar la que sí hizo.
//
// Lo único que manda el cliente es el tipo. Quién es, de qué agencia, desde qué
// IP y con qué dispositivo lo determina el servidor:
//  - usuario_id y agencia_id salen del token validado, no del cuerpo.
//  - ip sale de x-forwarded-for (lo pone Vercel), no del navegador.
//  - dispositivo sale del user-agent de la request.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor (ver .env.example)." },
      { status: 500 }
    );
  }

  // 1) Token de quien llama.
  const encabezado = request.headers.get("authorization") ?? "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });

  const anonClient = createClient(url, anonKey);
  const { data: sesion, error: errorSesion } = await anonClient.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return NextResponse.json({ error: "Sesión inválida o vencida." }, { status: 401 });
  }

  // 2) Tipo de evento: lo único que decide el cliente, y solo estos dos valores.
  let body: { tipo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const tipo = body.tipo === "ingreso" || body.tipo === "salida" ? body.tipo : null;
  if (!tipo) return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });

  const admin = createClient(url, serviceKey);

  // 3) La agencia sale del perfil del usuario del token.
  const { data: perfil, error: errorPerfil } = await admin
    .from("perfiles")
    .select("agencia_id")
    .eq("id", sesion.user.id)
    .single();
  if (errorPerfil || !perfil) {
    return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 403 });
  }

  // x-forwarded-for puede traer varias IP encadenadas (cliente, proxies): la
  // primera es la del cliente.
  const reenviadas = request.headers.get("x-forwarded-for") ?? "";
  const ip = reenviadas.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
  const dispositivo = request.headers.get("user-agent")?.slice(0, 400) ?? null;

  const { error } = await admin.from("eventos_sesion").insert({
    agencia_id: perfil.agencia_id,
    usuario_id: sesion.user.id,
    tipo,
    ip,
    dispositivo,
  });
  if (error) {
    return NextResponse.json({ error: "No se pudo registrar la conexión." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
