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
