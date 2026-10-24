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
