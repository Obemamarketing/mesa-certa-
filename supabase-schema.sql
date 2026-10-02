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
create unique index if not exists reservas_slot_unico
  on reservas (dia, horario, mesa_numero)
  where not cancelada;

alter table reservas enable row level security;

-- Protótipo sem login: libera leitura e escrita pra chave anônima.
-- Antes de virar produto de verdade, troque por políticas com autenticação
-- (ex: só o dono autenticado pode cancelar reservas).
create policy "reservas_select_publico" on reservas for select using (true);
create policy "reservas_insert_publico" on reservas for insert with check (true);
create policy "reservas_update_publico" on reservas for update using (true);

-- Liga o realtime pra admin e cliente verem mudanças na hora, sem precisar
-- recarregar a página.
alter publication supabase_realtime add table reservas;
