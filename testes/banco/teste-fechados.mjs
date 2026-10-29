import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };

async function novoBanco({ comLembretes }) {
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique); create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$; create role anon nologin; create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to anon, authenticated, service_role;
    create table reservas (
      id uuid primary key default gen_random_uuid(),
      dia text not null check (dia in ('sexta','sabado','domingo')),
      horario text not null, mesa_numero text not null, pessoas integer not null,
      nome text not null, telefone text not null, email text,
      criada_em timestamptz not null default now(), cancelada boolean not null default false
    );
    create unique index reservas_slot_unico on reservas (dia, horario, mesa_numero) where not cancelada;
    grant all on reservas to anon, authenticated, service_role;`);
  if (comLembretes) await db.exec((fs.readFileSync(proj + "supabase-completo.sql", "utf8") + MODO_ANTIGO));
  else await db.exec(fs.readFileSync(proj + "supabase-migration-dias-fechados.sql", "utf8"));
  return db;
}
const proxima = async (db, diaSemana) => (await db.query(`
  select (h + (case when ((${diaSemana} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${diaSemana} - extract(dow from h)::int + 7) % 7) end))::text as d
  from (select (now() at time zone 'America/Sao_Paulo')::date h) x`)).rows[0].d;

console.log("--- A) com tudo (lembretes + mesas + dias fechados) ---");
{
  const db = await novoBanco({ comLembretes: true });
  await db.exec((fs.readFileSync(proj + "supabase-completo.sql", "utf8") + MODO_ANTIGO)); // 2a vez: idempotente
  ok(true, "arquivo completo roda duas vezes sem erro");

  const sexta = await proxima(db, 5), sabado = await proxima(db, 6);
  await db.exec(`insert into dias_fechados (data, motivo) values ('${sexta}', 'Feriado')`);

  let barrou = false, msg = "";
  try { await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','01',2,'Ana','4199')`); }
  catch (e) { barrou = true; msg = e.message; }
  ok(barrou && /RESTAURANTE_FECHADO/.test(msg), `reserva na sexta fechada (${sexta}) e recusada com RESTAURANTE_FECHADO`);

  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sabado','19:30','01',2,'Bia','4188')`);
  const r = (await db.query(`select count(*)::int n from reservas`)).rows[0];
  ok(r.n === 1, `sabado (${sabado}) continua aberto e aceita reserva`);

  // reabrir
  await db.exec(`delete from dias_fechados where data = '${sexta}'`);
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','02',2,'Caio','4177')`);
  ok(true, "reaberto o dia, a reserva volta a ser aceita");

  // a reserva recusada nao deixou rastro (nem lembrete)
  const l = (await db.query(`select count(*)::int n from lembretes_whatsapp`)).rows[0];
  ok(l.n === 2, `so as 2 reservas aceitas geraram lembrete (${l.n})`);

  // permissões do navegador (sem privilégios padrão)
  await db.exec("set role anon");
  await db.exec(`insert into dias_fechados (data, motivo) values ('2030-01-01', 'teste')`);
  await db.exec(`update dias_fechados set motivo = 'outro' where data = '2030-01-01'`);
  const lido = (await db.query(`select count(*)::int n from dias_fechados`)).rows[0].n;
  await db.exec(`delete from dias_fechados where data = '2030-01-01'`);
  await db.exec("reset role");
  ok(lido === 1, "anon consegue fechar, editar o motivo, ler e reabrir um dia");
}

console.log("\n--- B) so a migracao de dias fechados (sem data_reserva na tabela) ---");
{
  const db = await novoBanco({ comLembretes: false });
  const sexta = await proxima(db, 5);
  await db.exec(`insert into dias_fechados (data) values ('${sexta}')`);
  let barrou = false;
  try { await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','01',2,'Ana','4199')`); }
  catch (e) { barrou = /RESTAURANTE_FECHADO/.test(e.message); }
  ok(barrou, "funciona sozinha, sem a coluna data_reserva (calcula a data pelo dia da semana)");
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sabado','19:30','01',2,'Bia','4188')`);
  ok(true, "dia aberto continua aceitando");
}

console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> dias fechados validado");
