// Almoço de sábado (supabase-migration-almoco.sql), num Postgres local que imita o Supabase.
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
ok(true, "supabase-completo.sql (com o almoço) roda duas vezes");
await db.exec(`insert into auth.users (email) values ('dono@x.test'), ('curioso@x.test')`);
const [ADMIN, CURIOSO] = (await q(`select id from auth.users order by email`)).map((r) => r.id).sort((a, b) => 0) && (await q(`select id, email from auth.users`)).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));

const prox = async (dow, sem = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5), sabado = await prox(6), domingo2 = await prox(0, 2);
const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
let terca = null; for (let i = 1; i <= 7 && !terca; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) terca = r.d; }

const sabado2 = await prox(6, 1);
const reservar = (quem, data, horario, mesa, tel = "41911110001") => como(quem === "admin" ? "authenticated" : "anon", quem === "admin" ? ADMIN : null, () =>
  tentar(`select * from reservar($1::date, $2, $3::jsonb, 'Cliente Almoco', $4)`, [data, horario, JSON.stringify([{ numero: mesa, pessoas: 2 }]), tel]));
const entrar = (data, horario) => como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, $2, 2, 'Fila Almoco', '41922220002', null)`, [data, horario]));

console.log("\n--- dias ---");
let r = await reservar("anon", sabado, "12:00", "01");
ok(r.ok, `sabado 12h, mesa 01: aceita ${r.ok ? "" : r.msg}`);
ok(r.ok && r.rows[0].dia === "sabado", "gravou como sabado");
for (const [rot, d] of [["sexta", sexta], ["domingo", domingo2]]) {
  const x = await reservar("anon", d, "12:00", "02");
  ok(!x.ok && /DATA_FORA_DA_AGENDA/.test(x.msg), `${rot}: recusa (so sabado)`);
  const y = await reservar("admin", d, "12:00", "02");
  ok(!y.ok && /DATA_FORA_DA_AGENDA/.test(y.msg), `${rot} pelo painel: tambem recusa`);
}

console.log("\n--- horarios ---");
for (const h of ["12:30", "13:00", "13:30", "14:00", "14:30"]) {
  const x = await reservar("anon", sabado, h, "05", "4193333" + h.replace(":", ""));
  // 05 a cada 30 min: so os que nao se cruzam passam — testado abaixo com a 01
  void x;
}
for (const [h, esperado] of [["19:30", false], ["11:30", false], ["15:00", false]]) {
  const x = await reservar("anon", sabado2, h, "09");
  ok(x.ok === esperado && /horario/.test(x.msg ?? ""), `site recusa ${h} (fora do almoco)`);
}

console.log("\n--- a mesa fica presa 1h30 ---");
for (const [h, aceita] of [["12:30", false], ["13:00", false], ["13:30", true]]) {
  const x = await reservar("anon", sabado, h, "01", "4194444" + h.replace(":", ""));
  ok(x.ok === aceita && (aceita || x.code === "23505"), `mesa 01 (reservada 12h) as ${h}: ${aceita ? "aceita" : "recusa (23505, mesa ocupada)"}`);
}
ok((await reservar("anon", sabado, "12:00", "02", "41955550001")).ok, "outra mesa no mesmo horario: aceita");
ok((await reservar("anon", sabado2, "12:00", "01", "41955550002")).ok, "mesma mesa e horario em OUTRO sabado: aceita");
const x1 = await reservar("admin", sabado, "12:30", "01");
ok(!x1.ok && x1.code === "23505", "pelo painel tambem nao deixa sobrepor");

console.log("\n--- cancelar, reativar e mudar ---");
const doze = (await q(`select id from reservas where data_reserva = $1 and mesa_numero = '01' and horario = '12:00'`, [sabado]))[0].id;
await como("authenticated", ADMIN, () => q(`update reservas set cancelada = true where id = $1`, [doze]));
ok((await reservar("anon", sabado, "12:00", "01", "41966660001")).ok, "cancelada a das 12h, outra pessoa pega a mesa 01 as 12h (a das 13h30 nao atrapalha: 1h30 exata)");
const re = await como("authenticated", ADMIN, () => tentar(`update reservas set cancelada = false where id = $1`, [doze]));
ok(!re.ok && re.code === "23505", "reativar a reserva cancelada agora recusa (a mesa ja e de outra pessoa)");
const outra = (await q(`select id from reservas where data_reserva = $1 and mesa_numero = '02'`, [sabado]))[0].id;
const mv = await como("authenticated", ADMIN, () => tentar(`update reservas set mesa_numero = '01' where id = $1`, [outra]));
ok(!mv.ok && mv.code === "23505", "mudar outra reserva para a mesa 01 no mesmo horario: recusa");
const ck = await como("authenticated", ADMIN, () => tentar(`update reservas set checkin_em = now() where id = $1`, [outra]));
ok(ck.ok, "check-in (sem mudar mesa/horario) continua funcionando");

console.log("\n--- fila ---");
let f = await entrar(sexta, "12:00");
ok(!f.ok && /DATA_FORA_DA_AGENDA/.test(f.msg), "fila na sexta: recusa");
f = await entrar(sabado, "19:30");
ok(!f.ok && /horario/.test(f.msg), "fila as 19h30: recusa");
f = await entrar(sabado, "13:00");
ok(f.ok, "fila no sabado 13h: aceita");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
