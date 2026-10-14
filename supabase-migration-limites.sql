-- Freio contra abuso na reserva pública.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- PRÉ-REQUISITO: supabase-migration-acesso.sql (o supabase-completo.sql roda os dois, na ordem).
--
-- O PROBLEMA
--   A reserva pelo site é aberta a qualquer visitante — tem que ser. Sem
--   limite, um robô (ou alguém de má-fé) consegue ocupar o salão inteiro com
--   nomes falsos numa chamada só, e o restaurante perde a noite.
--
-- COMO FICA
--   A função reservar() passa a conferir, antes de gravar:
--     1. no máximo N mesas por reserva;
--     2. no máximo N mesas em reservas futuras por telefone, e em no máximo N
--        datas diferentes;
--     3. no máximo N mesas reservadas PELO SITE nos últimos 10 minutos, somando
--        todo mundo (segura um ataque em rajada).
--   O que o administrador reserva pelo painel não entra nas contas e não é
--   barrado: o balcão às vezes precisa reservar muito de uma vez.
--
--   Os números ficam na tabela "limites_reserva" (uma linha só), para cada
--   restaurante ajustar ao tamanho do salão sem mexer em código:
--     update limites_reserva set mesas_por_telefone = 10;
--
--   Isto FREIA o abuso, não o impede de vez: quem trocar de telefone a cada
--   reserva passa pelos limites 1 e 2. O que barra robô de verdade é o captcha.

-- ------------------------------------------------------------------ limites
create table if not exists limites_reserva (
  id int primary key default 1 check (id = 1),
  -- uma reserva só (o grupo inteiro). 15 mesas de 4 = 60 pessoas.
  mesas_por_reserva int not null default 15 check (mesas_por_reserva >= 1),
  -- mesas que o mesmo telefone pode ter em reservas de hoje em diante
  mesas_por_telefone int not null default 15 check (mesas_por_telefone >= 1),
  -- datas diferentes que o mesmo telefone pode ter reservadas de hoje em diante
  datas_por_telefone int not null default 4 check (datas_por_telefone >= 1),
  -- mesas reservadas pelo site, somando todo mundo, a cada 10 minutos
  mesas_por_10_minutos int not null default 30 check (mesas_por_10_minutos >= 1)
);
insert into limites_reserva (id) values (1) on conflict (id) do nothing;

-- Só o SQL Editor (e o servidor) mexe nos limites. Ninguém lê pela API.
alter table limites_reserva enable row level security;
revoke all on limites_reserva from anon, authenticated;
grant all on limites_reserva to service_role;

-- ------------------------------------------------- de onde veio a reserva
-- "site" (visitante) ou "painel" (administrador logado). Serve à conta do
-- limite e ajuda a entender o movimento. Reservas antigas ficam como "site".
alter table reservas add column if not exists origem text not null default 'site';
alter table reservas drop constraint if exists reservas_origem_valida;
alter table reservas add constraint reservas_origem_valida check (origem in ('site', 'painel'));

-- a conta "reservas do site nos últimos 10 minutos" precisa ser rápida
create index if not exists reservas_criada_em_idx on reservas (criada_em);

-- ------------------------------------------------------------- a função
-- Mesma função de supabase-migration-acesso.sql, agora com os limites.
create or replace function reservar(
  p_data date,
  p_horario text,
  p_mesas jsonb,
  p_nome text,
  p_telefone text,
  p_email text default null,
  p_aniversario text default null,
  p_observacao text default null
) returns setof reservas
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  v_numero text;
  v_pessoas int;
  v_capacidade int;
  v_dia text;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_digitos text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_ids uuid[] := '{}';
  v_id uuid;
  v_admin boolean := eh_admin();
  v_limites limites_reserva%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_chave text;
  v_qtd int;
