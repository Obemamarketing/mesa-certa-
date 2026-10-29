// Nome e sobrenome, consulta e alteração pelo cliente (supabase-migration-reserva-cliente.sql), num Postgres local que imita o Supabase.
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
ok(true, "supabase-completo.sql (com a parte 14) roda duas vezes");
await db.exec(`insert into auth.users (email) values ('dono@x.test'), ('curioso@x.test')`);
const [ADMIN, CURIOSO] = (await q(`select id from auth.users order by email`)).map((r) => r.id).sort((a, b) => 0) && (await q(`select id, email from auth.users`)).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));

const prox = async (dow, sem = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5), sabado = await prox(6), domingo2 = await prox(0, 2);
const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
let terca = null; for (let i = 1; i <= 7 && !terca; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) terca = r.d; }

const sabado2 = await prox(6, 1);
const reservar = (quem, data, horario, mesas, nome, tel) => como(quem === "admin" ? "authenticated" : "anon", quem === "admin" ? ADMIN : null, () =>
  tentar(`select * from reservar($1::date, $2, $3::jsonb, $4, $5)`, [data, horario, JSON.stringify(mesas), nome, tel]));
const uma = (numero, pessoas = 2) => [{ numero, pessoas }];
const consultar = (termo) => como("anon", null, () => q(`select * from consultar_reservas($1)`, [termo]));
const alterar = (id, dig, data, horario, mesas) => como("anon", null, async () => (await q(`select alterar_minha_reserva($1::uuid, $2, $3::date, $4, $5::jsonb) x`, [id, dig, data, horario, JSON.stringify(mesas)]))[0].x);
const ativas = (nome) => q(`select horario, mesa_numero, pessoas from reservas where nome = $1 and not cancelada order by mesa_numero`, [nome]);

console.log("\n--- nome e sobrenome ---");
let r = await reservar("anon", sabado, "12:00", uma("01"), "Ana", "41911110001");
ok(!r.ok && /nome/.test(r.msg), "site: so o primeiro nome e recusado");
r = await reservar("anon", sabado, "12:00", uma("01"), "Ana Lima", "41911110001");
ok(r.ok, "site: nome e sobrenome aceito");
const idAna = r.rows[0].id;
r = await reservar("admin", sabado2, "12:00", uma("01"), "Joao", "41922220001");
ok(r.ok, "painel: so o primeiro nome continua aceito (balcao)");
r = await como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, '12:00', 2, 'Beto', '41933330001', null)`, [sabado]));
ok(!r.ok && /nome/.test(r.msg), "fila: so o primeiro nome e recusado");
r = await como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, '12:00', 2, 'Beto Souza', '41933330001', null)`, [sabado]));
ok(r.ok, "fila: nome e sobrenome aceito");

console.log("\n--- consulta pelo nome completo ---");
ok((await reservar("anon", sabado, "12:00", uma("02"), "Mariana Limeira", "41944440001")).ok, "Mariana Limeira reserva");
ok((await consultar("ana")).length === 0, "so 'ana': nao mostra nada (precisa de sobrenome)");
const al = await consultar("ana lima");
ok(al.length === 1 && al[0].mesa_numero === "01", "'ana lima': acha so a Ana Lima (nao a Mariana Limeira)");
ok((await consultar("LIMA ána")).length === 1, "ordem, maiuscula e acento nao importam");
ok((await consultar("ana li")).length === 0, "pedaco de palavra nao vale ('li' nao e 'Lima')");
ok(!("nome" in al[0]) && !("telefone" in al[0]), "a consulta nao devolve nome nem telefone");

console.log("\n--- alterar ---");
let a = await alterar(idAna, "0000", sabado, "13:30", uma("02"));
ok(a.status === "telefone", "digitos errados: 'telefone'");
ok((await ativas("Ana Lima")).length === 1 && (await ativas("Ana Lima"))[0].horario === "12:00", "...e nada mudou");
a = await alterar(idAna, "0001", sabado, "13:30", uma("02"));
ok(a.status === "ok" && a.reservas.length === 1 && a.reservas[0].horario === "13:30" && a.reservas[0].mesa_numero === "02", "digitos certos: passa para 13h30, mesa 02");
const agora = await ativas("Ana Lima");
ok(agora.length === 1 && agora[0].horario === "13:30", "a das 12h foi cancelada, ficou so a nova");
ok((await reservar("anon", sabado, "12:00", uma("01"), "Outra Pessoa", "41955550001")).ok, "a mesa 01 das 12h ficou livre para outra pessoa");
const idNova = a.reservas[0].id;
const tel = (await q(`select telefone, nome from reservas where id = $1`, [idNova]))[0];
ok(tel.telefone === "41911110001" && tel.nome === "Ana Lima", "a nova reserva tem o mesmo nome e telefone");

