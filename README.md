# Mesa Certa

Sistema de reservas de mesa para restaurantes. A marca fica em
`lib/reservaBrand.ts`; hoje atende o **ZéPelin**.

- **Cliente** (`/`): escolhe dia, pessoas e mesa na planta, confirma a reserva.
  `/consulta` mostra e cancela a reserva pelo nome.
- **Administração** (`/admin`): reservas, modo operação (check-in), planta de
  mesas, calendário de dias fechados, movimento (mesas reservadas e pessoas que
  vieram, noite a noite e semana contra semana), clientes e lembretes por
  WhatsApp.
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
   todas as migrações (observação, check-in, lembretes, planta, dias fechados e
   reservas por data) e **pode ser rodado de novo sem perder dados**.
3. `supabase-cron-lembretes.sql` fica de fora: só rode depois do deploy, com o
   `CRON_SECRET` definido na Vercel.

Cada migração também existe separada (`supabase-migration-*.sql`) para consulta.

## Como a reserva funciona

- O restaurante recebe reservas **sexta, sábado e domingo, às 19h30**.
- A reserva guarda a **data** (`data_reserva`). No próprio dia da semana, o
  cliente reserva para a semana seguinte.
- Uma mesa só pode ter uma reserva ativa por data e horário (índice único no
  banco). Grupo grande escolhe várias mesas: cada mesa vira uma reserva.
- O horário e a data de referência são sempre os de **São Paulo**.

## Variáveis de ambiente

Veja `.env.local.example`. As duas primeiras bastam para o site; as demais
ativam o envio de lembretes e só existem no servidor.

## O que ainda não está pronto

Documentado no guia de segurança (fora do repositório): painel `/admin` sem
login, regras de acesso do Supabase ainda abertas para a chave pública, sem
captcha nem limite de tentativas, e e-mail ainda não implementado.
