-- ============================================================
-- Disparador de las publicaciones programadas
-- ============================================================
-- Se usa pg_cron (adentro de Supabase) y NO el cron de Vercel: el plan Hobby
-- limita los cron a UNA VEZ POR DÍA, y encima un schedule más frecuente hace
-- fallar el deploy entero. Con pg_cron se puede cada 5 minutos, no cuesta nada
-- y no suma ningún servicio nuevo: ya estaba en la base.
--
-- Correr esto UNA VEZ, después de cargar CRON_SECRET en Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El secreto se guarda en el Vault de Supabase, no escrito en la definición del
-- job: cron.job es legible por cualquiera que entre a la base, y ahí quedaría
-- la llave del endpoint a la vista.
-- Reemplazar PEGAR_ACA_EL_MISMO_SECRETO por el valor de CRON_SECRET de Vercel.
select vault.create_secret('PEGAR_ACA_EL_MISMO_SECRETO', 'cron_secret_jarvis');

-- Cada 5 minutos: junta las programadas vencidas y las publica.
select cron.schedule(
  'publicar-programadas',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://jarvis-autos-acv.vercel.app/api/redes/cron',
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
--   where jobid = (select jobid from cron.job where jobname = 'publicar-programadas')
--   order by start_time desc limit 10;
-- Para apagarlo:
--   select cron.unschedule('publicar-programadas');
