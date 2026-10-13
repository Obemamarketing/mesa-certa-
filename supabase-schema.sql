-- Mesa Certa — esquema do Supabase
-- Rode isso uma vez no SQL Editor do seu projeto Supabase (supabase.com/dashboard > seu projeto > SQL Editor > New query).

create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  dia text not null check (dia in ('sexta', 'sabado', 'domingo')),
  horario text not null,
  mesa_numero text not null,
  pessoas integer not null,
  nome text not null,
  telefone text not null,
  email text,
  criada_em timestamptz not null default now(),
  cancelada boolean not null default false
);

-- Impede duas reservas ativas na mesma mesa, dia e horário.
-- (Índice parcial: só considera linhas não canceladas.)
-- ATENÇÃO: "dia" é só sexta/sábado/domingo, então este índice trava a mesa em
-- todas as semanas. O supabase-migration-datas.sql (já incluso em
-- supabase-completo.sql) troca por um índice por DATA — rode-o em seguida.
create unique index if not exists reservas_slot_unico
  on reservas (dia, horario, mesa_numero)
  where not cancelada;

alter table reservas enable row level security;

-- Instalação nova começa ABERTA: leitura e escrita pela chave pública do site.
-- É só o ponto de partida. O login do painel e o fechamento do banco vêm em
-- seguida: supabase-completo.sql, supabase-administradores.sql e, por último,
-- supabase-fechar-acesso.sql.
-- Banco que já foi fechado continua fechado, mesmo rodando este arquivo de novo.
do $$
declare
  fechado boolean := false;
begin
  if to_regclass('public.acesso_publico') is not null then
    execute 'select exists (select 1 from acesso_publico where fechado_em is not null)' into fechado;
  end if;
  if fechado then
    return;
  end if;

  drop policy if exists "reservas_select_publico" on reservas;
  drop policy if exists "reservas_insert_publico" on reservas;
  drop policy if exists "reservas_update_publico" on reservas;
  create policy "reservas_select_publico" on reservas for select using (true);
  create policy "reservas_insert_publico" on reservas for insert with check (true);
  create policy "reservas_update_publico" on reservas for update using (true);
end $$;

-- Liga o realtime pro painel ver mudanças na hora, sem precisar recarregar a
-- página.
do $$ begin
  alter publication supabase_realtime add table reservas;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;
