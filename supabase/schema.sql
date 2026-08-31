-- ============================================================
-- JARVIS · Esquema multi-agencia (Fase A)
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- Idempotente: se puede correr una sola vez sobre un proyecto nuevo.
-- ============================================================

-- ---------- Tablas ----------

create table if not exists public.agencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  ciudad text,
  telefono_whatsapp text,
  tema jsonb not null default '{}'::jsonb,  -- branding futuro: {"color": "#22d3ee", "logo_url": "..."}
  activa boolean not null default true,      -- se usará para bloquear acceso si no paga (fase de cobros)
  elevenlabs_agent_id text,                  -- para que el webhook de voz sepa a qué agencia pertenece cada conversación
  creado_en timestamptz not null default now()
);
alter table public.agencias add column if not exists elevenlabs_agent_id text;
-- Número de la Cloud API de WhatsApp (Meta) → mapea cada mensaje entrante a su agencia.
alter table public.agencias add column if not exists whatsapp_phone_number_id text;

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  nombre text,
  rol text not null default 'admin',
  creado_en timestamptz not null default now()
);

create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  marca text not null,
  modelo text not null,
  version text,
  anio int,
  km int,
  es_cero boolean not null default false,
  dominio text,
  precio numeric,
  condicion text,
  motor text,
  caja text,
  traccion text,
  specs jsonb not null default '[]'::jsonb,
  destacado boolean not null default false,
  fotos int not null default 0,
  carroceria text,  -- 'pickup' | 'suv' | 'sedan' | 'hatch' (usado por el avatar reactivo de voz)
  valor_tabla_dnrpa numeric,  -- valor de referencia DNRPA (distinto del precio de venta), carga manual por auto
  creado_en timestamptz not null default now()
);
alter table public.vehiculos add column if not exists carroceria text;
alter table public.vehiculos add column if not exists valor_tabla_dnrpa numeric;
create index if not exists vehiculos_agencia_idx on public.vehiculos (agencia_id);
alter table public.vehiculos drop constraint if exists vehiculos_precio_check;
alter table public.vehiculos add constraint vehiculos_precio_check check (precio is null or precio >= 0);
alter table public.vehiculos drop constraint if exists vehiculos_km_check;
alter table public.vehiculos add constraint vehiculos_km_check check (km is null or km >= 0);
alter table public.vehiculos drop constraint if exists vehiculos_valor_tabla_dnrpa_check;
alter table public.vehiculos add constraint vehiculos_valor_tabla_dnrpa_check check (valor_tabla_dnrpa is null or valor_tabla_dnrpa >= 0);

-- "Memoria" del negocio: clientes y cada interacción/operación con ellos
-- (llamada, WhatsApp, visita, venta, conversación con JARVIS, etc.), para que
-- quede un historial único por cliente en vez de perderse en cabezas o chats sueltos.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  nombre text not null,
  telefono text,
  email text,
  notas text,
  creado_en timestamptz not null default now()
);
create index if not exists clientes_agencia_idx on public.clientes (agencia_id);

create table if not exists public.interacciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  -- Nullable: las conversaciones de voz capturadas automáticamente no siempre
  -- identifican a un cliente puntual (puede ser una consulta general).
  cliente_id uuid references public.clientes (id) on delete cascade,
  vehiculo_id uuid references public.vehiculos (id) on delete set null,
  creado_por uuid references public.perfiles (id) on delete set null,
  tipo text not null default 'otro',  -- 'llamada' | 'whatsapp' | 'visita' | 'email' | 'voz_jarvis' | 'otro'
  resumen text not null,
  datos_origen jsonb,  -- payload crudo del webhook de origen (ej. ElevenLabs), para auditoría/debug
  creado_en timestamptz not null default now()
);
alter table public.interacciones alter column cliente_id drop not null;
alter table public.interacciones add column if not exists datos_origen jsonb;
create index if not exists interacciones_cliente_idx on public.interacciones (cliente_id, creado_en desc);
create index if not exists interacciones_agencia_idx on public.interacciones (agencia_id, creado_en desc);

-- ---------- Función helper: agencia del usuario logueado ----------

create or replace function public.mi_agencia_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agencia_id from public.perfiles where id = auth.uid()
$$;

-- Solo usuarios logueados pueden invocarla directo (el "Security Advisor" de
-- Supabase marca como advertencia cualquier función security definer
-- ejecutable por el público sin sesión). No cambia el comportamiento de las
-- políticas RLS que la usan, solo cierra la posibilidad de invocarla como
-- RPC suelta sin estar autenticado.
revoke execute on function public.mi_agencia_id() from public;
grant execute on function public.mi_agencia_id() to authenticated;

-- ---------- RLS ----------

alter table public.agencias enable row level security;
alter table public.perfiles enable row level security;
alter table public.vehiculos enable row level security;

