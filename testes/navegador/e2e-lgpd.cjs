// LGPD, políticas e acessibilidade, no site local ligado ao Supabase FALSO.
const path = require("path");
const fs = require("fs");
const A = require("./e2e-ajuda.cjs");
const { puppeteer, EDGE, BASE, espera, mock, estado, clicar, digitar, texto, esperarTexto, ir, logar } = A;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n), fullPage: false });

// Auditoria automática de acessibilidade (WCAG 2.1 A e AA)
async function auditar(page, nome) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return res.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(" ") + " :: " + (x.failureSummary || "").split("\n")[1]) }));
  });
  ok(r.length === 0, `acessibilidade ${nome}: ${r.length ? r.map((v) => `${v.id}(${v.n}) ${v.ex.join(" | ")}`).join(" ;; ") : "sem problemas"}`);
}

(async () => {
  await mock("/__reset");
  await mock("/__fechar-acesso");
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const pedidosParaFora = [];
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 160)));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith("http://127.0.0.1:54321") && !u.startsWith("data:")) pedidosParaFora.push(u); });
  await page.setViewport({ width: 1366, height: 900 });

  console.log("--- aviso de cookies e rodapé ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 90000 });
  await esperarTexto(page, "armazenamento essencial");
  ok(true, "aviso de cookies aparece na primeira visita");
  const links = await page.evaluate(() => [...document.querySelectorAll("footer a")].filter((a) => a.offsetParent).map((a) => a.getAttribute("href")));
  ok(["/privacidade", "/termos", "/cancelamento", "/privacidade#cookies", "/meus-dados"].every((h) => links.includes(h)), `rodapé com os links das políticas (${links.join(", ")})`);
  ok(/Amintas de Barros/.test(await texto(page)) && !/preencher/.test(await texto(page)), "rodapé mostra endereço e contato, sem [preencher]");
  ok(!/\bReservas\b\s*\n?\s*O ZéPelin/.test(await page.evaluate(() => document.querySelector("nav[aria-label=Principal]")?.innerText ?? "")), "menu do computador sem itens que não levam a lugar nenhum");
  await auditar(page, "página inicial (computador)");
  await foto(page, "_lgpd-inicio.png");
  await clicar(page, "button", "Entendi");
  await espera(200);
  ok(!/armazenamento essencial/.test(await texto(page)), "'Entendi' fecha o aviso");
  await ir(page, "/cardapio");
  ok(!/armazenamento essencial/.test(await texto(page)), "o aviso não volta nas outras páginas");
  ok(/proibida para menores de 18 anos/.test(await texto(page)), "cardápio avisa a proibição de álcool para menores");
  await auditar(page, "cardápio");

  console.log("\n--- teclado ---");
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  const focos = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    focos.push(await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      const caixa = el.closest(".campo-foco");
      const anel = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (caixa && getComputedStyle(caixa).boxShadow !== "none");
      return { rotulo: (el.getAttribute("aria-label") || el.innerText || el.tagName).trim().slice(0, 25), anel };
    }));
  }
  ok(focos.every((f) => f.anel), `Tab percorre o site com contorno visível: ${focos.map((f) => `${f.rotulo}${f.anel ? "" : " (SEM CONTORNO)"}`).join(" → ")}`);
  await page.keyboard.press("Tab");
  await foto(page, "_lgpd-foco.png");

  console.log("\n--- formulário da reserva ---");
  const opcoes = await page.evaluate(() => [...document.querySelector('select[aria-label="Data"]').options].map((o) => ({ v: o.value, t: o.textContent })));
  await (await A.visivel(page, 'select[aria-label="Data"]')).asElement().select(opcoes.find((o) => !/fechado/i.test(o.t) && o.v !== "outra").v);
  await espera(300);
  await clicar(page, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  await clicar(page, "button", "Continuar");
  await page.waitForSelector("button[data-mesa]", { timeout: 60000 });
  await espera(500);
  const livre = await page.evaluate(() => [...document.querySelectorAll("button[data-mesa]")].find((b) => b.offsetParent && !b.disabled)?.dataset.mesa);
  await clicar(page, `button[data-mesa="${livre}"]`);
  await espera(200);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  const t = await texto(page);
  ok(!/e-mail/i.test(t), "o formulário não pede mais e-mail");
  ok(/Usamos seu nome e WhatsApp só para cuidar da sua reserva/.test(t), "explica para que servem os dados");
  ok(/Só para lembrarmos da data/.test(t), "explica para que serve o aniversário");
  const semRotulo = await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].filter((e) => e.offsetParent && !(e.labels && e.labels.length) && !e.getAttribute("aria-label")).length);
  ok(semRotulo === 0, `todo campo visível tem nome ligado a ele (${semRotulo} sem)`);
  await auditar(page, "dados da reserva");
  await digitar(page, "Ex.: Maria Souza", "Ana Teste Lgpd");
  await digitar(page, "(41) 99999-9999", "41 9");
  await espera(200);
  const invalido = await page.evaluate(() => { const e = [...document.querySelectorAll('input[autocomplete="tel"]')].find((x) => x.offsetParent); const id = e.getAttribute("aria-describedby"); return e.getAttribute("aria-invalid") === "true" && id && document.getElementById(id.split(" ")[0])?.innerText; });
  ok(Boolean(invalido), `telefone errado: campo marcado como inválido e aviso lido junto ("${invalido}")`);
  await digitar(page, "(41) 99999-9999", "(41) 97777-0001");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => a.offsetParent).map((a) => a.getAttribute("href")));
  ok(/Ao confirmar, você aceita os Termos de uso/.test(await texto(page)) && ["/termos", "/cancelamento", "/privacidade"].every((h) => hrefs.includes(h)), "antes de confirmar: aceite dos termos com links");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  ok(/Sua mesa está reservada/.test(await texto(page)) && !/garantida/.test(await texto(page)), "confirmação sem prometer 'garantida', com a tolerância");
  let s = await estado();
  ok(s.chamadas.length ? s.chamadas.every((c) => !c.p_email) : true, "nenhum e-mail foi enviado ao banco");

  console.log("\n--- páginas de política ---");
  for (const [caminho, titulo] of [["/privacidade", "Política de privacidade"], ["/termos", "Termos de uso"], ["/cancelamento", "Cancelamento e reembolso"], ["/meus-dados", "Meus dados"]]) {
    await ir(page, caminho);
    const h1 = await page.evaluate(() => document.querySelector("h1")?.innerText);
    ok(h1 === titulo, `${caminho} abre ("${h1}")`);
    await auditar(page, caminho);
  }
  await ir(page, "/privacidade");
  const pend = await page.evaluate(() => document.querySelectorAll("mark").length);
  console.log(`      (dados da empresa ainda pendentes: ${pend} lugares destacados em amarelo)`);
  await foto(page, "_lgpd-privacidade.png");

  console.log("\n--- pedido para apagar os dados ---");
  await ir(page, "/meus-dados");
  await page.type('input[autocomplete="name"]', "Ana Teste Lgpd");
  await page.type('input[autocomplete="tel"]', "41977770001");
  await page.type("textarea", "Quero sair da lista");
  await clicar(page, 'button[type="submit"]', "Enviar pedido");
  await esperarTexto(page, "Pedido recebido");
  const protocolo = (await texto(page)).match(/Protocolo ([0-9A-F]{8})/)?.[1];
  ok(Boolean(protocolo), `pedido enviado, protocolo ${protocolo}`);
  await foto(page, "_lgpd-meus-dados.png");

  console.log("\n--- painel: atender o pedido ---");
  await logar(page);
  ok(!/armazenamento essencial/.test(await texto(page)), "o aviso de cookies não aparece no painel");
  await ir(page, "/admin/clientes");
  await page.waitForFunction(() => /Ana Teste Lgpd/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "antes: Ana aparece em Clientes");
  await ir(page, "/admin/configuracoes");
  await esperarTexto(page, "Pedidos sobre dados");
  await page.waitForFunction(() => /Apagar meus dados · Ana Teste Lgpd/.test(document.body.innerText), { timeout: 30000 });
  ok(new RegExp(`protocolo ${protocolo}`).test(await texto(page)), "o pedido aparece no painel com o mesmo protocolo");
  const whats = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Confirmar pelo WhatsApp/.test(a.innerText))?.href ?? "");
  ok(/wa\.me\/5541977770001/.test(whats), "botão abre o WhatsApp do cliente para confirmar");
  await clicar(page, "button", "2. Apagar os dados");
  await esperarTexto(page, "Não dá para desfazer");
  await clicar(page, "button", "Sim, apagar");
  await esperarTexto(page, "Dados apagados:");
  ok(/1 reserva sem nome e telefone, 1 futura cancelada/.test(await texto(page)), "apagou: 1 reserva sem nome e telefone e a futura cancelada");
  await foto(page, "_lgpd-painel.png");
  await clicar(page, "button", "Marcar como respondido");
  await page.waitForFunction(() => /Nenhum pedido em aberto/.test(document.body.innerText), { timeout: 20000 });
  ok(true, "pedido marcado como respondido");
  s = await estado();
  const r = s.reservas.find((x) => x.nome === "Dados removidos");
  ok(r && r.telefone === "" && r.cancelada && s.pedidos[0].status === "concluido" && /apagad/i.test(s.pedidos[0].nota || ""), "no banco: sem nome/telefone, cancelada, pedido concluído com o registro do que foi feito");
  await ir(page, "/admin/clientes");
  await espera(1500);
  ok(!/Ana Teste Lgpd|Dados removidos/.test(await texto(page)), "depois: Ana sumiu de Clientes (e não aparece 'Dados removidos')");

  console.log("\n--- celular ---");
  const cel = await (await browser.createBrowserContext()).newPage();
  cel.on("pageerror", (e) => erros.push("[cel] " + String(e.message).slice(0, 160)));
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const c of ["/", "/privacidade", "/meus-dados"]) {
    await ir(cel, c);
    await espera(800);
    const rol = await cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(rol <= 1, `${c} no celular sem rolagem para o lado (${rol})`);
  }
  await ir(cel, "/");
  await espera(800);
  await auditar(cel, "página inicial (celular)");
  await foto(cel, "_lgpd-cel.png");

  ok(pedidosParaFora.length === 0, `nenhum pedido a servidor de terceiros (rastreamento) ${pedidosParaFora.slice(0, 3).join(", ")}`);
  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de página ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
