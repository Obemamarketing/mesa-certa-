// Login em duas etapas de ponta a ponta, no site local ligado ao Supabase FALSO.
const path = require("path");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, MOCK, ADMIN, espera, datas, mock, semear, clicar, texto, esperarTexto, ir, preencherLogin, logar } = A;
const { totp } = require("./e2e-totp.cjs");

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
const digitarNo = async (page, seletor, valor) => { await page.focus(seletor); await page.$eval(seletor, (e) => e.select()); await page.keyboard.press("Backspace"); await page.type(seletor, valor); };

(async () => {
  await mock("/__reset");
  await mock("/__fechar-acesso"); // como em produção: banco fechado
  await semear([{ data_reserva: datas[0], mesa_numero: "03", nome: "Cliente Secreto", telefone: "41999990003" }]);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const ctx = await browser.createBrowserContext();
  const adm = await ctx.newPage();
  adm.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  await adm.setViewport({ width: 1366, height: 900 });

  console.log("--- ativar ---");
  await logar(adm);
  await ir(adm, "/admin/configuracoes");
  await esperarTexto(adm, "Login em duas etapas");
  await clicar(adm, "button", "Ativar login em duas etapas");
  await adm.waitForSelector('img[alt="QR Code para o app autenticador"]', { timeout: 20000 });
  const segredo = await adm.evaluate(() => document.querySelector(".select-all").innerText.trim());
  ok(/^[A-Z2-7]{16,}$/.test(segredo), "aparece o QR Code e a chave para digitar no app");
  const qrCarregou = await adm.waitForFunction(() => { const i = document.querySelector('img[alt="QR Code para o app autenticador"]'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 10000 }).then(() => true, () => false);
  ok(qrCarregou, "a imagem do QR Code carrega de verdade (nao fica quebrada)");
  await adm.evaluate(() => document.querySelector('img[alt="QR Code para o app autenticador"]').scrollIntoView({ block: "center" }));
  await foto(adm, "_mfa-ativar.png");
  await digitarNo(adm, "#codigo-ativacao", "000000");
  await clicar(adm, "button", "Confirmar e ativar");
  await esperarTexto(adm, "Código incorreto");
  ok(true, "codigo errado: 'Código incorreto' e nao ativa");
  await digitarNo(adm, "#codigo-ativacao", totp(segredo));
  await clicar(adm, "button", "Confirmar e ativar");
  await adm.waitForFunction(() => /Ativado\. Para entrar/.test(document.body.innerText), { timeout: 20000 });
  ok(true, "codigo certo do app: 'Ativado'");
  await ir(adm, "/admin");
  await adm.waitForFunction(() => /Cliente Secreto/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "quem ativou continua no painel, sem precisar entrar de novo");

  console.log("\n--- entrar de novo: senha + codigo ---");
  await clicar(adm, "aside button", "Sair");
  await clicar(adm, "aside button", "Sim");
  await adm.waitForSelector("#login-email", { timeout: 20000 });
  await preencherLogin(adm, ADMIN);
  await adm.waitForSelector("#login-codigo", { timeout: 30000 });
  let t = await texto(adm);
  ok(/Digite o código do app/.test(t) && !/Cliente Secreto|Gerencie as reservas/.test(t), "depois da senha, pede o codigo — e o painel ainda nao aparece");
  await foto(adm, "_mfa-codigo.png");

  // alguém que pulasse a tela: com a sessão só da senha, o banco não entrega nada
  const burla = await adm.evaluate(async (MOCK) => {
    const chave = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    const token = JSON.parse(localStorage.getItem(chave)).access_token;
    const h = { Authorization: "Bearer " + token, apikey: "x" };
    const admin = await (await fetch(MOCK + "/rest/v1/rpc/eh_admin", { method: "POST", headers: h })).json();
    const reservas = await (await fetch(MOCK + "/rest/v1/reservas?select=*", { headers: h })).json();
    return { admin, reservas: reservas.length };
  }, MOCK);
  ok(burla.admin === false && burla.reservas === 0, "pulando a tela do codigo direto no banco: nao e administrador e nao recebe nenhuma reserva");

  await digitarNo(adm, "#login-codigo", "123456");
  await clicar(adm, 'button[type="submit"]', "Entrar");
  await esperarTexto(adm, "Código incorreto");
  ok(!/Cliente Secreto/.test(await texto(adm)), "codigo errado no login: continua fora");
  const segredoAtual = (await (await fetch(MOCK + "/__fatores")).json())[ADMIN.id ?? Object.keys(await (await fetch(MOCK + "/__fatores")).json())[0]]?.[0]?.secret ?? segredo;
  await digitarNo(adm, "#login-codigo", totp(segredoAtual));
  await clicar(adm, 'button[type="submit"]', "Entrar");
  await adm.waitForFunction(() => /Cliente Secreto/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "codigo certo: entra e ve as reservas");

  console.log("\n--- outro aparelho ---");
  const cel = await (await browser.createBrowserContext()).newPage();
  cel.on("pageerror", (e) => erros.push("[cel] " + String(e.message).slice(0, 160)));
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ir(cel, "/admin");
  await preencherLogin(cel, ADMIN);
  await cel.waitForSelector("#login-codigo", { timeout: 30000 });
  const rol = await cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(rol <= 1, `no celular tambem pede o codigo, sem rolagem lateral (${rol})`);
  await foto(cel, "_mfa-codigo-cel.png");

  console.log("\n--- desativar ---");
  await ir(adm, "/admin/configuracoes");
  await adm.waitForFunction(() => /Ativado\. Para entrar/.test(document.body.innerText), { timeout: 20000 });
  await clicar(adm, "button", "Desativar");
  await clicar(adm, "button", "Sim, desativar");
  await adm.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Ativar login em duas etapas/.test(b.innerText)), { timeout: 20000 });
  ok(true, "desativar volta para 'Ativar login em duas etapas'");
  await clicar(adm, "aside button", "Sair");
  await clicar(adm, "aside button", "Sim");
  await adm.waitForSelector("#login-email", { timeout: 20000 });
  await preencherLogin(adm, ADMIN);
  await adm.waitForFunction(() => /Cliente Secreto/.test(document.body.innerText) || document.querySelector("#login-codigo"), { timeout: 30000 }).catch(async () => console.log("      tela:", (await texto(adm)).slice(0, 300).split("\n").join(" | ")));
  ok(!(await adm.$("#login-codigo")), "desativado: entra so com a senha de novo");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de pagina ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
