-- Liga o captcha "de verdade": depois disto, reservar, entrar na fila e pedir
-- algo sobre os próprios dados SÓ funcionam pelo servidor do site (rota
-- /api/protegido), que confere o captcha antes. Um robô chamando o banco direto
-- com a chave pública passa a levar "permissão negada".
--
-- RODE SÓ DEPOIS DE (nesta ordem):
--   1. criar o captcha na Cloudflare (Turnstile) e colocar na Vercel:
--        NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY e
--        SUPABASE_SERVICE_ROLE_KEY;
--   2. publicar o site de novo (Redeploy) e conferir que aparece o quadradinho
--      "não sou um robô" e que dá para reservar.
-- Se rodar antes, o site para de aceitar reservas.
--
-- Pode rodar de novo sem problema. O supabase-completo.sql respeita: depois de
-- fechado, rodar o completo de novo NÃO reabre.
--
-- VOLTA ATRÁS DE EMERGÊNCIA (captcha fora do ar, reservas travadas):
--   select reabrir_reserva_direta();

create table if not exists reserva_direta_fechada (
  id int primary key default 1 check (id = 1),
  fechada_em timestamptz not null default now()
);
alter table reserva_direta_fechada enable row level security;
revoke all on reserva_direta_fechada from anon, authenticated;

insert into reserva_direta_fechada (id) values (1) on conflict (id) do nothing;

revoke execute on function reservar(date, text, jsonb, text, text, text, text, text) from anon;
revoke execute on function entrar_na_fila(date, text, int, text, text, text) from anon;
revoke execute on function pedir_sobre_meus_dados(text, text, text, text) from anon;

-- emergência: volta a aceitar direto do navegador (sem captcha no banco)
create or replace function reabrir_reserva_direta() returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from reserva_direta_fechada;
  grant execute on function reservar(date, text, jsonb, text, text, text, text, text) to anon;
  grant execute on function entrar_na_fila(date, text, int, text, text, text) to anon;
  grant execute on function pedir_sobre_meus_dados(text, text, text, text) to anon;
  return 'reaberto: o banco volta a aceitar reservas direto do navegador. Tire NEXT_PUBLIC_TURNSTILE_SITE_KEY da Vercel ou conserte o captcha e feche de novo.';
end $$;
revoke all on function reabrir_reserva_direta() from public, anon, authenticated;

select 'fechado: reserva, fila e pedidos so pelo servidor (com captcha)' as resultado;
