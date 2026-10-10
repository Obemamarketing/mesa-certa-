-- Reservas passam a valer por DATA, não só pelo dia da semana.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- O PROBLEMA
--   O índice que impedia duas reservas na mesma mesa era (dia, horario,
--   mesa_numero), e "dia" é só sexta/sábado/domingo. Uma reserva feita para a
--   sexta 10/10 continuava segurando a mesa em TODAS as sextas seguintes: a
--   mesa aparecia ocupada e o banco recusava a nova reserva ("acabou de ser
--   reservada") mesmo estando livre naquela data.
--
-- O QUE MUDA
--   1. toda reserva passa a ter data_reserva preenchida. As antigas recebem a
--      data pela mesma regra que o sistema sempre usou: a próxima ocorrência
--      do dia da semana, contada a partir do dia em que foram criadas;
--   2. o índice único passa a ser (data_reserva, horario, mesa_numero);
--   3. renomear_mesa confere conflito por data, não por dia da semana.
--
-- Nenhuma reserva é apagada ou alterada, só ganha a data.

-- ----------------------------------------------------------------- coluna
alter table reservas add column if not exists data_reserva date;

-- Quem define a data em reservas novas (mesma função do arquivo de lembretes,
-- repetida aqui para este arquivo valer sozinho): reserva no próprio dia da
-- semana vale para a semana seguinte, no fuso de São Paulo.
create or replace function reservas_definir_data() returns trigger
language plpgsql as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  dow_alvo int;
  diff int;
begin
  if new.data_reserva is null then
    dow_alvo := case new.dia when 'sexta' then 5 when 'sabado' then 6 else 0 end;
    diff := (dow_alvo - extract(dow from hoje)::int + 7) % 7;
    if diff = 0 then diff := 7; end if;
    new.data_reserva := hoje + diff;
  end if;
  return new;
end $$;

drop trigger if exists reservas_definir_data_trg on reservas;
create trigger reservas_definir_data_trg
  before insert on reservas
  for each row execute function reservas_definir_data();

-- --------------------------------------------------- reservas já existentes
update reservas r
   set data_reserva = d.criada_dia + case when d.diff = 0 then 7 else d.diff end
  from (
    select id,
           (criada_em at time zone 'America/Sao_Paulo')::date as criada_dia,
           (
             case dia when 'sexta' then 5 when 'sabado' then 6 else 0 end
             - extract(dow from (criada_em at time zone 'America/Sao_Paulo')::date)::int
             + 7
           ) % 7 as diff
      from reservas
     where data_reserva is null
  ) d
 where r.id = d.id;

-- A partir daqui o banco não aceita mais reserva sem data. O gatilho acima
-- preenche antes da checagem, então o site continua gravando normalmente.
alter table reservas alter column data_reserva set not null;

-- ------------------------------------------------------------------ índice
-- O novo entra antes de o antigo sair: nunca fica um instante sem proteção.
create unique index if not exists reservas_slot_data_unico
  on reservas (data_reserva, horario, mesa_numero)
  where not cancelada;

drop index if exists reservas_slot_unico;

-- ------------------------------------------------------------ renomear mesa
-- Mesma função de supabase-migration-mesas.sql, agora comparando por data: a
-- reserva da sexta passada não pode mais "conflitar" com a da sexta que vem.
create or replace function renomear_mesa(mesa_id uuid, novo_numero text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  atual text;
begin
  novo_numero := trim(novo_numero);

  if novo_numero is null or novo_numero = '' then
    raise exception 'O número da mesa não pode ficar em branco';
  end if;

  select numero into atual from mesas where id = mesa_id for update;
  if atual is null then
    raise exception 'Mesa não encontrada';
  end if;

  if atual = novo_numero then
    return;
  end if;

  if exists (select 1 from mesas where numero = novo_numero) then
    raise exception 'Já existe uma mesa com o número %', novo_numero;
  end if;

  -- duas reservas da mesma mesa/data/horário colidiriam no índice único
  if exists (
    select 1
      from reservas r
     where r.mesa_numero = novo_numero
       and not r.cancelada
       and exists (
         select 1 from reservas o
          where o.mesa_numero = atual and not o.cancelada
            and o.data_reserva = r.data_reserva and o.horario = r.horario
       )
  ) then
    raise exception 'Há reservas conflitantes no número %', novo_numero;
  end if;

  update reservas set mesa_numero = novo_numero where mesa_numero = atual;
  update mesas set numero = novo_numero where id = mesa_id;
end $$;

grant execute on function renomear_mesa(uuid, text) to anon, authenticated, service_role;
