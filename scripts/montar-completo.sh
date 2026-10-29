#!/bin/bash
# Junta as migrações em supabase-completo.sql, na ordem certa.
# Uso (na pasta do projeto): bash scripts/montar-completo.sh
# Quando criar uma migração nova: acrescente uma seção no fim (sec + cat) e
# uma linha na lista "O que este arquivo faz".
cd "$(dirname "$0")/.." || exit 1
sec() { printf '\n\n-- #####################################################################\n-- %s\n-- #####################################################################\n' "$1"; }
{
cat <<'EOF'
-- =====================================================================
-- Mesa Certa — SQL COMPLETO para o Supabase
-- =====================================================================
-- Cole tudo no SQL Editor do Supabase (New query) e clique em Run.
--
-- É seguro rodar mais de uma vez: tudo aqui é idempotente e NÃO desfaz
-- reservas, nem posições de mesas que você já calibrou no painel, nem os
-- dias fechados que você já marcou no calendário.
--
-- O que este arquivo faz, nesta ordem:
--   1. observação da reserva        (coluna reservas.observacao)
--   2. check-in                     (coluna reservas.checkin_em)
--   3. lembretes por WhatsApp       (tabelas, gatilhos, função de envio)
--   4. planta oficial / mesas       (tabela mesas, 20 mesas, renomear_mesa)
--   5. dias fechados (calendário)   (tabela dias_fechados e bloqueio)
--   6. reservas por data            (data_reserva obrigatória e índice por data)
--   7. agenda de dois meses         (validação da data escolhida e aniversário)
--   8. login do painel (preparar)   (administradores e funções do site do cliente)
--   9. freio contra abuso           (limites da reserva pelo site)
--  10. fila de espera              (data lotada: entrar, acompanhar, sair)
--  11. login em duas etapas        (o banco exige o código de quem ativou)
--  12. dados do cliente (LGPD)     (pedidos, exclusão e prazo de guarda)
--  13. almoço de sábado            (dias e horários; a mesa fica presa 1h30)
--  14. reserva do cliente          (nome e sobrenome, consulta pelo nome completo, alterar)
--  15. manter fechado              (se o captcha já fechou a reserva direta, continua fechado)
--
-- O item 8 só PREPARA o login: nada fica fechado ao rodar este arquivo. Quem
-- fecha o banco é o supabase-fechar-acesso.sql, rodado à parte, depois de o
-- login estar testado. Banco que já foi fechado CONTINUA fechado.
--
-- FICA DE FORA de propósito: supabase-cron-lembretes.sql. Ele precisa do
-- seu CRON_SECRET e só faz sentido depois do deploy — rode à parte.
--
-- Pré-requisito: a tabela "reservas" já existe (supabase-schema.sql).
-- =====================================================================
EOF
sec "1. OBSERVAÇÃO DA RESERVA"
sed -n '/^alter table/,$p' supabase-migration-observacao.sql
sec "2. CHECK-IN"
sed -n '/^alter table/,$p' supabase-migration-checkin.sql
sec "3. LEMBRETES AUTOMÁTICOS POR WHATSAPP"
cat supabase-migration-lembretes.sql
sec "4. PLANTA OFICIAL DO RESTAURANTE (MESAS)"
cat supabase-migration-mesas.sql
sec "5. DIAS FECHADOS (CALENDÁRIO)"
cat supabase-migration-dias-fechados.sql
sec "6. RESERVAS POR DATA (A DA SEMANA PASSADA NÃO TRAVA A DA QUE VEM)"
cat supabase-migration-datas.sql
sec "7. AGENDA DE DOIS MESES E ANIVERSÁRIO DO CLIENTE"
cat supabase-migration-agenda.sql
sec "8. LOGIN DO PAINEL E ACESSO AO BANCO (PREPARAR — NADA É FECHADO AQUI)"
cat supabase-migration-acesso.sql
sec "9. FREIO CONTRA ABUSO NA RESERVA PELO SITE"
cat supabase-migration-limites.sql
sec "10. FILA DE ESPERA PARA DATA LOTADA"
cat supabase-migration-fila.sql
sec "11. LOGIN EM DUAS ETAPAS NO PAINEL"
cat supabase-migration-mfa.sql
sec "12. DADOS DO CLIENTE (LGPD): PEDIDOS, EXCLUSÃO E PRAZO DE GUARDA"
cat supabase-migration-lgpd.sql
sec "13. ALMOÇO DE SÁBADO: DIAS, HORÁRIOS E TEMPO DA MESA"
cat supabase-migration-almoco.sql
sec "14. RESERVA DO CLIENTE: NOME E SOBRENOME, CONSULTA E ALTERAÇÃO"
cat supabase-migration-reserva-cliente.sql
sec "15. MANTER FECHADA A RESERVA DIRETA (CAPTCHA), SE JÁ FOI FECHADA"
cat supabase-migration-manter-fechado.sql
} > supabase-completo.sql
echo "supabase-completo.sql: $(wc -l < supabase-completo.sql) linhas, $(grep -c '^-- ####' supabase-completo.sql) marcadores"