drop policy if exists "ver mi agencia" on public.agencias;
create policy "ver mi agencia" on public.agencias
  for select using (id = public.mi_agencia_id());

drop policy if exists "ver mi perfil" on public.perfiles;
create policy "ver mi perfil" on public.perfiles
  for select using (id = auth.uid());

drop policy if exists "ver vehiculos de mi agencia" on public.vehiculos;
create policy "ver vehiculos de mi agencia" on public.vehiculos
  for select using (agencia_id = public.mi_agencia_id());

-- CRUD de vehículos habilitado ya (para cuando la Fase B agregue edición desde la UI);
-- por ahora nadie la usa desde el frontend, pero queda lista y correctamente acotada por agencia.
drop policy if exists "editar vehiculos de mi agencia" on public.vehiculos;
create policy "editar vehiculos de mi agencia" on public.vehiculos
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

alter table public.clientes enable row level security;
alter table public.interacciones enable row level security;

drop policy if exists "clientes de mi agencia" on public.clientes;
create policy "clientes de mi agencia" on public.clientes
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "interacciones de mi agencia" on public.interacciones;
create policy "interacciones de mi agencia" on public.interacciones
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

-- ============================================================
-- Fase 2 · Ciclo de vida de vehículos, medios, leads y operaciones
-- Agregado después de las tablas base: mismo patrón idempotente
-- (add column if not exists / create table if not exists), misma
-- estrategia de RLS por agencia_id vía public.mi_agencia_id().
-- Se puede correr sobre una base que ya tiene datos: las columnas
-- nuevas toman su default y no se pierde nada del stock cargado.
-- ============================================================

-- ---------- Vehículos: ciclo de vida, costo interno y notas ----------

-- 'disponible' por default para que los vehículos ya cargados sigan
-- apareciendo exactamente igual que hoy en el sitio estático en
-- producción, sin necesidad de ninguna migración manual.
alter table public.vehiculos add column if not exists estado text not null default 'disponible';
-- El costo interno NO vive acá. Vivió en esta tabla brevemente y se movió a
-- `vehiculo_costos` (más abajo, bloque de correcciones de seguridad) porque RLS
-- es por fila y no por columna: mientras estuvo en `vehiculos`, cualquier
-- vendedor de la agencia podía leerlo.
alter table public.vehiculos add column if not exists notas text;

alter table public.vehiculos drop constraint if exists vehiculos_estado_check;
alter table public.vehiculos add constraint vehiculos_estado_check
  check (estado in ('borrador', 'disponible', 'reservado', 'vendido', 'no_disponible'));

create index if not exists vehiculos_estado_idx on public.vehiculos (agencia_id, estado);

-- ---------- Medios por vehículo (fotos, videos, documentos) ----------

-- Reemplaza a futuro el esquema actual de fotos: archivos estáticos en
-- /images/<dominio>/ contados en la columna vehiculos.fotos. Esa columna
-- NO se elimina todavía porque el sitio estático en producción la usa —
-- la migración se hace cuando exista el bucket de Storage (ver
-- docs/phases/pendientes.md, punto 7).
create table if not exists public.vehiculo_media (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos (id) on delete cascade,
  tipo text not null default 'foto',  -- 'foto' | 'video' | 'documento'
  url text not null,
  orden int not null default 0,       -- para ordenar la galería
  creado_en timestamptz not null default now()
);
alter table public.vehiculo_media drop constraint if exists vehiculo_media_tipo_check;
alter table public.vehiculo_media add constraint vehiculo_media_tipo_check
  check (tipo in ('foto', 'video', 'documento'));
-- Ruta dentro del bucket de Storage (`vehiculos/<agencia_id>/<vehiculo_id>/...`).
-- Se guarda aparte de `url` porque para borrar el archivo del bucket hace falta
-- la ruta, no la URL pública.
alter table public.vehiculo_media add column if not exists ruta text;
create index if not exists vehiculo_media_vehiculo_idx on public.vehiculo_media (vehiculo_id, orden);

-- ---------- Clientes: campos de lead (Fase 5) ----------

-- Nota: no existe una tabla `leads` separada a propósito. Un lead es un
-- cliente en una etapa del embudo, no otra entidad — desdoblarlo obligaría
-- a sincronizar dos tablas con los mismos datos. Se modela como estado
-- sobre `clientes`, que ya tiene su historial en `interacciones`.
alter table public.clientes add column if not exists estado_lead text not null default 'nuevo';
alter table public.clientes add column if not exists vehiculo_interes_id uuid references public.vehiculos (id) on delete set null;
alter table public.clientes add column if not exists presupuesto numeric;
alter table public.clientes add column if not exists vendedor_id uuid references public.perfiles (id) on delete set null;

alter table public.clientes drop constraint if exists clientes_estado_lead_check;
alter table public.clientes add constraint clientes_estado_lead_check
  check (estado_lead in ('nuevo', 'contactado', 'en_negociacion', 'ganado', 'perdido'));
