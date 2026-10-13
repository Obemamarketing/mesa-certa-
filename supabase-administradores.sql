-- Quem pode entrar no painel do restaurante.
--
-- ANTES DE RODAR, crie o usuário no Supabase:
--   Authentication > Users > Add user > Create new user
--   preencha e-mail e senha e deixe marcado "Auto Confirm User".
--
-- DEPOIS, troque os e-mails abaixo pelos que você criou e rode este arquivo.
-- Pode rodar de novo para acrescentar mais gente. Quem não está nesta lista
-- não entra no painel, mesmo que tenha conta.

insert into administradores (user_id, nome)
select u.id, x.nome
  from auth.users u
  join (values
    ('TROQUE-AQUI@exemplo.com', 'Dono do restaurante'),
    ('TROQUE-AQUI-2@exemplo.com', 'Suporte Mesa Certa')
  ) as x (email, nome) on lower(u.email) = lower(x.email)
on conflict (user_id) do update set nome = excluded.nome;

-- Confira quem ficou como administrador (tem que aparecer uma linha por pessoa):
select a.nome, u.email, a.criado_em
  from administradores a
  join auth.users u on u.id = a.user_id
 order by a.criado_em;

-- Para tirar o acesso de alguém:
--   delete from administradores where user_id = (select id from auth.users where email = 'fulano@exemplo.com');
