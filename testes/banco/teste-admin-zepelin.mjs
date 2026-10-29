// Confere o SQL preenchido do administrador do ZéPelin num Postgres local.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)

const proj = fileURLToPath(new URL("../../", import.meta.url));
const sql = fs.readFileSync(new URL("./administradores-zepelin.sql", import.meta.url), "utf8");
const lerSql = (f) => fs.readFileSync(proj + f, "utf8").replace(/notify pgrst[^;]*;/gi, "");
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text); create function auth.jwt() returns jsonb language sql stable as $j$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $j$;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(lerSql("supabase-schema.sql"));
await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));

// antes de o usuário existir: não dá erro, só não cadastra ninguém
let r = await db.exec(sql);
ok(r.at(-1).rows.length === 0, "sem o usuario criado: roda sem erro e a conferencia vem vazia");
let f = await db.exec(`select fechar_acesso_publico()`).then(() => "fechou", (e) => e.message);
ok(/Cadastre ao menos um administrador/.test(f), "e o fechamento do banco continua recusado");

// usuário criado no Supabase (com maiúscula diferente, como alguém poderia digitar)
await db.exec(`insert into auth.users (email) values ('ZepelinMesaCerta@gmail.com'), ('outro@gmail.com')`);
r = await db.exec(sql);
r = await db.exec(sql); // rodar duas vezes não duplica
const linhas = r.at(-1).rows;
ok(linhas.length === 1 && linhas[0].email === "ZepelinMesaCerta@gmail.com" && linhas[0].nome === "ZéPelin", `com o usuario criado: 1 administrador (${linhas.map((l) => `${l.nome} <${l.email}>`).join(", ")})`);

const uid = (await db.query(`select id from auth.users where lower(email) = 'zepelinmesacerta@gmail.com'`)).rows[0].id;
const outro = (await db.query(`select id from auth.users where email = 'outro@gmail.com'`)).rows[0].id;
const ehAdmin = async (id) => { await db.exec(`set request.jwt.claim.sub = '${id}'; set role authenticated;`); const v = (await db.query(`select eh_admin() a`)).rows[0].a; await db.exec(`reset role; set request.jwt.claim.sub = '';`); return v; };
ok((await ehAdmin(uid)) === true, "o login do ZePelin e administrador");
ok((await ehAdmin(outro)) === false, "outra conta qualquer nao e");
f = await db.exec(`select fechar_acesso_publico()`).then(() => "fechou", (e) => e.message);
ok(f === "fechou", "com ele cadastrado, o fechamento do banco e aceito");
console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> SQL do administrador validado");
