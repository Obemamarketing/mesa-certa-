-- Agenda de dois meses e aniversário do cliente.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- PRÉ-REQUISITO: supabase-migration-datas.sql (reservas por data). Sem ele, a
-- mesma mesa não pode ser reservada em sextas diferentes e a agenda de dois
-- meses não funciona. O supabase-completo.sql já roda os dois, na ordem certa.
--
-- O QUE MUDA
--   1. O cliente passa a escolher a DATA da reserva, até dois meses à frente.
--      O banco confere a data escolhida: tem que ser sexta, sábado ou domingo,
--      de amanhã em diante, e no máximo 62 dias à frente (60 da tela + 2 de
--      folga). Sem isso, alguém mexendo por fora da tela poderia gravar reserva
--      numa terça-feira ou daqui a dois anos.
--   2. A reserva ganha o aniversário do cliente (só dia e mês: "12/03").

-- ------------------------------------------------------------- aniversário
alter table reservas add column if not exists aniversario text;

-- Só dia e mês, e só dias que existem (31/04 e 30/02 não passam; 29/02 passa).
alter table reservas drop constraint if exists reservas_aniversario_valido;
alter table reservas add constraint reservas_aniversario_valido check (
  aniversario is null
  or (
    aniversario ~ '^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])$'
    and not (substr(aniversario, 4, 2) in ('04', '06', '09', '11') and substr(aniversario, 1, 2) = '31')
    and not (substr(aniversario, 4, 2) = '02' and substr(aniversario, 1, 2) in ('30', '31'))
  )
);

-- ------------------------------------------------------ validação da data
-- Roda antes de gravar, DEPOIS de reservas_definir_data_trg (que preenche a
-- data quando o site não manda) e ANTES de reservas_verificar_fechamento_trg:
-- os gatilhos BEFORE disparam em ordem alfabética do nome.
create or replace function reservas_validar_data() returns trigger
language plpgsql as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  dow int;
begin
  if new.data_reserva is null then
    return new;
  end if;

  dow := extract(dow from new.data_reserva)::int;
  if dow not in (5, 6, 0) then
    raise exception 'DATA_FORA_DA_AGENDA: o restaurante so recebe reservas na sexta, no sabado e no domingo' using errcode = 'P0001';
  end if;
  if new.data_reserva <= hoje then
    raise exception 'DATA_FORA_DA_AGENDA: a data precisa ser de amanha em diante' using errcode = 'P0001';
  end if;
  if new.data_reserva > hoje + 62 then
    raise exception 'DATA_FORA_DA_AGENDA: a agenda so abre dois meses a frente' using errcode = 'P0001';
  end if;

  -- a data é que manda: o campo "dia" acompanha, venha o que vier do navegador
  new.dia := case dow when 5 then 'sexta' when 6 then 'sabado' else 'domingo' end;
  return new;
end $$;

drop trigger if exists reservas_validar_data_trg on reservas;
create trigger reservas_validar_data_trg
  before insert on reservas
  for each row execute function reservas_validar_data();

-- Avisa a API do Supabase que a tabela ganhou uma coluna (senão o site pode
-- levar alguns instantes para enxergar "aniversario").
notify pgrst, 'reload schema';
