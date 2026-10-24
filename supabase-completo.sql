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
--   6. reservas por data            (data_reserva obrigatória e índice por data)
--   7. agenda de dois meses         (validação da data escolhida e aniversário)
--   8. login do painel (preparar)   (administradores e funções do site do cliente)
--   9. freio contra abuso           (limites da reserva pelo site)
--  10. fila de espera              (data lotada: entrar, acompanhar, sair)
--  11. login em duas etapas        (o banco exige o código de quem ativou)
--  12. dados do cliente (LGPD)     (pedidos, exclusão e prazo de guarda)
--
-- O item 8 só PREPARA o login: nada fica fechado ao rodar este arquivo. Quem
-- fecha o banco é o supabase-fechar-acesso.sql, rodado à parte, depois de o
-- login estar testado. Banco que já foi fechado CONTINUA fechado.
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

  -- duas reservas da mesma mesa/data/horário colidiriam no índice único.
  -- A data vem via to_jsonb porque este arquivo pode rodar antes de a coluna
  -- data_reserva existir (nesse caso vale o dia da semana, como sempre valeu).
  if exists (
    select 1
      from reservas r
     where r.mesa_numero = novo_numero
       and not r.cancelada
       and exists (
         select 1 from reservas o
          where o.mesa_numero = atual and not o.cancelada
            and coalesce(to_jsonb(o)->>'data_reserva', o.dia) = coalesce(to_jsonb(r)->>'data_reserva', r.dia)
            and o.horario = r.horario
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


-- #####################################################################
-- 6. RESERVAS POR DATA (A DA SEMANA PASSADA NÃO TRAVA A DA QUE VEM)
-- #####################################################################
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


-- #####################################################################
-- 7. AGENDA DE DOIS MESES E ANIVERSÁRIO DO CLIENTE
-- #####################################################################
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


-- #####################################################################
-- 8. LOGIN DO PAINEL E ACESSO AO BANCO (PREPARAR — NADA É FECHADO AQUI)
-- #####################################################################
-- Login do painel e acesso ao banco — PARTE 1: PREPARAR.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Esta parte só ACRESCENTA coisas. Nada é fechado ainda: o site e o painel
-- continuam funcionando exatamente como antes depois de rodá-la.
--
-- O PROBLEMA QUE ISTO RESOLVE
--   Até aqui qualquer pessoa com a chave pública do site (que vai dentro do
--   próprio site) conseguia ler TODAS as reservas — nome, telefone, e-mail — e
--   alterar ou cancelar qualquer uma, sem passar pelo painel. O painel /admin
--   também abria para quem tivesse o endereço.
--
-- COMO FICA
--   1. O painel passa a exigir login (e-mail e senha, pelo Supabase Auth). Só
--      quem está na tabela "administradores" é tratado como administrador —
--      criar uma conta sozinho não dá acesso a nada.
--   2. O site do cliente deixa de ler a tabela de reservas. Ele usa funções que
--      entregam só o necessário:
--        mesas_ocupadas()          quais mesas estão tomadas em cada data (sem nomes)
--        reservar(...)             cria a reserva — o grupo inteiro ou nada
--        consultar_reservas(nome)  a consulta pública, sem nome, telefone nem e-mail
--        cancelar_minha_reserva()  cancela conferindo o final do telefone
--   3. Quando tudo estiver testado, a PARTE 2 (supabase-fechar-acesso.sql)
--      fecha o acesso aberto. Rodar este arquivo de novo depois disso NÃO
--      reabre nada (ver o bloco final).
--
-- PRÉ-REQUISITO: as migrações anteriores (o supabase-completo.sql roda todas).

-- ---------------------------------------------------------- administradores
create table if not exists administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);

-- Ninguém lê nem escreve esta tabela pela API. Ela só é mexida aqui, no SQL
-- Editor (ver supabase-administradores.sql), e lida pela função eh_admin().
alter table administradores enable row level security;
revoke all on administradores from anon, authenticated;
grant all on administradores to service_role;

-- Quem está logado é administrador?
create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores a where a.user_id = auth.uid());
$$;
revoke all on function eh_admin() from public;
grant execute on function eh_admin() to anon, authenticated, service_role;

