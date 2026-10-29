// Login em duas etapas: o banco exige a sessão confirmada com o código (aal2)
// de quem ativou o app autenticador.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MODO_ANTIGO = "; update funcionamento set dias_semana = '{5,6,0}'; update limites_reserva set horarios_permitidos = '{19:30}'; drop trigger if exists reservas_exigir_sobrenome_trg on reservas; drop trigger if exists fila_exigir_sobrenome_trg on fila_espera;"; // estes testes sao do tempo de sexta a domingo, 19h30 (o almoco de sabado tem teste-almoco.mjs)
const proj = fileURLToPath(new URL("../../", import.meta.url));
let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) { falhas++; process.exitCode = 1; } };
const lerSql = (f) => fs.readFileSync(proj + f, "utf8").replace(/notify pgrst[^;]*;/gi, "");
const stub = fs.readFileSync(new URL("./_stub.txt", import.meta.url), "utf8");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
// entra como "authenticated", com a sessão no nível dado (aal1 = só senha, aal2 = senha + código)
async function como(uid, aal, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid}'; set request.jwt.claims = '${JSON.stringify({ sub: uid, aal })}'; set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; set request.jwt.claim.sub = ''; set request.jwt.claims = '';`); }
}
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role dono nologin;
  grant all on schema public to dono; grant usage on schema public to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role dono in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; ${stub}
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to dono, anon, authenticated, service_role; grant select, references on auth.users to dono; grant select on auth.mfa_factors to dono;
`);
await db.exec("set role dono");
await db.exec(lerSql("supabase-schema.sql"));
await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','01',2,'Cliente','41999990001', (select d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1, (now() at time zone 'America/Sao_Paulo')::date + 7, interval '1 day') g(d) where extract(dow from d) = 5 limit 1)::date)`);
await db.exec("reset role");
await db.exec(`insert into auth.users (email) values ('dono@x.test')`);
const A = (await q(`select id from auth.users`))[0].id;
await db.exec(`insert into administradores (user_id) values ('${A}')`);
await db.exec("set role dono"); await db.exec(lerSql("supabase-fechar-acesso.sql")); await db.exec("reset role");
ok(true, "supabase-completo.sql (com as duas etapas) roda e o banco fecha");

const ve = (aal) => como(A, aal, async () => ({ admin: (await q(`select eh_admin() a`))[0].a, reservas: (await q(`select count(*)::int n from reservas`))[0].n }));
let r = await ve("aal1");
ok(r.admin && r.reservas === 1, "sem as duas etapas ativadas: entra so com a senha (como hoje)");
await db.exec(`insert into auth.mfa_factors (user_id, status) values ('${A}', 'unverified')`);
r = await ve("aal1");
ok(r.admin && r.reservas === 1, "ativacao comecada mas nao confirmada (QR lido, codigo nao digitado): continua entrando com a senha");
await db.exec(`update auth.mfa_factors set status = 'verified' where user_id = '${A}'`);
r = await ve("aal1");
ok(!r.admin && r.reservas === 0, "duas etapas ATIVADAS e sessao so com a senha: nao e administrador e nao ve nenhuma reserva");
r = await ve("aal2");
ok(r.admin && r.reservas === 1, "com o codigo do app confirmado (aal2): entra e ve as reservas");
const alt = await como(A, "aal1", async () => { try { return (await db.query(`update reservas set cancelada = true returning id`)).rows.length; } catch { return -1; } });
ok(alt === 0, "so com a senha, tambem nao consegue alterar nada");
await db.exec(`delete from auth.mfa_factors where user_id = '${A}'`);
r = await ve("aal1");
ok(r.admin, "suporte apagou o fator (celular perdido): volta a entrar so com a senha");
console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> duas etapas validadas no banco");
