// Dados do cliente / LGPD (supabase-migration-lgpd.sql), num Postgres local que imita o Supabase.
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
ok(true, "supabase-completo.sql (com a LGPD) roda duas vezes");
await db.exec(`insert into auth.users (email) values ('dono@x.test'), ('curioso@x.test')`);
const [ADMIN, CURIOSO] = (await q(`select id from auth.users order by email`)).map((r) => r.id).sort((a, b) => 0) && (await q(`select id, email from auth.users`)).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);
await db.exec(`insert into administradores (user_id) values ('${ADMIN}')`);
await como("dono", null, () => db.exec(lerSql("supabase-fechar-acesso.sql")));

const prox = async (dow, sem = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * sem})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5), sabado = await prox(6), domingo2 = await prox(0, 2);
const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
let terca = null; for (let i = 1; i <= 7 && !terca; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) terca = r.d; }

const pedir = (tipo, nome, tel, msg = null) => como("anon", null, () => tentar(`select pedir_sobre_meus_dados($1, $2, $3, $4) p`, [tipo, nome, tel, msg]));
const reservarSite = (data, mesa, nome, tel) => como("anon", null, () => tentar(`select * from reservar($1::date, '19:30', $2::jsonb, $3, $4, 'ana@x.test', '12/03', 'alergia a camarao')`, [data, JSON.stringify([{ numero: mesa, pessoas: 2 }]), nome, tel]));
const entrar = (data, nome, tel) => como("anon", null, () => tentar(`select * from entrar_na_fila($1::date, '19:30', 2, $2, $3, null)`, [data, nome, tel]));

console.log("\n--- pedido do cliente ---");
let r = await pedir("exclusao", "Ana Lima", "(41) 91111-0001", "quero sair");
ok(r.ok && /^[0-9A-F]{8}$/.test(r.rows[0].p), `pedido aceito, protocolo ${r.ok ? r.rows[0].p : r.msg}`);
for (const [rot, fn, padrao] of [
  ["tipo inventado", () => pedir("hackear", "Ana", "41911110001"), /tipo/],
  ["nome de 1 letra", () => pedir("exclusao", "A", "41911110001"), /nome/],
  ["telefone curto", () => pedir("exclusao", "Ana", "123"), /telefone/],
]) { const x = await fn(); ok(!x.ok && padrao.test(x.msg), `recusa: ${rot}`); }
await pedir("acesso", "Ana Lima", "41911110001"); await pedir("correcao", "Ana Lima", "+55 41 91111-0001");
r = await pedir("outro", "Ana Lima", "41 91111 0001");
ok(!r.ok && /LIMITE_DE_PEDIDOS/.test(r.msg), "4o pedido do mesmo telefone no dia: freado");
for (const [papel, uid, rot] of [["anon", null, "visitante"], ["authenticated", CURIOSO, "conta nao administradora"]]) {
  const x = await como(papel, uid, () => tentar(`select * from pedidos_titular`));
  ok(papel === "anon" ? !x.ok : x.ok && x.rows.length === 0, `${rot} nao le os pedidos`);
  const y = await como(papel, uid, () => tentar(`select apagar_dados_do_cliente('41911110001')`));
  ok(!y.ok, `${rot} nao consegue apagar dados`);
  const z = await como(papel, uid, () => tentar(`select anonimizar_dados_antigos()`));
  ok(!z.ok, `${rot} nao roda a limpeza`);
}
const pedidos = await como("authenticated", ADMIN, () => q(`select * from pedidos_titular order by criado_em`));
ok(pedidos.length === 3 && pedidos[0].mensagem === "quero sair", "administrador ve os 3 pedidos");
const u = await como("authenticated", ADMIN, () => tentar(`update pedidos_titular set status = 'concluido', concluido_em = now(), nota = 'apagado' where id = $1 returning status`, [pedidos[0].id]));
ok(u.ok && u.rows[0].status === "concluido", "administrador marca o pedido como concluido");

