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
