-- Almoço de sábado: dias, horários e quanto tempo a mesa fica presa.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- PRÉ-REQUISITO: as partes anteriores (o supabase-completo.sql roda tudo, na ordem).
--
-- O QUE MUDA (decisão de 30/10/2026 para o ZéPelin, que é o piloto)
--   1. Só SÁBADO recebe reserva (antes: sexta, sábado e domingo).
--   2. Horários de almoço: 12h, 12h30, 13h, 13h30, 14h e 14h30 (antes: só 19h30).
--   3. Cada reserva segura a mesa por 1h30: quem reserva a mesa 05 às 12h
--      deixa a 05 livre a partir das 13h30. Antes cada horário era independente
--      (só existia um).
--
--   Os números ficam na tabela "funcionamento" (uma linha só). Para mudar, por
--   exemplo, para sábado e domingo:
--     update funcionamento set dias_semana = '{6,0}';
--   e o mesmo em lib/regras.ts (DIAS_DA_SEMANA_ABERTOS, HORARIOS e
--   DURACAO_RESERVA_MINUTOS). Na reforma para vários restaurantes, esta tabela
--   vira uma linha por restaurante.

-- ---------------------------------------------------------------- tabela
create table if not exists funcionamento (
  id int primary key default 1 check (id = 1),
  -- dias da semana em que dá para reservar: 0 = domingo … 6 = sábado
  dias_semana int[] not null default '{6}',
  -- quanto tempo uma reserva segura a mesa
  duracao_minutos int not null default 90 check (duracao_minutos between 15 and 600)
);
insert into funcionamento (id) values (1) on conflict (id) do nothing;
-- deixa os valores do almoço de sábado mesmo se a linha já existia
update funcionamento set dias_semana = '{6}', duracao_minutos = 90 where id = 1;

-- só o SQL Editor (e o servidor) mexe; ninguém lê pela API
alter table funcionamento enable row level security;
revoke all on funcionamento from anon, authenticated;
grant all on funcionamento to service_role;

-- os horários que o SITE aceita (a função reservar já confere esta lista)
alter table limites_reserva alter column horarios_permitidos set default '{12:00,12:30,13:00,13:30,14:00,14:30}';
update limites_reserva set horarios_permitidos = '{12:00,12:30,13:00,13:30,14:00,14:30}' where id = 1;

-- ------------------------------------------------- dias em que dá para reservar
-- Mesma função de supabase-migration-agenda.sql, agora com os dias da tabela
-- "funcionamento" no lugar de sexta/sábado/domingo fixos. Vale para o site e
-- para o painel.
create or replace function reservas_validar_data() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  dow int;
  abertos int[];
begin
  if new.data_reserva is null then
    return new;
  end if;

  select f.dias_semana into abertos from funcionamento f where f.id = 1;
  abertos := coalesce(abertos, '{6}');
  dow := extract(dow from new.data_reserva)::int;
  if not (dow = any (abertos)) then
    raise exception 'DATA_FORA_DA_AGENDA: o restaurante nao recebe reservas neste dia da semana' using errcode = 'P0001';
  end if;
  if new.data_reserva <= hoje then
    raise exception 'DATA_FORA_DA_AGENDA: a data precisa ser de amanha em diante' using errcode = 'P0001';
  end if;
  if new.data_reserva > hoje + 62 then
    raise exception 'DATA_FORA_DA_AGENDA: a agenda so abre dois meses a frente' using errcode = 'P0001';
  end if;

  -- a data é que manda: o campo "dia" acompanha
  new.dia := case dow when 5 then 'sexta' when 6 then 'sabado' else 'domingo' end;
  return new;
end $$;

-- ------------------------------------------------ fila: os mesmos dias
create or replace function fila_validar_dia() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  abertos int[];
begin
  select f.dias_semana into abertos from funcionamento f where f.id = 1;
  if not (extract(dow from new.data_reserva)::int = any (coalesce(abertos, '{6}'))) then
    raise exception 'DATA_FORA_DA_AGENDA: o restaurante nao recebe reservas neste dia da semana' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists fila_validar_dia_trg on fila_espera;
create trigger fila_validar_dia_trg
  before insert on fila_espera
  for each row execute function fila_validar_dia();

-- ------------------------------------------- a mesa fica presa por 1h30
-- Antes de gravar (ou reativar, ou trocar mesa/horário de) uma reserva, confere
-- se a mesma mesa já tem outra reserva ativa na mesma data começando a menos
-- de duracao_minutos desta. Se tiver, recusa com o mesmo erro do índice único
-- (23505): o site já trata como "essa mesa acabou de ser reservada".
-- O nome começa com "zz" para rodar depois dos outros gatilhos (que definem e
-- conferem a data): gatilhos BEFORE rodam em ordem alfabética.
create or replace function reservas_conferir_conflito() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  duracao int;
  minutos_novo int;
begin
  if new.cancelada or new.data_reserva is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.cancelada = new.cancelada
     and old.data_reserva is not distinct from new.data_reserva
     and old.horario = new.horario
     and old.mesa_numero = new.mesa_numero then
    return new; -- só mudou outra coisa (check-in, observação…)
  end if;

  select f.duracao_minutos into duracao from funcionamento f where f.id = 1;
  duracao := coalesce(duracao, 90);
  minutos_novo := split_part(new.horario, ':', 1)::int * 60 + split_part(new.horario, ':', 2)::int;

  -- duas pessoas reservando a mesma mesa no mesmo dia, ao mesmo tempo: uma
  -- espera a outra terminar, e aí enxerga a reserva dela
  perform pg_advisory_xact_lock(hashtext('mesa:' || new.data_reserva::text || ':' || new.mesa_numero));

  if exists (
    select 1 from reservas r
     where r.id <> new.id
       and not r.cancelada
       and r.data_reserva = new.data_reserva
       and r.mesa_numero = new.mesa_numero
       and abs((split_part(r.horario, ':', 1)::int * 60 + split_part(r.horario, ':', 2)::int) - minutos_novo) < duracao
  ) then
    raise exception 'MESA_OCUPADA: a mesa % ja tem reserva perto deste horario', new.mesa_numero using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists reservas_zz_conflito_trg on reservas;
create trigger reservas_zz_conflito_trg
  before insert or update on reservas
  for each row execute function reservas_conferir_conflito();

notify pgrst, 'reload schema';
