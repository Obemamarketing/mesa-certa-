// Login do painel e fechamento do banco, testados num Postgres local (pglite).
// Imita o Supabase no que importa: os papéis anon / authenticated /
// service_role, os "default privileges" (toda tabela e função nova nasce
// liberada pros três), auth.users e auth.uid(). As migrações rodam como um
// dono SEM superusuário, igual ao papel "postgres" do Supabase.
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
  try { return { ok: true, rows: params ? (await db.query(sql, params)).rows : (await db.exec(sql)).at(-1)?.rows ?? [] }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}
// roda como um papel do navegador; uid = usuário logado (ou nada)
async function como(papel, uid, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ""}'; set role ${papel};`);
  try { return await fn(); }
  finally { await db.exec(`reset role; set request.jwt.claim.sub = '';`); }
}
const dono = (fn) => como("dono", null, fn);

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

// ---------------------------------------------------------------- instalação
await dono(async () => {
  await db.exec(lerSql("supabase-schema.sql"));
  // uma reserva antiga, de antes de tudo (sem data, de uma sexta que já passou)
  await db.exec(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,criada_em) values ('sexta','19:30','01',2,'Antiga Reserva','41999990001','2026-09-01 15:00-03')`);
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
  await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO));
});
ok(true, "supabase-schema.sql + supabase-completo.sql (com o login) rodam, o completo duas vezes, como dono sem superusuario");

const hoje = (await q(`select (now() at time zone 'America/Sao_Paulo')::date::text d`))[0].d;
const prox = async (dow, semanas = 0) => (await q(`select (h + (case when ((${dow} - extract(dow from h)::int + 7) % 7) = 0 then 7 else ((${dow} - extract(dow from h)::int + 7) % 7) end) + ${7 * semanas})::text d from (select (now() at time zone 'America/Sao_Paulo')::date h) x`))[0].d;
const sexta = await prox(5, 0), sabado = await prox(6, 0), domingo = await prox(0, 1), sexta3 = await prox(5, 2);
let diaUtil = null;
for (let i = 1; i <= 7 && !diaUtil; i++) { const r = (await q(`select ((now() at time zone 'America/Sao_Paulo')::date + ${i})::text d, extract(dow from (now() at time zone 'America/Sao_Paulo')::date + ${i})::int w`))[0]; if (![5, 6, 0].includes(r.w)) diaUtil = r.d; }
console.log(`\nhoje no banco: ${hoje} · sexta ${sexta} · sabado ${sabado} · domingo ${domingo}`);

const reservar = (data, mesas, nome, telefone, extra = {}) =>
  tentar(`select * from reservar($1::date, $2, $3::jsonb, $4, $5, $6, $7, $8)`, [data, extra.horario ?? "19:30", JSON.stringify(mesas), nome, telefone, extra.email ?? null, extra.aniversario ?? null, extra.observacao ?? null]);

// ============================================================ PARTE 1 (aberto)
console.log("\n=== PARTE 1 rodada, NADA fechado: o site ANTIGO tem que continuar igual ===");
await como("anon", null, async () => {
  ok((await q(`select acesso_fechado() f`))[0].f === false, "acesso_fechado() = false");
  ok((await tentar(`select * from reservas`)).ok, "anon ainda le reservas direto (site antigo)");
  let r = await tentar(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','02',2,'Site Antigo','41999990002','${sexta}') returning id`);
  ok(r.ok, "anon ainda cria reserva direto na tabela (site antigo)");
  ok((await tentar(`update reservas set cancelada = true where nome = 'Site Antigo'`)).ok, "anon ainda cancela direto (site antigo)");
  ok((await tentar(`update mesas set pos_x = pos_x where numero = '01'`)).ok, "anon ainda edita a planta (painel antigo, sem login)");
  ok((await tentar(`insert into dias_fechados (data, motivo) values ('${sexta3}', 'teste')`)).ok, "anon ainda fecha um dia (painel antigo)");
  ok((await tentar(`delete from dias_fechados where data = '${sexta3}'`)).ok, "anon ainda reabre o dia (painel antigo)");
  ok((await tentar(`select * from config_lembretes`)).ok, "anon ainda le a config dos lembretes (painel antigo)");
  const id = (await q(`select id from mesas where numero = '20'`))[0].id;
  ok((await tentar(`select renomear_mesa('${id}', '21')`)).ok && (await tentar(`select renomear_mesa('${id}', '20')`)).ok, "anon ainda renomeia mesa (painel antigo)");

  r = await tentar(`select * from administradores`);
  ok(!r.ok && r.code === "42501", "anon NAO le a tabela de administradores");
  r = await tentar(`select * from acesso_publico`);
  ok(!r.ok && r.code === "42501", "anon NAO le o marcador de fechamento");
  for (const f of ["fechar_acesso_publico()", "reabrir_acesso_publico()", "aplicar_fechamento()"]) {
    r = await tentar(`select ${f}`);
    ok(!r.ok && r.code === "42501", `anon NAO consegue chamar ${f}`);
  }
  ok((await q(`select eh_admin() a`))[0].a === false, "eh_admin() para visitante = false");
});
let r = await dono(() => tentar(`select fechar_acesso_publico()`));
ok(!r.ok && /Cadastre ao menos um administrador/.test(r.msg), "fechar sem nenhum administrador cadastrado: recusado");
ok((await q(`select acesso_fechado() f`))[0].f === false, "e continua aberto depois da recusa");

