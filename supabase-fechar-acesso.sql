-- Login do painel e acesso ao banco — PARTE 2: FECHAR.
--
-- SÓ RODE DEPOIS DE:
--   1. ter rodado supabase-completo.sql (que inclui a parte 1);
--   2. a versão nova do site estar no ar;
--   3. ter cadastrado os administradores (supabase-administradores.sql);
--   4. ter ENTRADO no painel com login e visto as reservas.
--
-- O que acontece ao rodar: a chave pública do site deixa de ler e de alterar
-- as reservas direto na tabela. O site do cliente continua reservando,
-- consultando e cancelando (pelas funções da parte 1), e o painel só abre para
-- administrador logado.
--
-- Se não houver nenhum administrador cadastrado, este arquivo se recusa a
-- rodar — senão ninguém mais entraria no painel.
--
-- DEPOIS DE RODAR, confira: abra o painel, veja se as reservas aparecem e se
-- dá para marcar "Cliente chegou". Em Configurações > Acesso tem que aparecer
-- "Banco de dados protegido".
--
-- SE ALGO DER ERRADO (o painel logado parou de mostrar as reservas, por
-- exemplo), a volta atrás é rodar só esta linha, sem os dois traços:
--   select reabrir_acesso_publico();
-- Ela devolve o banco ao estado de antes deste arquivo. Avise o suporte e
-- feche de novo quando estiver resolvido.

select fechar_acesso_publico() as resultado;

-- Conferência: as regras que sobraram em cada tabela.
-- O esperado é "reservas", "config_lembretes" e "lembretes_whatsapp" só com a
-- regra "_admin", e "mesas" e "dias_fechados" com a "_admin" e a de leitura
-- ("_select").
select tablename as tabela, policyname as regra, cmd as operacao, roles as para_quem
  from pg_policies
 where schemaname = 'public'
   and tablename in ('reservas', 'mesas', 'dias_fechados', 'config_lembretes', 'lembretes_whatsapp')
 order by tablename, policyname;
