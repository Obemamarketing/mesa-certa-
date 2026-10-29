// Freio contra abuso na reserva pública (supabase-migration-limites.sql), num
// Postgres local que imita o Supabase (papéis, default privileges, auth).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) { falhas++; process.exitCode = 1; } };
const lerSql = (f) => fs.readFileSync(proj + f, "utf8").replace(/notify pgrst[^;]*;/gi, "");

const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
async function tentar(sql, params) {
  try { return { ok: true, rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}
async function como(papel, uid, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ""}'; set role ${papel};`);
  try { return await fn(); } finally { await db.exec(`reset role; set request.jwt.claim.sub = '';`); }
}

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role dono nologin;
  grant all on schema public to dono;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to dono, anon, authenticated, service_role;
  grant select, references on auth.users to dono; grant select on auth.mfa_factors to dono;
`);
await como("dono", null, async () => {
  await db.exec(lerSql("supabase-schema.sql"));
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,criada_em) values ('sexta','19:30','01',2,'Antiga','41999990001','2026-09-01 15:00-03')`);
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
  // como num banco que rodou a versão anterior, com o limite de datas
  await db.exec(`alter table limites_reserva add column datas_por_telefone int not null default 4`);
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
});
ok((await q(`select count(*)::int n from information_schema.columns where table_name = 'limites_reserva' and column_name = 'datas_por_telefone'`))[0].n === 0, "rodar de novo apaga a coluna antiga do limite de datas");
ok(true, "supabase-completo.sql (com o freio) roda duas vezes, com reserva antiga no banco");
await db.exec(`insert into auth.users (email) values ('dono@zepelin.test')`);
const ADMIN = (await q(`select id from auth.users`))[0].id;
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));
ok((await q(`select acesso_fechado() f`))[0].f === true, "banco fechado (parte 2), como em producao");
ok((await q(`select origem from reservas where nome = 'Antiga'`))[0].origem === "site", "reserva antiga ganhou origem 'site'");

