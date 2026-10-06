-- Adiciona o campo de check-in (horário de chegada do cliente).
-- Rode uma vez no SQL Editor do Supabase.
alter table reservas add column if not exists checkin_em timestamptz;