alter table public.clientes drop constraint if exists clientes_presupuesto_check;
alter table public.clientes add constraint clientes_presupuesto_check
  check (presupuesto is null or presupuesto >= 0);
create index if not exists clientes_estado_lead_idx on public.clientes (agencia_id, estado_lead);

-- ---------- Operaciones (venta / reserva / permuta / consignación) ----------

create table if not exists public.operaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  vehiculo_id uuid references public.vehiculos (id) on delete set null,
  cliente_id uuid references public.clientes (id) on delete set null,
  vendedor_id uuid references public.perfiles (id) on delete set null,
  tipo text not null default 'venta',      -- 'venta' | 'reserva' | 'permuta' | 'consignacion'
  estado text not null default 'abierta',  -- 'abierta' | 'cerrada' | 'cancelada'
  monto numeric,
  notas text,
  creado_en timestamptz not null default now()
);
alter table public.operaciones drop constraint if exists operaciones_tipo_check;
alter table public.operaciones add constraint operaciones_tipo_check
  check (tipo in ('venta', 'reserva', 'permuta', 'consignacion'));
alter table public.operaciones drop constraint if exists operaciones_estado_check;
alter table public.operaciones add constraint operaciones_estado_check
  check (estado in ('abierta', 'cerrada', 'cancelada'));
alter table public.operaciones drop constraint if exists operaciones_monto_check;
alter table public.operaciones add constraint operaciones_monto_check
  check (monto is null or monto >= 0);
create index if not exists operaciones_agencia_idx on public.operaciones (agencia_id, creado_en desc);
create index if not exists operaciones_vehiculo_idx on public.operaciones (vehiculo_id);

-- ---------- RLS de las tablas nuevas ----------

alter table public.vehiculo_media enable row level security;
alter table public.operaciones enable row level security;

drop policy if exists "media de mi agencia" on public.vehiculo_media;
create policy "media de mi agencia" on public.vehiculo_media
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "operaciones de mi agencia" on public.operaciones;
create policy "operaciones de mi agencia" on public.operaciones
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

-- ---------- Fase 5: ver los perfiles de la propia agencia ----------

-- La política "ver mi perfil" (más arriba) limita a cada usuario a su propia
-- fila. Eso alcanzaba mientras `perfiles` solo servía para resolver a qué
-- agencia pertenece el usuario logueado, pero rompe el CRM: el selector de
-- "vendedor asignado" de un cliente mostraría únicamente al usuario logueado,
-- y `clientes.vendedor_id` quedaría como una columna decorativa.
--
-- Esta política amplía SOLO la lectura, y solo dentro de la misma agencia —
-- exactamente el mismo límite multi-tenant que ya rige `vehiculos`, `clientes`,
-- `interacciones` y `operaciones`. Nadie puede ver perfiles de otra agencia, y
-- la escritura no se toca: nadie puede modificar el perfil de otro.
drop policy if exists "ver perfiles de mi agencia" on public.perfiles;
create policy "ver perfiles de mi agencia" on public.perfiles
  for select using (agencia_id = public.mi_agencia_id());

-- ============================================================
-- Fase 12 · RBAC (admin / vendedor) y registro de auditoría
-- ============================================================

-- ---------- Roles ----------

-- `perfiles.rol` existía desde la Fase A con default 'admin', pero nunca se
-- usó para nada: la única regla real era "pertenece a una agencia". Acá pasa a
-- tener efecto.
--
-- La normalización previa evita que la restricción falle sobre datos ya
-- cargados. Cualquier rol no reconocido se lleva a 'admin' a propósito: fallar
-- al revés dejaría al dueño de la agencia sin permiso para administrar su
-- propio stock, que es peor que ser permisivo con un dato viejo.
update public.perfiles set rol = 'admin' where rol is null or rol not in ('admin', 'vendedor');
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin', 'vendedor'));

-- Mismo patrón que mi_agencia_id(): security definer para poder leer `perfiles`
-- sin quedar atrapada en las propias políticas RLS de esa tabla (si no, una
-- política sobre `perfiles` que llamara a esta función recursaría).
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid()
$$;

revoke execute on function public.mi_rol() from public;
grant execute on function public.mi_rol() to authenticated;

-- ---------- Políticas diferenciadas por rol ----------

-- Las políticas `for all` de arriba se reemplazan por políticas por comando:
-- una sola `for all` no puede distinguir quién puede leer de quién puede
-- borrar. IMPORTANTE: hay que borrarlas, porque varias políticas permisivas se
-- suman entre sí (OR) — dejar la vieja anularía toda esta granularidad.

-- Vehículos: todos ven y actualizan (un vendedor tiene que poder marcar un auto
-- como reservado), pero solo un admin da de alta o elimina stock.
drop policy if exists "editar vehiculos de mi agencia" on public.vehiculos;

