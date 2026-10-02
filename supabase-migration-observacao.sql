-- Mesa Certa — adiciona o campo de observação da reserva (ex: "mesa mais
-- tranquila"). Rode isso uma vez no SQL Editor do Supabase, depois do
-- supabase-schema.sql original.

alter table reservas add column if not exists observacao text;