-- ------------------------------------------------------ aberto ou fechado?
-- Uma linha só, que guarda QUANDO o acesso público foi fechado (PARTE 2).
-- Vazio = ainda aberto, como sempre foi.
create table if not exists acesso_publico (
  id int primary key default 1 check (id = 1),
  fechado_em timestamptz
);
insert into acesso_publico (id) values (1) on conflict (id) do nothing;
alter table acesso_publico enable row level security;
revoke all on acesso_publico from anon, authenticated;
grant all on acesso_publico to service_role;

create or replace function acesso_fechado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select a.fechado_em is not null from acesso_publico a where a.id = 1), false);
$$;
revoke all on function acesso_fechado() from public;
grant execute on function acesso_fechado() to anon, authenticated, service_role;

-- ------------------------------------------- regras para o administrador
-- Valem só para quem está logado E está em "administradores". O (select ...)
-- faz o banco conferir uma vez por consulta, não uma vez por linha.
grant select, insert, update on reservas to authenticated;
drop policy if exists reservas_admin on reservas;
create policy reservas_admin on reservas for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

grant select, update on mesas to authenticated;
drop policy if exists mesas_admin on mesas;
create policy mesas_admin on mesas for update to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

grant select, insert, update, delete on dias_fechados to authenticated;
drop policy if exists dias_fechados_admin on dias_fechados;
create policy dias_fechados_admin on dias_fechados for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

grant select, update on config_lembretes to authenticated;
drop policy if exists config_lembretes_admin on config_lembretes;
create policy config_lembretes_admin on config_lembretes for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

grant select on lembretes_whatsapp to authenticated;
drop policy if exists lembretes_admin on lembretes_whatsapp;
create policy lembretes_admin on lembretes_whatsapp for select to authenticated
  using ((select eh_admin()));

