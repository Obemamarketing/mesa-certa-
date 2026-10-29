// Teste de ponta a ponta das correções: data real da reserva, validação,
// campo de pessoas, cancelamento com erro e confirmação no painel.
// Roda contra o Supabase FALSO (mock-supabase2.cjs), nunca contra o banco real.
const puppeteer = require("puppeteer-core");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3001";
const MOCK = "http://127.0.0.1:54321";

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- datas (mesma regra do sistema, fuso de São Paulo) ----------
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const soma = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const proximaReserva = (w) => soma(hoje, ((w - dow(hoje) + 7) % 7) || 7); // próximo dia da semana, nunca hoje
const sextaQueVem = proximaReserva(6); // (o nome ficou: agora é o próximo SÁBADO, único dia aberto)
const sextaPassada = soma(sextaQueVem, -7);
// primeiro dia de funcionamento a partir de hoje (hoje incluído)
let S0 = hoje;
while (![6].includes(dow(S0))) S0 = soma(S0, 1);
const CHAVE = { 5: "sexta", 6: "sabado", 0: "domingo" };
const ROTULO = { sexta: "Sexta-feira", sabado: "Sábado", domingo: "Domingo" };

async function semear(lista) {
  await fetch(MOCK + "/__reset", { method: "POST" });
  await fetch(MOCK + "/__seed", { method: "POST", body: JSON.stringify(lista) });
}
const estadoMock = async () => (await (await fetch(MOCK + "/__log")).json());

async function visivel(page, seletor, filtro) {
  return page.evaluateHandle(
    (sel, f) => {
      const vis = (el) => !!(el.offsetParent || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
      return [...document.querySelectorAll(sel)].find((el) => vis(el) && (!f || el.innerText.includes(f) || (el.placeholder || "").includes(f))) || null;
    },
    seletor,
    filtro || "",
  );
}
async function clicarTexto(page, texto, seletor = "button, a") {
  const h = await visivel(page, seletor, texto);
  const el = h.asElement();
  if (!el) throw new Error(`nao achei "${texto}" visivel`);
  await el.click();
}
async function digitar(page, placeholder, texto) {
  const h = (await visivel(page, "input, textarea", placeholder)).asElement();
  if (!h) throw new Error(`nao achei campo "${placeholder}"`);
  await h.focus();
  await h.evaluate((e) => e.select());
  await page.keyboard.press("Backspace");
  if (texto) await h.type(texto);
}
const textoDaPagina = (page) => page.evaluate(() => document.body.innerText);
async function esperarTexto(page, texto, ms = 30000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, texto);
}

