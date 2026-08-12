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
  creado_en timestamptz not null default now()
);
alter table public.vehiculos add column if not exists carroceria text;

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

-- ---------- Seed: Alcover Automotores + catálogo real de 32 vehículos ----------
-- (Migrado desde data.js — ver commit "Actualiza catálogo con datos reales de la lista de precios")

do $$
declare
  aid uuid;
begin
  insert into public.agencias (nombre, slug, ciudad, telefono_whatsapp, elevenlabs_agent_id)
  values ('Agencia Alcover Automotores', 'alcover', 'Salta', '5493875105956', '8YF78LYHcMXQOWWqeipS')
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
