-- Direitos do cliente sobre os próprios dados (LGPD) e prazo de guarda.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- PRÉ-REQUISITO: supabase-migration-acesso.sql e supabase-migration-fila.sql
-- (o supabase-completo.sql roda tudo, na ordem).
--
-- O QUE FAZ
--   1. Pedido do cliente: pela página /meus-dados, qualquer pessoa pede para
--      apagar, ver ou corrigir os próprios dados. O pedido cai no painel
--      (Configurações > Pedidos sobre dados). Ninguém de fora lê a lista.
--   2. Exclusão: o administrador, depois de confirmar pelo WhatsApp que o
--      pedido é mesmo do dono do número, apaga os dados daquele telefone:
--        - reservas futuras são canceladas;
--        - em todas as reservas, nome, telefone, e-mail, aniversário e
--          observação são apagados (sobram só data, mesa e quantas pessoas,
--          que não identificam ninguém e mantêm o Movimento certo);
--        - a pessoa sai da fila de espera.
--   3. Prazo de guarda (limpeza automática, todo dia de madrugada):
--        - reservas com mais de 24 meses: dados pessoais apagados do mesmo jeito;
--        - fila de espera: apagada 30 dias depois da data pedida;
--        - pedidos sobre dados: apagados depois de 5 anos (é a prova de que o
--          pedido foi atendido, e 5 anos é o prazo do Código de Defesa do
--          Consumidor).
--      Os prazos estão escritos na Política de privacidade (lib/empresa.ts).
--      Se mudar aqui, mude lá.

-- ------------------------------------------------------- chave do telefone
-- Só os dígitos, sem o 55 do Brasil: "(41) 99999-0001" e "+55 41 99999-0001"
-- são o mesmo número.
create or replace function chave_telefone(p text) returns text
language sql immutable set search_path = public as $$
  select case when char_length(d) > 11 and left(d, 2) = '55' then substr(d, 3) else d end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- marca das reservas cujos dados pessoais já foram apagados
alter table reservas add column if not exists dados_removidos_em timestamptz;

-- -------------------------------------------------------------- pedidos
create table if not exists pedidos_titular (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('exclusao', 'acesso', 'correcao', 'outro')),
  nome text not null,
  telefone text not null,
  mensagem text,
  status text not null default 'aberto' check (status in ('aberto', 'concluido', 'recusado')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  -- o que o restaurante fez ou respondeu
  nota text
);

create index if not exists pedidos_titular_criado_idx on pedidos_titular (criado_em);

alter table pedidos_titular enable row level security;
revoke all on pedidos_titular from anon;
grant select, update on pedidos_titular to authenticated;
grant all on pedidos_titular to service_role;

drop policy if exists pedidos_titular_admin on pedidos_titular;
create policy pedidos_titular_admin on pedidos_titular for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

