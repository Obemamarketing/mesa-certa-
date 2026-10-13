# Mesa Certa

Sistema de reservas de mesa para restaurantes. A marca fica em
`lib/reservaBrand.ts`; hoje atende o **ZéPelin**.

- **Cliente** (`/`): escolhe dia, pessoas e mesa na planta, confirma a reserva.
  `/consulta` mostra a reserva pelo nome e cancela conferindo os 4 últimos
  dígitos do telefone.
- **Administração** (`/admin`, com login): reservas, modo operação (check-in),
  planta de mesas, calendário de dias fechados, movimento (mesas reservadas e
  pessoas que vieram, noite a noite e semana contra semana), clientes, lembretes
  por WhatsApp e planilhas de cópia dos dados (clientes, reservas e movimento).
- **Stack**: Next.js (App Router) · React · Tailwind · Supabase · Vercel.

## Rodar no computador

```bash
npm install
cp .env.local.example .env.local   # preencha as duas chaves do Supabase
npm run dev
```

Antes de publicar: `npm run lint`, `npx tsc --noEmit` e `npm run build`.

## Banco de dados (Supabase)

1. Rode `supabase-schema.sql` (tabela `reservas`) — só na primeira vez.
2. Rode `supabase-completo.sql` no SQL Editor. Ele junta, na ordem certa,
   todas as migrações (observação, check-in, lembretes, planta, dias fechados,
   reservas por data, agenda de dois meses com aniversário e a preparação do
   login) e **pode ser rodado de novo sem perder dados**.
3. Login do painel — ver a seção abaixo.
4. `supabase-cron-lembretes.sql` fica de fora: só rode depois do deploy, com o
   `CRON_SECRET` definido na Vercel.

Cada migração também existe separada (`supabase-migration-*.sql`) para consulta.

## Login do painel e proteção dos dados

Quem guarda a senha é o Supabase Auth. Estar logado não basta: a conta precisa
estar na tabela `administradores`. O site do cliente não lê a tabela de
reservas — usa funções do banco (`mesas_ocupadas`, `reservar`,
`consultar_reservas`, `cancelar_minha_reserva`) que nunca entregam telefone nem
e-mail de ninguém.

Para ligar, nesta ordem:

1. `supabase-completo.sql` (só prepara; nada é fechado).
2. Publicar o site.
3. No Supabase: Authentication > Users > Add user (com "Auto Confirm User"),
   um para cada pessoa que vai usar o painel.
4. `supabase-administradores.sql`, trocando os e-mails de exemplo.
5. Entrar em `/admin` com o login e conferir que as reservas aparecem.
6. `supabase-fechar-acesso.sql` — a partir daqui a chave pública do site não lê
   nem altera reservas. Em Configurações > Acesso aparece "Banco de dados
   protegido".

Volta atrás de emergência (reabre o banco como era antes): rodar
`select reabrir_acesso_publico();` no SQL Editor. Trocar senha ou tirar o
acesso de alguém também é pelo Supabase (Authentication > Users e a tabela
`administradores`). Vale desligar o cadastro aberto em Authentication > Sign In
/ Providers ("Allow new users to sign up"): quem se cadastra sozinho não vira
administrador, mas assim nem conta cria.

## Como a reserva funciona

- O restaurante recebe reservas **sexta, sábado e domingo, às 19h30**.
- O cliente escolhe a **data** (`data_reserva`): qualquer sexta, sábado ou
  domingo, de amanhã até 60 dias à frente (`ANTECEDENCIA_DIAS` em
  `lib/regras.ts`). A tela inicial lista só as próximas datas; as demais ficam
  no calendário. O banco confere a data escolhida.
- A mesa pode ser escolhida clicando nela na planta ou na lista de mesas.
- A reserva pode guardar o aniversário do cliente (só dia e mês).
- Uma mesa só pode ter uma reserva ativa por data e horário (índice único no
  banco). Grupo grande escolhe várias mesas: cada mesa vira uma reserva, e o
  banco grava todas de uma vez — ou o grupo inteiro, ou nada.
- O horário e a data de referência são sempre os de **São Paulo**.

## Variáveis de ambiente

Veja `.env.local.example`. As duas primeiras bastam para o site; as demais
ativam o envio de lembretes e só existem no servidor.

## O que ainda não está pronto

Documentado no guia de segurança (fora do repositório): a reserva e a consulta
públicas não têm captcha nem limite de tentativas por visitante (um robô
conseguiria ocupar mesas com reservas falsas); troca de senha e cadastro de
administradores são feitos no Supabase, não no painel; e-mail ainda não
implementado.
