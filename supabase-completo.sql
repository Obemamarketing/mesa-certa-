-- =====================================================================
-- Mesa Certa — SQL COMPLETO para o Supabase
-- =====================================================================
-- Cole tudo no SQL Editor do Supabase (New query) e clique em Run.
--
-- É seguro rodar mais de uma vez: tudo aqui é idempotente e NÃO desfaz
-- reservas, nem posições de mesas que você já calibrou no painel, nem os
-- dias fechados que você já marcou no calendário.
--
-- O que este arquivo faz, nesta ordem:
--   1. observação da reserva        (coluna reservas.observacao)
--   2. check-in                     (coluna reservas.checkin_em)
--   3. lembretes por WhatsApp       (tabelas, gatilhos, função de envio)
--   4. planta oficial / mesas       (tabela mesas, 20 mesas, renomear_mesa)
--   5. dias fechados (calendário)   (tabela dias_fechados e bloqueio)
--
-- FICA DE FORA de propósito: supabase-cron-lembretes.sql. Ele precisa do
-- seu CRON_SECRET e só faz sentido depois do deploy — rode à parte.
--
-- Pré-requisito: a tabela "reservas" já existe (supabase-schema.sql).
-- =====================================================================


-- #####################################################################
-- 1. OBSERVAÇÃO DA RESERVA
-- #####################################################################
alter table reservas add column if not exists observacao text;


-- #####################################################################
-- 2. CHECK-IN
-- #####################################################################
alter table reservas add column if not exists checkin_em timestamptz;


-- #####################################################################
-- 3. LEMBRETES AUTOMÁTICOS POR WHATSAPP
-- #####################################################################
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

-- Permissões explícitas (não dependem dos privilégios padrão do projeto).
grant select, update on config_lembretes to anon, authenticated;
grant select on lembretes_whatsapp to anon, authenticated;
grant all on config_lembretes, lembretes_whatsapp to service_role;

-- Atualiza o painel em tempo real quando um lembrete muda de status.
do $$ begin
  alter publication supabase_realtime add table lembretes_whatsapp;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;


-- #####################################################################
-- 4. PLANTA OFICIAL DO ZÉPELIN (MESAS)
-- #####################################################################
-- Planta oficial do ZéPelin como configuração central.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema:
-- tudo aqui é idempotente e NÃO desfaz posições já ajustadas no painel).
--
-- A planta é a imagem public/planta-zepelin.webp. Esta tabela guarda, para cada
-- mesa desenhada nela, onde fica o marcador do sistema: pos_x e pos_y são
-- PORCENTAGENS da imagem (0 a 100), então a mesma configuração serve no
-- desktop e no celular, em qualquer tamanho de tela.
--
-- Painel (Mesas), modo operação e tela do cliente leem daqui. Não existe
-- planta por tela.

create table if not exists mesas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  capacidade int not null check (capacidade between 1 and 20),
  formato text not null default 'quadrada' check (formato in ('redonda', 'quadrada')),
  zona text not null,
  -- posição do marcador sobre a imagem, em % da largura/altura
  pos_x numeric not null check (pos_x between 0 and 100),
  pos_y numeric not null check (pos_y between 0 and 100),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

-- A planta oficial tem quatro ambientes (o anexo fica só à esquerda).
alter table mesas drop constraint if exists mesas_zona_check;
alter table mesas add constraint mesas_zona_check
  check (zona in ('Salão principal', 'Salão anexo', 'Palco', 'Área externa'));

create index if not exists mesas_zona_idx on mesas (zona);

-- Seed: as 20 mesas da planta oficial, na posição em que estão desenhadas.
-- Só insere o que falta; nunca sobrescreve o que já existe.
insert into mesas (numero, capacidade, formato, zona, pos_x, pos_y) values
  ('01', 4, 'quadrada', 'Salão principal', 42.33, 32.89),
  ('02', 4, 'quadrada', 'Salão principal', 53.20, 35.12),
  ('03', 4, 'quadrada', 'Salão principal', 63.53, 35.16),
  ('04', 4, 'quadrada', 'Salão principal', 74.09, 35.33),
  ('05', 6, 'quadrada', 'Salão principal', 44.49, 44.35),
  ('06', 4, 'quadrada', 'Salão principal', 60.22, 46.46),
  ('07', 4, 'quadrada', 'Salão principal', 73.63, 46.25),
  ('08', 4, 'quadrada', 'Salão principal', 42.21, 54.16),
  ('09', 4, 'quadrada', 'Salão principal', 51.81, 54.12),
  ('10', 6, 'quadrada', 'Salão principal', 69.08, 56.43),
  ('11', 4, 'quadrada', 'Salão anexo',     12.37, 35.28),
  ('12', 4, 'quadrada', 'Salão anexo',     22.47, 35.28),
  ('13', 4, 'quadrada', 'Salão anexo',     12.37, 46.21),
  ('14', 4, 'quadrada', 'Salão anexo',     22.59, 46.25),
  ('15', 4, 'quadrada', 'Salão anexo',     12.37, 59.77),
  ('16', 4, 'quadrada', 'Salão anexo',     22.51, 59.77),
  ('17', 2, 'quadrada', 'Palco',           38.16, 79.18),
  ('18', 4, 'quadrada', 'Área externa',    15.46, 17.11),
  ('19', 4, 'quadrada', 'Área externa',    34.97, 17.23),
  ('20', 4, 'quadrada', 'Área externa',    51.89, 17.35)
on conflict (numero) do nothing;

-- Instalações anteriores do protótipo tinham 15 mesas com outra distribuição
-- (01-04 no Palco, 11 no Salão principal) e coordenadas de um desenho que não
-- existe mais. Este bloco alinha essas mesas à planta oficial UMA vez: só
-- mexe em quem ainda está com coordenada fora da escala de porcentagem.
do $$
begin
  if exists (select 1 from mesas where pos_x > 100 or pos_y > 100) then
    update mesas m set
      zona = p.zona,
      pos_x = p.pos_x,
      pos_y = p.pos_y,
      capacidade = p.capacidade,
      formato = 'quadrada'
    from (values
      ('01','Salão principal',42.33,32.89,4), ('02','Salão principal',53.20,35.12,4),
      ('03','Salão principal',63.53,35.16,4), ('04','Salão principal',74.09,35.33,4),
      ('05','Salão principal',44.49,44.35,6), ('06','Salão principal',60.22,46.46,4),
      ('07','Salão principal',73.63,46.25,4), ('08','Salão principal',42.21,54.16,4),
      ('09','Salão principal',51.81,54.12,4), ('10','Salão principal',69.08,56.43,6),
      ('11','Salão anexo',12.37,35.28,4),     ('12','Salão anexo',22.47,35.28,4),
      ('13','Salão anexo',12.37,46.21,4),     ('14','Salão anexo',22.59,46.25,4),
      ('15','Salão anexo',12.37,59.77,4),     ('16','Salão anexo',22.51,59.77,4)
    ) as p(numero, zona, pos_x, pos_y, capacidade)
    where m.numero = p.numero;
  end if;
end $$;

-- carimbo de atualização
create or replace function mesas_marcar_atualizacao() returns trigger
language plpgsql as $$
begin
  new.atualizada_em := now();
  return new;
end $$;

drop trigger if exists mesas_atualizacao_trg on mesas;
create trigger mesas_atualizacao_trg
  before update on mesas
  for each row execute function mesas_marcar_atualizacao();

-- ------------------------------------------------------------- renomear
-- Renomear uma mesa leva junto as reservas que apontam pra ela: reservas
-- guardam o NÚMERO da mesa, então sem isso o histórico ficaria órfão.
-- Recusa se o número novo já pertencer a outra mesa.
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

  -- duas reservas da mesma mesa/dia/horário colidiriam no índice único
  if exists (
    select 1
      from reservas r
     where r.mesa_numero = novo_numero
       and not r.cancelada
       and exists (
         select 1 from reservas o
          where o.mesa_numero = atual and not o.cancelada
            and o.dia = r.dia and o.horario = r.horario
       )
  ) then
    raise exception 'Há reservas conflitantes no número %', novo_numero;
  end if;

  update reservas set mesa_numero = novo_numero where mesa_numero = atual;
  update mesas set numero = novo_numero where id = mesa_id;
end $$;

-- --------------------------------------------------------------- segurança
-- Mesmo critério do resto do protótipo (sem login): a chave anônima lê a
-- planta e o painel salva as posições. Criar e apagar mesas fica fora da
-- chave anônima — a planta física muda pouco e não deve sumir por engano.
alter table mesas enable row level security;

drop policy if exists mesas_select on mesas;
create policy mesas_select on mesas for select using (true);

drop policy if exists mesas_update on mesas;
create policy mesas_update on mesas for update using (true) with check (true);

-- Permissões explícitas (não dependem dos privilégios padrão do projeto): o
-- site lê a planta e o painel atualiza; só o backend (service_role) tem acesso
-- total. Ninguém com a chave anônima consegue criar nem apagar mesa.
grant select, update on mesas to anon, authenticated;
grant all on mesas to service_role;

grant execute on function renomear_mesa(uuid, text) to anon, authenticated, service_role;

-- A planta se atualiza sozinha nas outras telas quando alguém salva.
do $$ begin
  alter publication supabase_realtime add table mesas;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;


-- #####################################################################
-- 5. DIAS FECHADOS (CALENDÁRIO)
-- #####################################################################
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
