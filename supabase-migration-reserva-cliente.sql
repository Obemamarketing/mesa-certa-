-- Nome e sobrenome, consulta pelo nome completo e o cliente alterar a própria
-- reserva. Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem
-- problema). PRÉ-REQUISITO: as partes anteriores (o supabase-completo.sql
-- roda tudo, na ordem).
--
-- O QUE MUDA
--   1. Reserva e fila de espera feitas PELO SITE exigem nome e sobrenome
--      (duas palavras de pelo menos 2 letras). O painel continua livre: o
--      balcão às vezes só sabe o primeiro nome.
--   2. A consulta pública exige nome e sobrenome e compara PALAVRAS INTEIRAS:
--      "Ana Lima" não acha mais "Mariana Limeira". Continua sem devolver nome,
--      telefone nem observação de ninguém.
--   3. alterar_minha_reserva: o cliente troca data, horário, mesa ou número de
--      pessoas, conferindo os 4 últimos dígitos do telefone (como no
--      cancelamento, com o mesmo bloqueio depois de 5 erros). Ou dá tudo
--      certo (a reserva antiga é cancelada e a nova é gravada), ou NADA muda:
--      se a mesa nova acabou de ser tomada, a antiga continua valendo.
--      Um grupo em várias mesas muda inteiro.

-- ------------------------------------------------------------ ajudante
-- Quantas palavras de pelo menos 2 letras tem um nome.
create or replace function palavras_do_nome(p text) returns int
language sql immutable set search_path = public as $$
  select count(*)::int
    from regexp_split_to_table(btrim(coalesce(p, '')), '\s+') as w
   where char_length(regexp_replace(w, '[^[:alpha:]]', '', 'g')) >= 2
$$;

-- ------------------------------------------------ 1. nome e sobrenome
create or replace function reservas_exigir_sobrenome() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.origem = 'site' and palavras_do_nome(new.nome) < 2 then
    raise exception 'DADOS_INVALIDOS: nome e sobrenome' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists reservas_exigir_sobrenome_trg on reservas;
create trigger reservas_exigir_sobrenome_trg
  before insert on reservas
  for each row execute function reservas_exigir_sobrenome();

create or replace function fila_exigir_sobrenome() returns trigger
language plpgsql set search_path = public as $$
begin
  if palavras_do_nome(new.nome) < 2 then
    raise exception 'DADOS_INVALIDOS: nome e sobrenome' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;
create trigger fila_exigir_sobrenome_trg
  before insert on fila_espera
  for each row execute function fila_exigir_sobrenome();

