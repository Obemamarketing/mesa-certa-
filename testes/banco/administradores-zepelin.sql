-- Libera o painel para o login do ZéPelin.
-- Só funciona DEPOIS de: (1) rodar o supabase-completo.sql e
-- (2) criar o usuário zepelinmesacerta@gmail.com em Authentication > Users.

insert into administradores (user_id, nome)
select u.id, 'ZéPelin'
  from auth.users u
 where lower(u.email) = lower('zepelinmesacerta@gmail.com')
on conflict (user_id) do update set nome = excluded.nome;

-- Conferência: tem que aparecer UMA linha com o e-mail do ZéPelin.
-- Se vier vazio, o usuário ainda não foi criado em Authentication > Users.
select a.nome, u.email, a.criado_em
  from administradores a
  join auth.users u on u.id = a.user_id;
