-- ============================================================
-- JARVIS · Policies del bucket de Storage `vehiculos`
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- (aparte de schema.sql, porque toca storage.objects y no el esquema public)
-- Idempotente: se puede correr más de una vez.
-- ============================================================
--
-- POR QUÉ ESTE ARCHIVO
--
-- El bucket se creó desde el dashboard con 4 policies generadas por el asistente
-- de Supabase. Las tres de escritura (INSERT / UPDATE / DELETE) daban permiso a
-- CUALQUIER usuario autenticado, sin distinguir agencia. Con una sola agencia no
-- expone nada, pero todo el resto del esquema está acotado por `agencia_id`;
-- Storage era el único lugar que quedaba afuera. El día que entre una segunda
-- agencia, sus usuarios podrían subir, reemplazar o borrar las fotos de los autos
-- de la primera.
--
-- La corrección: los archivos se guardan como
--     vehiculos/<agencia_id>/<vehiculo_id>/<archivo>
-- y las policies exigen que la PRIMERA carpeta de la ruta coincida con la agencia
-- del usuario logueado. Es la misma regla que ya usan las tablas, aplicada a los
-- archivos. Ver web/lib/media.ts, que arma la ruta con ese formato.
--
-- La policy de SELECT no se toca: es pública a propósito. Las fotos del catálogo
-- tienen que verse sin login, igual que en el sitio actual de la agencia.

-- ---------- Fuera las policies amplias generadas por el asistente ----------

drop policy if exists "Authenticated users can upload vehicle images" on storage.objects;
drop policy if exists "Authenticated users can update vehicle images" on storage.objects;
drop policy if exists "Authenticated users can delete vehicle images" on storage.objects;

-- ---------- Escritura acotada por agencia ----------

drop policy if exists "fotos: subir solo en mi agencia" on storage.objects;
create policy "fotos: subir solo en mi agencia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehiculos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

drop policy if exists "fotos: reemplazar solo en mi agencia" on storage.objects;
create policy "fotos: reemplazar solo en mi agencia"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehiculos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  )
  with check (
    bucket_id = 'vehiculos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

drop policy if exists "fotos: borrar solo en mi agencia" on storage.objects;
create policy "fotos: borrar solo en mi agencia"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehiculos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

-- ============================================================
-- Cómo comprobar que quedó bien, después de correrlo:
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
--
-- Tienen que aparecer las 3 nuevas ("fotos: ...") más la de lectura pública
-- ("Public vehicle images"), y NINGUNA de las tres viejas
-- ("Authenticated users can ...").
-- ============================================================

-- ============================================================
-- Bucket privado `documentos` (base de conocimiento)
-- ============================================================
-- A diferencia del de fotos, este bucket NO es público. Las fotos del catálogo
-- tienen que verse sin login; una lista de precios, un contrato o la política
-- de toma de usados, no. Se accede con URLs firmadas de corta duración desde
-- web/lib/documentos.ts.
--
-- El bucket se crea con:
--   insert into storage.buckets (id, name, public, file_size_limit)
--   values ('documentos', 'documentos', false, 26214400)
--   on conflict (id) do nothing;
--
-- Misma regla que las fotos: la primera carpeta de la ruta es el agencia_id.

drop policy if exists "documentos: leer solo los de mi agencia" on storage.objects;
create policy "documentos: leer solo los de mi agencia"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

drop policy if exists "documentos: subir solo en mi agencia" on storage.objects;
create policy "documentos: subir solo en mi agencia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

drop policy if exists "documentos: reemplazar solo en mi agencia" on storage.objects;
create policy "documentos: reemplazar solo en mi agencia"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  )
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );

drop policy if exists "documentos: borrar solo en mi agencia" on storage.objects;
create policy "documentos: borrar solo en mi agencia"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.mi_agencia_id()::text
  );
