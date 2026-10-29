// Ferramentas comuns dos testes de ponta a ponta. Tudo roda contra o site local
// (localhost:3001) ligado ao Supabase FALSO (banco-falso.cjs) — nunca contra
// o banco real.
const puppeteer = require("puppeteer-core");
const { ADMIN, NAO_ADMIN } = require("./e2e-contas.cjs");

// navegador usado nos testes: o Edge do Windows (ou outro, com NAVEGADOR=caminho)
const EDGE = process.env.NAVEGADOR || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
// fotos que os testes tiram ficam em testes/navegador/_saida (fora do git)
require("fs").mkdirSync(require("path").join(__dirname, "_saida"), { recursive: true });
const BASE = "http://localhost:3001";
const MOCK = "http://127.0.0.1:54321";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const soma = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const CHAVE = { 5: "sexta", 6: "sabado", 0: "domingo" };
// as datas que o cliente pode reservar: sábados (almoço), de amanhã a 60 dias
const datas = []; for (let i = 1; i <= 60; i++) { const d = soma(hoje, i); if ([6].includes(dow(d))) datas.push(d); }

const estado = async () => (await fetch(MOCK + "/__log")).json();
const mock = (caminho, corpo) => fetch(MOCK + caminho, { method: "POST", body: corpo === undefined ? undefined : JSON.stringify(corpo) });
const semear = (linhas) => mock("/__seed", linhas.map((r) => ({ horario: "12:00", pessoas: 2, dia: CHAVE[dow(r.data_reserva)], ...r })));

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
const ir = (page, caminho) => page.goto(BASE + caminho, { waitUntil: "networkidle2", timeout: 120000 });

// Preenche a tela de login do painel. Não espera o painel abrir: quem chama
// decide o que esperar (painel, "sem acesso", senha errada…).
async function preencherLogin(page, conta, senha = conta.senha) {
  await page.waitForSelector("#login-email", { timeout: 60000 });
  for (const [id, valor] of [["#login-email", conta.email], ["#login-senha", senha]]) {
    await page.focus(id);
    await page.$eval(id, (e) => e.select());
    await page.keyboard.press("Backspace");
    await page.type(id, valor);
  }
  await clicar(page, 'button[type="submit"]', "Entrar");
}

// Deixa a página logada como administrador (se já estiver, não faz nada).
async function logar(page, conta = ADMIN) {
  await ir(page, "/admin");
  await page.waitForFunction(() => /Gerencie as reservas/.test(document.body.innerText) || document.querySelector("#login-email"), { timeout: 90000 });
  if (/Gerencie as reservas/.test(await texto(page))) return;
  await preencherLogin(page, conta);
  await esperarTexto(page, "Gerencie as reservas", 60000);
}

// Faz o próximo "Baixar…" entregar o arquivo ao teste em vez de salvar no disco.
async function prepararCaptura(page) {
  await page.evaluate(() => {
    window.__arquivo = null; window.__nome = null;
    if (window.__capturando) return;
    window.__capturando = true;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__arquivo = blob; return original(blob); };
    HTMLAnchorElement.prototype.click = function () { window.__nome = this.download; };
  });
}
async function arquivoBaixado(page) {
  await page.waitForFunction(() => window.__arquivo && window.__nome, { timeout: 20000 });
  const r = await page.evaluate(async () => ({
    nome: window.__nome,
    texto: await window.__arquivo.text(),
    bytes: [...new Uint8Array(await window.__arquivo.arrayBuffer()).slice(0, 3)],
  }));
  return { ...r, linhas: r.texto.split("\r\n").filter(Boolean) };
}

// Etapa "Que horas vocês chegam?" (almoço): escolhe o horário e segue.
async function escolherHorario(page, horario = "12h") {
  await esperarTexto(page, "Que horas vocês chegam?");
  const h = await page.evaluateHandle((x) => [...document.querySelectorAll('[role="radio"]')].find((b) => b.offsetParent && b.innerText.split(String.fromCharCode(10))[0].trim() === x) || null, horario);
  const el = h.asElement();
  if (!el) throw new Error("nao achei o horario " + horario);
  await el.click();
  await espera(150);
}

// No painel, vai até a data pedida (o painel abre no dia de hoje quando hoje é
// dia de funcionamento).
async function irParaData(page, iso) {
  for (let i = 0; i < 12; i++) {
    const atual = await page.evaluate(() => document.querySelector('button[title="Abrir o calendário"]')?.innerText ?? "");
    if (atual.includes(curta(iso))) return;
    await page.click('button[aria-label="Próximo dia"]');
    await espera(250);
  }
  throw new Error("nao achei a data " + iso + " no painel");
}

module.exports = { escolherHorario, irParaData, puppeteer, EDGE, BASE, MOCK, ADMIN, NAO_ADMIN, espera, hoje, soma, dow, curta, CHAVE, datas, estado, mock, semear, visivel, clicar, digitar, texto, esperarTexto, marcador, pressionado, ir, preencherLogin, logar, prepararCaptura, arquivoBaixado };
