// Semeia várias semanas de reservas no Supabase FALSO e confere a tela /admin/movimento.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE = process.env.NAVEGADOR || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3001";
const MOCK = "http://127.0.0.1:54321";

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const soma = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const segunda = (iso) => soma(iso, -((dow(iso) + 6) % 7));
const CHAVE = { 5: "sexta", 6: "sabado", 0: "domingo" };

let semente = 7;
const rnd = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };

const linhas = [];
const segAtual = segunda(hoje);
let totalPorData = {};
for (let w = -5; w <= 1; w++) {
  for (const d of [5, 6, 0]) {
    const data = soma(segAtual, 7 * w + (d === 0 ? 6 : d - 1));
    if (data > soma(segAtual, 7 + 6)) continue;
    const mesas = 5 + Math.floor(rnd() * 11) + (d === 6 ? 3 : 0); // sábado mais cheio
    const passada = data < hoje, eHoje = data === hoje;
    totalPorData[data] = { mesas, pessoas: 0, chegaram: 0 };
    for (let i = 1; i <= mesas; i++) {
      const pessoas = 2 + Math.floor(rnd() * 5);
      const cancelada = rnd() < 0.08;
      const veio = !cancelada && (passada ? rnd() < 0.85 : eHoje ? rnd() < 0.5 : false);
      linhas.push({
        dia: CHAVE[d], data_reserva: data, horario: "12:00", mesa_numero: String(i).padStart(2, "0"),
        pessoas, nome: `Cliente ${data} ${i}`, telefone: `4199${String(1000000 + linhas.length).slice(-7)}`,
        cancelada, checkin_em: veio ? new Date().toISOString() : null,
      });
      if (!cancelada) { totalPorData[data].pessoas += pessoas; if (veio) totalPorData[data].chegaram += pessoas; }
    }
  }
}

(async () => {
  await fetch(MOCK + "/__reset", { method: "POST" });
  await fetch(MOCK + "/__seed", { method: "POST", body: JSON.stringify(linhas) });
  console.log(`semeadas ${linhas.length} reservas; hoje=${hoje}`);

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await require("./e2e-ajuda.cjs").logar(page); // o painel agora exige login
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/admin/movimento", { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(() => document.body.innerText.includes("Pessoas que vieram"), { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("svg[role=img]"), { timeout: 30000 });

  const t = await page.evaluate(() => document.body.innerText);
  ok(/Cada dia, semana contra semana/.test(t), "grafico de comparacao por dia aparece");
  ok(/Total de cada semana/.test(t) && /Dia a dia/.test(t), "totais por semana e tabela noite a noite aparecem");
  ok(/Por área/.test(t) && /Mesas mais reservadas/.test(t), "areas e mesas mais reservadas aparecem");

  // conferir os numeros do cartao "Pessoas reservadas" contra o que semeamos (de 4 semanas atras ate hoje)
  const inicio = soma(segAtual, -21);
  let esperadoPessoas = 0, esperadoChegaram = 0;
  for (const [data, v] of Object.entries(totalPorData)) if (data >= inicio && data <= hoje) { esperadoPessoas += v.pessoas; esperadoChegaram += v.chegaram; }
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("section[aria-label='Resumo do período'] > div")].map((c) => c.innerText.replace(/\s+/g, " ")),
  );
  const num = (s) => Number((s.match(/(\d[\d.]*)/) || [])[1]?.replace(/\./g, ""));
  const vieram = cards.find((c) => /Pessoas que vieram/i.test(c));
  const reservadas = cards.find((c) => /Pessoas reservadas/i.test(c));
  ok(reservadas && num(reservadas.replace(/Pessoas reservadas/i, "")) === esperadoPessoas, `cartao Pessoas reservadas = ${esperadoPessoas} (veio: ${reservadas})`);
  ok(vieram && num(vieram.replace(/Pessoas que vieram/i, "")) === esperadoChegaram, `cartao Pessoas que vieram = ${esperadoChegaram} (veio: ${vieram})`);

  const barras = await page.evaluate(() => document.querySelectorAll("svg[role=img] rect").length);
  ok(barras >= 9, `grafico com barras (${barras})`); // 3 semanas passadas x 3 noites, no minimo (a semana atual so ganha barra depois que a noite acontece)

  await page.screenshot({ path: path.join(__dirname, "_mov-desktop.png"), fullPage: true });

  // trocar periodo e medida
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "8 semanas").click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Mesas reservadas").click());
  await new Promise((r) => setTimeout(r, 600));
  const barras8 = await page.evaluate(() => document.querySelectorAll("svg[role=img] rect").length);
  ok(barras8 > barras, `8 semanas mostra mais barras que 4 (${barras8} > ${barras})`);
  await page.screenshot({ path: path.join(__dirname, "_mov-8sem.png"), fullPage: true });

  // celular
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "4 semanas").click());
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.querySelector("svg[role=img]"), { timeout: 30000 });
  const larguraPagina = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: window.innerWidth }));
  ok(larguraPagina.rolagem <= larguraPagina.janela + 1, `celular sem rolagem lateral da pagina (${larguraPagina.rolagem} <= ${larguraPagina.janela})`);
  await page.screenshot({ path: path.join(__dirname, "_mov-celular.png"), fullPage: true });

  ok(erros.length === 0, `nenhum erro de pagina (${erros.length})${erros.length ? ": " + erros.join(" | ") : ""}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });

