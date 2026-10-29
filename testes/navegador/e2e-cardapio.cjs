// Cardápio: abre pelo menu do celular e pelo do computador, sem rolagem lateral.
const path = require("path");
const { puppeteer, EDGE, espera, clicar, texto, ir, visivel } = require("./e2e-ajuda.cjs");
let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];

  const pc = await browser.newPage();
  pc.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  await pc.setViewport({ width: 1366, height: 900 });
  await ir(pc, "/");
  await clicar(pc, 'nav a[href="/cardapio"]');
  await pc.waitForFunction(() => location.pathname === "/cardapio" && /Tilapinha maravilha/.test(document.body.innerText), { timeout: 60000 });
  ok(true, "computador: 'Cardápio' no menu do topo abre a pagina do cardapio");
  let t = await texto(pc);
  for (const s of ["Caldinho de feijão", "que o chefe ostentação criou!", "Camarão", "Banana Foster", "Suçuarana", "por Marcelo Adidio Dalmazo", "Caipirão na caneca de chope", "Gin Tanqueray", "Baden Baden", "Red Bull"]) {
    if (!t.includes(s)) ok(false, `falta "${s}"`);
  }
  ok(true, "as 6 partes do cardapio estao la (petiscos, sobremesas, drinks, doses, cervejas, refris)");
  const colunas = await pc.evaluate(() => { const a = document.querySelector("#petiscos").getBoundingClientRect(); const b = document.querySelector("#drinks").getBoundingClientRect(); return { a: Math.round(a.left), b: Math.round(b.left) }; });
  ok(colunas.b > colunas.a + 300, `no computador comida e bebida ficam lado a lado (${colunas.a} | ${colunas.b})`);
  await pc.screenshot({ path: path.join(__dirname, "_cardapio-pc.png") });
  await clicar(pc, 'a[href="#doses"]');
  await espera(600);
  const topoDoses = await pc.evaluate(() => Math.round(document.querySelector("#doses").getBoundingClientRect().top));
  ok(topoDoses >= 40 && topoDoses < 200, `atalho 'Doses' leva ate a parte, sem ficar escondida atras da barra (${topoDoses}px do topo)`);
  await clicar(pc, "a", "Reservar uma mesa");
  await pc.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
  ok(true, "'Reservar uma mesa' volta para a reserva");

  const cel = await browser.newPage();
  cel.on("pageerror", (e) => erros.push("[cel] " + String(e.message).slice(0, 160)));
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ir(cel, "/");
  await (await visivel(cel, 'button[aria-label="Abrir menu"]')).asElement().tap();
  await espera(300);
  await (await visivel(cel, 'a[href="/cardapio"]')).asElement().tap();
  await cel.waitForFunction(() => location.pathname === "/cardapio" && /Minininhos/.test(document.body.innerText), { timeout: 60000 });
  ok(true, "celular: 'Ver o cardápio' no menu abre a pagina");
  await espera(400);
  const rol = await cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(rol <= 1, `celular sem rolagem lateral (${rol})`);
  ok(!(await cel.evaluate(() => document.body.style.overflow === "hidden")), "a pagina rola normalmente depois de sair do menu");
  await cel.screenshot({ path: path.join(__dirname, "_cardapio-cel.png") });
  await cel.evaluate(() => document.querySelector("#drinks").scrollIntoView());
  await espera(300);
  await cel.screenshot({ path: path.join(__dirname, "_cardapio-cel-drinks.png") });

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de pagina ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
