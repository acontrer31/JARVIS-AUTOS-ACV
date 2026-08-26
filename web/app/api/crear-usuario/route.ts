import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Crea un usuario nuevo para la agencia del admin que lo pide. Corre SOLO en el
// servidor porque usa SUPABASE_SERVICE_ROLE_KEY (la clave de administración de
// Supabase, que puede crear usuarios y saltear RLS) — esa clave NUNCA puede
// estar en el navegador.
//
// Seguridad, por capas:
//  1. Exige el token de sesión de quien llama y lo valida contra Supabase.
//  2. Confirma, leyendo `perfiles`, que ese usuario es admin. Un vendedor no
//     puede crear usuarios.
//  3. La agencia del usuario nuevo se toma del perfil del ADMIN, no de lo que
//     mande el cliente: así un admin de la agencia A no puede crear usuarios
//     en la agencia B ni aunque manipule el request.
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

  // Cliente con service_role: puede leer cualquier perfil y crear usuarios.
  const admin = createClient(url, serviceKey);

  // 2) ¿Quién llama es admin? Se lee su propio perfil (agencia + rol).
  const { data: perfilAdmin, error: errorPerfil } = await admin
    .from("perfiles")
    .select("agencia_id, rol")
    .eq("id", sesion.user.id)
    .single();
  if (errorPerfil || !perfilAdmin) {
    return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 403 });
  }
  if (perfilAdmin.rol !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede crear usuarios." }, { status: 403 });
  }

  // 3) Validación del cuerpo.
  let body: { nombre?: string; email?: string; password?: string; rol?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const nombre = (body.nombre ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const rol = body.rol === "admin" || body.rol === "vendedor" ? body.rol : null;

  if (!email.includes("@")) return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  if (!rol) return NextResponse.json({ error: "Rol inválido." }, { status: 400 });

  // Crea el usuario ya confirmado (email_confirm: true) para que pueda entrar
  // sin el paso de verificación por correo.
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errorCrear || !creado.user) {
    return NextResponse.json(
      { error: errorCrear?.message ?? "No se pudo crear el usuario." },
      { status: 400 }
    );
  }

  // El perfil lleva la agencia del ADMIN (no la que mande el cliente).
  const { error: errorPerfilNuevo } = await admin.from("perfiles").insert({
    id: creado.user.id,
    agencia_id: perfilAdmin.agencia_id,
    nombre: nombre || email,
    rol,
  });
  if (errorPerfilNuevo) {
    // Si el perfil no se pudo crear, el usuario auth quedaría huérfano (existe
    // en Auth pero sin agencia, no podría usar nada). Se limpia.
    await admin.auth.admin.deleteUser(creado.user.id);
    return NextResponse.json(
      { error: "El usuario se creó pero falló su perfil, se revirtió: " + errorPerfilNuevo.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: creado.user.id, nombre: nombre || email, rol });
}