// ================================================================== funções
console.log("\n=== funcoes do site do cliente (como visitante) ===");
await como("anon", null, async () => {
  r = await reservar(sexta, [{ numero: "03", pessoas: 4 }], "  José da Silva  ", "(41) 99999-1234", { email: " jose@exemplo.com ", aniversario: "12/03", observacao: "x".repeat(250) });
  ok(r.ok && r.rows.length === 1, "reservar: uma mesa");
  const l = r.rows?.[0] ?? {};
  ok(l.nome === "José da Silva" && l.telefone === "(41) 99999-1234" && l.email === "jose@exemplo.com" && l.dia === "sexta" && String(l.aniversario) === "12/03" && l.observacao.length === 200,
    "  nome/telefone/e-mail aparados, dia tirado da data, observacao cortada em 200");

  r = await reservar(sabado, [{ numero: "05", pessoas: 6 }, { numero: "06", pessoas: 1 }], "JOSÉ Souza", "41988887777");
  ok(r.ok && r.rows.length === 2 && r.rows[0].mesa_numero === "05" && r.rows[1].mesa_numero === "06" && r.rows.every((x) => x.dia === "sabado"), "reservar: grupo em duas mesas vira duas reservas");

  // grupo em que UMA das mesas já está tomada: nada pode ser gravado
  r = await reservar(sabado, [{ numero: "07", pessoas: 4 }, { numero: "05", pessoas: 2 }], "Grupo Azarado", "41977776666");
  ok(!r.ok && r.code === "23505", "reservar: grupo com uma mesa ja tomada -> recusado (23505)");
});
ok((await q(`select count(*)::int n from reservas where nome = 'Grupo Azarado'`))[0].n === 0, "  e NENHUMA mesa do grupo ficou gravada (tudo ou nada)");

