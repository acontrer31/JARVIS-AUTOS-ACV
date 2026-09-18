-- ============================================================
-- JARVIS · Endurecimiento de permisos (Security Advisor)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Idempotente y seguro: se puede correr más de una vez.
-- ============================================================
--
-- Cierra las advertencias del Security Advisor sobre funciones SECURITY
-- DEFINER ejecutables por anon / public, SIN romper la RLS.
--
-- Principio: una función SECURITY DEFINER corre con los privilegios de su
-- dueño, así que conviene que solo la puedan ejecutar los roles que realmente
-- la necesitan.
--
--   * mi_agencia_id() y mi_rol() se usan DENTRO de las policies de RLS, así que
--     'authenticated' DEBE conservar EXECUTE (si no, se rompe todo el acceso a
--     datos). Solo se le quita a anon/public. El usuario anónimo nunca consulta
--     esas tablas (la app exige login), por eso es seguro. Va a quedar una
--     advertencia "Signed-In Users Can Execute..." para estas dos: es esperada
--     y correcta — solo devuelven la agencia/rol del propio usuario logueado.
--
--   * registrar_auditoria() (función de trigger) y rls_auto_enable() (helper de
--     setup) no las llama nadie de forma directa, así que se les quita EXECUTE a
--     todos los roles de cliente. Los triggers siguen funcionando porque corren
--     con los privilegios del dueño de la función, no del usuario.

-- ---------- Ayudantes de RLS: solo 'authenticated' ----------
revoke execute on function public.mi_agencia_id() from anon, public;
grant  execute on function public.mi_agencia_id() to authenticated;

revoke execute on function public.mi_rol() from anon, public;
grant  execute on function public.mi_rol() to authenticated;

-- ---------- Funciones internas (trigger / setup): nadie las ejecuta directo ----------
-- DO block: cubre cualquier firma (con o sin argumentos) y no falla si la
-- función no existe en este proyecto.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('registrar_auditoria', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
  end loop;
end $$;

-- ============================================================
-- Comprobar cómo quedaron los permisos, después de correrlo:
--
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('mi_agencia_id','mi_rol','registrar_auditoria','rls_auto_enable');
--
-- Esperado:
--   mi_agencia_id / mi_rol        -> anon = false, auth = true
--   registrar_auditoria / rls_... -> anon = false, auth = false
-- ============================================================

-- ============================================================
-- pg_net: por qué NO se le revoca el permiso a PUBLIC
-- ============================================================
-- El Security Advisor marca `pg_net` por estar registrada en el esquema
-- `public`. Sus 12 funciones viven en el esquema `net` con el ACL por defecto
-- `{=X/supabase_admin}` — o sea EXECUTE para PUBLIC, que `anon` y
-- `authenticated` heredan. Entre ellas `http_get`, `http_post` y también
-- `wake` / `worker_restart`.
--
-- El riesgo, si alguna vez fuera alcanzable, sería SSRF: cualquiera con la anon
-- key (que vive en el navegador) haciendo que la base dispare pedidos HTTP
-- arbitrarios desde la red de Supabase.
--
-- HOY NO ES ALCANZABLE: PostgREST solo expone `public`, `graphql_public` y
-- `storage`. **No agregar `net` a los Exposed schemas nunca.** Esa es la única
-- mitigación que está en nuestras manos, y es la que hay que sostener.
--
-- NO SE PUEDE REVOCAR desde este proyecto. Se intentó y las migraciones
-- devuelven "éxito" sin cambiar nada: en Postgres solo el dueño de un objeto
-- puede revocarle privilegios, el dueño es `supabase_admin`, y el rol que da
-- Supabase (`postgres`) no es superusuario ni miembro de ese rol.
--
-- Para comprobarlo (debe dar postgres / false / false):
--   select current_user,
--          (select rolsuper from pg_roles where rolname = current_user) as superusuario,
--          pg_has_role(current_user, 'supabase_admin', 'member') as miembro_del_dueno;
--
-- Y para ver el ACL sin tocar (debe seguir diciendo `=X/supabase_admin`):
--   select proname, proacl::text from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'net' and proname = 'http_get';


-- ============================================================================
-- AUDITORÍA DE SEGURIDAD — septiembre de 2026
-- Aplicado en producción y verificado. Idempotente: se puede correr de nuevo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MÍNIMO PRIVILEGIO PARA anon Y authenticated
--
-- Supabase otorga por defecto GRANT ALL sobre public a los dos roles y deja
-- que la RLS sea el único freno. Funciona, pero apoya toda la seguridad en que
-- ninguna tabla se quede nunca sin políticas.
--
-- Y TRUNCATE NO PASA POR RLS: un rol con TRUNCATE vacía la tabla entera aunque
-- sus políticas no le dejen borrar una sola fila. PostgREST no lo expone hoy —
-- pero `anon` es el rol de la clave que viaja en el navegador.
--
-- Estado verificado después de correr esto:
--   anon           -> SELECT
--   authenticated  -> SELECT, INSERT, UPDATE, DELETE
-- ----------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- anon no escribe nada. Conserva SELECT porque la RLS ya le devuelve cero
    -- filas, y el sitio viejo hace un select sobre `vehiculos`: quitárselo le
    -- cambiaría una lista vacía por un error, sin ganar seguridad.
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t.tablename);
    -- authenticated sí escribe (con RLS), pero nunca trunca ni toca el esquema.
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.tablename);
  end loop;
end $$;

alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;


-- ----------------------------------------------------------------------------
-- 2. RATE LIMITING QUE FUNCIONA EN SERVERLESS
--
-- Un contador en memoria no sirve en Vercel: cada request puede caer en una
-- instancia distinta, así que limita por instancia y no limita nada. El estado
-- tiene que vivir afuera, y la base ya está.
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  clave text primary key,
  ventana_inicio timestamptz not null default now(),
  contador integer not null default 0
);

alter table public.rate_limits enable row level security;
-- Sin políticas: RLS sin política es denegar. Solo service_role la toca.
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.consumir_rate_limit(
  p_clave text, p_maximo integer, p_ventana_segundos integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_contador integer;
begin
  -- Una sola sentencia atómica: dos requests simultáneas no pueden leer el
  -- mismo contador y escribir las dos.
  insert into public.rate_limits as r (clave, ventana_inicio, contador)
  values (p_clave, now(), 1)
  on conflict (clave) do update set
    contador = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_segundos)
                    then 1 else r.contador + 1 end,
    ventana_inicio = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_segundos)
                    then now() else r.ventana_inicio end
  returning r.contador into v_contador;
  return v_contador <= p_maximo;
end; $$;

-- Si la pudiera llamar el cliente, podría gastar la cuota de otro a propósito.
revoke all on function public.consumir_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, integer, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 3. TIPOS DE ARCHIVO PERMITIDOS EN LOS BUCKETS
--
-- Los dos aceptaban CUALQUIER tipo. `vehiculos` además es público: se podía
-- subir un .html o un .svg y quedaba servido desde el dominio de Storage,
-- ejecutándose en el navegador de quien abriera el enlace. Supabase sirve el
-- archivo con el Content-Type declarado al subirlo, así que limitar la lista es
-- justamente lo que impide que algo se sirva como HTML.
--
-- SVG queda afuera a propósito: es una imagen que puede llevar scripts adentro.
-- ----------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/quicktime'
] where id = 'vehiculos';

update storage.buckets set allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/webp','image/avif','image/gif',
  'text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip'
] where id = 'documentos';