drop policy if exists "alta de vehiculos solo admin" on public.vehiculos;
create policy "alta de vehiculos solo admin" on public.vehiculos
  for insert with check (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

drop policy if exists "actualizar vehiculos de mi agencia" on public.vehiculos;
create policy "actualizar vehiculos de mi agencia" on public.vehiculos
  for update using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "borrar vehiculos solo admin" on public.vehiculos;
create policy "borrar vehiculos solo admin" on public.vehiculos
  for delete using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

-- Clientes: cualquiera de la agencia los carga y edita (es el trabajo diario de
-- un vendedor); borrar un cliente, que se lleva puesto su historial, es de admin.
drop policy if exists "clientes de mi agencia" on public.clientes;

drop policy if exists "ver clientes de mi agencia" on public.clientes;
create policy "ver clientes de mi agencia" on public.clientes
  for select using (agencia_id = public.mi_agencia_id());

drop policy if exists "alta de clientes de mi agencia" on public.clientes;
create policy "alta de clientes de mi agencia" on public.clientes
  for insert with check (agencia_id = public.mi_agencia_id());

drop policy if exists "actualizar clientes de mi agencia" on public.clientes;
create policy "actualizar clientes de mi agencia" on public.clientes
  for update using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "borrar clientes solo admin" on public.clientes;
create policy "borrar clientes solo admin" on public.clientes
  for delete using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

-- Interacciones: son el historial del negocio. Se agregan libremente, pero
-- editarlas o borrarlas es reescribir el pasado — queda para admin.
drop policy if exists "interacciones de mi agencia" on public.interacciones;

drop policy if exists "ver interacciones de mi agencia" on public.interacciones;
create policy "ver interacciones de mi agencia" on public.interacciones
  for select using (agencia_id = public.mi_agencia_id());

drop policy if exists "alta de interacciones de mi agencia" on public.interacciones;
create policy "alta de interacciones de mi agencia" on public.interacciones
  for insert with check (agencia_id = public.mi_agencia_id());

drop policy if exists "editar interacciones solo admin" on public.interacciones;
create policy "editar interacciones solo admin" on public.interacciones
  for update using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin')
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "borrar interacciones solo admin" on public.interacciones;
create policy "borrar interacciones solo admin" on public.interacciones
  for delete using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

-- Operaciones: cargarlas y actualizarlas es trabajo de vendedor; borrar una
-- venta registrada, no.
drop policy if exists "operaciones de mi agencia" on public.operaciones;

drop policy if exists "ver operaciones de mi agencia" on public.operaciones;
create policy "ver operaciones de mi agencia" on public.operaciones
  for select using (agencia_id = public.mi_agencia_id());

drop policy if exists "alta de operaciones de mi agencia" on public.operaciones;
create policy "alta de operaciones de mi agencia" on public.operaciones
  for insert with check (agencia_id = public.mi_agencia_id());

drop policy if exists "actualizar operaciones de mi agencia" on public.operaciones;
create policy "actualizar operaciones de mi agencia" on public.operaciones
  for update using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());

drop policy if exists "borrar operaciones solo admin" on public.operaciones;
create policy "borrar operaciones solo admin" on public.operaciones
  for delete using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

-- Perfiles: un admin puede renombrar y cambiar el rol de la gente de SU agencia
-- (es lo que hace falta para el módulo Administración). Un vendedor no puede
-- tocar perfiles — ni el propio: si no, se auto-ascendería a admin y el rol no
-- valdría nada.
drop policy if exists "administrar perfiles de mi agencia" on public.perfiles;
create policy "administrar perfiles de mi agencia" on public.perfiles
  for update using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin')
  with check (agencia_id = public.mi_agencia_id());

-- ---------- Registro de auditoría ----------

-- Quién cambió qué y cuándo. Deliberadamente NO tiene políticas de insert,
-- update ni delete: desde el cliente solo se puede leer. Las filas las escribe
-- el trigger de abajo, que es security definer y por eso puede insertar aunque
-- el usuario no tenga permiso de escritura acá. Un log que el usuario auditado
-- puede editar no sirve para nada.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  tabla text not null,
  operacion text not null,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  registro_id uuid,
  usuario_id uuid,          -- auth.uid() al momento del cambio (null si lo hizo un proceso)
  datos_antes jsonb,
  datos_despues jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists audit_log_agencia_idx on public.audit_log (agencia_id, creado_en desc);
create index if not exists audit_log_registro_idx on public.audit_log (tabla, registro_id);

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  antes jsonb;
  despues jsonb;
  agencia uuid;
  registro uuid;
