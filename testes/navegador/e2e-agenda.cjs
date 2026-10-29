// Teste de ponta a ponta das três mudanças: (1) reserva por data até dois meses à frente,
// com lista curta + calendário; (2) escolher a mesa clicando na planta; (3) aniversário.
// Roda contra o Supabase FALSO (mock-supabase2.cjs), nunca contra o banco real.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE = process.env.NAVEGADOR || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3001";
const MOCK = "http://127.0.0.1:54321";

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- agenda (mesma regra do sistema, fuso de São Paulo) ----------
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const soma = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const NOME = { 5: "Sexta", 6: "Sábado", 0: "Domingo" };
const EXTENSO = { 5: "sexta-feira", 6: "sábado", 0: "domingo" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotulo = (iso) => `${NOME[dow(iso)]}, ${curta(iso)}`;
const datas = []; for (let i = 1; i <= 60; i++) { const d = soma(hoje, i); if ([6].includes(dow(d))) datas.push(d); }
const primeira = datas[0];
const alvo = datas[6]; // fora da lista curta (6 datas)
const ultima = datas[datas.length - 1];
const ariaDoDia = (iso) => `${EXTENSO[dow(iso)]}, ${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

const estado = async () => (await (await fetch(MOCK + "/__log")).json());
async function visivel(page, seletor, filtro) {
  return page.evaluateHandle((sel, f) => {
    const vis = (el) => !!(el.offsetParent || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
    return [...document.querySelectorAll(sel)].find((el) => vis(el) && (!f || el.innerText.includes(f) || (el.placeholder || "").includes(f) || (el.getAttribute("aria-label") || "").includes(f))) || null;
  }, seletor, filtro || "");
}
async function clicar(page, seletor, filtro) { const h = (await visivel(page, seletor, filtro)).asElement(); if (!h) throw new Error(`nao achei ${seletor} "${filtro || ""}"`); await h.click(); return h; }
async function digitar(page, placeholder, texto) { const h = (await visivel(page, "input, textarea", placeholder)).asElement(); if (!h) throw new Error(`nao achei campo "${placeholder}"`); await h.focus(); await h.evaluate((e) => e.select()); await page.keyboard.press("Backspace"); if (texto) await h.type(texto); return h; }
const texto = (page) => page.evaluate(() => document.body.innerText);
const esperarTexto = (page, t, ms = 30000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t);
const marcador = (n) => `button[aria-label^="Mesa ${n},"]`;
const pressionado = async (page, seletor) => { const h = (await visivel(page, seletor)).asElement(); return h ? h.evaluate((e) => e.getAttribute("aria-pressed") === "true") : null; };

(async () => {
  console.log(`hoje=${hoje}  primeira=${primeira}  alvo=${alvo} (${rotulo(alvo)})  ultima=${ultima}  | ${datas.length} datas na agenda`);

  const mesAtual = hoje.slice(5, 7);
  await fetch(MOCK + "/__reset", { method: "POST" });
  await fetch(MOCK + "/__seed", { method: "POST", body: JSON.stringify([
    { dia: "x", data_reserva: primeira, horario: "12:00", mesa_numero: "02", pessoas: 2, nome: "Primeira Data", telefone: "41999990001" },
    { dia: "x", data_reserva: alvo, horario: "12:00", mesa_numero: "03", pessoas: 2, nome: "Ja Reservou", telefone: "41999990002" },
    { dia: "x", data_reserva: primeira, horario: "12:00", mesa_numero: "09", pessoas: 2, nome: "Aniversariante Souza", telefone: "41999990003", aniversario: `15/${mesAtual}` },
  ].map((r) => ({ ...r, dia: { 5: "sexta", 6: "sabado", 0: "domingo" }[dow(r.data_reserva)] }))) });

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await require("./e2e-ajuda.cjs").logar(page); // o painel agora exige login
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));

  // =====================================================================
  console.log("\n--- 1) lista curta de datas + calendario ---");
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  const sel = (await visivel(page, 'select[aria-label="Data"]')).asElement();
  const opcoes = await sel.evaluate((s) => [...s.options].map((o) => ({ v: o.value, t: o.textContent.trim() })));
  ok(opcoes.length === 7, `lista mostra so 6 datas + "outra" (tem ${opcoes.length} itens), e nao as ${datas.length} da agenda`);
  ok(opcoes[0].t === rotulo(primeira), `primeira opcao e a proxima data: ${opcoes[0].t}`);
  ok(opcoes[6].v === "outra" && /outra data/i.test(opcoes[6].t), `ultima opcao: "${opcoes[6].t}"`);
  ok(/calendário/i.test(await texto(page)) && (await texto(page)).includes(curta(ultima)), `atalho "Ver calendario · datas ate ${curta(ultima)}" aparece`);

  await sel.select("outra");
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  ok(true, 'escolher "outra data" abre o calendario');
  // anda até o mês da data alvo
  for (let i = 0; i < 4; i++) {
    const tem = await page.$(`[role="dialog"] button[aria-label^="${ariaDoDia(alvo)}"]`);
    if (tem) break;
    await page.click('[role="dialog"] button[aria-label="Próximo mês"]');
    await espera(150);
  }
  // no mês mostrado: só dias da agenda são botões
  const dias = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')].map((b) => b.getAttribute("aria-label")));
  ok(dias.length > 0 && dias.every((a) => /^sábado,/.test(a)), `no calendario so os sabados sao clicaveis (${dias.length} neste mes)`);
  // último mês: nada depois do limite de dois meses
  await page.evaluate(async () => { const p = document.querySelector('[role="dialog"] button[aria-label="Próximo mês"]'); for (let i = 0; i < 4 && !p.disabled; i++) { p.click(); await new Promise((r) => setTimeout(r, 120)); } });
  const ultimoDoCalendario = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')].map((b) => b.getAttribute("aria-label")).pop());
  ok(ultimoDoCalendario && ultimoDoCalendario.startsWith(ariaDoDia(ultima)), `ultimo dia clicavel do calendario e o limite de dois meses: ${ultimoDoCalendario}`);
  await page.screenshot({ path: path.join(__dirname, "_ag-calendario.png") });
  // volta ao mês da data alvo e escolhe
  for (let i = 0; i < 4; i++) { if (await page.$(`[role="dialog"] button[aria-label^="${ariaDoDia(alvo)}"]`)) break; await page.click('[role="dialog"] button[aria-label="Mês anterior"]'); await espera(150); }
  await page.click(`[role="dialog"] button[aria-label^="${ariaDoDia(alvo)}"]`);
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 });
  ok((await texto(page)).includes(rotulo(alvo)), `campo Data passou a mostrar ${rotulo(alvo)}`);
  const opcoes2 = await sel.evaluate((s) => [...s.options].map((o) => o.textContent.trim()));
  ok(opcoes2.includes(rotulo(alvo)) && opcoes2.length === 8, "a data escolhida no calendario entrou na lista (6 + ela + outra)");
  await page.screenshot({ path: path.join(__dirname, "_ag-inicio.png") });

  // =====================================================================
  console.log("\n--- 2) escolher a mesa clicando na planta ---");
  await clicar(page, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  ok((await texto(page)).includes(curta(alvo).split("/")[0]), "tela de horario mostra a data escolhida");
  await clicar(page, "button", "Continuar");
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("01"));
  await espera(600);

  await clicar(page, marcador("01"));
  await espera(250);
  ok(await pressionado(page, marcador("01")), "clicar na mesa 01 NA PLANTA seleciona a mesa");
  ok(await pressionado(page, 'button[data-mesa="01"]'), "…e o cartao da lista acompanha (mesma selecao)");

  await clicar(page, marcador("03"));
  await espera(250);
  ok(/mesa 03 já está reservada/i.test(await texto(page)), "clicar na planta numa mesa ja reservada mostra o motivo");
  ok(!(await pressionado(page, marcador("03"))), "…e nao seleciona");

  await clicar(page, marcador("02"));
  await espera(250);
  ok(/grupo já está acomodado/i.test(await texto(page)), "com o grupo acomodado, outra mesa pela planta avisa em vez de adicionar");
  ok(!(await pressionado(page, marcador("02"))), "…e nao adiciona mesa a mais");
  await page.screenshot({ path: path.join(__dirname, "_ag-planta.png") });

  await clicar(page, marcador("01"));
  await espera(250);
  ok(!(await pressionado(page, marcador("01"))), "clicar de novo na mesa escolhida, na planta, desmarca");
  await clicar(page, marcador("02"));
  await espera(250);
  ok(await pressionado(page, marcador("02")), `mesa 02 (reservada em ${curta(primeira)}) esta livre em ${curta(alvo)}: seleciona pela planta`);
  // as duas vias: desmarca pela lista e escolhe outra pela lista
  await clicar(page, 'button[data-mesa="02"]');
  await espera(200);
  await clicar(page, 'button[data-mesa="01"]');
  await espera(250);
  ok((await pressionado(page, marcador("01"))) && !(await pressionado(page, marcador("02"))), "a lista continua funcionando e a planta acompanha");

  // =====================================================================
  console.log("\n--- 3) aniversario ---");
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Maria Agenda");
  await digitar(page, "(41) 99999-9999", "(41) 98888-7777");
  let botao = (await visivel(page, "button", "Revisar reserva")).asElement();
  ok(!(await botao.evaluate((b) => b.disabled)), "aniversario vazio (opcional) nao trava o botao");
  const campoNiver = await digitar(page, "dd/mm", "3102");
  ok((await campoNiver.evaluate((i) => i.value)) === "31/02", "digitando 3102 a barra entra sozinha: 31/02");
  ok(/Essa data não existe/.test(await texto(page)), "31/02 mostra aviso");
  botao = (await visivel(page, "button", "Revisar reserva")).asElement();
  ok(await botao.evaluate((b) => b.disabled), "…e trava o botao");
  await digitar(page, "dd/mm", "1203");
  botao = (await visivel(page, "button", "Revisar reserva")).asElement();
  ok(!(await botao.evaluate((b) => b.disabled)), "12/03 libera o botao");
  await page.screenshot({ path: path.join(__dirname, "_ag-dados.png") });
  await botao.click();
  await esperarTexto(page, "Revise sua reserva");
  let t = await texto(page);
  ok(t.includes(rotulo(alvo).replace(NOME[dow(alvo)], { 5: "Sexta-feira", 6: "Sábado", 0: "Domingo" }[dow(alvo)])) && /Aniversário\s+12\/03/.test(t.replace(/\n/g, " ")), "revisao mostra a data escolhida e o aniversario");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  const m1 = await estado();
  const nova = m1.reservas.find((r) => r.nome === "Maria Agenda");
  const enviado = m1.corpos.find((c) => c.nome === "Maria Agenda");
  ok(nova && nova.data_reserva === alvo && nova.mesa_numero === "01", `banco gravou mesa 01 na data escolhida (${nova && nova.data_reserva})`);
  ok(nova && nova.aniversario === "12/03", `banco gravou o aniversario (${nova && nova.aniversario})`);
  ok(enviado && enviado.data_reserva === alvo, "o site mandou a data junto com a reserva");
  ok((await texto(page)).includes(curta(alvo)), "tela de confirmacao mostra a data escolhida");

  // =====================================================================
  console.log("\n--- 4) celular: tocar na mesa na planta ---");
  const cel = await browser.newPage();
  cel.on("pageerror", (e) => erros.push("[cel] " + String(e.message).slice(0, 200)));
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await cel.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120000 });
  await cel.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await cel.screenshot({ path: path.join(__dirname, "_ag-cel-inicio.png") });
  await (await visivel(cel, "button", "Buscar mesas")).asElement().tap();
  await require("./e2e-ajuda.cjs").escolherHorario(cel);
  await (await visivel(cel, "button", "Continuar")).asElement().tap();
  await cel.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("04"));
  await espera(600);
  const alvoToque = (await visivel(cel, marcador("04"))).asElement();
  const caixa = await alvoToque.boundingBox();
  ok(caixa.width >= 26, `area de toque da mesa na planta: ${caixa.width.toFixed(0)} px (o quadradinho desenhado tem uns ${(caixa.width * 4.2 / 8).toFixed(0)} px)`);
  await alvoToque.tap();
  await espera(300);
  ok(await pressionado(cel, marcador("04")), "tocar na mesa 04 na planta, no celular, seleciona");
  ok(await pressionado(cel, 'button[data-mesa="04"]'), "…e o cartao da lista acompanha");
  await (await visivel(cel, marcador("02"))).asElement().tap(); // 02 está reservada na primeira data
  await espera(300);
  ok(/mesa 02 já está reservada/i.test(await texto(cel)), "tocar em mesa reservada mostra o motivo no celular");
  const rol = await cel.evaluate(() => ({ r: document.documentElement.scrollWidth, j: window.innerWidth }));
  ok(rol.r <= rol.j + 1, `celular sem rolagem lateral (${rol.r} <= ${rol.j})`);
  await cel.screenshot({ path: path.join(__dirname, "_ag-cel-planta.png") });
  // calendário no celular
  await cel.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120000 });
  await cel.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && /Ver calendário/.test(b.innerText)), { timeout: 60000 });
  await (await visivel(cel, "button", "Ver calendário")).asElement().tap();
  await cel.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await espera(300);
  await cel.screenshot({ path: path.join(__dirname, "_ag-cel-calendario.png") });
  ok(true, 'atalho "Ver calendario" abre o calendario no celular');
  await cel.close();

  // =====================================================================
  console.log("\n--- 5) painel: aniversario do cliente e navegacao por data ---");
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/admin/clientes", { waitUntil: "networkidle2", timeout: 120000 });
  await esperarTexto(page, "Aniversariante Souza");
  t = await texto(page);
  ok(t.includes(`Aniversário: 15/${mesAtual}`) && /neste mês/.test(t), "lista de clientes mostra o aniversario e marca quem faz neste mes");
  ok(/Aniversário: 12\/03/.test(t), "o aniversario informado na reserva nova aparece no cliente");
  await clicar(page, "button", "Aniversariantes de");
  await espera(300);
  t = await texto(page);
  ok(t.includes("Aniversariante Souza") && !t.includes("Maria Agenda") && !t.includes("Primeira Data"), "filtro de aniversariantes do mes mostra so quem faz aniversario no mes");
  await page.screenshot({ path: path.join(__dirname, "_ag-clientes.png") });

  await page.goto(BASE + "/admin", { waitUntil: "networkidle2", timeout: 120000 });
  await esperarTexto(page, "Gerencie as reservas");
  await clicar(page, 'button[title="Abrir o calendário"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  for (let i = 0; i < 4; i++) { if (await page.$(`[role="dialog"] button[aria-label^="${ariaDoDia(alvo)}"]`)) break; await page.click('[role="dialog"] button[aria-label="Próximo mês"]'); await espera(150); }
  await page.click(`[role="dialog"] button[aria-label^="${ariaDoDia(alvo)}"]`);
  await page.waitForFunction((n) => [...document.querySelectorAll("section")].some((s) => /Reservas de/.test(s.innerText) && s.innerText.includes(n)), { timeout: 20000 }, "Maria Agenda");
  ok(true, `painel: calendario leva direto para ${curta(alvo)} e a reserva nova aparece na lista do dia`);
  await clicar(page, "button", "Maria Agenda");
  await page.waitForFunction(() => /Aniversário: 12\/03/.test(document.body.innerText), { timeout: 15000 });
  ok(true, "ficha da mesa mostra o aniversario do cliente");

  // nova reserva pelo painel, na data que o painel está mostrando
  await clicar(page, "button", "Nova reserva");
  await esperarTexto(page, "Nova reserva");
  await espera(400);
  t = await texto(page);
  ok(t.includes(curta(alvo)) && /trocar/.test(t), `nova reserva abre ja na data do painel (${curta(alvo)}), fora dos atalhos`);
  // mesa 04 no mapa do formulário
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && /^04\s*4p$/.test(x.innerText.replace(/\n/g, " ").trim())); b.click(); });
  await digitar(page, "Nome do cliente", "Balcao Silva");
  await digitar(page, "Telefone", "41977776666");
  await digitar(page, "Aniversário dd/mm", "0711");
  await page.screenshot({ path: path.join(__dirname, "_ag-nova-reserva.png") });
  await clicar(page, "button", "Confirmar reserva");
  await page.waitForFunction(() => !document.body.innerText.includes("Nome do cliente"), { timeout: 15000 }).catch(() => {});
  await espera(600);
  const m2 = await estado();
  const balcao = m2.reservas.find((r) => r.nome === "Balcao Silva");
  ok(balcao && balcao.data_reserva === alvo && balcao.mesa_numero === "04" && balcao.aniversario === "07/11", `reserva do painel gravada em ${balcao && balcao.data_reserva}, mesa ${balcao && balcao.mesa_numero}, aniversario ${balcao && balcao.aniversario}`);

  console.log("\n--- erros de JavaScript no navegador ---");
  const relevantes = erros.filter((e) => !/WebSocket|realtime/i.test(e));
  ok(relevantes.length === 0, `nenhum erro de pagina (${relevantes.length})${relevantes.length ? ": " + relevantes.join(" | ") : ""}`);

  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