-- ------------------------------------- 2. consulta pelo nome completo
create or replace function consultar_reservas(p_nome text)
returns table (
  id uuid, dia text, data_reserva date, horario text,
  mesa_numero text, pessoas int, cancelada boolean, chegou boolean, criada_em timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  com_acento constant text := 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
  sem_acento constant text := 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn';
  termo text := lower(translate(btrim(coalesce(p_nome, '')), com_acento, sem_acento));
  palavras text[];
begin
  palavras := array(
    select p from regexp_split_to_table(termo, '\s+') as p
     where char_length(regexp_replace(p, '[^[:alpha:]]', '', 'g')) >= 2
  );
  -- nome e sobrenome, no mínimo
  if coalesce(array_length(palavras, 1), 0) < 2 then
    return;
  end if;

  return query
    select r.id, r.dia, r.data_reserva, r.horario, r.mesa_numero, r.pessoas,
           r.cancelada, r.checkin_em is not null, r.criada_em
      from reservas r
     where r.data_reserva >= (now() at time zone 'America/Sao_Paulo')::date - 30
       -- cada palavra digitada é uma palavra INTEIRA do nome da reserva
       and not exists (
         select 1 from unnest(palavras) as p
          where position(' ' || p || ' ' in ' ' || regexp_replace(lower(translate(r.nome, com_acento, sem_acento)), '\s+', ' ', 'g') || ' ') = 0
       )
     order by r.criada_em desc
     limit 30;
end $$;
revoke all on function consultar_reservas(text) from public;
grant execute on function consultar_reservas(text) to anon, authenticated, service_role;

-- ------------------------------ 3a. conferir os dígitos antes de alterar
-- A tela de consulta confere os 4 últimos dígitos ANTES de o cliente escolher
-- a nova data e mesa (para ele não descobrir só no fim que errou). Mesmo
-- bloqueio do cancelamento: 5 erros e só o restaurante mexe na reserva.
create or replace function conferir_minha_reserva(p_id uuid, p_final_telefone text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  informado text := regexp_replace(coalesce(p_final_telefone, ''), '\D', '', 'g');
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into r from reservas where id = p_id for update;
  if not found then return 'nao_encontrada'; end if;
  if r.cancelada then return 'ja_cancelada'; end if;
  if r.checkin_em is not null or r.data_reserva < hoje then return 'encerrada'; end if;
  if r.tentativas_cancelamento >= 5 then return 'bloqueada'; end if;
  if char_length(informado) <> 4 or right(regexp_replace(r.telefone, '\D', '', 'g'), 4) <> informado then
    update reservas set tentativas_cancelamento = tentativas_cancelamento + 1 where id = p_id;
    return case when r.tentativas_cancelamento + 1 >= 5 then 'bloqueada' else 'telefone' end;
  end if;
  return 'ok';
end $$;

revoke all on function conferir_minha_reserva(uuid, text) from public;
grant execute on function conferir_minha_reserva(uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------- 3. alterar a própria reserva
-- Devolve um JSON: { "status": "...", "reservas": [...] }.
--   ok              alterada (reservas = as novas)
--   telefone        os 4 dígitos não conferem
--   bloqueada       errou 5 vezes: só o restaurante altera agora
--   encerrada       já passou ou o cliente já chegou
--   ja_cancelada / nao_encontrada
--   erro            a nova não deu certo (mesa tomada, data fora da agenda…):
--                   "codigo" e "mensagem" dizem o motivo; a antiga continua valendo
create or replace function alterar_minha_reserva(
  p_id uuid,
  p_final_telefone text,
  p_data date,
  p_horario text,
  p_mesas jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  informado text := regexp_replace(coalesce(p_final_telefone, ''), '\D', '', 'g');
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  novas jsonb;
begin
  select * into r from reservas where id = p_id for update;
  if not found then return jsonb_build_object('status', 'nao_encontrada'); end if;
  if r.cancelada then return jsonb_build_object('status', 'ja_cancelada'); end if;
  if r.checkin_em is not null or r.data_reserva < hoje then return jsonb_build_object('status', 'encerrada'); end if;
  if r.tentativas_cancelamento >= 5 then return jsonb_build_object('status', 'bloqueada'); end if;

  if char_length(informado) <> 4 or right(regexp_replace(r.telefone, '\D', '', 'g'), 4) <> informado then
    update reservas set tentativas_cancelamento = tentativas_cancelamento + 1 where id = p_id;
    return jsonb_build_object('status', case when r.tentativas_cancelamento + 1 >= 5 then 'bloqueada' else 'telefone' end);
  end if;

  -- O bloco abaixo é "tudo ou nada": se a reserva nova falhar, o cancelamento
  -- da antiga é desfeito junto.
  begin
    -- o grupo inteiro (mesmo telefone, data, horário e nome) sai da agenda…
    update reservas g
       set cancelada = true
     where not g.cancelada
       and g.data_reserva = r.data_reserva
       and g.horario = r.horario
       and g.nome = r.nome
       and chave_telefone(g.telefone) = chave_telefone(r.telefone);

    -- …e entra a reserva nova, pelas mesmas regras de quem reserva pelo site
    select coalesce(jsonb_agg(to_jsonb(n) order by n.mesa_numero), '[]'::jsonb) into novas
      from reservar(p_data, p_horario, p_mesas, r.nome, r.telefone, r.email, r.aniversario, r.observacao) n;
  exception when others then
    return jsonb_build_object('status', 'erro', 'codigo', sqlstate, 'mensagem', sqlerrm);
  end;

  return jsonb_build_object('status', 'ok', 'reservas', novas);
end $$;

revoke all on function alterar_minha_reserva(uuid, text, date, text, jsonb) from public;
grant execute on function alterar_minha_reserva(uuid, text, date, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
