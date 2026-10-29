-- Fica no FIM do supabase-completo.sql. As partes anteriores dão permissão
-- ao visitante para reservar, entrar na fila e fazer pedidos sobre dados; se o
-- banco já foi fechado para isso (supabase-fechar-reserva-direta.sql, captcha
-- ligado), esta parte tira a permissão de novo. Assim, rodar o completo depois
-- não reabre nada.
do $$
declare
  fechada boolean := false;
begin
  if to_regclass('public.reserva_direta_fechada') is not null then
    execute 'select exists (select 1 from reserva_direta_fechada)' into fechada;
  end if;
  if fechada then
    revoke execute on function reservar(date, text, jsonb, text, text, text, text, text) from anon;
    revoke execute on function entrar_na_fila(date, text, int, text, text, text) from anon;
    revoke execute on function pedir_sobre_meus_dados(text, text, text, text) from anon;
  end if;
end $$;
