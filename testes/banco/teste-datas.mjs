import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };
const lerSql = (f) => fs.readFileSync(proj + f, "utf8");

async function bancoAntigo() {
  // o banco como estava em producao: tabela original + indice por dia da semana
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique); create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$; create role anon nologin; create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(lerSql("supabase-schema.sql").replace(/alter publication[^;]*;/i, ""));
  await db.exec(`grant all on reservas to anon, authenticated, service_role;`);
  return db;
}

async function tentar(db, sql) {
  try { await db.exec(sql); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}

console.log("--- A) migracao sobre um banco com reservas ANTIGAS (sem data_reserva) ---");
{
  const db = await bancoAntigo();
  // reservas feitas antes de existir data_reserva (criada_em explicito)
  await db.exec(`
    insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,criada_em) values
      ('sexta','19:30','01',2,'Criada numa sexta',   '41999990001', '2026-10-02 15:00-03'),
      ('sexta','19:30','02',2,'Criada numa segunda', '41999990002', '2026-10-05 15:00-03'),
      ('domingo','19:30','03',2,'Domingo da semana', '41999990003', '2026-10-02 15:00-03'),
      ('sabado','19:30','04',2,'Sabado a noite',     '41999990004', '2026-10-03 23:30-03');`);

  // o sistema antigo travava a mesma mesa em semanas diferentes
  const antes = await tentar(db, `insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','01',2,'Outra','41999990009')`);
  ok(!antes.ok && antes.code === "23505", "ANTES: a mesa 01 da sexta ja estava travada pela reserva antiga (23505)");

  // pre-requisitos do arquivo completo: roda tudo
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO)); // 2a vez
  ok(true, "supabase-completo.sql roda duas vezes sem erro");

  const datas = Object.fromEntries((await db.query(`select nome, data_reserva::text d from reservas`)).rows.map((r) => [r.nome, r.d]));
  ok(datas["Criada numa sexta"] === "2026-10-09", `sexta criada numa sexta (02/10) -> proxima sexta 09/10 (veio ${datas["Criada numa sexta"]})`);
  ok(datas["Criada numa segunda"] === "2026-10-09", `sexta criada numa segunda (05/10) -> 09/10 (veio ${datas["Criada numa segunda"]})`);
  ok(datas["Domingo da semana"] === "2026-10-04", `domingo criado numa sexta (02/10) -> 04/10 (veio ${datas["Domingo da semana"]})`);
  ok(datas["Sabado a noite"] === "2026-10-10", `sabado criado no sabado 23h30 (03/10) -> 10/10, no fuso de SP (veio ${datas["Sabado a noite"]})`);

  const nulos = (await db.query(`select count(*)::int n from reservas where data_reserva is null`)).rows[0].n;
  ok(nulos === 0, "nenhuma reserva ficou sem data");

  const idx = (await db.query(`select indexname from pg_indexes where tablename = 'reservas' and indexname like 'reservas_slot%' order by 1`)).rows.map((r) => r.indexname);
  ok(idx.length === 1 && idx[0] === "reservas_slot_data_unico", `indice trocado: ${idx.join(", ")}`);

  // datas FUTURAS, contadas a partir de hoje: desde a migracao da agenda o banco
  // recusa reserva nova em data que ja passou
  const prox = async (dow, semanas = 0) => (await db.query(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * semanas})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`)).rows[0].d;
  const f1 = await prox(5, 0), f2 = await prox(5, 1), f3 = await prox(5, 2);

  // o ponto central: semana seguinte nao e travada pela anterior
  const proxSemana = await tentar(db, `insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','01',2,'Semana seguinte','41999990005','${f1}')`);
  ok(proxSemana.ok, `DEPOIS: a mesa 01 da sexta ${f1} aceita reserva mesmo com a reserva antiga (de 09/10) ativa`);

  // mas a mesma data continua protegida
  const mesmaData = await tentar(db, `insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','01',2,'Duplicada','41999990006','${f1}')`);
  ok(!mesmaData.ok && mesmaData.code === "23505", "a MESMA mesa na MESMA data continua recusada (23505)");

  // reserva cancelada nao segura a mesa
  await db.exec(`update reservas set cancelada = true where nome = 'Semana seguinte'`);
  const aposCancelar = await tentar(db, `insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','01',2,'Refeita','41999990007','${f1}')`);
  ok(aposCancelar.ok, "reserva cancelada libera a mesa na data");

  // insercao normal do site (sem data): o gatilho preenche
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('domingo','19:30','10',2,'Do site','41999990008')`);
  const doSite = (await db.query(`select data_reserva::text d, extract(dow from data_reserva)::int dow from reservas where nome = 'Do site'`)).rows[0];
  ok(doSite && doSite.dow === 0, `reserva do site recebe a data pelo gatilho (domingo ${doSite?.d})`);

  // renomear mesa: conflito so quando a data coincide
  await db.exec(`insert into mesas (numero, capacidade, formato, zona, pos_x, pos_y) values ('91', 4, 'quadrada', 'Palco', 10, 10), ('92', 4, 'quadrada', 'Palco', 20, 20) on conflict do nothing;`);
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values
    ('sexta','19:30','91',2,'A','41999990011','${f2}'),
    ('sexta','19:30','92',2,'B','41999990012','${f3}')`);
  const id91 = (await db.query(`select id from mesas where numero = '91'`)).rows[0].id;
  const semConflito = await tentar(db, `select renomear_mesa('${id91}', '92')`);
  // 92 ja existe como mesa -> recusa por numero repetido, nao por conflito: usa um numero novo
  ok(!semConflito.ok && /Já existe uma mesa/.test(semConflito.msg), "renomear para numero que ja e mesa continua recusado");
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','93',2,'C','41999990013','${f2}')`);
  const conflito = await tentar(db, `select renomear_mesa('${id91}', '93')`);
  ok(!conflito.ok && /conflitantes/.test(conflito.msg), "renomear 91 -> 93 recusa: as duas tem reserva na MESMA data");
  await db.exec(`update reservas set data_reserva = '${f3}' where mesa_numero = '93'`);
  const livre = await tentar(db, `select renomear_mesa('${id91}', '93')`);
  ok(livre.ok, "renomear 91 -> 93 passa quando as reservas sao de datas DIFERENTES");

  // permissao do navegador continua
  await db.exec("set role anon");
  const lido = await tentar(db, `select count(*) from reservas`);
  await db.exec("reset role");
  ok(lido.ok, "anon continua lendo as reservas");
}

console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> migracao de datas validada");
