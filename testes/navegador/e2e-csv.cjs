// Clica em "Baixar planilha" e confere o arquivo gerado (contra o Supabase FALSO).
const puppeteer = require("puppeteer-core");

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

(async () => {
  // 3 semanas: 2 passadas e a atual, com check-in nas passadas
  const linhas = [];
  const segAtual = segunda(hoje);
  for (let w = -2; w <= 0; w++) {
    for (const d of [5, 6, 0]) {
      const data = soma(segAtual, 7 * w + (d === 0 ? 6 : d - 1));
      for (let i = 1; i <= 4; i++) {
        linhas.push({
          dia: CHAVE[d], data_reserva: data, horario: "12:00", mesa_numero: String(i).padStart(2, "0"),
          pessoas: 3, nome: `C ${data} ${i}`, telefone: `4199${String(2000000 + linhas.length).slice(-7)}`,
          cancelada: false, checkin_em: data < hoje && i <= 3 ? new Date().toISOString() : null,
        });
      }
    }
  }
  await fetch(MOCK + "/__reset", { method: "POST" });
  await fetch(MOCK + "/__seed", { method: "POST", body: JSON.stringify(linhas) });

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await require("./e2e-ajuda.cjs").logar(page); // o painel agora exige login
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/admin/movimento", { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("Baixar planilha")), { timeout: 60000 });

  // captura o arquivo que o botão gera (nome e conteúdo)
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__arquivo = { blob, tipo: blob.type }; return original(blob); };
    const clique = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__nome = this.download; window.__href = this.href; /* nao navega: so registra */ };
    window.__restaurarClique = () => { HTMLAnchorElement.prototype.click = clique; };
  });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Baixar planilha")).click());
  await page.waitForFunction(() => window.__arquivo && window.__nome, { timeout: 10000 });

  // Blob.text() descarta o BOM ao decodificar: os bytes é que dizem se ele está lá
  const r = await page.evaluate(async () => ({
    nome: window.__nome,
    tipo: window.__arquivo.tipo,
    texto: await window.__arquivo.blob.text(),
    bytes: [...new Uint8Array(await window.__arquivo.blob.arrayBuffer()).slice(0, 3)],
  }));
  const linhasCsv = r.texto.split("\r\n").filter(Boolean);
  console.log(`      arquivo: ${r.nome} | ${linhasCsv.length} linhas`);

  ok(/^movimento-zepelin-\d{4}-\d{2}-\d{2}\.csv$/.test(r.nome), `nome do arquivo sem acento: ${r.nome}`);
  ok(/text\/csv/.test(r.tipo), `tipo ${r.tipo}`);
  ok(r.bytes.join(",") === "239,187,191", `BOM (EF BB BF) nos primeiros bytes do arquivo (${r.bytes.join(",")})`);
  ok(linhasCsv[0].includes("Pessoas que vieram") && linhasCsv[0].includes(";"), "cabecalho com separador ;");
  // 3 semanas x 3 noites; a semana atual tem noites futuras (previstas) e hoje
  const noites = linhasCsv.length - 1;
  ok(noites === 9, `9 noites seedadas (${noites})`);
  // ordem cronologica
  const datas = linhasCsv.slice(1).map((l) => l.split(";")[0].split("/").reverse().join("-"));
  ok(JSON.stringify(datas) === JSON.stringify([...datas].sort()), "linhas em ordem cronologica");
  // uma noite passada: 4 mesas, 12 pessoas, 9 vieram (3 mesas x 3), 3 nao vieram
  const passada = linhasCsv.slice(1).find((l) => l.split(";")[3] === "Realizada");
  ok(passada && passada.split(";").slice(4, 10).join(";") === "4;4;12;9;3;0", `noite realizada = 4 mesas, 12 pessoas, 9 vieram, 3 nao vieram (${passada})`);
  const prevista = linhasCsv.slice(1).find((l) => l.split(";")[3] === "Prevista");
  if (prevista) ok(prevista.split(";")[7] === "" && prevista.split(";")[8] === "", `noite prevista com vieram/nao vieram vazios (${prevista})`);

  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