-- ------------------------------------------------------- site do cliente
-- 1) Quais mesas estão tomadas, de hoje em diante. Só data, horário e mesa:
--    nenhum nome, nenhum telefone. Vem como uma lista só (JSON), que não sofre
--    o corte de 1000 linhas da API.
create or replace function mesas_ocupadas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'data', r.data_reserva,
             'horario', r.horario,
             'mesa', r.mesa_numero,
             'chegou', r.checkin_em is not null
           )),
           '[]'::jsonb
         )
    from reservas r
   where not r.cancelada
     and r.data_reserva >= (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function mesas_ocupadas() from public;
grant execute on function mesas_ocupadas() to anon, authenticated, service_role;

-- 2) Criar a reserva. p_mesas = [{"numero":"05","pessoas":4},{"numero":"06","pessoas":3}].
--    Tudo acontece numa transação só: se uma das mesas do grupo já foi levada,
--    NENHUMA é gravada (antes o site gravava uma a uma e desfazia na mão).
--    As regras de data, dia fechado e mesa repetida continuam nos gatilhos e no
--    índice da tabela — esta função não as contorna.
--    (supabase-migration-limites.sql redefine esta função com o freio contra
--    abuso; o supabase-completo.sql roda as duas, nesta ordem.)
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

    insert into reservas (dia, data_reserva, horario, mesa_numero, pessoas, nome, telefone, email, aniversario, observacao)
    values (
      v_dia, p_data, p_horario, v_numero, v_pessoas, v_nome, v_telefone, v_email,
      nullif(btrim(coalesce(p_aniversario, '')), ''),
      nullif(left(btrim(coalesce(p_observacao, '')), 200), '')
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return query select r.* from reservas r where r.id = any (v_ids) order by r.mesa_numero;
end $$;
revoke all on function reservar(date, text, jsonb, text, text, text, text, text) from public;
grant execute on function reservar(date, text, jsonb, text, text, text, text, text) to anon, authenticated, service_role;

-- 3) Consulta pública pelo nome. Devolve só o que a tela de consulta mostra:
--    data, horário, mesa e quantas pessoas. Sem telefone, sem e-mail, sem
--    aniversário, sem observação — e sem o nome: quem consulta já sabe o
--    próprio, e quem digita três letras quaisquer não leva o nome de ninguém.
--    Cada palavra digitada precisa aparecer no nome, em qualquer ordem, sem
--    ligar para acento ou maiúscula. Só reservas dos últimos 30 dias em diante.
drop function if exists consultar_reservas(text);
create function consultar_reservas(p_nome text)
returns table (
  id uuid, dia text, data_reserva date, horario text,
  mesa_numero text, pessoas int, cancelada boolean, chegou boolean, criada_em timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  -- maiúsculas e minúsculas na mesma tabela: não depende de como o banco
  -- trata lower() em letra acentuada
  com_acento constant text := 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
  sem_acento constant text := 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn';
  termo text := lower(translate(btrim(coalesce(p_nome, '')), com_acento, sem_acento));
  palavras text[];
begin
  if char_length(regexp_replace(termo, '\s', '', 'g')) < 3 then
    return;
  end if;
  palavras := array(select p from regexp_split_to_table(termo, '\s+') as p where p <> '');

  return query
    select r.id, r.dia, r.data_reserva, r.horario, r.mesa_numero, r.pessoas,
           r.cancelada, r.checkin_em is not null, r.criada_em
      from reservas r
     where r.data_reserva >= (now() at time zone 'America/Sao_Paulo')::date - 30
       and not exists (
         select 1 from unnest(palavras) as p
          where position(p in lower(translate(r.nome, com_acento, sem_acento))) = 0
       )
     order by r.criada_em desc
     limit 30;
end $$;
revoke all on function consultar_reservas(text) from public;
grant execute on function consultar_reservas(text) to anon, authenticated, service_role;

-- 4) Cancelar pela tela de consulta. Como a consulta é pelo nome, qualquer um
--    acharia a reserva de qualquer "Maria": pra cancelar é preciso informar os
--    4 últimos dígitos do telefone usado na reserva. Cinco erros travam o
--    cancelamento por ali (o restaurante ainda cancela pelo painel).
alter table reservas add column if not exists tentativas_cancelamento int not null default 0;

create or replace function cancelar_minha_reserva(p_id uuid, p_final_telefone text)
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

  update reservas set cancelada = true where id = p_id;
  return 'ok';
