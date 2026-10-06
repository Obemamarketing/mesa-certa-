-- Lembretes automáticos de reserva via WhatsApp.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema:
-- tudo aqui é idempotente). Depois rode também supabase-cron-lembretes.sql.
--
-- Como funciona:
--   1. Ao criar uma reserva, um gatilho calcula a data real da reserva e
--      agenda o lembrete (horário da reserva - antecedência configurada).
--   2. Um cron (pg_cron) chama a rota /api/lembretes/cron do app a cada 5 min.
--   3. A rota reivindica os lembretes vencidos (reivindicar_lembretes),
--      envia pela API oficial do WhatsApp e grava o resultado aqui.
-- O envio é feito pelo backend — nada depende do navegador do cliente.

-- ---------------------------------------------------------------- reservas
-- Data real da reserva (o campo "dia" guarda só sexta/sábado/domingo).
alter table reservas add column if not exists data_reserva date;

-- ----------------------------------------------------------- configuração
create table if not exists config_lembretes (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  antecedencia_minutos int not null default 180 check (antecedencia_minutos between 15 and 1440),
  atualizado_em timestamptz not null default now()
);

insert into config_lembretes (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- lembretes
create table if not exists lembretes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  -- "tipo" deixa a estrutura pronta pra outros lembretes no futuro
  -- (ex: um segundo aviso mais perto do horário).
  tipo text not null default 'antecedencia',
  antecedencia_minutos int not null,
  reserva_em timestamptz not null,
  agendado_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado', 'expirado', 'ignorado')),
  tentativas int not null default 0,
  iniciado_em timestamptz,
  enviado_em timestamptz,
  wa_message_id text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- garante que o mesmo lembrete nunca é criado (nem enviado) duas vezes
  unique (reserva_id, tipo)
);

create index if not exists lembretes_pendentes_idx
  on lembretes_whatsapp (agendado_para) where status = 'pendente';

-- ----------------------------------------------------------------- gatilhos
-- Define a data real da reserva: próxima ocorrência do dia da semana, no
-- fuso de São Paulo (mesma regra do app: reserva no próprio dia vale pra
-- semana seguinte).
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

-- Agenda o lembrete quando a reserva é criada. Qualquer erro aqui vira só um
-- aviso: lembrete nunca pode impedir uma reserva de ser salva.
create or replace function reservas_criar_lembrete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  minutos int;
  quando timestamptz;
  agendado timestamptz;
begin
  begin
    select antecedencia_minutos into minutos from config_lembretes where id = 1;
    minutos := coalesce(minutos, 180);

    quando := (new.data_reserva + new.horario::time) at time zone 'America/Sao_Paulo';
    agendado := quando - make_interval(mins => minutos);

    insert into lembretes_whatsapp (reserva_id, tipo, antecedencia_minutos, reserva_em, agendado_para, status, erro)
    values (
      new.id, 'antecedencia', minutos, quando, agendado,
      case when agendado <= now() then 'ignorado' else 'pendente' end,
      case when agendado <= now() then 'Reserva criada já dentro da janela do lembrete' else null end
    )
    on conflict (reserva_id, tipo) do nothing;
  exception when others then
    raise warning 'lembrete nao agendado para a reserva %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists reservas_criar_lembrete_trg on reservas;
create trigger reservas_criar_lembrete_trg
  after insert on reservas
  for each row execute function reservas_criar_lembrete();

-- Reserva cancelada → lembrete pendente é cancelado.
create or replace function reservas_cancelar_lembrete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update lembretes_whatsapp
     set status = 'cancelado', atualizado_em = now()
   where reserva_id = new.id and status = 'pendente';
  return new;
end $$;

drop trigger if exists reservas_cancelar_lembrete_trg on reservas;
create trigger reservas_cancelar_lembrete_trg
  after update of cancelada on reservas
  for each row when (new.cancelada and not old.cancelada)
  execute function reservas_cancelar_lembrete();

