-- ============================================================
-- Disparador de las automatizaciones diarias
-- ============================================================
-- Seguimientos vencidos y stock estancado: una pasada por día que revisa el
-- estado del negocio y crea las tareas que correspondan.
--
-- Reusa el secreto que ya dejó `cron-publicaciones.sql` en el Vault
-- (`cron_secret_jarvis`). Si todavía no se corrió ese archivo, correrlo primero:
-- acá no se vuelve a crear el secreto porque `vault.create_secret` falla si el
-- nombre ya existe.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 11:00 UTC = 8:00 en Argentina. pg_cron trabaja en UTC, así que la hora
-- argentina hay que convertirla a mano; a las 8 el equipo recién llega y se
-- encuentra las tareas del día ya armadas.
select cron.schedule(
  'automatizaciones-diarias',
  '0 11 * * *',
  $$
  select net.http_get(
    url := 'https://jarvis-autos-acv.vercel.app/api/automatizaciones/cron',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_jarvis')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Para ver que quedó programado:
--   select jobid, jobname, schedule, active from cron.job;
-- Para ver las últimas corridas:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'automatizaciones-diarias')
--   order by start_time desc limit 10;
-- Para dispararlo a mano una vez (sin esperar a mañana), correr el bloque
-- `select net.http_get(...)` de arriba suelto.
-- Para apagarlo:
--   select cron.unschedule('automatizaciones-diarias');
