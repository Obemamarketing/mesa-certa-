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