-- Mudou a antecedência (ex: de 3h pra 2h)? Reagenda os lembretes pendentes.
create or replace function config_lembretes_reagendar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.antecedencia_minutos is distinct from old.antecedencia_minutos then
    update lembretes_whatsapp
       set antecedencia_minutos = new.antecedencia_minutos,
           agendado_para = reserva_em - make_interval(mins => new.antecedencia_minutos),
           atualizado_em = now()
     where status = 'pendente';
  end if;
  return new;
end $$;

drop trigger if exists config_lembretes_reagendar_trg on config_lembretes;
create trigger config_lembretes_reagendar_trg
  before update on config_lembretes
  for each row execute function config_lembretes_reagendar();

-- ------------------------------------------------- reivindicar lembretes
-- Chamada só pelo backend (service_role). Faz a "limpeza" e entrega ao
-- backend os lembretes que devem ser enviados AGORA, já marcados como
-- "enviando" numa única operação atômica — duas execuções simultâneas do
-- cron nunca pegam o mesmo lembrete (for update skip locked).
create or replace function reivindicar_lembretes(limite int default 20)
returns table (
  lembrete_id uuid,
  reserva_id uuid,
  nome text,
  telefone text,
  pessoas int,
  mesa_numero text,
  horario text,
  data_reserva date,
  tentativas int
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  -- envio que travou há mais de 15 min: não reenvia (poderia duplicar),
  -- marca como falha pro administrador ver.
  update lembretes_whatsapp
     set status = 'falhou', erro = 'Envio interrompido (sem resposta); não reenviado para evitar duplicidade', atualizado_em = now()
   where status = 'enviando' and iniciado_em < now() - interval '15 minutes';

  -- reserva cancelada: nunca envia
  update lembretes_whatsapp l
     set status = 'cancelado', atualizado_em = now()
    from reservas r
   where l.reserva_id = r.id and l.status = 'pendente' and r.cancelada;

  -- reserva já aconteceu: lembrete perdeu o sentido
  update lembretes_whatsapp
     set status = 'expirado', erro = 'Horário da reserva já passou', atualizado_em = now()
   where status = 'pendente' and reserva_em <= now();

  return query
  with alvo as (
    select l.id
      from lembretes_whatsapp l
      join reservas r on r.id = l.reserva_id
     where l.status = 'pendente' and l.agendado_para <= now() and not r.cancelada
     order by l.agendado_para
     limit limite
       for update of l skip locked
  )
  update lembretes_whatsapp l
     set status = 'enviando', iniciado_em = now(), atualizado_em = now(), tentativas = l.tentativas + 1
    from alvo, reservas r
   where l.id = alvo.id and r.id = l.reserva_id
  returning l.id, r.id, r.nome, r.telefone, r.pessoas, r.mesa_numero, r.horario, r.data_reserva, l.tentativas;
end $$;

revoke all on function reivindicar_lembretes(int) from public, anon, authenticated;
grant execute on function reivindicar_lembretes(int) to service_role;

-- --------------------------------------------------------------- segurança
-- Mesmo critério do restante do protótipo (sem login): o painel lê os
-- lembretes e liga/desliga a configuração com a chave anônima. Ninguém com
-- a chave anônima consegue criar, alterar ou apagar lembretes — só o
-- backend (service_role) e os gatilhos acima.
alter table config_lembretes enable row level security;
alter table lembretes_whatsapp enable row level security;

drop policy if exists config_lembretes_select on config_lembretes;
create policy config_lembretes_select on config_lembretes for select using (true);
drop policy if exists config_lembretes_update on config_lembretes;
create policy config_lembretes_update on config_lembretes for update using (true) with check (true);

drop policy if exists lembretes_select on lembretes_whatsapp;
create policy lembretes_select on lembretes_whatsapp for select using (true);

-- Atualiza o painel em tempo real quando um lembrete muda de status.
do $$ begin
  alter publication supabase_realtime add table lembretes_whatsapp;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;
