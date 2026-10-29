// Captcha: reserva direta fechada (supabase-fechar-reserva-direta.sql), num Postgres local que imita o Supabase.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
  await db.exec(lerSql("supabase-completo.sql"));
  await db.exec(lerSql("supabase-completo.sql"));
});
ok(true, "supabase-completo.sql roda duas vezes");
await db.exec(`insert into auth.users (email) values ('dono@x.test'), ('curioso@x.test')`);
const [ADMIN, CURIOSO] = (await q(`select id from auth.users order by email`)).map((r) => r.id).sort((a, b) => 0) && (await q(`select id, email from auth.users`)).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));

const prox = async (dow, sem = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5), sabado = await prox(6), domingo2 = await prox(0, 2);
const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
let terca = null; for (let i = 1; i <= 7 && !terca; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) terca = r.d; }

const sabado2 = await prox(6, 1);
const args = (nome, tel, mesa) => [sabado, "12:00", JSON.stringify([{ numero: mesa, pessoas: 2 }]), nome, tel];
const SQL_RESERVAR = `select * from reservar($1::date, $2, $3::jsonb, $4, $5)`;
const comoServidor = (fn) => como("service_role", null, fn);

console.log("\n--- antes de fechar ---");
ok((await como("anon", null, () => tentar(SQL_RESERVAR, args("Ana Lima", "41911110001", "01")))).ok, "visitante reserva direto (como hoje)");

console.log("\n--- fechar ---");
await como("dono", null, () => db.exec(lerSql("supabase-fechar-reserva-direta.sql")));
let r = await como("anon", null, () => tentar(SQL_RESERVAR, args("Beto Souza", "41922220001", "02")));
ok(!r.ok && r.code === "42501", "visitante direto no banco: permissao negada (reserva)");
r = await como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, '12:00', 2, 'Beto Souza', '41922220001', null)`, [sabado]));
ok(!r.ok && r.code === "42501", "visitante direto no banco: permissao negada (fila)");
r = await como("anon", null, () => tentar(`select pedir_sobre_meus_dados('exclusao', 'Beto Souza', '41922220001', null)`));
ok(!r.ok && r.code === "42501", "visitante direto no banco: permissao negada (pedido sobre dados)");
r = await comoServidor(() => tentar(SQL_RESERVAR, args("Beto Souza", "41922220001", "02")));
ok(r.ok && r.rows[0].origem === "site", "o servidor (depois do captcha) reserva, e conta como reserva do site");
r = await como("authenticated", ADMIN, () => tentar(SQL_RESERVAR, args("Caio", "41933330001", "03")));
ok(r.ok, "o painel (administrador logado) continua reservando direto");
ok((await como("anon", null, () => tentar(`select * from mesas_ocupadas()`))).ok, "o visitante continua vendo as mesas ocupadas");
ok((await como("anon", null, () => tentar(`select * from consultar_reservas('ana lima')`))).ok, "o visitante continua consultando");
const idAna = (await q(`select id from reservas where nome = 'Ana Lima'`))[0].id;
const alt = await como("anon", null, async () => (await q(`select alterar_minha_reserva($1::uuid, '0001', $2::date, '13:30', '[{"numero":"01","pessoas":2}]'::jsonb) x`, [idAna, sabado]))[0].x);
ok(alt.status === "ok", "o visitante ainda altera a propria reserva (precisa dos 4 digitos)");

console.log("\n--- rodar o completo de novo nao reabre ---");
await como("dono", null, () => db.exec(lerSql("supabase-completo.sql")));
r = await como("anon", null, () => tentar(SQL_RESERVAR, args("Davi Rocha", "41944440001", "04")));
ok(!r.ok && r.code === "42501", "depois do supabase-completo.sql: continua fechado");

console.log("\n--- emergencia ---");
const re = await como("dono", null, () => q(`select reabrir_reserva_direta() x`));
ok(/reaberto/.test(re[0].x), "reabrir_reserva_direta() responde");
ok((await como("anon", null, () => tentar(SQL_RESERVAR, args("Davi Rocha", "41944440001", "04")))).ok, "reaberto: o visitante volta a reservar direto");
ok(!(await como("anon", null, () => tentar(`select reabrir_reserva_direta()`))).ok, "visitante nao consegue reabrir");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