(async () => {
  console.log(`hoje(SP)=${hoje}  sextaQueVem=${sextaQueVem}  sextaPassada=${sextaPassada}  S0=${S0}`);

  await semear([
    // a reserva da sexta passada: ANTES travava a mesa 01 em todas as sextas
    { dia: "sabado", data_reserva: sextaPassada, horario: "12:00", mesa_numero: "01", pessoas: 2, nome: "Passada Silva", telefone: "41999990001" },
    { dia: "sabado", data_reserva: sextaQueVem, horario: "12:00", mesa_numero: "02", pessoas: 2, nome: "Futura Souza", telefone: "41999990002" },
    { dia: CHAVE[dow(S0)], data_reserva: S0, horario: "12:00", mesa_numero: "05", pessoas: 3, nome: "Hoje Pereira", telefone: "41999990003" },
    { dia: CHAVE[dow(S0)], data_reserva: soma(S0, 7), horario: "12:00", mesa_numero: "06", pessoas: 2, nome: "Proxima Lima", telefone: "41999990004" },
  ]);

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await require("./e2e-ajuda.cjs").logar(page); // o painel agora exige login
  const errosDoNavegador = [];
  page.on("pageerror", (e) => errosDoNavegador.push(String(e.message).slice(0, 200)));
  page.on("dialog", (d) => d.dismiss());

  // =====================================================================
  console.log("\n--- 1) cliente: a reserva da semana passada nao trava a mesa ---");
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await (await visivel(page, 'select[aria-label="Data"]')).asElement().select(sextaQueVem);
  await clicarTexto(page, "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  await clicarTexto(page, "Continuar");
  await page.waitForFunction(
    () => [...document.querySelectorAll("button[aria-pressed]")].some((b) => /\b01\b/.test(b.innerText) && b.offsetParent),
    { timeout: 60000 },
  );
  const cartoes = await page.evaluate(() =>
    [...document.querySelectorAll("button[data-mesa]")]
      .filter((b) => b.offsetParent)
      .map((b) => ({ n: (b.innerText.match(/\b(\d{2})\b/) || [])[1], desabilitado: b.disabled })),
  );
  const c = (n) => cartoes.find((x) => x.n === n);
  // (os marcadores da planta tambem sao botoes com aria-pressed: aqui valem so os cartoes da lista)
  ok(c("01") && !c("01").desabilitado, `mesa 01 livre na sexta ${curta(sextaQueVem)} (a reserva de ${curta(sextaPassada)} ficou no passado)`);
  ok(c("02") && c("02").desabilitado, "mesa 02 reservada para a sexta que vem continua indisponivel");

  // =====================================================================
  console.log("\n--- 2) validacao dos dados de contato ---");
  await (await visivel(page, "button[aria-pressed]", "01")).asElement().click();
  await clicarTexto(page, "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Maria Teste");
  await digitar(page, "(41) 99999-9999", "abc123");
  let t = await textoDaPagina(page);
  ok(/Confira o número/.test(t), "telefone invalido (abc123) mostra o aviso");
  let botao = (await visivel(page, "button", "Revisar reserva")).asElement();
  ok(await botao.evaluate((b) => b.disabled), "botao Revisar fica travado com telefone invalido");

  await digitar(page, "(41) 99999-9999", "(41) 99999-9999");
  t = await textoDaPagina(page);
  ok(!/e-mail/i.test(t), "o formulario nao pede e-mail (so o necessario)");
  botao = (await visivel(page, "button", "Revisar reserva")).asElement();
  const desab = await botao.evaluate((b) => b.disabled);
  if (desab) {
    const diag = await page.evaluate(() => ({
      campos: [...document.querySelectorAll("input,textarea")].filter((i) => i.offsetParent).map((i) => `${i.placeholder}=[${i.value}]`),
      avisos: [...document.querySelectorAll("[role=alert]")].filter((i) => i.offsetParent).map((i) => i.innerText),
    }));
    console.log("      diag:", JSON.stringify(diag));
  }
  ok(!desab, "telefone valido libera o botao");

  await botao.click();
  await esperarTexto(page, "Revise sua reserva");
  await clicarTexto(page, "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  t = await textoDaPagina(page);
  ok(t.includes(`Sábado, ${curta(sextaQueVem)}`), `confirmacao mostra a data real: Sábado, ${curta(sextaQueVem)}`);
  const m1 = await estadoMock();
  const nova = m1.reservas.find((r) => r.nome === "Maria Teste");
  ok(nova && nova.data_reserva === sextaQueVem && nova.mesa_numero === "01", `banco gravou a mesa 01 em ${sextaQueVem}`);

  // =====================================================================
  console.log("\n--- 3) 'Mais de 10 pessoas': da pra digitar 15 ---");
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 90000 });
  const sel = (await visivel(page, 'select[aria-label="Pessoas"]')).asElement();
  await sel.select("mais");
  const campo = (await visivel(page, 'input[aria-label^="Quantidade de pessoas"]')).asElement();
  const limpar = async () => { await campo.focus(); await campo.evaluate((e) => e.select()); await page.keyboard.press("Backspace"); };
  await limpar();
  await campo.type("15");
  ok((await campo.evaluate((i) => i.value)) === "15", "digitar 1 e depois 5 resulta em 15 (antes virava 115)");
  await limpar();
  await campo.type("99");
  await page.keyboard.press("Tab");
  ok((await campo.evaluate((i) => i.value)) === "60", "99 ao sair do campo vira o maximo (60)");
  await limpar();
  await campo.type("3");
  await page.keyboard.press("Tab");
  ok((await campo.evaluate((i) => i.value)) === "11", "3 ao sair do campo vira o minimo (11)");

  // =====================================================================
  console.log("\n--- 4) consulta: data real, passado encerrado, cancelar com erro ---");
  await page.goto(BASE + "/consulta", { waitUntil: "networkidle2", timeout: 90000 });
  await digitar(page, "Maria Souza", "Passada Silva");
  await clicarTexto(page, "Consultar reserva", "button");
  await page.waitForFunction(() => /reserva #/i.test(document.body.innerText), { timeout: 30000 });
  t = await textoDaPagina(page);
  ok(t.includes(`Sábado, ${curta(sextaPassada)}`), `reserva antiga aparece com a data dela (${curta(sextaPassada)}), nao com a da proxima sexta`);
  ok(/Encerrada/.test(t) && !/Cancelar reserva/.test(t), "reserva de data passada aparece como Encerrada, sem botao de cancelar");

  await digitar(page, "Maria Souza", "Futura Souza");
  await clicarTexto(page, "Consultar reserva", "button");
  await page.waitForFunction(() => document.body.innerText.includes("Futura") === false && document.body.innerText.includes("Confirmada"), { timeout: 20000 });
  t = await textoDaPagina(page);
  ok(t.includes(`Sábado, ${curta(sextaQueVem)}`) && /Confirmada/.test(t), "reserva futura aparece Confirmada na data certa");

  // o cliente cancela pela funcao do banco, informando o final do telefone (41999990002)
  await fetch(MOCK + "/__falhar-proximo-cancelamento");
  await clicarTexto(page, "Cancelar reserva", "button");
  await digitar(page, "0000", "0002");
  await clicarTexto(page, "Sim, cancelar", "button");
  await esperarTexto(page, "Não foi possível cancelar");
  const m2 = await estadoMock();
  ok(m2.reservas.find((r) => r.nome === "Futura Souza").cancelada === false, "cancelamento que falhou NAO diz que cancelou: a reserva segue ativa");
  await clicarTexto(page, "Sim, cancelar", "button");
  await page.waitForFunction(() => /Cancelada/.test(document.body.innerText), { timeout: 20000 });
  const m3 = await estadoMock();
  ok(m3.reservas.find((r) => r.nome === "Futura Souza").cancelada === true, "segunda tentativa cancela de verdade");

  // =====================================================================
  console.log("\n--- 5) painel: datas, lista do dia e confirmacao ao cancelar ---");
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/admin", { waitUntil: "networkidle2", timeout: 90000 });
  await esperarTexto(page, "Gerencie as reservas");
  const rotuloS0 = `${ROTULO[CHAVE[dow(S0)]]}, ${curta(S0)}`;
  await page.waitForFunction((r) => document.body.innerText.includes(r), { timeout: 30000 }, rotuloS0);
  ok(true, `cabecalho do painel mostra ${rotuloS0}`);
  await page.waitForFunction(() => document.body.innerText.includes("Hoje Pereira"), { timeout: 30000 });
  // só a seção "Reservas de ...": a de Clientes, mais embaixo, lista todo mundo
  const listaDoDia = () =>
    page.evaluate(() => [...document.querySelectorAll("section")].find((s) => /Reservas de/.test(s.innerText) && s.offsetParent)?.innerText || "");
  t = await listaDoDia();
  ok(t.includes("Hoje Pereira") && !t.includes("Proxima Lima"), "a lista do dia NAO traz a reserva do mesmo dia da semana na semana seguinte");
  ok(/funcionamento|Fechado hoje/.test(await textoDaPagina(page)), "cartao da barra lateral nao diz mais 'Restaurante aberto' o tempo todo");

  // lista de todas as datas
  const selFiltro = (await visivel(page, "select")).asElement();
  const sels = await page.$$("select");
  for (const s of sels) {
    const tem = await s.evaluate((x) => [...x.options].some((o) => o.value === "todos"));
    if (tem) await s.select("todos");
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll("section")].some((s) => /Reservas de todas as datas/.test(s.innerText) && s.innerText.includes("Proxima Lima")),
    { timeout: 20000 },
  );
  ok(true, "em 'Todas as datas' as reservas de outras semanas aparecem");
  for (const s of await page.$$("select")) {
    if (await s.evaluate((x) => [...x.options].some((o) => o.value === "dia"))) await s.select("dia");
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll("section")].some((s) => /Reservas de/.test(s.innerText) && !/Reservas de todas as datas/.test(s.innerText) && !s.innerText.includes("Proxima Lima")),
    { timeout: 20000 },
  );

  // detalhe + confirmacao
  await clicarTexto(page, "Hoje Pereira", "button");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && b.innerText.includes("Cancelar reserva")), { timeout: 20000 });
  await clicarTexto(page, "Cancelar reserva", "button");
  await esperarTexto(page, "Cancelar a reserva de Hoje Pereira?");
  const m4 = await estadoMock();
  ok(m4.reservas.find((r) => r.nome === "Hoje Pereira").cancelada === false, "primeiro clique so PERGUNTA: nada foi cancelado ainda");
  await clicarTexto(page, "Voltar", "button");
  await espera(300);
  const m5 = await estadoMock();
  ok(m5.reservas.find((r) => r.nome === "Hoje Pereira").cancelada === false, "Voltar mantem a reserva");
  await clicarTexto(page, "Cancelar reserva", "button");
  await clicarTexto(page, "Sim, cancelar", "button");
  await page.waitForFunction(() => !document.body.innerText.includes("Cancelar a reserva de"), { timeout: 20000 });
  await espera(500);
  const m6 = await estadoMock();
  ok(m6.reservas.find((r) => r.nome === "Hoje Pereira").cancelada === true, "'Sim, cancelar' cancela de verdade");

  // =====================================================================
  console.log("\n--- 6) modo operacao ---");
  await page.goto(BASE + "/admin/operacao", { waitUntil: "networkidle2", timeout: 90000 });
  await esperarTexto(page, "Modo operação");
  t = await textoDaPagina(page);
  ok(!/Proxima Lima/.test(t), "operacao nao mistura a semana seguinte na lista do dia");
  ok(/agora/i.test(t), "modo operacao abre sem erro");
  await page.screenshot({ path: __dirname + "/_operacao.png" });

  console.log("\n--- erros de JavaScript no navegador ---");
  const relevantes = errosDoNavegador.filter((e) => !/WebSocket|realtime/i.test(e));
  ok(relevantes.length === 0, `nenhum erro de pagina (${relevantes.length})${relevantes.length ? ": " + relevantes.join(" | ") : ""}`);

  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
