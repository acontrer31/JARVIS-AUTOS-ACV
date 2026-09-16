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
