// Cliente: nome e sobrenome, consulta pelo nome completo, comprovante para
// baixar e alterar a própria reserva — no site local com o Supabase FALSO.
const path = require("path");
const fs = require("fs");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, espera, mock, estado, semear, datas, clicar, digitar, texto, esperarTexto, ir, escolherHorario } = A;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
async function auditar(page, nome) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`));
  ok(r.length === 0, `acessibilidade ${nome}: ${r.join(" | ") || "sem problemas"}`);
}
// rola a mesa para o meio da tela antes de clicar (a lista tem rolagem própria)
async function clicarMesa(page, n) {
  await page.evaluate((x) => [...document.querySelectorAll("button[data-mesa='" + x + "']")].find((b) => b.offsetParent).scrollIntoView({ block: "center" }), n);
  await espera(150);
  await clicar(page, "button[data-mesa='" + n + "']");
}
const botao = (page, re) => page.evaluate((src) => [...document.querySelectorAll("button")].find((b) => b.offsetParent && new RegExp(src).test(b.innerText.trim()))?.disabled, re);

(async () => {
  await mock("/__reset");
  // a mesa 03 das 13h30 do 1º sábado já é de outra pessoa (para testar conflito)
  await semear([{ data_reserva: datas[0], horario: "13:30", mesa_numero: "03", nome: "Outra Pessoa", telefone: "41900001111" }]);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  globalThis.__pagina = page;
  await page.setViewport({ width: 1366, height: 900 });

  console.log("--- nome e sobrenome ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 90000 });
  await (await A.visivel(page, 'select[aria-label="Data"]')).asElement().select(datas[0]);
  await espera(300);
  await clicar(page, "button", "Buscar mesas");
  await escolherHorario(page, "12h");
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(400);
  await clicarMesa(page, "01");
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Ana");
  await digitar(page, "(41) 99999-9999", "(41) 98888-0001");
  await espera(200);
  ok(/Digite nome e sobrenome/.test(await texto(page)) && (await botao(page, "^Revisar reserva")) === true, "só o primeiro nome: avisa e não deixa seguir");
  await digitar(page, "Ex.: Maria Souza", "Ana Lima");
  await espera(200);
  ok((await botao(page, "^Revisar reserva")) === false, "nome e sobrenome: libera");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  ok(true, "Ana Lima reservou: sábado 12h, mesa 01");

  console.log("\n--- comprovante ---");
  await A.prepararCaptura(page);
  await clicar(page, "button", "Baixar comprovante");
  await page.waitForFunction(() => window.__arquivo && window.__nome, { timeout: 20000 });
  const comp = await page.evaluate(async () => ({ nome: window.__nome, tipo: window.__arquivo.type, tamanho: window.__arquivo.size, bytes: [...new Uint8Array(await window.__arquivo.arrayBuffer()).slice(0, 4)] }));
  ok(comp.tipo === "image/png" && comp.bytes.join() === "137,80,78,71" && comp.tamanho > 20000, `baixa uma imagem PNG (${comp.nome}, ${Math.round(comp.tamanho / 1024)} KB)`);
  ok(/^reserva-.*\.png$/.test(comp.nome), "nome do arquivo: reserva-<restaurante>-<código>.png");
  // guarda a imagem para conferir a cara dela
  const b64 = await page.evaluate(async () => { const b = new Uint8Array(await window.__arquivo.arrayBuffer()); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); });
  fs.writeFileSync(path.join(__dirname, "_saida", "_comprovante.png"), Buffer.from(b64, "base64"));

  console.log("\n--- consulta pelo nome completo ---");
  await ir(page, "/consulta");
  await page.type("#termo", "ana");
  ok((await botao(page, "^Consultar reserva")) === true && /Digite também o sobrenome/.test(await texto(page)), "só 'ana': botão travado e pede o sobrenome");
  await page.type("#termo", " lima");
  await clicar(page, "button", "Consultar reserva");
  await page.waitForFunction(() => document.querySelectorAll("article").length === 1, { timeout: 30000 });
  ok(/12h/.test(await texto(page)) && /Mesa 01/.test(await texto(page)), "'ana lima': acha a reserva (12h, mesa 01)");
  await auditar(page, "consulta com resultado");

  console.log("\n--- alterar: dígitos errados ---");
  await clicar(page, "button", "Alterar reserva");
  await esperarTexto(page, "continua valendo até você confirmar");
  await page.type('input[id^="final-"]', "9999");
  await clicar(page, "button", "Continuar para escolher");
  await esperarTexto(page, "não conferem");
  ok(true, "4 dígitos errados: avisa e não segue");

  console.log("\n--- alterar: escolher a nova ---");
  await page.$eval('input[id^="final-"]', (e) => e.select());
  await page.keyboard.press("Backspace");
  await page.type('input[id^="final-"]', "0001");
  await clicar(page, "button", "Continuar para escolher");
  await page.waitForFunction(() => location.pathname === "/" && /Alterando sua reserva/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "dígitos certos: volta para a reserva com a faixa 'Alterando sua reserva'");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await foto(page, "_alterar-inicio.png");
  await clicar(page, "button", "Buscar mesas");
  await escolherHorario(page, "13h30");
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(400);
  // a mesa 03 às 13h30 é de outra pessoa; a 01 (a minha) aparece livre
  const status = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('button[aria-label^="Mesa "]')].filter((b) => b.offsetParent).map((b) => [b.getAttribute("aria-label").slice(5, 7), /reservad|ocupad|indispon/i.test(b.getAttribute("aria-label"))])));
  ok(status["03"] === true && status["01"] === false, "na planta: a 03 (de outra pessoa) aparece tomada; a 01 (a minha) aparece livre");
  await clicarMesa(page, "02");
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Revise a alteração");
  const rev = await texto(page);
  ok(/Antes/.test(rev) && /12h/.test(rev) && /13h30/.test(rev) && !/Quase tudo pronto/.test(rev), "pulou os dados (já são conhecidos) e mostra 'Antes' e a nova");
  await auditar(page, "revisar a alteração");
  await foto(page, "_alterar-revisar.png");
  await clicar(page, "button", "Confirmar alteração");
  await esperarTexto(page, "Reserva alterada!");
  let s = await estado();
  const ativasAna = s.reservas.filter((r) => r.nome === "Ana Lima" && !r.cancelada);
  ok(ativasAna.length === 1 && ativasAna[0].horario === "13:30" && ativasAna[0].mesa_numero === "02", "no banco: a antiga cancelada, a nova (13h30, mesa 02) ativa, mesmo nome");
  ok(s.alteracoes.length === 1, "foi uma alteração (uma chamada só, tudo ou nada)");
  ok(!(await page.evaluate(() => sessionStorage.getItem("mesa-certa:alteracao"))), "a alteração em andamento foi apagada do navegador");

  console.log("\n--- alterar: a mesa nova é tomada no meio do caminho ---");
  await ir(page, "/consulta");
  await page.waitForSelector("#termo");
  await espera(800); // a página termina de carregar antes do clique
  await page.type("#termo", "Ana Lima");
  await clicar(page, "button", "Consultar reserva");
  await page.waitForFunction(() => [...document.querySelectorAll("article")].some((a) => /13h30/.test(a.innerText) && /Confirmada/.test(a.innerText)), { timeout: 30000 });
  await page.evaluate(() => [...[...document.querySelectorAll("article")].find((a) => /Confirmada/.test(a.innerText)).querySelectorAll("button")].find((b) => /Alterar reserva/.test(b.innerText)).click());
  await page.type('input[id^="final-"]', "0001");
  await clicar(page, "button", "Continuar para escolher");
  await page.waitForFunction(() => /Alterando sua reserva/.test(document.body.innerText) && [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await clicar(page, "button", "Buscar mesas");
  await escolherHorario(page, "14h30");
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(400);
  await clicarMesa(page, "07");
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Revise a alteração");
  await mock("/__tomar-na-proxima-reserva", { mesa: "07" });
  await clicar(page, "button", "Confirmar alteração");
  await page.waitForFunction(() => /acabou de ser reservada por outra pessoa/.test(document.body.innerText), { timeout: 30000 });
  s = await estado();
  const aindaAna = s.reservas.filter((r) => r.nome === "Ana Lima" && !r.cancelada);
  ok(aindaAna.length === 1 && aindaAna[0].horario === "13:30" && aindaAna[0].mesa_numero === "02", "a mesa nova foi tomada: avisa, volta para a planta, e a reserva de antes (13h30, mesa 02) continua valendo");
  await clicar(page, "button", "Desistir");
  await page.waitForFunction(() => location.pathname === "/consulta", { timeout: 30000 });
  ok(!(await page.evaluate(() => sessionStorage.getItem("mesa-certa:alteracao"))), "'Desistir' volta para a consulta e esquece a alteração");

  console.log("\n--- celular ---");
  const cel = await (await browser.createBrowserContext()).newPage();
  cel.on("pageerror", (e) => erros.push("[cel] " + String(e.message).slice(0, 160)));
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ir(cel, "/consulta");
  await cel.type("#termo", "Ana Lima");
  await clicar(cel, "button", "Consultar reserva");
  await cel.waitForFunction(() => document.querySelectorAll("article").length >= 1, { timeout: 30000 });
  const rol = await cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(rol <= 1, `consulta no celular sem rolagem para o lado (${rol})`);
  await foto(cel, "_consulta-cel.png");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de página ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error("ERRO NO TESTE:", e.message);
  // onde parou: o endereço e o começo da tela
  try { const p = globalThis.__pagina; console.error("TELA:", p.url(), (await p.evaluate(() => document.body.innerText)).slice(0, 500).replace(/\n/g, " | ")); } catch {}
  process.exit(2);
});
