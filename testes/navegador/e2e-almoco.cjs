// Almoço de sábado (12h às 15h, horários de 30 em 30 min, mesa presa 1h30),
// no site local ligado ao Supabase FALSO.
const path = require("path");
const fs = require("fs");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, espera, mock, estado, semear, datas, clicar, digitar, texto, esperarTexto, ir, logar } = A;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
const MESAS = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0"));
const tudoTomado = (data, horario) => MESAS.map((m, i) => ({ data_reserva: data, horario, mesa_numero: m, pessoas: 2, nome: `Ocupa ${m}`, telefone: `4190000${String(i).padStart(4, "0")}` }));

async function auditar(page, nome) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`));
  ok(r.length === 0, `acessibilidade ${nome}: ${r.join(" | ") || "sem problemas"}`);
}
const selecionarData = async (page, iso) => {
  const sel = (await A.visivel(page, 'select[aria-label="Data"]')).asElement();
  await sel.select(iso);
  await espera(300);
};

(async () => {
  await mock("/__reset");
  await mock("/__fechar-acesso");
  // 1º sábado: todas as mesas às 12h (lota 12h, 12h30 e 13h; libera de 13h30 em diante)
  // 2º sábado: todas às 12h e às 13h30 (lota o dia inteiro)
  await semear([...tudoTomado(datas[0], "12:00"), ...tudoTomado(datas[1], "12:00"), ...tudoTomado(datas[1], "13:30")]);

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  await page.setViewport({ width: 1366, height: 900 });

  console.log("--- datas ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 90000 });
  const opcoes = await page.evaluate(() => [...[...document.querySelectorAll('select[aria-label="Data"]')].find((s) => s.offsetParent).options].map((o) => o.textContent).filter((t) => !/outra data/i.test(t)));
  ok(opcoes.length > 0 && opcoes.every((t) => /^Sáb/.test(t)), `a lista só tem sábados (${opcoes.slice(0, 3).join(", ")}…)`);
  ok(/venha almoçar/.test(await texto(page)), "o texto fala em almoço");

  console.log("\n--- horário ---");
  await selecionarData(page, datas[0]);
  await clicar(page, "button", "Buscar mesas");
  await esperarTexto(page, "Que horas vocês chegam?");
  const grade = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="Horário de chegada"]')].find((g) => g.offsetParent).querySelectorAll('[role="radio"]').length);
  ok(grade === 6, `6 horários: 12h, 12h30, 13h, 13h30, 14h, 14h30 (${grade})`);
  const lotados = await page.evaluate(() => [...[...document.querySelectorAll('[role="radiogroup"][aria-label="Horário de chegada"]')].find((g) => g.offsetParent).querySelectorAll('[role="radio"]')].filter((b) => b.disabled).map((b) => b.innerText.split("\n")[0]));
  ok(lotados.join() === "12h,12h30,13h", `com todas as mesas tomadas às 12h: 12h, 12h30 e 13h aparecem lotados (${lotados.join(", ")})`);
  const continuar = async () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.offsetParent && /^Continuar/.test(b.innerText.trim()))?.disabled);
  ok((await continuar()) === true, "sem escolher o horário, Continuar fica travado");
  await auditar(page, "escolha do horário");
  await foto(page, "_almoco-horario.png");
  await clicar(page, '[role="radio"]', "13h30");
  await espera(200);
  ok((await continuar()) === false, "escolheu 13h30: Continuar libera");
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(500);
  const livres = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Mesa "]')].filter((b) => b.offsetParent && !/reservad|ocupad|indispon/i.test(b.getAttribute("aria-label"))).length);
  ok(livres === 20, `às 13h30 as 20 mesas estão livres (as reservas das 12h liberam a mesa depois de 1h30) — ${livres}`);
  await clicar(page, 'button[data-mesa="05"]');
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Cliente Almoço");
  await digitar(page, "(41) 99999-9999", "(41) 97777-1330");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  ok(/13h30/.test(await texto(page)), "a revisão mostra o horário escolhido");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  ok(/Chegue até as 13h50/.test(await texto(page)), "confirmação: 'Chegue até as 13h50' (20 min de tolerância)");
  let s = await estado();
  const nova = s.reservas.find((r) => r.nome === "Cliente Almoço");
  ok(nova && nova.horario === "13:30" && nova.mesa_numero === "05" && nova.dia === "sabado", "o banco gravou sábado, 13h30, mesa 05");

  console.log("\n--- dia lotado: fila de espera ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await selecionarData(page, datas[1]);
  ok(/Lotado em/.test(await texto(page)), "sábado com todos os horários tomados: aparece 'Lotado' e a fila");
  await clicar(page, "button", "Entrar na fila de espera");
  await esperarTexto(page, "Fila de espera");
  const horarioFila = (await A.visivel(page, "select")).asElement();
  ok(Boolean(horarioFila), "a fila pergunta o horário que a pessoa prefere");
  await horarioFila.select("13:00");
  await digitar(page, "Ex.: Maria Souza", "Fila Almoço");
  await digitar(page, "(41) 99999-9999", "(41) 96666-1300");
  await auditar(page, "fila de espera");
  await clicar(page, "button", "Entrar na fila de espera");
  await page.waitForFunction(() => /\/fila\//.test(location.pathname), { timeout: 30000 });
  s = await estado();
  ok(s.fila.some((f) => f.nome === "Fila Almoço" && f.horario === "13:00"), "a fila gravou o horário escolhido (13h)");

  console.log("\n--- painel ---");
  await logar(page);
  const sel = await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Horário da planta"]')].find((s) => s.offsetParent)?.options.length);
  ok(sel === 6, `planta do painel tem o seletor de horário (${sel} opções)`);
  await ir(page, "/admin/operacao");
  await esperarTexto(page, "almoço, 12h às 15h", 60000);
  ok(true, "modo operação: 'almoço, 12h às 15h'");
  const chips = await page.evaluate(() => document.querySelectorAll('[role="radiogroup"][aria-label="Horário da planta"] [role="radio"]').length);
  ok(chips === 6, `modo operação: botões de horário na planta (${chips})`);
  await foto(page, "_almoco-operacao.png");

  console.log("\n--- textos ---");
  await ir(page, "/termos");
  ok(/das 12h às 15h/.test(await texto(page)) && !/19h30|19:30/.test(await texto(page)), "termos: almoço das 12h às 15h, sem 19h30");
  await ir(page, "/cancelamento");
  ok(!/19h30|19:30/.test(await texto(page)), "cancelamento: sem 19h30");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de página ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
