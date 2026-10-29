// Captcha (Cloudflare Turnstile) ligado: o site só reserva passando pelo
// servidor (/api/protegido), que confere o captcha. Roda com o site ligado às
// chaves de TESTE da Cloudflare (que sempre aprovam) — rodar.cjs cuida disso.
const path = require("path");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, BASE, MOCK, espera, mock, estado, semear, datas, clicar, digitar, texto, esperarTexto, ir, logar, escolherHorario } = A;

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
const esperarPasse = (page) => page.waitForFunction(() => [...document.querySelectorAll('input[name="cf-turnstile-response"]')].some((i) => i.value), { timeout: 60000 });

(async () => {
  await mock("/__reset");
  await mock("/__fechar-acesso");
  await mock("/__fechar-reserva-direta");
  // 2º sábado lotado (para a fila)
  const MESAS = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0"));
  await semear(["12:00", "13:30"].flatMap((h, k) => MESAS.map((m, i) => ({ data_reserva: datas[1], horario: h, mesa_numero: m, nome: `Cliente ${m}`, telefone: `419000${k}${String(i).padStart(4, "0")}` }))));

  console.log("--- o banco fechado para chamadas diretas ---");
  const direto = await fetch(MOCK + "/rest/v1/rpc/reservar", { method: "POST", headers: { "Content-Type": "application/json", apikey: "chave-de-teste" }, body: JSON.stringify({ p_data: datas[0], p_horario: "12:00", p_mesas: [{ numero: "01", pessoas: 2 }], p_nome: "Robo Silva", p_telefone: "41911112222" }) });
  ok(direto.status === 401, `robô chamando o banco direto: recusado (${direto.status})`);
  const semPasse = await fetch(BASE + "/api/protegido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funcao: "reservar", parametros: { p_data: datas[0] }, captcha: "passe-falso-de-robo".replace("passe-", "x") }) });
  ok(semPasse.status === 400 && (await semPasse.json()).error.code === "CAPTCHA", "robô chamando o servidor com captcha falso: recusado");
  const outra = await fetch(BASE + "/api/protegido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funcao: "apagar_dados_do_cliente", parametros: {}, captcha: "passe-bom" }) });
  ok(outra.status === 400 && (await outra.json()).error.code === "PEDIDO", "o servidor só aceita as três funções públicas (não 'apagar dados')");

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  await page.setViewport({ width: 1366, height: 900 });

  console.log("\n--- reserva com captcha ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 90000 });
  await (await A.visivel(page, 'select[aria-label="Data"]')).asElement().select(datas[0]);
  await espera(300);
  await clicar(page, "button", "Buscar mesas");
  await escolherHorario(page, "12h");
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(400);
  await page.evaluate(() => [...document.querySelectorAll('button[data-mesa="01"]')].find((b) => b.offsetParent).scrollIntoView({ block: "center" }));
  await clicar(page, 'button[data-mesa="01"]');
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Clara Nunes");
  await digitar(page, "(41) 99999-9999", "(41) 97777-3333");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  // a Cloudflare põe a janelinha numa área isolada da página; o que dá para ver
  // de fora é o campo escondido onde ela deixa o "passe"
  const temCaptcha = await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]') && document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]'), { timeout: 60000 }).then(() => true, () => false);
  ok(temCaptcha, "a revisão mostra o captcha da Cloudflare");
  await esperarPasse(page);
  ok(true, "o captcha de teste aprova sozinho (o cliente normalmente nem precisa clicar)");
  await foto(page, "_captcha-revisar.png");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!", 60000);
  let s = await estado();
  const ultima = s.chamadas[s.chamadas.length - 1];
  ok(ultima && ultima.quem === "servidor" && s.reservas.some((r) => r.nome === "Clara Nunes" && !r.cancelada), "a reserva passou pelo servidor (com captcha) e foi gravada");

  console.log("\n--- fila com captcha ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await (await A.visivel(page, 'select[aria-label="Data"]')).asElement().select(datas[1]);
  await espera(400);
  await clicar(page, "button", "Entrar na fila de espera");
  await esperarTexto(page, "Fila de espera");
  await digitar(page, "Ex.: Maria Souza", "Davi Rocha");
  await digitar(page, "(41) 99999-9999", "(41) 96666-4444");
  await esperarPasse(page);
  await clicar(page, "button", "Entrar na fila de espera");
  await page.waitForFunction(() => /\/fila\//.test(location.pathname), { timeout: 30000 });
  s = await estado();
  ok(s.fila.some((f) => f.nome === "Davi Rocha"), "entrou na fila passando pelo captcha");

  console.log("\n--- painel continua sem captcha ---");
  await logar(page);
  await clicar(page, "button", "Nova reserva");
  await page.waitForSelector("#nova-reserva-horario", { timeout: 30000 });
  ok(!(await page.evaluate(() => Boolean(document.querySelector('input[name="cf-turnstile-response"]')))), "o painel não mostra captcha (administrador logado)");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de página ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
