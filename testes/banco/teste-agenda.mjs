import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };
const lerSql = (f) => fs.readFileSync(proj + f, "utf8").replace(/notify pgrst[^;]*;/gi, "");

async function tentar(db, sql) {
  try { await db.exec(sql); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}

const db = new PGlite();
await db.exec(`create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique); create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$; create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;`);
await db.exec(fs.readFileSync(proj + "supabase-schema.sql", "utf8").replace(/alter publication[^;]*;/i, ""));
await db.exec(`grant all on reservas to anon, authenticated, service_role;`);
// uma reserva antiga, de antes de tudo (sem data, de uma sexta que ja passou)
await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,criada_em) values ('sexta','19:30','01',2,'Antiga','41999990001','2026-09-01 15:00-03')`);

await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
ok(true, "supabase-completo.sql (com a agenda) roda duas vezes sem erro, com reserva antiga no banco");

const hoje = (await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::int w`)).rows[0];
const dataEm = async (n) => (await db.query(`select ((now() at time zone 'America/Sao_Paulo')::date + ${n})::text d`)).rows[0].d;
// proxima sexta/sabado/domingo estritamente depois de hoje, mais k semanas
const prox = async (dow, semanas = 0) => (await db.query(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * semanas})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`)).rows[0].d;
const ins = (campos, valores) => `insert into reservas (${campos}) values (${valores})`;
const base = "dia,horario,mesa_numero,pessoas,nome,telefone";

console.log(`\n--- hoje no banco: ${hoje.d} (dia da semana ${hoje.w}) ---`);

console.log("\n--- data escolhida pelo cliente ---");
const sexta1 = await prox(5, 0), sexta5 = await prox(5, 4), sexta8 = await prox(5, 7), sexta10 = await prox(5, 9);
ok((await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','02',2,'A','41999990002','${sexta1}'`))).ok, `proxima sexta (${sexta1}) aceita`);
ok((await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','02',2,'B','41999990003','${sexta5}'`))).ok, `mesma mesa, sexta daqui a 5 semanas (${sexta5}) aceita`);
ok((await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','02',2,'C','41999990004','${sexta8}'`))).ok, `sexta daqui a 8 semanas (${sexta8}), dentro de dois meses, aceita`);
let r = await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','02',2,'D','41999990005','${sexta10}'`));
ok(!r.ok && /DATA_FORA_DA_AGENDA/.test(r.msg), `sexta daqui a 10 semanas (${sexta10}) recusada: passa de dois meses`);
r = await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','03',2,'E','41999990006','${hoje.d}'`));
ok(!r.ok && /DATA_FORA_DA_AGENDA/.test(r.msg), `hoje (${hoje.d}) recusado`);
r = await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','03',2,'F','41999990007','${await dataEm(-7)}'`));
ok(!r.ok && /DATA_FORA_DA_AGENDA/.test(r.msg), "data no passado recusada");
// um dia que nao e sexta/sabado/domingo, nos proximos dias
let diaUtil = null;
for (let i = 1; i <= 7; i++) { const d = await dataEm(i); const w = (await db.query(`select extract(dow from '${d}'::date)::int w`)).rows[0].w; if (![5, 6, 0].includes(w)) { diaUtil = d; break; } }
r = await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','03',2,'G','41999990008','${diaUtil}'`));
ok(!r.ok && /DATA_FORA_DA_AGENDA/.test(r.msg), `dia sem funcionamento (${diaUtil}) recusado`);

console.log("\n--- o campo 'dia' acompanha a data ---");
const sab = await prox(6, 2);
await db.exec(ins(base + ",data_reserva", `'sexta','19:30','04',2,'DiaErrado','41999990009','${sab}'`));
const corrigido = (await db.query(`select dia from reservas where nome = 'DiaErrado'`)).rows[0].dia;
ok(corrigido === "sabado", `mandou dia 'sexta' com data de sabado -> o banco gravou '${corrigido}'`);

console.log("\n--- site antigo (sem mandar a data) continua funcionando ---");
ok((await tentar(db, ins(base, `'domingo','19:30','05',2,'SiteAntigo','41999990010'`))).ok, "reserva sem data: o banco calcula a proxima ocorrencia e aceita");
const antigo = (await db.query(`select data_reserva::text d, extract(dow from data_reserva)::int w from reservas where nome = 'SiteAntigo'`)).rows[0];
ok(antigo.w === 0 && antigo.d > hoje.d, `caiu num domingo futuro (${antigo.d})`);

console.log("\n--- mesma mesa, mesma data continua protegida; dia fechado continua recusando ---");
r = await tentar(db, ins(base + ",data_reserva", `'sexta','19:30','02',2,'Dup','41999990011','${sexta5}'`));
ok(!r.ok && r.code === "23505", "mesma mesa na mesma data: recusada (23505)");
const sab4 = await prox(6, 3);
await db.exec(`insert into dias_fechados (data, motivo) values ('${sab4}', 'Evento')`);
r = await tentar(db, ins(base + ",data_reserva", `'sabado','19:30','06',2,'Fechado','41999990012','${sab4}'`));
ok(!r.ok && /RESTAURANTE_FECHADO/.test(r.msg), `sabado fechado daqui a 4 semanas (${sab4}) recusado com RESTAURANTE_FECHADO`);

console.log("\n--- aniversario ---");
const nv = (v, n) => tentar(db, ins(base + ",data_reserva,aniversario", `'domingo','19:30','${n}',2,'Niver','4199999${n}00','${sexta1.replace(/\d\d$/, (d) => d)}',${v}`));
const dom = await prox(0, 1);
const niver = (valor, mesa) => tentar(db, ins(base + ",data_reserva,aniversario", `'domingo','19:30','${mesa}',2,'Niver${mesa}','41999991${mesa}','${dom}',${valor}`));
ok((await niver("'12/03'", "07")).ok, "12/03 aceito");
ok((await niver("'29/02'", "08")).ok, "29/02 aceito");
ok((await niver("null", "09")).ok, "sem aniversario (opcional) aceito");
for (const [v, mesa] of [["31/04", "10"], ["30/02", "11"], ["1/3", "12"], ["12/13", "13"], ["00/05", "14"], ["12/03/1990", "15"], ["abc", "16"]]) {
  r = await niver(`'${v}'`, mesa);
  ok(!r.ok && /reservas_aniversario_valido/.test(r.msg), `'${v}' recusado`);
}
const lido = (await db.query(`select aniversario from reservas where nome = 'Niver07'`)).rows[0].aniversario;
ok(lido === "12/03", `gravado e lido: ${lido}`);

console.log("\n--- reserva antiga (anterior a tudo) nao foi tocada pela validacao ---");
const ant = (await db.query(`select data_reserva::text d, cancelada from reservas where nome = 'Antiga'`)).rows[0];
ok(ant && ant.d === "2026-09-04" && ant.cancelada === false, `continua la, com a data dela (${ant?.d})`);
// cancelar e fazer check-in em reserva de data passada continua possivel (validacao e so na criacao)
ok((await tentar(db, `update reservas set cancelada = true where nome = 'Antiga'`)).ok, "da pra cancelar reserva de data passada");

console.log("\n--- permissao do navegador ---");
await db.exec("set role anon");
r = await tentar(db, ins(base + ",data_reserva,aniversario", `'sabado','19:30','17',2,'Anon','41999990099','${await prox(6, 1)}','05/11'`));
await db.exec("reset role");
ok(r.ok, "anon consegue reservar com data e aniversario");

console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> agenda validada");
