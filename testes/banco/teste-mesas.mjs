import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const proj = fileURLToPath(new URL("../../", import.meta.url));
const sql = fs.readFileSync(proj + "supabase-migration-mesas.sql", "utf8");
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) process.exitCode = 1; };

const baseReservas = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create table reservas (
  id uuid primary key default gen_random_uuid(),
  dia text not null check (dia in ('sexta','sabado','domingo')),
  horario text not null, mesa_numero text not null, pessoas integer not null,
  nome text not null, telefone text not null, email text, observacao text,
  criada_em timestamptz not null default now(), cancelada boolean not null default false,
  checkin_em timestamptz
);
create unique index reservas_slot_unico on reservas (dia, horario, mesa_numero) where not cancelada;
`;

// =====================================================================
// A) instalação nova
// =====================================================================
console.log("--- A) instalacao nova ---");
{
  const db = new PGlite();
  await db.exec(baseReservas);
  await db.exec(sql);
  await db.exec(sql);
  ok(true, "migracao roda duas vezes sem erro");
  const q = async (s, p) => (await db.query(s, p)).rows;

  let [r] = await q(`select count(*)::int n from mesas`);
  ok(r.n === 20, `seed criou as 20 mesas da planta oficial (${r.n})`);

  const porZona = Object.fromEntries((await q(`select zona, count(*)::int n from mesas group by zona`)).map((x) => [x.zona, x.n]));
  ok(porZona["Salão principal"] === 10 && porZona["Salão anexo"] === 6 && porZona["Palco"] === 1 && porZona["Área externa"] === 3,
     `areas certas: principal 10, anexo 6, palco 1, externa 3 (${JSON.stringify(porZona)})`);

  [r] = await q(`select count(*)::int n from mesas where pos_x not between 0 and 100 or pos_y not between 0 and 100`);
  ok(r.n === 0, "todas as posicoes estao em porcentagem (0-100)");

  [r] = await q(`select zona from mesas where numero='01'`);
  ok(r.zona === "Salão principal", "mesa 01 agora e do Salao principal (antes era do Palco)");
  [r] = await q(`select zona from mesas where numero='18'`);
  ok(r.zona === "Área externa", "mesa 18 e da Area externa");

  // rodar de novo nao desfaz posicao calibrada
  await db.exec(`update mesas set pos_x = 50.5, pos_y = 40.25 where numero = '09'`);
  await db.exec(sql);
  [r] = await q(`select pos_x::float x, pos_y::float y from mesas where numero='09'`);
  ok(r.x === 50.5 && r.y === 40.25, "rodar a migracao de novo NAO desfaz o marcador calibrado");
  [r] = await q(`select count(*)::int n from mesas`);
  ok(r.n === 20, "e nao duplica mesas");

  // coordenada fora de 0-100 recusada
  let fora = false;
  try { await db.exec(`update mesas set pos_x = 640 where numero='05'`); } catch { fora = true; }
  ok(fora, "coordenada em pixels (>100) e recusada pelo banco");

  // area invalida recusada
  let zonaRuim = false;
  try { await db.exec(`insert into mesas (numero,capacidade,formato,zona,pos_x,pos_y) values ('99',4,'quadrada','Varanda',1,1)`); } catch { zonaRuim = true; }
  ok(zonaRuim, "area fora das 4 da planta e recusada");

  // renomear leva reservas
  await db.query(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','05',4,'Ana','4199')`);
  await db.query(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sabado','19:30','05',2,'Bia','4188')`);
  const id05 = (await q(`select id from mesas where numero='05'`))[0].id;
  await db.query(`select renomear_mesa($1, '55')`, [id05]);
  [r] = await q(`select count(*)::int n from reservas where mesa_numero='55'`);
  ok(r.n === 2, `as 2 reservas da mesa 05 foram para a 55 (${r.n})`);
  [r] = await q(`select count(*)::int n from reservas where mesa_numero='05'`);
  ok(r.n === 0, "nenhuma reserva ficou orfa");

  // recusa numero existente
  let negou = false;
  try { await db.query(`select renomear_mesa($1, '06')`, [id05]); } catch (e) { negou = /Já existe uma mesa/.test(e.message); }
  ok(negou, "recusa renomear para numero que ja existe");

  // recusa em branco
  negou = false;
  try { await db.query(`select renomear_mesa($1, '  ')`, [id05]); } catch (e) { negou = /em branco/.test(e.message); }
  ok(negou, "recusa numero em branco");

  // conflito de reservas
  const id06 = (await q(`select id from mesas where numero='06'`))[0].id;
  await db.query(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','06',2,'Caio','4177')`);
  await db.exec(`delete from mesas where numero='07'`); // libera o numero 07 pra provar o conflito de reserva, nao de mesa
  await db.query(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','07',2,'Duda','4166')`);
  negou = false;
  try { await db.query(`select renomear_mesa($1, '07')`, [id06]); } catch (e) { negou = /conflitantes/.test(e.message); }
  ok(negou, "recusa renomear quando as reservas colidiriam no mesmo dia/horario");

  // unique
  let dup = false;
  try { await db.exec(`insert into mesas (numero,capacidade,formato,zona,pos_x,pos_y) values ('08',4,'quadrada','Salão principal',1,1)`); } catch { dup = true; }
  ok(dup, "unique(numero) impede duas mesas com o mesmo numero");

  // carimbo
  await db.exec(`update mesas set pos_x = 12 where numero='11'`);
  [r] = await q(`select atualizada_em > criada_em as mudou from mesas where numero='11'`);
  ok(r.mudou === true, "salvar posicao carimba atualizada_em");
}

// =====================================================================
// B) instalação ANTIGA do protótipo (15 mesas, outra distribuição, pixels)
// =====================================================================
console.log("\n--- B) migrando instalacao antiga (15 mesas, coordenadas em pixels) ---");
{
  const db = new PGlite();
  await db.exec(baseReservas);
  const q = async (s, p) => (await db.query(s, p)).rows;

  // reproduz a tabela da versão anterior da migração
  await db.exec(`
    create table mesas (
      id uuid primary key default gen_random_uuid(),
      numero text not null unique,
      capacidade int not null check (capacidade between 1 and 20),
      formato text not null default 'redonda' check (formato in ('redonda','quadrada')),
      zona text not null check (zona in ('Palco','Salão principal','Salão anexo')),
      pos_x numeric not null, pos_y numeric not null,
      criada_em timestamptz not null default now(), atualizada_em timestamptz not null default now()
    );
    insert into mesas (numero,capacidade,formato,zona,pos_x,pos_y) values
      ('01',2,'redonda','Palco',585,520), ('02',2,'redonda','Palco',685,520),
      ('03',2,'redonda','Palco',585,620), ('04',2,'redonda','Palco',685,620),
      ('05',4,'redonda','Salão principal',370,128), ('06',4,'redonda','Salão principal',500,128),
      ('07',4,'redonda','Salão principal',370,262), ('08',4,'redonda','Salão principal',500,262),
      ('09',6,'redonda','Salão principal',650,258), ('10',6,'redonda','Salão principal',650,392),
      ('11',4,'redonda','Salão principal',420,392), ('12',4,'quadrada','Salão anexo',95,120),
      ('13',2,'quadrada','Salão anexo',205,120), ('14',2,'quadrada','Salão anexo',95,265),
      ('15',4,'quadrada','Salão anexo',205,265);
  `);
  await db.query(`insert into reservas (dia,horario,mesa_numero,pessoas,nome,telefone) values ('sexta','19:30','01',2,'Ana','4199')`);

  // a restrição antiga de pos (sem check) precisa aceitar a nova; o ALTER do script cuida da zona
  await db.exec(sql);

  let [r] = await q(`select count(*)::int n from mesas`);
  ok(r.n === 20, `instalacao antiga ficou com 20 mesas (${r.n})`);
  [r] = await q(`select count(*)::int n from mesas where pos_x > 100 or pos_y > 100`);
  ok(r.n === 0, "coordenadas antigas em pixels foram convertidas");
  [r] = await q(`select zona, capacidade, pos_x::float x from mesas where numero='01'`);
  ok(r.zona === "Salão principal" && r.capacidade === 4 && Math.abs(r.x - 42.33) < 0.01, "mesa 01 migrou do Palco para o Salao principal na posicao da planta");
  [r] = await q(`select mesa_numero from reservas`);
  ok(r.mesa_numero === "01", "a reserva existente continua apontando para a mesa 01");
  [r] = await q(`select zona from mesas where numero='17'`);
  ok(r.zona === "Palco", "mesa 17 (nova) esta no Palco");
}

console.log(process.exitCode ? "\n>>> TEM FALHA" : "\n>>> todos os cenarios passaram");