-- ------------------------------------------------------ fazer um pedido
-- Pública (o site chama). Devolve o número do protocolo.
-- Freio: 3 pedidos por telefone por dia e 20 no total a cada 10 minutos.
create or replace function pedir_sobre_meus_dados(
  p_tipo text,
  p_nome text,
  p_telefone text,
  p_mensagem text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_chave text := chave_telefone(p_telefone);
  v_mensagem text := nullif(left(btrim(coalesce(p_mensagem, '')), 500), '');
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('exclusao', 'acesso', 'correcao', 'outro') then
    raise exception 'DADOS_INVALIDOS: tipo' using errcode = 'P0001';
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception 'DADOS_INVALIDOS: nome' using errcode = 'P0001';
  end if;
  if char_length(v_chave) < 8 or char_length(v_chave) > 15 or char_length(v_telefone) > 20 then
    raise exception 'DADOS_INVALIDOS: telefone' using errcode = 'P0001';
  end if;

  -- um pedido de cada vez por telefone
  perform pg_advisory_xact_lock(hashtext('pedido-titular:' || v_chave));
  if (select count(*) from pedidos_titular
       where chave_telefone(telefone) = v_chave and criado_em > now() - interval '1 day') >= 3 then
    raise exception 'LIMITE_DE_PEDIDOS' using errcode = 'P0001';
  end if;
  if (select count(*) from pedidos_titular where criado_em > now() - interval '10 minutes') >= 20 then
    raise exception 'LIMITE_DE_PEDIDOS' using errcode = 'P0001';
  end if;

  insert into pedidos_titular (tipo, nome, telefone, mensagem)
  values (p_tipo, v_nome, v_telefone, v_mensagem)
  returning id into v_id;

  return upper(left(replace(v_id::text, '-', ''), 8));
end $$;

revoke all on function pedir_sobre_meus_dados(text, text, text, text) from public;
grant execute on function pedir_sobre_meus_dados(text, text, text, text) to anon, authenticated;

-- ------------------------------------------ apagar os dados de um telefone
-- Só o administrador logado. Não dá para desfazer.
create or replace function apagar_dados_do_cliente(p_telefone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_chave text := chave_telefone(p_telefone);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_canceladas int;
  v_reservas int;
  v_fila int;
begin
  if not eh_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if char_length(v_chave) < 8 then
    raise exception 'DADOS_INVALIDOS: telefone' using errcode = 'P0001';
  end if;

  -- reservas que ainda vão acontecer: canceladas (o lembrete cai junto)
  update reservas set cancelada = true
   where chave_telefone(telefone) = v_chave
     and not cancelada
     and data_reserva >= v_hoje;
  get diagnostics v_canceladas = row_count;

  update reservas
     set nome = 'Dados removidos', telefone = '', email = null, aniversario = null,
         observacao = null, dados_removidos_em = now()
   where chave_telefone(telefone) = v_chave;
  get diagnostics v_reservas = row_count;

  delete from fila_espera where chave_telefone(telefone) = v_chave;
  get diagnostics v_fila = row_count;

  return jsonb_build_object('reservas', v_reservas, 'canceladas', v_canceladas, 'fila', v_fila);
end $$;

revoke all on function apagar_dados_do_cliente(text) from public, anon;
grant execute on function apagar_dados_do_cliente(text) to authenticated;

-- ----------------------------------------------------- limpeza automática
-- Roda sozinha todo dia (agendada abaixo). Ninguém de fora chama.
create or replace function anonimizar_dados_antigos() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reservas int;
  v_fila int;
  v_pedidos int;
begin
  update reservas
     set nome = 'Dados removidos', telefone = '', email = null, aniversario = null,
         observacao = null, dados_removidos_em = now()
   where dados_removidos_em is null
     and data_reserva < v_hoje - interval '24 months';
  get diagnostics v_reservas = row_count;

  delete from fila_espera where data_reserva < v_hoje - 30;
  get diagnostics v_fila = row_count;

  delete from pedidos_titular where criado_em < now() - interval '5 years';
  get diagnostics v_pedidos = row_count;

  return jsonb_build_object('reservas', v_reservas, 'fila', v_fila, 'pedidos', v_pedidos);
end $$;

revoke all on function anonimizar_dados_antigos() from public, anon, authenticated;

-- agenda a limpeza para 3h30 da manhã (6h30 no horário do servidor, UTC).
-- Se o pg_cron não puder ser ligado, nada quebra: aparece um aviso e dá para
-- ligar depois em Database > Extensions e rodar este arquivo de novo.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponivel: ligue em Database > Extensions e rode de novo para agendar a limpeza';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('limpeza-dados-antigos')
      where exists (select 1 from cron.job where jobname = 'limpeza-dados-antigos');
    perform cron.schedule('limpeza-dados-antigos', '30 6 * * *', $c$select anonimizar_dados_antigos()$c$);
  end if;
end $$;

notify pgrst, 'reload schema';
