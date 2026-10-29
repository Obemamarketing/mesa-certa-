// Fila de espera (supabase-migration-fila.sql), num Postgres local que imita o Supabase.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) { falhas++; process.exitCode = 1; } };
const lerSql = (f) => fs.readFileSync(proj + f, "utf8").replace(/notify pgrst[^;]*;/gi, "");
const db = new PGlite();
const q = async (sql, p) => (await db.query(sql, p)).rows;
async function tentar(sql, p) { try { return { ok: true, rows: (await db.query(sql, p)).rows }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } }
async function como(papel, uid, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ""}'; set role ${papel};`);
  try { return await fn(); } finally { await db.exec(`reset role; set request.jwt.claim.sub = '';`); }
}
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role dono nologin;
  grant all on schema public to dono; grant usage on schema public to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to dono, anon, authenticated, service_role; grant select, references on auth.users to dono; grant select on auth.mfa_factors to dono;
`);
await como("dono", null, async () => {
  await db.exec(lerSql("supabase-schema.sql"));
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
});
ok(true, "supabase-completo.sql (com a fila) roda duas vezes");
await db.exec(`insert into auth.users (email) values ('dono@x.test'), ('curioso@x.test')`);
const [ADMIN, CURIOSO] = (await q(`select id from auth.users order by email`)).map((r) => r.id).sort((a, b) => 0) && (await q(`select id, email from auth.users`)).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));

const prox = async (dow, sem = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5), sabado = await prox(6), domingo2 = await prox(0, 2);
const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
let terca = null; for (let i = 1; i <= 7 && !terca; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) terca = r.d; }

const entrar = (data, pessoas, nome, tel, horario = "19:30") => como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, $2, $3, $4, $5, 'mesa perto da janela')`, [data, horario, pessoas, nome, tel]));
const ver = (codigo) => como("anon", null, () => q(`select * from ver_minha_fila($1::uuid)`, [codigo]));

console.log("\n--- entrar ---");
let r = await entrar(sexta, 6, "Ana Lima Souza", "41911110001");
ok(r.ok && r.rows[0].posicao === 1 && r.rows[0].codigo, "primeira da fila: posicao 1 e um codigo");
const codAna = r.rows[0].codigo;
r = await entrar(sexta, 4, "Beto", "(41) 92222-0002");
ok(r.ok && r.rows[0].posicao === 2, "segundo: posicao 2");
const codBeto = r.rows[0].codigo;
r = await entrar(sexta, 2, "Ana de novo", "+55 41 91111-0001");
ok(!r.ok && /JA_NA_FILA/.test(r.msg), "mesmo telefone (escrito de outro jeito) na mesma data: recusado");
r = await entrar(sabado, 2, "Ana Lima Souza", "41911110001");
ok(r.ok && r.rows[0].posicao === 1, "mesmo telefone em outra data: aceito");
for (const [rot, fn, padrao] of [
  ["dia sem funcionamento", () => entrar(terca, 2, "Caio", "41933330003"), /DATA_FORA_DA_AGENDA/],
  ["hoje", () => entrar(hoje, 2, "Caio", "41933330003"), /DATA_FORA_DA_AGENDA/],
  ["horario fora da casa (03:00)", () => entrar(sexta, 2, "Caio", "41933330003", "03:00"), /horario/],
  ["0 pessoas", () => entrar(sexta, 0, "Caio", "41933330003"), /pessoas/],
  ["nome de 1 letra", () => entrar(sexta, 2, "C", "41933330003"), /nome/],
  ["telefone curto", () => entrar(sexta, 2, "Caio", "123"), /telefone/],
]) { const x = await fn(); ok(!x.ok && padrao.test(x.msg), `recusa: ${rot}`); }
await db.exec(`insert into dias_fechados (data, motivo) values ('${domingo2}', 'Evento')`);
r = await entrar(domingo2, 2, "Caio", "41933330003");
ok(!r.ok && /RESTAURANTE_FECHADO/.test(r.msg), "recusa: dia fechado no calendario");