begin
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception 'DADOS_INVALIDOS: nome' using errcode = 'P0001';
  end if;
  if char_length(v_digitos) < 8 or char_length(v_digitos) > 15 or char_length(v_telefone) > 20 then
    raise exception 'DADOS_INVALIDOS: telefone' using errcode = 'P0001';
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$') then
    raise exception 'DADOS_INVALIDOS: email' using errcode = 'P0001';
  end if;
  if p_horario is null or p_horario !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'DADOS_INVALIDOS: horario' using errcode = 'P0001';
  end if;
  if p_data is null then
    raise exception 'DATA_FORA_DA_AGENDA: sem data' using errcode = 'P0001';
  end if;
  if p_mesas is null or jsonb_typeof(p_mesas) <> 'array' or jsonb_array_length(p_mesas) < 1 or jsonb_array_length(p_mesas) > 30 then
    raise exception 'DADOS_INVALIDOS: mesas' using errcode = 'P0001';
  end if;

  v_dia := case extract(dow from p_data)::int when 5 then 'sexta' when 6 then 'sabado' when 0 then 'domingo' else null end;
  if v_dia is null then
    raise exception 'DATA_FORA_DA_AGENDA: o restaurante so recebe reservas na sexta, no sabado e no domingo' using errcode = 'P0001';
  end if;

  -- ---------------------------------------------- limites (só para o site)
  if not v_admin then
    select * into v_limites from limites_reserva where id = 1;
    if not found then
      v_limites := row(1, 15, 15, 4, 30)::limites_reserva;
    end if;

    -- uma reserva de cada vez por telefone: duas abas mandando juntas não
    -- passam as duas pelo limite
    v_chave := case when char_length(v_digitos) > 11 and left(v_digitos, 2) = '55' then substr(v_digitos, 3) else v_digitos end;
    perform pg_advisory_xact_lock(hashtext('reservar:' || v_chave));

    if jsonb_array_length(p_mesas) > v_limites.mesas_por_reserva then
      raise exception 'LIMITE_DE_RESERVAS: mesas por reserva' using errcode = 'P0001';
    end if;

    select count(*) into v_qtd
      from reservas r
     where not r.cancelada
       and r.data_reserva >= v_hoje
       and (case when char_length(regexp_replace(r.telefone, '\D', '', 'g')) > 11 and left(regexp_replace(r.telefone, '\D', '', 'g'), 2) = '55'
                 then substr(regexp_replace(r.telefone, '\D', '', 'g'), 3)
                 else regexp_replace(r.telefone, '\D', '', 'g') end) = v_chave;
    if v_qtd + jsonb_array_length(p_mesas) > v_limites.mesas_por_telefone then
      raise exception 'LIMITE_DE_RESERVAS: mesas por telefone' using errcode = 'P0001';
    end if;

    select count(distinct r.data_reserva) into v_qtd
      from reservas r
     where not r.cancelada
       and r.data_reserva >= v_hoje
       and r.data_reserva <> p_data
       and (case when char_length(regexp_replace(r.telefone, '\D', '', 'g')) > 11 and left(regexp_replace(r.telefone, '\D', '', 'g'), 2) = '55'
                 then substr(regexp_replace(r.telefone, '\D', '', 'g'), 3)
                 else regexp_replace(r.telefone, '\D', '', 'g') end) = v_chave;
    if v_qtd + 1 > v_limites.datas_por_telefone then
      raise exception 'LIMITE_DE_RESERVAS: datas por telefone' using errcode = 'P0001';
    end if;

    select count(*) into v_qtd
      from reservas r
     where r.origem = 'site'
       and r.criada_em > now() - interval '10 minutes';
    if v_qtd + jsonb_array_length(p_mesas) > v_limites.mesas_por_10_minutos then
      raise exception 'LIMITE_DE_RESERVAS: muitas reservas agora' using errcode = 'P0001';
    end if;
  end if;

  for item in select * from jsonb_array_elements(p_mesas) loop
    v_numero := item ->> 'numero';
    if coalesce(item ->> 'pessoas', '') !~ '^[0-9]{1,3}$' then
      raise exception 'DADOS_INVALIDOS: pessoas' using errcode = 'P0001';
    end if;
    v_pessoas := (item ->> 'pessoas')::int;

    v_capacidade := null;
    select m.capacidade into v_capacidade from mesas m where m.numero = v_numero;
    if v_capacidade is null then
      raise exception 'DADOS_INVALIDOS: a mesa % nao existe', coalesce(v_numero, '?') using errcode = 'P0001';
    end if;
    if v_pessoas < 1 or v_pessoas > v_capacidade then
      raise exception 'DADOS_INVALIDOS: a mesa % nao comporta % pessoas', v_numero, v_pessoas using errcode = 'P0001';
    end if;

    insert into reservas (dia, data_reserva, horario, mesa_numero, pessoas, nome, telefone, email, aniversario, observacao, origem)
    values (
      v_dia, p_data, p_horario, v_numero, v_pessoas, v_nome, v_telefone, v_email,
      nullif(btrim(coalesce(p_aniversario, '')), ''),
      nullif(left(btrim(coalesce(p_observacao, '')), 200), ''),
      case when v_admin then 'painel' else 'site' end
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return query select r.* from reservas r where r.id = any (v_ids) order by r.mesa_numero;
end $$;
revoke all on function reservar(date, text, jsonb, text, text, text, text, text) from public;
grant execute on function reservar(date, text, jsonb, text, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
