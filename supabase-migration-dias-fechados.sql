-- Dias em que o restaurante está FECHADO.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- O administrador marca os dias no calendário do painel (Admin > Calendário).
-- Nesses dias o cliente não consegue reservar mesa: a tela mostra "fechado" e
-- o próprio banco recusa a reserva, mesmo que alguém tente por fora da tela.

create table if not exists dias_fechados (
  data date primary key,
  motivo text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- recusa
-- Antes de gravar uma reserva, confere se a data dela está fechada. A data é
-- a próxima ocorrência do dia da semana em São Paulo (a mesma regra do app e
-- do gatilho de lembretes); se a reserva já trouxer data_reserva, vale ela.
create or replace function reservas_verificar_fechamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  alvo date;
  dow_alvo int;
  diff int;
begin
  begin
    alvo := new.data_reserva;
  exception when undefined_column then
    alvo := null;
  end;

  if alvo is null then
    dow_alvo := case new.dia when 'sexta' then 5 when 'sabado' then 6 else 0 end;
    diff := (dow_alvo - extract(dow from hoje)::int + 7) % 7;
    if diff = 0 then diff := 7; end if;
    alvo := hoje + diff;
  end if;

  if exists (select 1 from dias_fechados where data = alvo) then
    raise exception 'RESTAURANTE_FECHADO' using errcode = 'P0001';
  end if;

  return new;
end $$;

-- O nome começa depois de "reservas_definir_data_trg": gatilhos BEFORE
-- disparam em ordem alfabética, e este precisa ver a data já definida.
drop trigger if exists reservas_verificar_fechamento_trg on reservas;
create trigger reservas_verificar_fechamento_trg
  before insert on reservas
  for each row execute function reservas_verificar_fechamento();

-- --------------------------------------------------------------- segurança
-- Mesmo critério do protótipo (sem login): a chave anônima lê e o painel
-- marca/desmarca os dias.
alter table dias_fechados enable row level security;

drop policy if exists dias_fechados_select on dias_fechados;
create policy dias_fechados_select on dias_fechados for select using (true);

drop policy if exists dias_fechados_insert on dias_fechados;
create policy dias_fechados_insert on dias_fechados for insert with check (true);

drop policy if exists dias_fechados_update on dias_fechados;
create policy dias_fechados_update on dias_fechados for update using (true) with check (true);

drop policy if exists dias_fechados_delete on dias_fechados;
create policy dias_fechados_delete on dias_fechados for delete using (true);

grant select, insert, update, delete on dias_fechados to anon, authenticated;
grant all on dias_fechados to service_role;

-- O site se atualiza sozinho quando o administrador fecha ou reabre um dia.
do $$ begin
  alter publication supabase_realtime add table dias_fechados;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;