begin
  -- OLD y NEW no existen en todas las operaciones, así que se arma por rama en
  -- vez de referenciarlos a ciegas.
  if tg_op = 'INSERT' then
    despues := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    antes := to_jsonb(old);
    despues := to_jsonb(new);
  else
    antes := to_jsonb(old);
  end if;

  agencia := coalesce((despues ->> 'agencia_id')::uuid, (antes ->> 'agencia_id')::uuid);
  -- La mayoría de las tablas auditadas se identifican por `id`; vehiculo_costos
  -- usa vehiculo_id como clave primaria, así que se contempla como alternativa.
  registro := coalesce(
    (despues ->> 'id')::uuid, (antes ->> 'id')::uuid,
    (despues ->> 'vehiculo_id')::uuid, (antes ->> 'vehiculo_id')::uuid
  );

  insert into public.audit_log (agencia_id, tabla, operacion, registro_id, usuario_id, datos_antes, datos_despues)
  values (agencia, tg_table_name, tg_op, registro, auth.uid(), antes, despues);

  return null;  -- trigger AFTER: el valor de retorno se ignora
end;
$$;

drop trigger if exists auditar_vehiculos on public.vehiculos;
create trigger auditar_vehiculos
  after insert or update or delete on public.vehiculos
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditar_clientes on public.clientes;
create trigger auditar_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditar_operaciones on public.operaciones;
create trigger auditar_operaciones
  after insert or update or delete on public.operaciones
  for each row execute function public.registrar_auditoria();

alter table public.audit_log enable row level security;

-- Solo los admin de la agencia leen el registro. Un vendedor no tiene por qué
-- ver el historial de cambios de toda la agencia.
drop policy if exists "ver auditoria de mi agencia" on public.audit_log;
create policy "ver auditoria de mi agencia" on public.audit_log
  for select using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

-- Explícito por si los privilegios por defecto del proyecto fueran más amplios:
-- desde el cliente, el log es de solo lectura.
revoke insert, update, delete on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ============================================================
-- Correcciones de la revisión de seguridad
-- ============================================================

-- ---------- Auditar también los cambios de rol ----------

-- El audit_log cubría vehiculos, clientes y operaciones, pero no `perfiles`.
-- Ascender a alguien a administrador es la acción más sensible del sistema —
-- es la que reparte los permisos — y no dejaba ningún rastro.
drop trigger if exists auditar_perfiles on public.perfiles;
create trigger auditar_perfiles
  after insert or update or delete on public.perfiles
  for each row execute function public.registrar_auditoria();

-- ---------- Costo interno: tabla aparte, solo para admin ----------

-- `costo_interno` vivía como columna de `vehiculos`. El problema: RLS es por
-- FILA, no por columna. La política de lectura de vehículos no distingue roles,
-- así que cualquier vendedor de la agencia podía leer lo que la agencia pagó por
-- cada auto — y no solo en la interfaz: consultando la API directamente.
--
-- Esconderlo en el frontend no habría sido una corrección sino un disfraz. Al
-- vivir en su propia tabla, el límite lo impone la base de datos.
create table if not exists public.vehiculo_costos (
  vehiculo_id uuid primary key references public.vehiculos (id) on delete cascade,
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  costo_interno numeric,
  actualizado_en timestamptz not null default now()
);
alter table public.vehiculo_costos drop constraint if exists vehiculo_costos_monto_check;
alter table public.vehiculo_costos add constraint vehiculo_costos_monto_check
  check (costo_interno is null or costo_interno >= 0);
create index if not exists vehiculo_costos_agencia_idx on public.vehiculo_costos (agencia_id);

-- Migración de los datos que ya estuvieran cargados en la columna vieja. El
-- guard sobre information_schema la hace idempotente: en la segunda corrida la
-- columna ya no existe y el bloque entero se saltea.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehiculos' and column_name = 'costo_interno'
  ) then
    insert into public.vehiculo_costos (vehiculo_id, agencia_id, costo_interno)
    select id, agencia_id, costo_interno from public.vehiculos where costo_interno is not null
    on conflict (vehiculo_id) do nothing;

    alter table public.vehiculos drop constraint if exists vehiculos_costo_interno_check;
    alter table public.vehiculos drop column costo_interno;
  end if;
end $$;

alter table public.vehiculo_costos enable row level security;