// mesa nova tomada: nada muda
ok((await reservar("anon", sabado, "12:00", uma("03"), "Beto Souza", "41933330001")).ok, "Beto Souza reserva a mesa 03 as 12h");
a = await alterar(idNova, "0001", sabado, "12:30", uma("03"));
ok(a.status === "erro" && a.codigo === "23505", "trocar para a mesa 03 as 12h30 (ocupada pelo Beto): erro 23505");
const depois = await ativas("Ana Lima");
ok(depois.length === 1 && depois[0].horario === "13:30" && depois[0].mesa_numero === "02", "...e a reserva da Ana continua a de antes (13h30, mesa 02)");

// mesma mesa, outro horário (ela não conflita com ela mesma)
a = await alterar(idNova, "0001", sabado, "14:00", uma("02"));
ok(a.status === "ok" && a.reservas[0].horario === "14:00", "mesma mesa, outro horario: aceita");

// data fora da agenda
a = await alterar(a.reservas[0].id, "0001", sexta, "12:00", uma("02"));
ok(a.status === "erro" && /DATA_FORA_DA_AGENDA/.test(a.mensagem), "trocar para uma sexta: recusa (so sabado)");
ok((await ativas("Ana Lima"))[0].horario === "14:00", "...e a das 14h continua");

console.log("\n--- grupo em varias mesas ---");
r = await reservar("anon", sabado2, "12:00", [{ numero: "04", pessoas: 4 }, { numero: "05", pessoas: 2 }], "Carla Dias", "41966660001");
ok(r.ok && r.rows.length === 2, "Carla Dias: 6 pessoas nas mesas 04 e 05");
a = await alterar(r.rows[0].id, "0001", sabado2, "13:30", [{ numero: "06", pessoas: 4 }, { numero: "07", pessoas: 2 }]);
const carla = await ativas("Carla Dias");
ok(a.status === "ok" && carla.length === 2 && carla.every((x) => x.horario === "13:30") && carla.map((x) => x.mesa_numero).join() === "06,07", "alterar muda o grupo inteiro: 04+05 as 12h viram 06+07 as 13h30");

console.log("\n--- bloqueio e reserva encerrada ---");
r = await reservar("anon", sabado2, "12:00", uma("08"), "Davi Rocha", "41977770001");
let ultimo;
for (let i = 0; i < 5; i++) ultimo = await alterar(r.rows[0].id, "9999", sabado2, "13:30", uma("08"));
ok(ultimo.status === "bloqueada", "5 erros de digitos: 'bloqueada'");
ok((await alterar(r.rows[0].id, "0001", sabado2, "13:30", uma("08"))).status === "bloqueada", "...e nem o certo passa mais (so o restaurante)");
r = await reservar("anon", sabado2, "12:00", uma("09"), "Eva Melo", "41988880001");
await q(`update reservas set checkin_em = now() where id = $1`, [r.rows[0].id]);
ok((await alterar(r.rows[0].id, "0001", sabado2, "13:30", uma("09"))).status === "encerrada", "cliente que ja chegou: 'encerrada'");
ok((await alterar("00000000-0000-0000-0000-000000000000", "0001", sabado2, "13:30", uma("09"))).status === "nao_encontrada", "reserva inventada: 'nao_encontrada'");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");

console.log("\n--- conferir os digitos antes de alterar ---");
const conferir = (id, dig) => como("anon", null, async () => (await q(`select conferir_minha_reserva($1::uuid, $2) x`, [id, dig]))[0].x);
r = await reservar("anon", sabado2, "12:00", uma("10"), "Fabio Neves", "41999990077");
ok((await conferir(r.rows[0].id, "1111")) === "telefone", "digitos errados: 'telefone'");
ok((await conferir(r.rows[0].id, "0077")) === "ok", "digitos certos: 'ok' (sem mudar nada)");
ok((await ativas("Fabio Neves")).length === 1, "...e a reserva continua igual");
console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> conferencia ok");