console.log("\n--- apagar os dados de um telefone ---");
ok((await reservarSite(sexta, "01", "Ana Lima", "41911110001")).ok, "Ana reserva na sexta (com e-mail, aniversario e observacao)");
ok((await reservarSite(sexta, "02", "Beto Souza", "41922220002")).ok, "Beto reserva na sexta");
ok((await entrar(sabado, "Ana Lima", "+55 (41) 91111-0001")).ok, "Ana entra na fila do sabado");
await como("dono", null, async () => {
  await db.exec(`alter table reservas disable trigger reservas_validar_data_trg`);
  await db.exec(`insert into reservas (dia, data_reserva, horario, mesa_numero, pessoas, nome, telefone, aniversario) values ('sexta', '2024-01-05', '19:30', '03', 4, 'Ana Lima', '41 91111-0001', '12/03'), ('sexta', '2024-01-05', '19:30', '04', 2, 'Velho Cliente', '41933330003', null), ('sexta', current_date - 40, '19:30', '05', 2, 'Recente', '41944440004', null)`);
  await db.exec(`alter table reservas enable trigger reservas_validar_data_trg`);
});
r = await como("authenticated", ADMIN, () => tentar(`select apagar_dados_do_cliente('(41) 91111-0001') x`));
ok(r.ok && r.rows[0].x.reservas === 2 && r.rows[0].x.canceladas === 1 && r.rows[0].x.fila === 1, `apaga: 2 reservas, 1 futura cancelada, 1 da fila (${JSON.stringify(r.ok ? r.rows[0].x : r.msg)})`);
const ana = await q(`select nome, telefone, email, aniversario, observacao, cancelada, dados_removidos_em, mesa_numero, pessoas from reservas where mesa_numero in ('01','03') order by mesa_numero`);
ok(ana.every((x) => x.nome === "Dados removidos" && x.telefone === "" && !x.email && !x.aniversario && !x.observacao && x.dados_removidos_em), "nas reservas da Ana: sem nome, telefone, e-mail, aniversario e observacao");
ok(ana[0].cancelada === true && ana[0].pessoas === 2, "a reserva futura dela foi cancelada; mesa e pessoas ficam para o Movimento");
ok((await q(`select count(*)::int n from reservas where nome = 'Beto Souza' and not cancelada`))[0].n === 1, "a reserva do Beto continua intacta");
ok((await q(`select count(*)::int n from fila_espera where chave_telefone(telefone) = '41911110001'`))[0].n === 0, "Ana nao esta mais na fila");
ok((await reservarSite(sexta, "01", "Carla", "41955550005")).ok, "a mesa da reserva cancelada fica livre para outra pessoa");
r = await como("authenticated", ADMIN, () => tentar(`select apagar_dados_do_cliente('123')`));
ok(!r.ok && /telefone/.test(r.msg), "telefone incompleto: recusa (nao apaga tudo por engano)");

console.log("\n--- limpeza automatica ---");
await db.exec(`alter table fila_espera disable trigger fila_validar_dia_trg; insert into fila_espera (data_reserva, horario, pessoas, nome, telefone) values (current_date - 31, '19:30', 2, 'Fila Velha', '41966660006'), (current_date - 5, '19:30', 2, 'Fila Recente', '41977770007'); alter table fila_espera enable trigger fila_validar_dia_trg;`); // preparo direto no banco: a data pode cair num dia fechado
await db.exec(`insert into pedidos_titular (tipo, nome, telefone, criado_em) values ('exclusao', 'Pedido Antigo', '41988880008', now() - interval '6 years')`);
r = await como("dono", null, () => tentar(`select anonimizar_dados_antigos() x`));
ok(r.ok && r.rows[0].x.reservas === 1 && r.rows[0].x.fila === 1 && r.rows[0].x.pedidos === 1, `limpeza: 1 reserva de mais de 24 meses, 1 fila velha, 1 pedido de 6 anos (${JSON.stringify(r.ok ? r.rows[0].x : r.msg)})`);
ok((await q(`select nome from reservas where mesa_numero = '04'`))[0].nome === "Dados removidos", "reserva de 2024 ficou sem dados pessoais");
ok((await q(`select nome from reservas where mesa_numero = '05'`))[0].nome === "Recente", "reserva de 40 dias atras continua");
ok((await q(`select count(*)::int n from fila_espera where nome = 'Fila Recente'`))[0].n === 1, "fila de 5 dias atras continua");
r = await como("dono", null, () => tentar(`select anonimizar_dados_antigos() x`));
ok(r.ok && r.rows[0].x.reservas === 0, "rodar de novo nao mexe em nada");
console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