const datas = [];
for (const [dow, sem] of [[5, 0], [6, 0], [0, 1], [5, 1], [6, 1], [0, 2]]) {
  datas.push((await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d);
}
const mesas = (de, ate) => Array.from({ length: ate - de + 1 }, (_, i) => ({ numero: String(de + i).padStart(2, "0"), pessoas: 1 }));
const reservar = (quem, data, lista, telefone, nome = "Cliente Teste") =>
  como(quem === "admin" ? "authenticated" : "anon", quem === "admin" ? ADMIN : null, () =>
    tentar(`select * from reservar($1::date, '19:30', $2::jsonb, $3, $4)`, [data, JSON.stringify(lista), nome, telefone]));

console.log("\n--- 1) mesas por reserva (padrao 15) ---");
let r = await reservar("anon", datas[0], mesas(1, 16), "41911110000");
ok(!r.ok && /LIMITE_DE_RESERVAS: mesas por reserva/.test(r.msg), "16 mesas numa reserva so: recusado");
ok((await q(`select count(*)::int n from reservas where telefone = '41911110000'`))[0].n === 0, "  e nada foi gravado");

console.log("\n--- 2) mesas por telefone (padrao 15), somando datas e formatos do numero ---");
r = await reservar("anon", datas[0], mesas(1, 10), "41922220000");
ok(r.ok && r.rows.length === 10 && r.rows.every((x) => x.origem === "site"), "10 mesas na primeira data: aceito, origem 'site'");
r = await reservar("anon", datas[1], mesas(1, 6), "+55 (41) 92222-0000");
ok(!r.ok && /mesas por telefone/.test(r.msg), "mais 6 com o mesmo numero escrito de outro jeito (+55 ...): passaria de 15, recusado");
r = await reservar("anon", datas[1], mesas(1, 5), "(41) 92222-0000");
ok(r.ok && r.rows.length === 5, "mais 5 (chega a 15): aceito");
await db.exec(`update reservas set cancelada = true where telefone = '41922220000' and mesa_numero in ('01','02')`);
r = await reservar("anon", datas[2], mesas(1, 2), "41922220000");
ok(r.ok, "reserva cancelada nao conta: depois de cancelar 2, cabem mais 2");

console.log("\n--- 3) datas por telefone (padrao 4) ---");
for (let i = 0; i < 4; i++) {
  r = await reservar("anon", datas[i], [{ numero: "17", pessoas: 2 }], "41933330000");
  if (!r.ok) ok(false, `data ${i + 1}: ${r.msg}`);
}
ok(true, "4 datas diferentes com o mesmo telefone: aceitas");
r = await reservar("anon", datas[4], [{ numero: "17", pessoas: 2 }], "41933330000");
ok(r.ok, "5a data diferente com o mesmo telefone: aceita (limite de datas retirado)");
r = await reservar("anon", datas[0], [{ numero: "18", pessoas: 2 }], "41933330000");
ok(r.ok, "mais uma mesa numa data que ele ja tem: aceita (nao e data nova)");

console.log("\n--- 4) rajada: mesas pelo site em 10 minutos, somando todo mundo ---");
await db.exec(`update limites_reserva set mesas_por_10_minutos = (select count(*) from reservas where origem = 'site' and criada_em > now() - interval '10 minutes') + 3`);
r = await reservar("anon", datas[3], mesas(1, 2), "41944440001");
ok(r.ok, "2 mesas de um telefone novo: aceito");
r = await reservar("anon", datas[3], mesas(3, 4), "41944440002");
ok(!r.ok && /LIMITE_DE_RESERVAS: muitas reservas agora/.test(r.msg), "outro telefone novo, mais 2: passaria do limite da janela, recusado");
r = await reservar("anon", datas[3], mesas(3, 3), "41944440003");
ok(r.ok, "1 mesa ainda cabe na janela: aceito");

console.log("\n--- 5) o painel (administrador) nao e barrado e nao conta na janela ---");
r = await reservar("admin", datas[3], mesas(5, 20).slice(0, 16).filter((m) => m.numero !== "17"), "41944440003", "Evento do Balcao");
ok(r.ok && r.rows.length === 15 && r.rows.every((x) => x.origem === "painel"), "administrador reserva 15 mesas de uma vez com um telefone que ja tem reserva: aceito, origem 'painel'");
await db.exec(`update limites_reserva set mesas_por_10_minutos = (select count(*) from reservas where origem = 'site' and criada_em > now() - interval '10 minutes') + 1`);
r = await reservar("anon", datas[5], mesas(1, 1), "41955550000");
ok(r.ok, "as 15 do painel nao entraram na conta da rajada do site");

console.log("\n--- 5b) horario: o site so reserva nos horarios da casa ---");
await db.exec(`update limites_reserva set mesas_por_10_minutos = 1000`);
const comHorario = (quem, horario, mesa) => como(quem === "admin" ? "authenticated" : "anon", quem === "admin" ? ADMIN : null, () =>
  tentar(`select * from reservar($1::date, $2, $3::jsonb, 'Hora Teste', '41966660000')`, [datas[4], horario, JSON.stringify([{ numero: mesa, pessoas: 2 }])]));
r = await comHorario("anon", "03:00", "11");
ok(!r.ok && /DADOS_INVALIDOS: horario/.test(r.msg), "visitante reservando as 03:00: recusado");
r = await comHorario("anon", "29:00", "11");
ok(!r.ok && /DADOS_INVALIDOS: horario/.test(r.msg), "horario impossivel (29:00): recusado");
r = await comHorario("anon", "19:30", "11");
ok(r.ok, "19:30 (horario da casa): aceito");
r = await comHorario("admin", "21:00", "12");
ok(r.ok && r.rows[0].horario === "21:00", "o painel pode abrir excecao (21:00)");
await db.exec(`update limites_reserva set horarios_permitidos = '{19:30,21:00}'`);
r = await comHorario("anon", "21:00", "13");
ok(r.ok, "depois de incluir 21:00 nos horarios da casa, o site aceita");
ok((await q(`select count(*)::int n from reservas where nome = 'Hora Teste'`))[0].n === 3, "  so as 3 aceitas foram gravadas");

console.log("\n--- 6) os limites so mudam pelo SQL Editor ---");
for (const papel of ["anon", "authenticated"]) {
  const x = await como(papel, papel === "authenticated" ? ADMIN : null, () => tentar(`select * from limites_reserva`));
  ok(!x.ok && x.code === "42501", `${papel === "anon" ? "visitante" : "nem o administrador"} le os limites pela API`);
  const y = await como(papel, papel === "authenticated" ? ADMIN : null, () => tentar(`update limites_reserva set mesas_por_telefone = 999`));
  ok(!y.ok && y.code === "42501", `${papel === "anon" ? "visitante" : "nem o administrador"} muda os limites pela API`);
}
const x = await como("anon", null, () => tentar(`update reservas set origem = 'painel'`));
ok(!x.ok, "visitante nao mexe na origem das reservas (tabela fechada)");
const y = await tentar(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva,origem) values ('sexta','19:30','19',2,'X','41900000000','${datas[0]}','qualquer')`);
ok(!y.ok && /reservas_origem_valida/.test(y.msg), "origem so aceita 'site' ou 'painel'");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> freio contra abuso validado");