end $$;
revoke all on function cancelar_minha_reserva(uuid, text) from public;
grant execute on function cancelar_minha_reserva(uuid, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------ renomear mesa
-- Mesma função de supabase-migration-datas.sql, agora com uma checagem no
-- começo: depois que o acesso for fechado, só administrador renomeia.
create or replace function renomear_mesa(mesa_id uuid, novo_numero text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  atual text;
begin
  if acesso_fechado() and not eh_admin() then
    raise exception 'Sem permissao para renomear mesas' using errcode = '42501';
  end if;

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

-- --------------------------------------------- PARTE 2, guardada em funções
-- O fechamento fica aqui, em funções, pra existir UM lugar só que sabe o que
-- é "fechado". Quem chama é o supabase-fechar-acesso.sql — e o bloco no fim
-- deste arquivo, pra manter fechado o que já estava.

-- Tira as regras abertas. Não confere nada: é a parte "mecânica".
create or replace function aplicar_fechamento() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- reservas: ninguém de fora lê, cria ou altera direto na tabela
  drop policy if exists "reservas_select_publico" on reservas;
  drop policy if exists "reservas_insert_publico" on reservas;
  drop policy if exists "reservas_update_publico" on reservas;
  revoke all on reservas from anon;

  -- mesas: a planta continua pública (o site precisa dela); alterar, só admin
  drop policy if exists mesas_update on mesas;
  revoke insert, update, delete on mesas from anon;

  -- dias fechados: ler continua público (o site avisa "fechado"); marcar, só admin
  drop policy if exists dias_fechados_insert on dias_fechados;
  drop policy if exists dias_fechados_update on dias_fechados;
  drop policy if exists dias_fechados_delete on dias_fechados;
  revoke insert, update, delete on dias_fechados from anon;

  -- lembretes: só admin
  drop policy if exists config_lembretes_select on config_lembretes;
  drop policy if exists config_lembretes_update on config_lembretes;
  drop policy if exists lembretes_select on lembretes_whatsapp;
  revoke all on config_lembretes from anon;
  revoke all on lembretes_whatsapp from anon;

  revoke all on function renomear_mesa(uuid, text) from public, anon;
end $$;
revoke all on function aplicar_fechamento() from public, anon, authenticated;

-- Fecha de verdade. Recusa se não houver administrador: sem isso ninguém mais
-- entraria no painel.
create or replace function fechar_acesso_publico() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from administradores) then
    raise exception 'Cadastre ao menos um administrador antes de fechar o acesso (supabase-administradores.sql). Sem isso ninguem entraria no painel.';
  end if;

  update acesso_publico set fechado_em = coalesce(fechado_em, now()) where id = 1;
  perform aplicar_fechamento();
  return 'Acesso publico fechado. O painel so abre com login de administrador.';
end $$;
revoke all on function fechar_acesso_publico() from public, anon, authenticated;

-- A volta atrás, para emergência (ex.: o painel parou de mostrar as reservas
-- depois de fechar). Devolve as regras abertas de antes. O login do painel
-- continua existindo; o que volta é a brecha no banco — então é para usar,
-- avisar o suporte e fechar de novo assim que resolver.
create or replace function reabrir_acesso_publico() returns text
language plpgsql security definer set search_path = public as $$
begin
  update acesso_publico set fechado_em = null where id = 1;

  drop policy if exists "reservas_select_publico" on reservas;
  drop policy if exists "reservas_insert_publico" on reservas;
  drop policy if exists "reservas_update_publico" on reservas;
  create policy "reservas_select_publico" on reservas for select using (true);
  create policy "reservas_insert_publico" on reservas for insert with check (true);
  create policy "reservas_update_publico" on reservas for update using (true);
  grant select, insert, update on reservas to anon;

  drop policy if exists mesas_update on mesas;
  create policy mesas_update on mesas for update using (true) with check (true);
  grant select, update on mesas to anon;

  drop policy if exists dias_fechados_insert on dias_fechados;
  drop policy if exists dias_fechados_update on dias_fechados;
  drop policy if exists dias_fechados_delete on dias_fechados;
  create policy dias_fechados_insert on dias_fechados for insert with check (true);
  create policy dias_fechados_update on dias_fechados for update using (true) with check (true);
  create policy dias_fechados_delete on dias_fechados for delete using (true);
  grant select, insert, update, delete on dias_fechados to anon;

  drop policy if exists config_lembretes_select on config_lembretes;
  drop policy if exists config_lembretes_update on config_lembretes;
  drop policy if exists lembretes_select on lembretes_whatsapp;
  create policy config_lembretes_select on config_lembretes for select using (true);
  create policy config_lembretes_update on config_lembretes for update using (true) with check (true);
  create policy lembretes_select on lembretes_whatsapp for select using (true);
  grant select, update on config_lembretes to anon;
  grant select on lembretes_whatsapp to anon;

  grant execute on function renomear_mesa(uuid, text) to anon;
  return 'Acesso publico REABERTO (como era antes). Feche de novo assim que puder.';
end $$;
revoke all on function reabrir_acesso_publico() from public, anon, authenticated;

-- Se o acesso JÁ tinha sido fechado, mantém fechado. (Este arquivo é o último
-- do supabase-completo.sql: rodar o completo de novo recria as regras abertas
-- das migrações antigas, e este bloco as remove outra vez.)
do $$
begin
  if acesso_fechado() then
    perform aplicar_fechamento();
  end if;
end $$;

notify pgrst, 'reload schema';


-- #####################################################################
-- 9. FREIO CONTRA ABUSO NA RESERVA PELO SITE
-- #####################################################################
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
--     2. no máximo N mesas em reservas futuras por telefone;
--     3. no máximo N mesas reservadas PELO SITE nos últimos 10 minutos, somando
--        todo mundo (segura um ataque em rajada);
--     4. só nos horários da casa (horarios_permitidos, hoje "19:30").
--   O que o administrador reserva pelo painel não entra nas contas e não é
--   barrado: o balcão às vezes precisa reservar muito de uma vez.
--
--   Os números ficam na tabela "limites_reserva" (uma linha só), para cada
--   restaurante ajustar ao tamanho do salão sem mexer em código:
--     update limites_reserva set mesas_por_telefone = 10;
--
--   Isto FREIA o abuso, não o impede de vez: quem trocar de telefone a cada
--   reserva passa pelos limites 1 e 2.
--
--   (Houve um limite de datas por telefone; foi retirado a pedido do ZéPelin.
--   Rodar este arquivo de novo apaga a coluna, se ela existir.) O que barra robô de verdade é o captcha.

-- ------------------------------------------------------------------ limites
create table if not exists limites_reserva (
  id int primary key default 1 check (id = 1),
  -- uma reserva só (o grupo inteiro). 15 mesas de 4 = 60 pessoas.
  mesas_por_reserva int not null default 15 check (mesas_por_reserva >= 1),
  -- mesas que o mesmo telefone pode ter em reservas de hoje em diante
  mesas_por_telefone int not null default 15 check (mesas_por_telefone >= 1),
  -- mesas reservadas pelo site, somando todo mundo, a cada 10 minutos
  mesas_por_10_minutos int not null default 30 check (mesas_por_10_minutos >= 1)
);
alter table limites_reserva drop column if exists datas_por_telefone;
-- horários em que o SITE aceita reserva ("19:30"). Sem isto, alguém chamando
-- a função por fora da tela gravaria reserva às 3h da manhã.
alter table limites_reserva add column if not exists horarios_permitidos text[] not null default '{19:30}';
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
  if p_horario is null or p_horario !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
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
      v_limites.mesas_por_reserva := 15;
      v_limites.mesas_por_telefone := 15;
      v_limites.mesas_por_10_minutos := 30;
      v_limites.horarios_permitidos := '{19:30}';
    end if;

    -- o site só reserva nos horários da casa (o painel pode abrir exceção)
    if not (p_horario = any (v_limites.horarios_permitidos)) then
      raise exception 'DADOS_INVALIDOS: horario' using errcode = 'P0001';
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


-- #####################################################################
-- 10. FILA DE ESPERA PARA DATA LOTADA
-- #####################################################################
-- Fila de espera para data lotada.
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- PRÉ-REQUISITO: supabase-migration-acesso.sql e supabase-migration-limites.sql
-- (o supabase-completo.sql roda tudo, na ordem).
--
-- COMO FUNCIONA
--   Quando não sobram lugares para o grupo numa data, o site oferece "entrar
--   na fila de espera". A pessoa deixa nome e WhatsApp e recebe um link só
--   dela (/fila/<código>) para acompanhar a posição. Se uma mesa liberar, o
--   restaurante chama pelo painel (Fila de espera), a pessoa vê "chamado" na
--   página e o restaurante confirma a reserva.
--
-- QUEM VÊ O QUÊ
--   Visitante: só entra na fila, vê a PRÓPRIA entrada (pelo código secreto do
--   link) e sai da fila. Nunca vê a lista nem dados de ninguém.
--   Administrador logado: vê e mexe na fila inteira.

create table if not exists fila_espera (
  id uuid primary key default gen_random_uuid(),
  -- o "endereço" da página de acompanhamento: impossível de adivinhar
  codigo uuid not null unique default gen_random_uuid(),
  data_reserva date not null,
  horario text not null,
  pessoas int not null check (pessoas between 1 and 200),
  nome text not null,
  telefone text not null,
  observacao text,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'chamado', 'atendido', 'saiu', 'removido')),
  criada_em timestamptz not null default now(),
  chamada_em timestamptz,
  atualizada_em timestamptz not null default now(),
  -- a reserva que nasceu desta espera, quando o restaurante acomoda a pessoa
  reserva_id uuid references reservas (id) on delete set null
);

