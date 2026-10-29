import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const proj = fileURLToPath(new URL("../../", import.meta.url));
const completo = fs.readFileSync(proj + "supabase-completo.sql", "utf8");
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };

const db = new PGlite();
// Papéis SEM os privilégios padrão do Supabase: o arquivo tem que se bastar.
await db.exec(`create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique); create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$; create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;`);

// esquema ORIGINAL (supabase-schema.sql), sem observacao nem checkin_em.
// A tabela reservas existe no Supabase com os privilégios que ele dá por padrão.
await db.exec(`
create table reservas (
  id uuid primary key default gen_random_uuid(),
  dia text not null check (dia in ('sexta','sabado','domingo')),
  horario text not null, mesa_numero text not null, pessoas integer not null,
  nome text not null, telefone text not null, email text,
  criada_em timestamptz not null default now(), cancelada boolean not null default false
);
create unique index reservas_slot_unico on reservas (dia, horario, mesa_numero) where not cancelada;
grant all on reservas to anon, authenticated, service_role;
`);
await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values
  ('sexta','19:30','01',2,'Ana','4199'), ('sexta','19:30','02',7,'Matheus','4198')`);

const q = async (s) => (await db.query(s)).rows;
const como = async (papel, sql) => { await db.exec(`set role ${papel}`); try { return await db.query(sql); } finally { await db.exec(`reset role`); } };
const falha = async (papel, sql) => { try { await como(papel, sql); return false; } catch { return true; } };

await db.exec(completo);
ok(true, "1a execucao do arquivo completo sem erro");
await db.exec(completo);
ok(true, "2a execucao (idempotente) sem erro");

let [r] = await q(`select count(*)::int n from information_schema.columns where table_name='reservas' and column_name in ('observacao','checkin_em','data_reserva')`);
ok(r.n === 3, "reservas ganhou observacao, checkin_em e data_reserva");
[r] = await q(`select count(*)::int n from reservas`);
ok(r.n === 2, "as reservas que ja existiam continuam la (2)");
[r] = await q(`select count(*)::int n from mesas`);
ok(r.n === 20, "tabela mesas com 20 mesas");
[r] = await q(`select count(*)::int n from config_lembretes`);
ok(r.n === 1, "config_lembretes com a linha unica");

await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sabado','19:30','05',4,'Bia Souza','4188')`);
[r] = await q(`select count(*)::int n from lembretes_whatsapp l join reservas x on x.id=l.reserva_id where x.nome='Bia Souza'`);
ok(r.n === 1, "reserva nova agenda o lembrete");

const id05 = (await q(`select id from mesas where numero='05'`))[0].id;
await db.query(`select renomear_mesa($1,'55')`, [id05]);
[r] = await q(`select count(*)::int n from reservas where mesa_numero='55'`);
ok(r.n === 1, "renomear a mesa leva a reserva junto");

console.log("\n--- permissoes (sem privilegios padrao) ---");
// chave anonima (o navegador)
ok((await como("anon", `select count(*)::int n from mesas`)).rows[0].n === 20, "anon le a planta (20 mesas)");
await como("anon", `update mesas set pos_x = 60.5, pos_y = 40 where numero='09'`);
ok((await q(`select pos_x::float x from mesas where numero='09'`))[0].x === 60.5, "anon consegue calibrar o marcador (update)");
ok(await falha("anon", `delete from mesas where numero='01'`), "anon NAO consegue apagar mesa");
ok(await falha("anon", `insert into mesas (numero,capacidade,formato,zona,pos_x,pos_y) values ('77',4,'quadrada','Palco',1,1)`), "anon NAO consegue criar mesa");
ok((await como("anon", `select count(*)::int n from config_lembretes`)).rows[0].n === 1, "anon le a config de lembretes");
await como("anon", `update config_lembretes set ativo = false where id = 1`);
ok((await q(`select ativo from config_lembretes`))[0].ativo === false, "anon consegue ligar/desligar lembretes");
await db.exec(`update config_lembretes set ativo = true where id = 1`);
ok((await como("anon", `select count(*)::int n from lembretes_whatsapp`)).rows[0].n >= 1, "anon le a lista de lembretes");
ok(await falha("anon", `delete from lembretes_whatsapp`), "anon NAO apaga lembretes");
ok(await falha("anon", `update lembretes_whatsapp set status='enviado'`), "anon NAO altera status de lembrete");
ok(await falha("anon", `select * from reivindicar_lembretes(1)`), "anon NAO executa reivindicar_lembretes");

// backend
ok((await como("service_role", `select count(*)::int n from mesas`)).rows[0].n === 20, "service_role le mesas (rota do cron)");
ok(!(await falha("service_role", `select * from reivindicar_lembretes(1)`)), "service_role executa reivindicar_lembretes");
ok(!(await falha("service_role", `update lembretes_whatsapp set tentativas = tentativas`)), "service_role atualiza lembretes");

console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> arquivo completo validado");
