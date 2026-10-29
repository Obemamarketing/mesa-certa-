// Passada rápida por todas as páginas: abre, espera um texto-chave e junta erros de JavaScript.
const puppeteer = require("puppeteer-core");
const EDGE = process.env.NAVEGADOR || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3001";
let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };

const paginas = [
  ["/", /Buscar mesas|Entrar na fila de espera/i],
  ["/consulta", /Consultar minha reserva/i],
  ["/admin", /Gerencie as reservas/i],
  ["/admin/operacao", /modo operação/i],
  // no celular a edição da planta não aparece (é feita no computador): texto que existe nos dois
  ["/admin/mesas", /A planta do salão/i],
  ["/admin/calendario", /Feche o restaurante/i],
  ["/admin/movimento", /Movimento/i],
  ["/admin/clientes", /Histórico básico/i],
  ["/admin/configuracoes", /Estabelecimento/i],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  for (const largura of [1440, 390]) {
    for (const [rota, esperado] of paginas) {
      const page = await browser.newPage();
      await require("./e2e-ajuda.cjs").logar(page); // o painel agora exige login
      const erros = [];
      page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
      await page.setViewport({ width: largura, height: 900, isMobile: largura < 500 });
      await page.goto(BASE + rota, { waitUntil: "networkidle2", timeout: 120000 });
      let achou = true;
      try { await page.waitForFunction((r) => new RegExp(r, "i").test(document.body.innerText), { timeout: 30000 }, esperado.source); } catch { achou = false; }
      const rol = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const relevantes = erros.filter((e) => !/WebSocket|realtime/i.test(e));
      ok(achou && relevantes.length === 0 && rol <= 1, `${String(largura).padStart(4)} px  ${rota.padEnd(22)} ${achou ? "abre" : "NAO ABRIU"}${relevantes.length ? " | ERRO: " + relevantes[0] : ""}${rol > 1 ? ` | rolagem lateral de ${rol}px` : ""}`);
      await page.close();
    }
  }
  // consulta: reserva futura feita no teste anterior aparece com a data certa
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/consulta", { waitUntil: "networkidle2" });
  await page.type("#termo", "Maria Agenda");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Consultar reserva/.test(b.innerText)).click());
  await page.waitForFunction(() => /reserva #/i.test(document.body.innerText), { timeout: 30000 });
  const t = await page.evaluate(() => document.body.innerText);
  ok(/Confirmada/.test(t) && /Cancelar reserva/.test(t), "consulta: reserva futura (feita pelo calendario) aparece Confirmada e pode ser cancelada");
  console.log("        " + (t.match(/(Sexta-feira|Sábado|Domingo), \d\d\/\d\d/) || [""])[0]);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