await como("anon", null, async () => {
  const casos = [
    ["nome de 1 letra", () => reservar(sexta, [{ numero: "08", pessoas: 2 }], "A", "41999990000"), /DADOS_INVALIDOS: nome/],
    ["telefone curto", () => reservar(sexta, [{ numero: "08", pessoas: 2 }], "Ana Lima", "1234"), /DADOS_INVALIDOS: telefone/],
    ["e-mail torto", () => reservar(sexta, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000", { email: "ana@" }), /DADOS_INVALIDOS: email/],
    ["sem mesas", () => reservar(sexta, [], "Ana Lima", "41999990000"), /DADOS_INVALIDOS: mesas/],
    ["mesa que nao existe", () => reservar(sexta, [{ numero: "99", pessoas: 2 }], "Ana Lima", "41999990000"), /DADOS_INVALIDOS: a mesa 99 nao existe/],
    ["mais gente que a mesa comporta", () => reservar(sexta, [{ numero: "17", pessoas: 3 }], "Ana Lima", "41999990000"), /nao comporta/],
    ["zero pessoas", () => reservar(sexta, [{ numero: "08", pessoas: 0 }], "Ana Lima", "41999990000"), /nao comporta/],
    ["pessoas que nao e numero", () => reservar(sexta, [{ numero: "08", pessoas: "2; drop" }], "Ana Lima", "41999990000"), /DADOS_INVALIDOS: pessoas/],
    ["horario torto", () => reservar(sexta, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000", { horario: "7 da noite" }), /DADOS_INVALIDOS: horario/],
    [`dia sem funcionamento (${diaUtil})`, () => reservar(diaUtil, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000"), /DATA_FORA_DA_AGENDA/],
    [`hoje (${hoje})`, () => reservar(hoje, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000"), /DATA_FORA_DA_AGENDA/],
    ["aniversario 31/04", () => reservar(sexta, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000", { aniversario: "31/04" }), /reservas_aniversario_valido/],
  ];
  for (const [nome, fn, padrao] of casos) {
    const x = await fn();
    ok(!x.ok && padrao.test(x.msg), `reservar recusa: ${nome}`);
  }
});
await dono(() => db.exec(`insert into dias_fechados (data, motivo) values ('${domingo}', 'Evento')`));
await como("anon", null, async () => {
  r = await reservar(domingo, [{ numero: "08", pessoas: 2 }], "Ana Lima", "41999990000");
  ok(!r.ok && /RESTAURANTE_FECHADO/.test(r.msg), "reservar recusa dia fechado no calendario (RESTAURANTE_FECHADO)");
});
ok((await q(`select count(*)::int n from reservas where nome = 'Ana Lima'`))[0].n === 0, "  nenhuma das tentativas recusadas deixou linha no banco");
ok((await q(`select count(*)::int n from lembretes_whatsapp l join reservas r on r.id = l.reserva_id where r.nome = 'José da Silva'`))[0].n === 1, "o lembrete de WhatsApp continua sendo agendado para reserva feita pela funcao");

// reservas para a consulta: uma velha (60 dias atrás), uma cancelada
await db.exec(`
  alter table reservas disable trigger reservas_validar_data_trg;
  insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','09',2,'José Velho','41999995555', (now() at time zone 'America/Sao_Paulo')::date - 60);
  insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','10',2,'José Recente','41999994444', (now() at time zone 'America/Sao_Paulo')::date - 10);
  insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva,cancelada) values ('sexta','19:30','11',2,'Jose Cancelado','41999993333','${sexta}', true);
  alter table reservas enable trigger reservas_validar_data_trg;
`);

await como("anon", null, async () => {
  const oc = (await q(`select mesas_ocupadas() o`))[0].o;
  ok(Array.isArray(oc) && oc.some((x) => x.data === sexta && x.mesa === "03" && x.horario === "19:30" && x.chegou === false), "mesas_ocupadas: traz a mesa 03 da sexta");
  ok(!oc.some((x) => x.mesa === "11") && !oc.some((x) => x.mesa === "02"), "mesas_ocupadas: reserva cancelada nao ocupa mesa");
  ok(!oc.some((x) => x.data < hoje), "mesas_ocupadas: nada de data passada");
  ok(oc.every((x) => Object.keys(x).sort().join() === "chegou,data,horario,mesa"), "mesas_ocupadas: so data, horario, mesa e chegou — nenhum nome, nenhum telefone");

});

// a consulta não devolve o nome: pra conferir QUEM ela achou, o teste olha o
// banco por dentro, pelo id
const consultar = (termo) => como("anon", null, () => q(`select * from consultar_reservas($1)`, [termo]));
const nomes = async (termo) => {
  const ids = (await consultar(termo)).map((x) => x.id);
  return ids.length ? (await q(`select nome from reservas where id = any($1::uuid[]) order by nome`, [ids])).map((x) => x.nome) : [];
};
{
  // desde a parte 14: nome E sobrenome, palavra inteira
  ok((await consultar("jose")).length === 0, "consultar so 'jose' (sem sobrenome): nada");
  ok((await nomes("jose recente")).join() === "José Recente" && (await nomes("jose velho")).length === 0, "consultar 'jose recente' acha; 'jose velho' (60 dias atras) fica de fora");
  const c = await consultar("jose cancelado");
  ok(Object.keys(c[0]).sort().join() === "cancelada,chegou,criada_em,data_reserva,dia,horario,id,mesa_numero,pessoas", "consultar: so data, horario, mesa, pessoas e situacao — SEM nome, telefone, e-mail, aniversario e observacao");
  const idCancelado = (await q(`select id from reservas where nome = 'Jose Cancelado'`))[0].id;
  ok(c.find((x) => x.id === idCancelado)?.cancelada === true, "consultar: a cancelada aparece como cancelada");
  ok((await nomes("silva jose")).join() === "José da Silva", "consultar 'silva jose': palavras em qualquer ordem");
  ok((await nomes("JOSÉ SOUZA")).join() === "JOSÉ Souza,JOSÉ Souza", "consultar 'JOSÉ SOUZA' (maiusculas com acento): acha as duas mesas do grupo");
  ok((await nomes("jo")).length === 0 && (await nomes("  ")).length === 0 && (await nomes("jo si")).length === 0, "consultar com pedacos de palavra: nada");
  ok((await nomes("%")).length === 0 && (await nomes("___")).length === 0, "consultar com curingas (% e _): nada — nao vira 'traga tudo'");
}

console.log("\n=== cancelar pela tela de consulta (4 ultimos digitos do telefone) ===");
const idDe = async (nome, mesa) => (await q(`select id from reservas where nome = $1 and mesa_numero = $2`, [nome, mesa]))[0].id;
const idJose = await idDe("José da Silva", "03");
const cancelar = (id, final) => como("anon", null, async () => (await q(`select cancelar_minha_reserva($1::uuid, $2) r`, [id, final]))[0].r);
ok((await cancelar(idJose, "0000")) === "telefone", "digitos errados -> 'telefone'");
ok((await cancelar(idJose, "123")) === "telefone", "so 3 digitos -> 'telefone'");
ok((await q(`select tentativas_cancelamento t, cancelada c from reservas where id = $1`, [idJose]))[0].t === 2, "  as duas tentativas erradas ficaram contadas e a reserva continua de pe");
ok((await cancelar(idJose, "12-34")) === "ok", "digitos certos (com tracinho no meio) -> 'ok'");
ok((await q(`select cancelada c from reservas where id = $1`, [idJose]))[0].c === true, "  reserva cancelada no banco");
ok((await q(`select status from lembretes_whatsapp where reserva_id = $1`, [idJose]))[0].status === "cancelado", "  e o lembrete dela foi cancelado junto");
ok((await cancelar(idJose, "1234")) === "ja_cancelada", "cancelar de novo -> 'ja_cancelada'");
ok((await cancelar("00000000-0000-0000-0000-000000000000", "1234")) === "nao_encontrada", "id que nao existe -> 'nao_encontrada'");
const idSouza = await idDe("JOSÉ Souza", "05");
const respostas = [];
for (let i = 0; i < 5; i++) respostas.push(await cancelar(idSouza, "1111"));
ok(respostas.join() === "telefone,telefone,telefone,telefone,bloqueada", `5 erros seguidos: ${respostas.join(", ")}`);
ok((await cancelar(idSouza, "7777")) === "bloqueada", "depois de travar, nem os digitos certos cancelam por ali");
ok((await q(`select cancelada c from reservas where id = $1`, [idSouza]))[0].c === false, "  a reserva travada continua de pe (o restaurante cancela pelo painel)");
const idSouza2 = await idDe("JOSÉ Souza", "06");
await db.exec(`update reservas set checkin_em = now() where id = '${idSouza2}'`);
ok((await cancelar(idSouza2, "7777")) === "encerrada", "reserva com chegada registrada -> 'encerrada'");
ok((await cancelar(await idDe("José Recente", "10"), "4444")) === "encerrada", "reserva de data passada -> 'encerrada'");
await como("anon", null, async () => {
  const oc = (await q(`select mesas_ocupadas() o`))[0].o;
  ok(oc.find((x) => x.mesa === "06" && x.data === sabado)?.chegou === true, "mesas_ocupadas: mesa com chegada registrada vem com chegou = true");
  ok(!oc.some((x) => x.mesa === "03" && x.data === sexta), "mesas_ocupadas: a mesa 03, cancelada pelo cliente, ficou livre");
});

// ============================================================ administradores
console.log("\n=== administradores ===");
await db.exec(`insert into auth.users (email) values ('Dono@ZePelin.com'), ('suporte@mesacerta.com'), ('curioso@gmail.com')`);
const uid = async (email) => (await q(`select id from auth.users where lower(email) = lower($1)`, [email]))[0].id;
const A = await uid("dono@zepelin.com"), S = await uid("suporte@mesacerta.com"), B = await uid("curioso@gmail.com");
const sqlAdmins = lerSql("supabase-administradores.sql");
await dono(() => db.exec(sqlAdmins));
ok((await q(`select count(*)::int n from administradores`))[0].n === 0, "supabase-administradores.sql com os e-mails de exemplo: nao cadastra ninguem e nao da erro");
r = await dono(() => tentar(`select fechar_acesso_publico()`));
ok(!r.ok, "  e fechar continua recusado");
const sqlAdminsPreenchido = sqlAdmins.replace("TROQUE-AQUI@exemplo.com", "dono@zepelin.com").replace("TROQUE-AQUI-2@exemplo.com", "SUPORTE@mesacerta.com");
await dono(() => db.exec(sqlAdminsPreenchido));
await dono(() => db.exec(sqlAdminsPreenchido));
const admins = await q(`select a.nome, u.email from administradores a join auth.users u on u.id = a.user_id order by a.nome`);
ok(admins.length === 2 && admins[0].email === "Dono@ZePelin.com", `e-mails preenchidos (maiusculas diferentes, rodado 2x): ${admins.map((a) => `${a.nome} <${a.email}>`).join(" · ")}`);
ok((await como("authenticated", A, () => q(`select eh_admin() a`)))[0].a === true, "eh_admin() para o dono logado = true");
ok((await como("authenticated", B, () => q(`select eh_admin() a`)))[0].a === false, "eh_admin() para conta que nao esta na lista = false");
ok((await como("anon", null, () => q(`select eh_admin() a`)))[0].a === false, "eh_admin() para visitante = false");
r = await como("authenticated", A, () => tentar(`select * from administradores`));
ok(!r.ok && r.code === "42501", "nem o administrador le a tabela de administradores pela API");
r = await como("authenticated", A, () => tentar(`select fechar_acesso_publico()`));
ok(!r.ok && r.code === "42501", "nem o administrador fecha/reabre pela API (so pelo SQL Editor)");

// ================================================================== PARTE 2
console.log("\n=== PARTE 2: supabase-fechar-acesso.sql ===");
const totalReservas = (await q(`select count(*)::int n from reservas`))[0].n;
r = await dono(() => tentar(lerSql("supabase-fechar-acesso.sql")));
ok(r.ok, "supabase-fechar-acesso.sql roda" + (r.ok ? "" : ` — ${r.msg}`));
const regras = (await q(`select tablename t, policyname p from pg_policies where schemaname = 'public' order by 1, 2`)).map((x) => `${x.t}.${x.p}`);
ok(regras.join() === "config_lembretes.config_lembretes_admin,dias_fechados.dias_fechados_admin,dias_fechados.dias_fechados_select,fila_espera.fila_espera_admin,lembretes_whatsapp.lembretes_admin,mesas.mesas_admin,mesas.mesas_select,pedidos_titular.pedidos_titular_admin,reservas.reservas_admin",
  `regras que sobraram: ${regras.join(" · ")}`);

async function conferirFechado(rotulo) {
  const antes = (await q(`select count(*)::int total, count(*) filter (where cancelada)::int canceladas from reservas`))[0];
  console.log(`\n--- ${rotulo}: visitante (chave publica) ---`);
  await como("anon", null, async () => {
    ok((await q(`select acesso_fechado() f`))[0].f === true, "acesso_fechado() = true");
    for (const [oque, sql] of [
      ["ler reservas", `select * from reservas`],
      ["criar reserva direto na tabela", `insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','12',2,'Invasor','41999990000','${sexta}')`],
      ["alterar/cancelar reserva direto", `update reservas set cancelada = true`],
      ["apagar reserva", `delete from reservas`],
      ["mexer na planta", `update mesas set capacidade = 99`],
      ["fechar um dia", `insert into dias_fechados (data) values ('${sexta3}')`],
      ["reabrir um dia", `delete from dias_fechados`],
      ["ler a config dos lembretes", `select * from config_lembretes`],
      ["desligar os lembretes", `update config_lembretes set ativo = false`],
      ["ler a fila de lembretes", `select * from lembretes_whatsapp`],
      ["renomear mesa", `select renomear_mesa((select id from mesas limit 1), '77')`],
      ["ler administradores", `select * from administradores`],
      ["reabrir o acesso", `select reabrir_acesso_publico()`],
    ]) {
      const x = await tentar(sql);
      ok(!x.ok && x.code === "42501", `visitante NAO consegue ${oque}`);
    }
    ok((await q(`select count(*)::int n from mesas`))[0].n === 20, "visitante ainda le a planta (20 mesas) — o site precisa");
    ok((await q(`select count(*)::int n from dias_fechados`))[0].n === 1, "visitante ainda le os dias fechados — o site precisa");
    ok(Array.isArray((await q(`select mesas_ocupadas() o`))[0].o), "visitante ainda ve as mesas ocupadas (sem nomes)");
    ok((await q(`select * from consultar_reservas('jose recente')`)).length > 0, "visitante ainda consulta pelo nome");
  });

  console.log(`--- ${rotulo}: conta logada que NAO e administradora ---`);
  await como("authenticated", B, async () => {
    ok((await q(`select count(*)::int n from reservas`))[0].n === 0, "nao enxerga nenhuma reserva");
    let x = await tentar(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone,data_reserva) values ('sexta','19:30','12',2,'Invasor','41999990000','${sexta}')`);
    ok(!x.ok && x.code === "42501", "nao cria reserva direto na tabela");
    x = await tentar(`update reservas set cancelada = true returning id`);
    ok(x.ok && x.rows.length === 0, "tentar cancelar tudo nao altera nenhuma linha");
    x = await tentar(`update mesas set capacidade = 99 returning id`);
    ok(x.ok && x.rows.length === 0, "nao altera a planta");
    x = await tentar(`insert into dias_fechados (data) values ('${sexta3}')`);
    ok(!x.ok && x.code === "42501", "nao fecha dia");
    x = await tentar(`delete from dias_fechados returning data`);
    ok(x.ok && x.rows.length === 0, "nao reabre dia");
    ok((await q(`select count(*)::int n from config_lembretes`))[0].n === 0 && (await q(`select count(*)::int n from lembretes_whatsapp`))[0].n === 0, "nao le lembretes");
    x = await tentar(`select renomear_mesa((select id from mesas where numero = '20'), '77')`);
    ok(!x.ok && /Sem permissao/.test(x.msg), "nao renomeia mesa");
  });
  ok((await q(`select count(*)::int n from reservas where cancelada`))[0].n === antes.canceladas && (await q(`select max(capacidade)::int c from mesas`))[0].c === 6, "  (conferido por dentro: nada foi alterado)");

  console.log(`--- ${rotulo}: administrador logado ---`);
  await como("authenticated", A, async () => {
    ok((await q(`select count(*)::int n from reservas where telefone is not null`))[0].n === antes.total, `enxerga todas as ${antes.total} reservas, com nome e telefone`);
    const alvo = (await q(`select id from reservas where nome = 'José Recente'`))[0].id;
    let x = await tentar(`update reservas set checkin_em = now() where id = '${alvo}' returning id`);
    ok(x.ok && x.rows.length === 1, "marca chegada (check-in)");
    x = await tentar(`update reservas set checkin_em = null where id = '${alvo}' returning id`);
    ok(x.ok && x.rows.length === 1, "desfaz a chegada");
    x = await tentar(`update mesas set pos_x = 50 where numero = '01' returning id`);
    ok(x.ok && x.rows.length === 1, "edita a planta");
    ok((await tentar(`insert into dias_fechados (data, motivo) values ('${sexta3}', 'Folga') on conflict (data) do update set motivo = excluded.motivo`)).ok, "fecha um dia (upsert, como o painel faz)");
    x = await tentar(`delete from dias_fechados where data = '${sexta3}' returning data`);
    ok(x.ok && x.rows.length === 1, "reabre o dia");
    ok((await q(`select count(*)::int n from config_lembretes`))[0].n === 1, "le a config dos lembretes");
    x = await tentar(`update config_lembretes set antecedencia_minutos = antecedencia_minutos where id = 1 returning id`);
    ok(x.ok && x.rows.length === 1, "salva a config dos lembretes");
    ok((await q(`select count(*)::int n from lembretes_whatsapp l join reservas r on r.id = l.reserva_id`))[0].n > 0, "le a fila de lembretes com o nome da reserva");
    const id = (await q(`select id from mesas where numero = '20'`))[0].id;
    ok((await tentar(`select renomear_mesa('${id}', '21')`)).ok && (await tentar(`select renomear_mesa('${id}', '20')`)).ok, "renomeia mesa");
  });
}
await conferirFechado("fechado");

console.log("\n--- fechado: o site do cliente continua reservando e cancelando ---");
await como("anon", null, async () => {
  r = await reservar(sexta, [{ numero: "13", pessoas: 4 }, { numero: "14", pessoas: 3 }], "Carla Mendes", "41 98888-4321");
  ok(r.ok && r.rows.length === 2, "visitante reserva (grupo de duas mesas) pela funcao");
});
ok((await cancelar(await idDe("Carla Mendes", "14"), "4321")) === "ok", "visitante cancela a propria reserva com o final do telefone");
await como("authenticated", A, async () => {
  r = await reservar(sabado, [{ numero: "15", pessoas: 2 }], "Reserva do Painel", "41977771111");
  ok(r.ok && r.rows.length === 1, "administrador logado tambem reserva pela funcao (Nova reserva do painel)");
  const x = await tentar(`update reservas set cancelada = true where nome = 'Reserva do Painel' returning id`);
  ok(x.ok && x.rows.length === 1, "e cancela pelo painel, sem telefone");
});
await como("service_role", null, async () => {
  ok((await q(`select count(*)::int n from reservas`))[0].n > 0 && (await tentar(`select * from reivindicar_lembretes(5)`)).ok, "o servidor (service_role, envio de lembretes) continua lendo tudo");
});

// ================================================== rodar de novo não reabre
console.log("\n=== rodar o supabase-completo.sql (e o schema) DE NOVO nao pode reabrir ===");
await dono(async () => { await db.exec((lerSql("supabase-completo.sql") + MODO_ANTIGO)); await db.exec(lerSql("supabase-schema.sql")); });
ok(true, "completo e schema rodaram de novo sem erro");
const regras2 = (await q(`select tablename t, policyname p from pg_policies where schemaname = 'public' order by 1, 2`)).map((x) => `${x.t}.${x.p}`);
ok(regras2.join() === regras.join(), "as mesmas regras de antes — nenhuma regra aberta voltou");
await db.exec(`update reservas set cancelada = true where nome = 'Carla Mendes' and mesa_numero = '13'`);
await conferirFechado("depois de rodar tudo de novo");

// ================================================================ emergência
console.log("\n=== volta atras de emergencia e fechar de novo ===");
r = await dono(() => tentar(`select reabrir_acesso_publico()`));
ok(r.ok, "reabrir_acesso_publico() roda pelo SQL Editor");
await como("anon", null, async () => {
  ok((await q(`select acesso_fechado() f`))[0].f === false && (await tentar(`select * from reservas`)).ok && (await tentar(`update mesas set pos_x = pos_x`)).ok, "reaberto: o banco voltou a aceitar o que aceitava antes");
});
r = await dono(() => tentar(lerSql("supabase-fechar-acesso.sql")));
ok(r.ok, "fechar de novo roda");
r = await como("anon", null, () => tentar(`select * from reservas`));
ok(!r.ok && r.code === "42501", "e esta fechado outra vez");

console.log("\n=== tirar o acesso de alguem ===");
await dono(() => db.exec(`delete from administradores where user_id = '${S}'`));
ok((await como("authenticated", S, () => q(`select count(*)::int n from reservas`)))[0].n === 0, "quem saiu da lista de administradores para de enxergar as reservas na hora");
ok((await como("authenticated", A, () => q(`select count(*)::int n from reservas`)))[0].n > 0, "o outro administrador continua enxergando");
await db.exec(`delete from auth.users where id = '${A}'`);
ok((await q(`select count(*)::int n from administradores`))[0].n === 0, "apagar o usuario no Supabase tira ele da lista sozinho (cascade)");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> login e fechamento do banco validados");