drop policy if exists "costos solo admin" on public.vehiculo_costos;
create policy "costos solo admin" on public.vehiculo_costos
  for all using (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin')
  with check (agencia_id = public.mi_agencia_id() and public.mi_rol() = 'admin');

drop trigger if exists auditar_vehiculo_costos on public.vehiculo_costos;
create trigger auditar_vehiculo_costos
  after insert or update or delete on public.vehiculo_costos
  for each row execute function public.registrar_auditoria();

-- ---------- Seed: Alcover Automotores + catálogo real de 32 vehículos ----------
-- (Migrado desde data.js — ver commit "Actualiza catálogo con datos reales de la lista de precios")

do $$
declare
  aid uuid;
begin
  insert into public.agencias (nombre, slug, ciudad, telefono_whatsapp, elevenlabs_agent_id)
  values ('Agencia Alcover Automotores', 'alcover', 'Salta', '5493875105956', 'agent_0501kzs629c5fn8agsxf08v1nw4z')
  on conflict (slug) do update set nombre = excluded.nombre, elevenlabs_agent_id = excluded.elevenlabs_agent_id
  returning id into aid;

  -- Evita duplicar el seed si el script se corre más de una vez
  if not exists (select 1 from public.vehiculos where agencia_id = aid) then
    insert into public.vehiculos
      (agencia_id, marca, modelo, version, anio, km, es_cero, dominio, precio, condicion, motor, caja, traccion, specs, destacado, fotos, carroceria)
    values
  (aid, 'Volkswagen', 'Amarok', '2.0 180HP 4x2 AT', 2016, 158200, false, 'AA763KF', 27000000, NULL, '2.0 (180HP)', 'Automática', NULL, '["Único dueño"]'::jsonb, false, 8, 'pickup'),
  (aid, 'Volkswagen', 'T-Cross', 'Trendline 1.6 Blanca', 2022, 66000, false, 'AF257KT', 26700000, 'Consignación', '1.6', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma", "Pantalla táctil", "Sensores de estacionamiento"]'::jsonb, false, 0, 'suv'),
  (aid, 'Renault', 'Duster Oroch', 'Outsider 1.6 GNC', 2019, 128000, false, 'AD880HR', 21500000, 'Consignación', '1.6', NULL, NULL, '["Equipo de GNC"]'::jsonb, false, 0, 'pickup'),
  (aid, 'Fiat', 'Palio', 'Atractive 1.4', 2017, 59000, false, 'AB842UQ', 15500000, 'Consignación', '1.4', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios electrónicos", "Llantas de aleación"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Volkswagen', 'Suran', 'Trendline 1.6', 2017, 174000, false, 'AC731GM', 17500000, NULL, '1.6', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios eléctricos"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Volkswagen', 'Virtus', 'GTS 1.4 Turbo AT', 2022, 126000, false, 'AF223GF', 31000000, NULL, '1.4 turbo', 'Automática', NULL, '["Cubiertas nuevas"]'::jsonb, false, 0, 'sedan'),
  (aid, 'Volkswagen', 'Fox', 'Connect 1.6', 2018, 86000, false, 'AC739GE', 19600000, NULL, '1.6', NULL, NULL, '["Pantalla táctil", "Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios eléctricos"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Peugeot', '408', 'Allure Plus 1.6 Turbo', 2019, 58500, false, 'AD853QE', 16900000, 'Consignación', '1.6 turbo', NULL, NULL, '["Tapizado de cuero", "Techo corredizo", "Climatizador Bizona", "Único dueño"]'::jsonb, false, 0, 'sedan'),
  (aid, 'Ford', 'Fiesta', 'SE 1.6', 2019, 76000, false, 'AD384BI', 20300000, 'Consignación', '1.6', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Peugeot', '208', 'Feline', 2020, 54000, false, 'AE057DK', 20600000, NULL, '1.6', NULL, NULL, '["Pantalla táctil", "Sensores y cámara de estacionamiento", "Techo panorámico corredizo"]'::jsonb, false, 7, 'hatch'),
  (aid, 'Chevrolet', 'S10', 'High Country 4x2 Manual', 2017, 151000, false, 'AB366SS', 29500000, 'Agencia', '2.8', 'Manual', '4x2', '["Tapizado de cuero", "Pantalla con sensores y cámara"]'::jsonb, false, 9, 'pickup'),
  (aid, 'Volkswagen', 'Amarok', 'Trendline 4x2 2.0', 2024, 28000, false, 'AG818BK', 36600000, NULL, '2.0 (140HP)', NULL, '4x2', '["Pantalla táctil", "Tapizado simil cuero", "Aire y dirección", "Levanta vidrios eléctricos"]'::jsonb, true, 0, 'pickup'),
  (aid, 'Chevrolet', 'Cruze', '1.4 Turbo LT MT', 2017, 71822, false, 'AB668OG', 21200000, 'Consignación', '1.4 Turbo', 'Manual', NULL, '["Tapizado de cuero", "Pantalla, cámara y sensores de estacionamiento"]'::jsonb, false, 7, 'hatch'),
  (aid, 'Volkswagen', 'Polo Track', NULL, 2024, 62200, false, 'AG953CO', 23500000, NULL, '1.6', NULL, NULL, '["Pantalla táctil con CarPlay", "Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios en puertas delanteras"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Volkswagen', 'Golf', 'Bluemotion Tecno DSG 1.4 TSI', 2015, NULL, false, 'PLU532', 22000000, NULL, '1.4 TSI', 'DSG Automática', NULL, '["Stage 1 - Escape Silen", "Sensores de estacionamiento traseros y delanteros"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Toyota', 'Yaris', 'XS AT', 2025, 0, true, 'AH962IG', 36900000, NULL, '1.5 cadenero', 'Automática', NULL, '["0km patentado", "Pantalla táctil"]'::jsonb, false, 0, 'sedan'),
  (aid, 'Fiat', 'Argo', 'Drive 1.3', 2018, 100000, false, 'AC977HC', 18500000, NULL, '1.3 cadenero', NULL, NULL, '["Aire y dirección electrónica", "Pantalla táctil", "Sensores de estacionamiento"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Toyota', 'Hilux', 'DX 2.4 4x4', 2025, 0, true, 'AH962GH', 56900000, NULL, '2.4', 'Manual 6ta', '4x4', '["Patentada", "Pantalla táctil con CarPlay"]'::jsonb, true, 10, 'pickup'),
  (aid, 'Toyota', 'Hilux', 'SR 2.4 4x2', 2025, 0, true, 'AH343NU', 56900000, NULL, '2.4', 'Manual 6ta', '4x2', '["Patentada", "Pantalla táctil con CarPlay", "Cámara de estacionamiento"]'::jsonb, true, 8, 'pickup'),
  (aid, 'Fiat', 'Uno', 'Fire 1.3 Base', 2013, 129000, false, 'MPO698', 8500000, 'Consignación', '1.3 Fire', NULL, NULL, '["Único dueño"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Fiat', 'Cronos', 'Precision 1.8', 2022, 54000, false, 'AF426TR', 21600000, 'Agencia', '1.8 cadenero', NULL, NULL, '["Tapizado de cuero", "Climatizador", "Pantalla táctil", "Cámara y sensores de estacionamiento", "Llantas de aleación", "4 cubiertas nuevas"]'::jsonb, false, 7, 'sedan'),
  (aid, 'Fiat', 'Toro', 'Freedom 1.8 AT', 2023, 75600, false, 'AF789RZ', 30600000, NULL, '1.8', 'Automática', NULL, '["Tapizado de cuero", "Pantalla con cámara y sensores"]'::jsonb, false, 7, 'pickup'),
  (aid, 'Volkswagen', 'Gol', 'Trend Trendline Rojo', 2019, 100000, false, 'AD701CW', 18200000, NULL, '1.6', NULL, NULL, '["Aire y dirección", "Levanta vidrios eléctricos delanteros", "Cierre centralizado y alarma", "Dos cubiertas nuevas"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Renault', 'Sandero', 'Stepway Privilege 1.6', 2017, 129000, false, 'AB188KV', 17200000, NULL, '1.6', NULL, NULL, '["Pantalla táctil", "Cubiertas nuevas"]'::jsonb, false, 0, 'hatch'),
  (aid, 'Fiat', 'Mobi', 'Way 1.0', 2018, 128000, false, 'AC331ND', 14200000, NULL, '1.0', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios eléctricos"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Ford', 'Ka', 'Freestyle SEL 1.5', 2020, 100000, false, 'AE292BV', 20600000, NULL, '1.5', NULL, NULL, '["Tapizado de cuero", "Pantalla táctil", "Cámara y sensores", "Cubiertas y correa nueva"]'::jsonb, false, 8, 'hatch'),
  (aid, 'Volkswagen', 'Taos', 'Highline Hero 250 TSI AT', 2022, 116000, false, 'AF716BM', 43000000, NULL, '1.4 turbo', 'Automática', NULL, '["Techo panorámico corredizo", "Tapizados de cuero", "Sensores y cámara de estacionamiento"]'::jsonb, true, 9, 'suv'),
  (aid, 'Renault', 'Sandero', 'RS 2.0', 2018, 84200, false, 'AC558GE', 19600000, 'Agencia', '2.0', '6ta', NULL, '["Pantalla táctil", "Sensores de estacionamiento"]'::jsonb, false, 6, 'hatch'),
  (aid, 'Fiat', 'Cronos', 'Drive Pack GSE BZ', 2026, 2000, true, 'AI049OG', 32600000, NULL, NULL, NULL, NULL, '["Patentado"]'::jsonb, false, 0, 'sedan'),
  (aid, 'Ford', 'Ecosport', 'SE 1.6', 2016, 127000, false, 'AA435BQ', 17600000, NULL, '1.6', NULL, NULL, '["Aire y dirección", "Cierre centralizado y alarma", "Levanta vidrios eléctricos", "Faros auxiliares antiniebla"]'::jsonb, false, 0, 'suv'),
  (aid, 'Chevrolet', 'Tracker', 'LTZ 1.8 4x4', 2017, 134000, false, 'AA872RK', 18900000, 'Consignación', '1.8', NULL, NULL, '["Tapizado de cuero", "Techo corredizo", "Sensores y cámara de estacionamiento"]'::jsonb, false, 8, 'suv'),
  (aid, 'Volkswagen', 'Amarok', 'Extreme V6 258HP', 2020, 98000, false, 'AE434WK', 50000000, NULL, '3.0 (258HP)', 'Automática', NULL, '["Tapizado de cuero", "Butacas calefaccionadas", "Cámara y sensores de estacionamiento"]'::jsonb, true, 6, 'pickup');
  end if;
end $$;

-- ============================================================
-- Después de correr esto:
-- 1. Andá a Authentication → Users → Add user y creá tu usuario (email/password).
-- 2. Copiá el UUID de ese usuario y corré (reemplazando TU-UUID-ACA):
--
--    insert into public.perfiles (id, agencia_id, nombre)
--    select 'TU-UUID-ACA', id, 'Agustín'
--    from public.agencias where slug = 'alcover';
--
-- 3. En Project Settings → API, copiá "Project URL" y la clave "anon public"
--    y completalas en config.js del sitio.
-- ============================================================

-- ============================================================
-- Tareas del día (asistente JARVIS)
-- Cada usuario ve y gestiona SOLO sus propias tareas, dentro de su agencia.
-- Se corre igual que el resto: es idempotente (create ... if not exists +
-- drop policy if exists antes del create policy).
-- ============================================================
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  titulo text not null,
  hecha boolean not null default false,
  vence date,
  creado_en timestamptz not null default now()
);
create index if not exists tareas_usuario_idx on public.tareas (usuario_id, hecha, vence);

alter table public.tareas enable row level security;

-- El límite lo pone la base: agencia del usuario Y que sea su propia tarea.
drop policy if exists "mis tareas" on public.tareas;
create policy "mis tareas" on public.tareas
  for all using (agencia_id = public.mi_agencia_id() and usuario_id = auth.uid())
  with check (agencia_id = public.mi_agencia_id() and usuario_id = auth.uid());

-- ============================================================
-- ERP · Ventas / Operaciones (ampliación de public.operaciones)
-- La tabla ya existía (Fase 2). Se le suman los campos de una venta real y se
-- refina el flujo de estados: abierta -> senada -> entregada (o cancelada).
-- Idempotente. La RLS "operaciones de mi agencia" ya está definida más arriba.
-- ============================================================
alter table public.operaciones add column if not exists forma_pago text;  -- 'contado' | 'financiado' | 'permuta' | 'mixto'
alter table public.operaciones add column if not exists sena numeric;      -- seña / anticipo entregado
alter table public.operaciones add column if not exists comision numeric;  -- comisión del vendedor

alter table public.operaciones drop constraint if exists operaciones_estado_check;
alter table public.operaciones add constraint operaciones_estado_check
  check (estado in ('abierta', 'senada', 'entregada', 'cancelada'));

alter table public.operaciones drop constraint if exists operaciones_forma_pago_check;
alter table public.operaciones add constraint operaciones_forma_pago_check
  check (forma_pago is null or forma_pago in ('contado', 'financiado', 'permuta', 'mixto'));

alter table public.operaciones drop constraint if exists operaciones_sena_check;
alter table public.operaciones add constraint operaciones_sena_check
  check (sena is null or sena >= 0);

alter table public.operaciones drop constraint if exists operaciones_comision_check;
alter table public.operaciones add constraint operaciones_comision_check
  check (comision is null or comision >= 0);

-- ============================================================
-- ERP · Caja / movimientos de dinero
-- Ingresos y egresos del día a día. Puede quedar ligado a una operación (el
-- cobro de una venta) o ser suelto (un gasto). RLS por agencia. Idempotente.
-- ============================================================
create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias (id) on delete cascade,
  operacion_id uuid references public.operaciones (id) on delete set null,
  creado_por uuid references public.perfiles (id) on delete set null,
  tipo text not null,               -- 'ingreso' | 'egreso'
  concepto text not null,
  monto numeric not null,
  forma_pago text,                  -- 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'otro'
  fecha date not null default current_date,
  creado_en timestamptz not null default now()
);
create index if not exists movimientos_caja_agencia_idx on public.movimientos_caja (agencia_id, fecha desc, creado_en desc);

alter table public.movimientos_caja drop constraint if exists movimientos_caja_tipo_check;
alter table public.movimientos_caja add constraint movimientos_caja_tipo_check
  check (tipo in ('ingreso', 'egreso'));
alter table public.movimientos_caja drop constraint if exists movimientos_caja_monto_check;
alter table public.movimientos_caja add constraint movimientos_caja_monto_check
  check (monto > 0);
alter table public.movimientos_caja drop constraint if exists movimientos_caja_forma_pago_check;
alter table public.movimientos_caja add constraint movimientos_caja_forma_pago_check
  check (forma_pago is null or forma_pago in ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'otro'));

alter table public.movimientos_caja enable row level security;
drop policy if exists "caja de mi agencia" on public.movimientos_caja;
create policy "caja de mi agencia" on public.movimientos_caja
  for all using (agencia_id = public.mi_agencia_id())
  with check (agencia_id = public.mi_agencia_id());
