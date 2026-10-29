// "Esqueci minha senha" do painel, no site local ligado ao Supabase FALSO.
const path = require("path");
const fs = require("fs");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, BASE, MOCK, ADMIN, espera, mock, estado, clicar, texto, esperarTexto, ir, preencherLogin, logar } = A;
const { totp } = require("./e2e-totp.cjs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
const linkDoEmail = async (email) => (await (await fetch(`${MOCK}/__link-recuperacao?email=${encodeURIComponent(email)}`)).json()).hash;
const escrever = async (page, sel, v) => { await page.focus(sel); await page.$eval(sel, (e) => e.select()); await page.keyboard.press("Backspace"); if (v) await page.type(sel, v); };
async function auditar(page, nome) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id}(${v.nodes.length})`));
  ok(r.length === 0, `acessibilidade ${nome}: ${r.join(", ") || "sem problemas"}`);
}

(async () => {
  await mock("/__reset");
  await mock("/__fechar-acesso");
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  await page.setViewport({ width: 1280, height: 900 });

  console.log("--- pedir o link ---");
  await ir(page, "/admin");
  await page.waitForSelector("#login-email", { timeout: 60000 });
  await clicar(page, "button", "Esqueci minha senha");
  await page.waitForSelector("#esqueci-email");
  await page.type("#esqueci-email", ADMIN.email);
  await auditar(page, "tela 'Trocar a senha'");
  await clicar(page, 'button[type="submit"]', "Enviar link");
  await esperarTexto(page, "Confira o seu e-mail");
  let s = await estado();
  ok(s.recuperacoes.length === 1 && s.recuperacoes[0].email === ADMIN.email && /\/nova-senha$/.test(s.recuperacoes[0].redirectTo || ""), `pediu o e-mail ao Supabase, com o link voltando para /nova-senha (${s.recuperacoes[0]?.redirectTo})`);
  await clicar(page, "button", "Voltar para o login");
  await clicar(page, "button", "Esqueci minha senha");
  await escrever(page, "#esqueci-email", "ninguem@nao-existe.test");
  await clicar(page, 'button[type="submit"]', "Enviar link");
  await esperarTexto(page, "Confira o seu e-mail");
  ok(true, "e-mail que não existe recebe a MESMA resposta (a tela não revela quem tem acesso)");

  console.log("\n--- outro aparelho logado antes da troca ---");
  const outro = await (await browser.createBrowserContext()).newPage();
  await outro.setViewport({ width: 1280, height: 900 });
  await logar(outro);
  ok(true, "outro aparelho está dentro do painel");

  console.log("\n--- link do e-mail ---");
  await page.goto("about:blank"); await page.goto(BASE + "/nova-senha", { waitUntil: "networkidle2" });
  await esperarTexto(page, "Link inválido");
  ok(true, "abrir /nova-senha sem link: 'Link inválido'");
  await page.goto("about:blank"); await page.goto(BASE + "/nova-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", { waitUntil: "networkidle2" });
  await esperarTexto(page, "Este link venceu");
  ok(true, "link vencido: 'Este link venceu' e manda pedir outro");

  await page.goto("about:blank"); await page.goto(BASE + "/nova-senha" + (await linkDoEmail(ADMIN.email)), { waitUntil: "networkidle2" });
  await esperarTexto(page, "Crie uma senha nova");
  ok(!/armazenamento essencial/.test(await texto(page)), "link certo: pede a senha nova (sem aviso de cookies na frente)");
  await auditar(page, "/nova-senha");
  await page.type("#nova-senha", "abc");
  ok(/Faltam 5 caracteres/.test(await texto(page)), "senha curta: avisa quantos caracteres faltam");
  await escrever(page, "#nova-senha", "SenhaNova2026");
  await page.type("#repetir-senha", "SenhaNova2027");
  ok(/não estão iguais/.test(await texto(page)) && (await page.$eval('button[type="submit"]', (b) => b.disabled)), "senhas diferentes: avisa e não deixa salvar");
  await escrever(page, "#repetir-senha", "SenhaNova2026");
  await foto(page, "_senha-nova.png");
  await clicar(page, 'button[type="submit"]', "Salvar senha nova");
  await esperarTexto(page, "Senha trocada");
  ok(true, "salvou: 'Senha trocada'");
  await clicar(page, "a", "Abrir o painel");
  await esperarTexto(page, "Gerencie as reservas", 60000);
  ok(true, "'Abrir o painel' já entra (sem pedir a senha de novo)");

  const refreshDoOutro = await outro.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token")); return JSON.parse(localStorage.getItem(k)).refresh_token; });
  const renovou = await fetch(MOCK + "/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshDoOutro }) });
  ok(renovou.status === 400, "o outro aparelho não consegue mais renovar o login: sai em até 1 hora (a senha antiga podia ter vazado)");
  const refreshDaqui = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token")); return JSON.parse(localStorage.getItem(k)).refresh_token; });
  ok((await fetch(MOCK + "/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshDaqui }) })).status === 200, "este aparelho (onde trocou a senha) continua dentro");

  console.log("\n--- entrar depois da troca ---");
  await clicar(page, "aside button", "Sair");
  await clicar(page, "aside button", "Sim");
  await preencherLogin(page, ADMIN, ADMIN.senha);
  await esperarTexto(page, "E-mail ou senha incorretos.");
  ok(true, "a senha antiga não entra mais");
  await preencherLogin(page, ADMIN, "SenhaNova2026");
  await esperarTexto(page, "Gerencie as reservas", 60000);
  ok(true, "a senha nova entra");

  console.log("\n--- conta com login em duas etapas ---");
  await mock("/__senha-exige-aal2");
  const hash = await linkDoEmail(ADMIN.email);
  const token = new URLSearchParams(hash.slice(1)).get("access_token");
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json", apikey: "x" };
  const fator = await (await fetch(MOCK + "/auth/v1/factors", { method: "POST", headers: h, body: JSON.stringify({ factor_type: "totp", friendly_name: "teste-senha" }) })).json();
  await fetch(`${MOCK}/auth/v1/factors/${fator.id}/verify`, { method: "POST", headers: h, body: JSON.stringify({ code: totp(fator.totp.secret) }) });
  const p2 = await (await browser.createBrowserContext()).newPage();
  p2.on("pageerror", (e) => erros.push("[p2] " + String(e.message).slice(0, 160)));
  await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p2.goto("about:blank"); await p2.goto(BASE + "/nova-senha" + (await linkDoEmail(ADMIN.email)), { waitUntil: "networkidle2" });
  await esperarTexto(p2, "Crie uma senha nova");
  await p2.type("#nova-senha", "OutraSenha2026");
  await p2.type("#repetir-senha", "OutraSenha2026");
  await clicar(p2, 'button[type="submit"]', "Salvar senha nova");
  await esperarTexto(p2, "Digite o código do app");
  ok(true, "com duas etapas ligadas, pede o código do app antes de trocar");
  await p2.type("#nova-senha-codigo", "123456");
  await clicar(p2, 'button[type="submit"]', "Confirmar e salvar");
  await esperarTexto(p2, "Código incorreto");
  ok(true, "código errado: avisa e não troca");
  await p2.type("#nova-senha-codigo", totp(fator.totp.secret));
  await clicar(p2, 'button[type="submit"]', "Confirmar e salvar");
  await esperarTexto(p2, "Senha trocada");
  ok(true, "código certo: senha trocada");
  const rol = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(rol <= 1, `no celular, sem rolagem para o lado (${rol})`);
  await foto(p2, "_senha-cel.png");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de página ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
