-- Agenda a verificação de lembretes: a cada 5 minutos o Supabase chama a
-- rota /api/lembretes/cron do app, que envia o que estiver vencido.
--
-- Por que pg_cron e não o Cron da Vercel: o plano Hobby da Vercel só
-- permite cron 1x por dia, o que não serve pra lembrete "3h antes".
--
-- ANTES DE RODAR:
--   1. Rode supabase-migration-lembretes.sql.
--   2. Defina CRON_SECRET nas variáveis de ambiente da Vercel (qualquer texto
--      longo e aleatório) e faça um novo deploy.
--   3. Troque SEU_CRON_SECRET abaixo pelo MESMO valor.
--   4. Se "create extension" der erro, ative pg_cron e pg_net em
--      Supabase > Database > Extensions e rode de novo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove o agendamento anterior (se existir) pra poder rodar de novo
select cron.unschedule('lembretes-whatsapp')
 where exists (select 1 from cron.job where jobname = 'lembretes-whatsapp');

select cron.schedule(
  'lembretes-whatsapp',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mesa-certa.vercel.app/api/lembretes/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SEU_CRON_SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Pra conferir as execuções depois:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status, response_code from net._http_response order by created desc limit 10;