console.log("\n--- acompanhar (so a propria) ---");
let v = await ver(codAna);
ok(v.length === 1 && v[0].posicao === 1 && v[0].status === "aguardando" && v[0].primeiro_nome === "Ana" && v[0].pessoas === 6, "Ana ve: aguardando, posicao 1, 6 pessoas, so o primeiro nome");
ok(Object.keys(v[0]).sort().join() === "chamada_em,criada_em,data_reserva,horario,pessoas,posicao,primeiro_nome,status", "colunas: sem telefone, sem observacao, sem dado de mais ninguem");
ok((await ver("00000000-0000-0000-0000-000000000000")).length === 0, "codigo inventado: nada");
for (const [papel, uid, rot] of [["anon", null, "visitante"], ["authenticated", CURIOSO, "conta nao administradora"]]) {
  const x = await como(papel, uid, () => tentar(`select * from fila_espera`));
  ok(papel === "anon" ? !x.ok && x.code === "42501" : x.ok && x.rows.length === 0, `${rot} nao le a fila`);
  const y = await como(papel, uid, () => tentar(`update fila_espera set status = 'removido' returning id`));
  ok(papel === "anon" ? !y.ok : y.ok && y.rows.length === 0, `${rot} nao mexe na fila`);
}

console.log("\n--- painel (administrador) ---");
const fila = await como("authenticated", ADMIN, () => q(`select id, nome, telefone, codigo, status from fila_espera where data_reserva = $1 order by criada_em`, [sexta]));
ok(fila.length === 2 && fila[0].telefone === "41911110001", "administrador ve a fila inteira, com telefone");
let x = await como("authenticated", ADMIN, () => tentar(`update fila_espera set status = 'chamado', chamada_em = now() where id = $1 returning id`, [fila[0].id]));
ok(x.ok && x.rows.length === 1, "administrador chama a Ana");
v = await ver(codAna);
ok(v[0].status === "chamado" && v[0].posicao === null && v[0].chamada_em, "Ana ve 'chamado' na pagina dela");
v = await ver(codBeto);
ok(v[0].posicao === 1, "Beto sobe para a posicao 1");

console.log("\n--- sair ---");
const sair = (c) => como("anon", null, async () => (await q(`select sair_da_fila($1::uuid) r`, [c]))[0].r);
ok((await sair(codBeto)) === "ok", "Beto sai da fila");
ok((await sair(codBeto)) === "encerrada" && (await ver(codBeto))[0].status === "saiu", "sair de novo: 'encerrada'; a pagina mostra 'saiu'");
ok((await sair("00000000-0000-0000-0000-000000000000")) === "nao_encontrada", "codigo inventado: 'nao_encontrada'");

console.log("\n--- data que passou ---");
await db.exec(`alter table fila_espera disable trigger fila_validar_dia_trg; insert into fila_espera (data_reserva, horario, pessoas, nome, telefone) values ((now() at time zone 'America/Sao_Paulo')::date - 3, '19:30', 2, 'Velho', '41900000000'); alter table fila_espera enable trigger fila_validar_dia_trg;`); // preparo direto no banco: a data pode cair num dia fechado
const codVelho = (await q(`select codigo from fila_espera where nome = 'Velho'`))[0].codigo;
ok((await ver(codVelho))[0].status === "expirado", "espera de data passada aparece como 'expirado'");

console.log("\n--- rajada ---");
await db.exec(`alter table fila_espera disable trigger fila_validar_dia_trg; insert into fila_espera (data_reserva, horario, pessoas, nome, telefone) select '${sabado}', '19:30', 2, 'Robo ' || g, '419' || lpad(g::text, 8, '0') from generate_series(1, 30) g; alter table fila_espera enable trigger fila_validar_dia_trg;`); // preparo direto no banco: a data pode cair num dia fechado
r = await entrar(sabado, 2, "Mais Um", "41955550000");
ok(!r.ok && /LIMITE_DE_RESERVAS/.test(r.msg), "mais de 30 entradas em 10 minutos: recusado");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> fila de espera validada");