create index if not exists fila_espera_data_idx on fila_espera (data_reserva, criada_em);

alter table fila_espera enable row level security;
-- ninguém de fora lê nem escreve direto na tabela (o Supabase libera tudo por
-- padrão para tabela nova; aqui tira)
revoke all on fila_espera from anon;
grant select, insert, update, delete on fila_espera to authenticated;
grant all on fila_espera to service_role;

drop policy if exists fila_espera_admin on fila_espera;
create policy fila_espera_admin on fila_espera for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

-- o painel acompanha a fila em tempo real
do $$ begin
  alter publication supabase_realtime add table fila_espera;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;

-- ------------------------------------------------------------ entrar na fila
create or replace function entrar_na_fila(
  p_data date,
  p_horario text,
  p_pessoas int,
  p_nome text,
  p_telefone text,
  p_observacao text default null
) returns table (codigo uuid, posicao int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_digitos text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_chave text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_horarios text[];
  v_qtd int;
  v_codigo uuid;
begin
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception 'DADOS_INVALIDOS: nome' using errcode = 'P0001';
  end if;
  if char_length(v_digitos) < 8 or char_length(v_digitos) > 15 or char_length(v_telefone) > 20 then
    raise exception 'DADOS_INVALIDOS: telefone' using errcode = 'P0001';
  end if;
  if p_pessoas is null or p_pessoas < 1 or p_pessoas > 60 then
    raise exception 'DADOS_INVALIDOS: pessoas' using errcode = 'P0001';
  end if;
  -- mesma agenda da reserva: sexta, sábado ou domingo, de amanhã a 62 dias
  if p_data is null or extract(dow from p_data)::int not in (5, 6, 0) or p_data <= v_hoje or p_data > v_hoje + 62 then
    raise exception 'DATA_FORA_DA_AGENDA: data fora da agenda' using errcode = 'P0001';
  end if;
  if exists (select 1 from dias_fechados d where d.data = p_data) then
    raise exception 'RESTAURANTE_FECHADO: fechado nesta data' using errcode = 'P0001';
  end if;
  select l.horarios_permitidos into v_horarios from limites_reserva l where l.id = 1;
  if p_horario is null or not (p_horario = any (coalesce(v_horarios, '{19:30}'))) then
    raise exception 'DADOS_INVALIDOS: horario' using errcode = 'P0001';
  end if;

  -- o mesmo telefone não entra duas vezes na fila da mesma data
  v_chave := case when char_length(v_digitos) > 11 and left(v_digitos, 2) = '55' then substr(v_digitos, 3) else v_digitos end;
  perform pg_advisory_xact_lock(hashtext('fila:' || v_chave));
  if exists (
    select 1 from fila_espera f
     where f.data_reserva = p_data
       and f.status in ('aguardando', 'chamado')
       and (case when char_length(regexp_replace(f.telefone, '\D', '', 'g')) > 11 and left(regexp_replace(f.telefone, '\D', '', 'g'), 2) = '55'
                 then substr(regexp_replace(f.telefone, '\D', '', 'g'), 3)
                 else regexp_replace(f.telefone, '\D', '', 'g') end) = v_chave
  ) then
    raise exception 'JA_NA_FILA: este telefone ja esta na fila desta data' using errcode = 'P0001';
  end if;

  -- freio contra robô: no máximo 30 entradas na fila a cada 10 minutos
  select count(*) into v_qtd from fila_espera f where f.criada_em > now() - interval '10 minutes';
  if v_qtd >= 30 then
    raise exception 'LIMITE_DE_RESERVAS: muitas reservas agora' using errcode = 'P0001';
  end if;

  insert into fila_espera (data_reserva, horario, pessoas, nome, telefone, observacao)
  values (p_data, p_horario, p_pessoas, v_nome, v_telefone, nullif(left(btrim(coalesce(p_observacao, '')), 200), ''))
  returning fila_espera.codigo into v_codigo;

  return query
    select v_codigo,
           (select count(*)::int from fila_espera f where f.data_reserva = p_data and f.status = 'aguardando');
end $$;
revoke all on function entrar_na_fila(date, text, int, text, text, text) from public;
grant execute on function entrar_na_fila(date, text, int, text, text, text) to anon, authenticated, service_role;

-- --------------------------------------------------- acompanhar (só a sua)
-- Pelo código do link. Devolve só o que é da própria pessoa e a posição.
create or replace function ver_minha_fila(p_codigo uuid)
returns table (
  data_reserva date, horario text, pessoas int, primeiro_nome text,
  status text, posicao int, chamada_em timestamptz, criada_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.data_reserva, f.horario, f.pessoas, split_part(f.nome, ' ', 1),
         -- data que já passou sem ser atendido: a espera acabou
         case when f.status in ('aguardando', 'chamado')
                   and f.data_reserva < (now() at time zone 'America/Sao_Paulo')::date
              then 'expirado' else f.status end,
         case when f.status = 'aguardando' then
           (select count(*)::int from fila_espera o
             where o.data_reserva = f.data_reserva and o.status = 'aguardando'
               and (o.criada_em, o.id) <= (f.criada_em, f.id))
         end,
         f.chamada_em, f.criada_em
    from fila_espera f
   where f.codigo = p_codigo;
$$;
revoke all on function ver_minha_fila(uuid) from public;
grant execute on function ver_minha_fila(uuid) to anon, authenticated, service_role;

-- ----------------------------------------------------------- sair da fila
create or replace function sair_da_fila(p_codigo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select f.status into v_status from fila_espera f where f.codigo = p_codigo for update;
  if not found then return 'nao_encontrada'; end if;
  if v_status not in ('aguardando', 'chamado') then return 'encerrada'; end if;
  update fila_espera set status = 'saiu', atualizada_em = now() where codigo = p_codigo;
  return 'ok';
end $$;
revoke all on function sair_da_fila(uuid) from public;
grant execute on function sair_da_fila(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- #####################################################################
-- 11. LOGIN EM DUAS ETAPAS NO PAINEL
-- #####################################################################
-- Login em duas etapas no painel (senha + código do app autenticador).
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- PRÉ-REQUISITO: supabase-migration-acesso.sql (o supabase-completo.sql roda tudo, na ordem).
--
-- COMO FUNCIONA
--   Cada administrador ativa as duas etapas em Configurações > Acesso,
--   escaneando um QR Code com um app autenticador (Google Authenticator,
--   Microsoft Authenticator, Authy…). A partir daí, entrar no painel pede a
--   senha E o código de 6 números que o app mostra.
--
--   A regra fica no BANCO, não só na tela: quem ativou as duas etapas e entrou
--   só com a senha (sessão "aal1") NÃO é tratado como administrador — não lê
--   nem altera nenhuma reserva, mesmo que alguém pule a tela do código.
--   Quem ainda não ativou continua entrando só com a senha.
--
-- PERDEU O CELULAR? O suporte apaga o fator da pessoa no Supabase:
--   Authentication > Users > (a pessoa) > Multi-Factor Authentication > apagar
--   e ela entra de novo só com a senha e ativa outra vez.

create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores a where a.user_id = auth.uid())
     and (
       -- sessão confirmada com o código do app
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       -- ou a pessoa ainda não ativou as duas etapas
       or not exists (
         select 1 from auth.mfa_factors f
          where f.user_id = auth.uid() and f.status = 'verified'
       )
     );
$$;
revoke all on function eh_admin() from public;
grant execute on function eh_admin() to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- #####################################################################
-- 12. DADOS DO CLIENTE (LGPD): PEDIDOS, EXCLUSÃO E PRAZO DE GUARDA
-- #####################################################################
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
