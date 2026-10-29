// Fila de espera de ponta a ponta, no site local ligado ao Supabase FALSO.
const path = require("path");
const A = require("./e2e-ajuda.cjs");
const { irParaData } = A;
const { puppeteer, EDGE, BASE, espera, datas, estado, mock, semear, visivel, clicar, digitar, texto, esperarTexto, ir, logar } = A;

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (p, n) => p.screenshot({ path: path.join(__dirname, "_saida", n) });
const lotada = datas[0], livre = datas[1];

async function entrarNaFila(page, nome, telefone) {
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && /Entrar na fila de espera/.test(b.innerText)), { timeout: 60000 });
  await clicar(page, "button", "Entrar na fila de espera");
  await esperarTexto(page, "Não há mesas livres para o seu grupo");
  await digitar(page, "Ex.: Maria Souza", nome);
  await digitar(page, "(41) 99999-9999", telefone);
  await clicar(page, "button", "Entrar na fila de espera");
  await page.waitForFunction(() => location.pathname.startsWith("/fila/"), { timeout: 30000 });
  await page.waitForFunction(() => /Sua posição/i.test(document.body.innerText), { timeout: 30000 });
  return page.evaluate(() => location.pathname.split("/").pop());
}

(async () => {
  await mock("/__reset");
  // todas as 20 mesas da primeira data reservadas: data lotada
  // almoço: 12h e 13h30 tomam todos os horários (cada reserva segura a mesa 1h30)
  await semear(["12:00", "13:30"].flatMap((h, k) => Array.from({ length: 20 }, (_, i) => ({ data_reserva: lotada, horario: h, mesa_numero: String(i + 1).padStart(2, "0"), nome: `Cliente ${i + 1}`, telefone: `419000${k}${String(i).padStart(4, "0")}` }))));

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const nova = async (ctx, rot, cel = false) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => erros.push(`[${rot}] ${String(e.message).slice(0, 160)}`));
    if (cel) await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    else await p.setViewport({ width: 1366, height: 900 });
    return p;
  };

  console.log("--- visitante: data lotada oferece a fila ---");
  const ana = await nova(await browser.createBrowserContext(), "ana", true);
  await ir(ana, "/");
  await ana.waitForFunction(() => /Lotado em/.test(document.body.innerText), { timeout: 60000 });
  ok(/Lotado em .* para 2 pessoas/.test(await texto(ana)), "com todas as mesas tomadas, a tela inicial avisa 'Lotado ... para 2 pessoas'");
  ok(!(await ana.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && /Buscar mesas/.test(b.innerText)))), "e troca 'Buscar mesas' por 'Entrar na fila de espera'");
  await foto(ana, "_fila-lotado-cel.png");
  const codAna = await entrarNaFila(ana, "Ana Lima", "(41) 98888-1111");
  let t = await texto(ana);
  ok(/1º/.test(t) && /Olá, Ana!/.test(t), "Ana entra na fila e cai na pagina dela: posicao 1º");
  const rol = await ana.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(rol <= 1, `pagina de acompanhamento sem rolagem lateral no celular (${rol})`);
  await foto(ana, "_fila-acompanhar.png");

  const beto = await nova(await browser.createBrowserContext(), "beto");
  const codBeto = await entrarNaFila(beto, "Beto Souza", "41977772222");
  ok(/2º/.test(await texto(beto)), "Beto entra depois: posicao 2º");

  const repetido = await nova(await browser.createBrowserContext(), "repetido");
  await ir(repetido, "/");
  await repetido.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && /Entrar na fila de espera/.test(b.innerText)), { timeout: 60000 });
  await clicar(repetido, "button", "Entrar na fila de espera");
  await esperarTexto(repetido, "Não há mesas livres");
  await digitar(repetido, "Ex.: Maria Souza", "Ana de Novo");
  await digitar(repetido, "(41) 99999-9999", "41988881111");
  await clicar(repetido, "button", "Entrar na fila de espera");
  await esperarTexto(repetido, "já está na fila de espera desta data");
  ok(true, "o mesmo telefone nao entra duas vezes (mensagem clara)");

  await (await visivel(repetido, 'select[aria-label="Data"]')).asElement(); // volta e escolhe outra data
  await ir(repetido, "/");
  await repetido.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await (await visivel(repetido, 'select[aria-label="Data"]')).asElement().select(livre);
  await espera(300);
  ok(await repetido.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.offsetParent && /Buscar mesas/.test(b.innerText))), "em outra data, com mesa livre, volta o 'Buscar mesas'");

  let m = await estado();
  ok(!m.log.some((l) => l.quem === "visitante" && ["/rest/v1/fila_espera", "/rest/v1/reservas"].includes(l.caminho)), "o visitante nunca pediu a tabela da fila nem a de reservas");

  console.log("\n--- painel ---");
  const adm = await nova(await browser.createBrowserContext(), "painel");
  await logar(adm);
  await irParaData(adm, lotada);
  await adm.waitForFunction(() => /Fila de espera:/.test(document.body.innerText), { timeout: 30000 });
  ok(/2 pedidos \(4 pessoas\)/.test(await texto(adm)), "a tela de Reservas avisa: 'Fila de espera: 2 pedidos (4 pessoas) para esta data'");
  await clicar(adm, "a", "Ver fila");
  await adm.waitForFunction(() => location.pathname === "/admin/fila" && /Ana Lima/.test(document.body.innerText), { timeout: 30000 });
  t = await texto(adm);
  ok(/Lotado/.test(t) && t.indexOf("Ana Lima") < t.indexOf("Beto Souza") && /\(41\) 98888-1111/.test(t), "a fila do painel mostra os dois, em ordem, com telefone, e a data como 'Lotado'");
  await foto(adm, "_fila-painel.png");

  // alguém cancela: libera a mesa 07
  const r7 = m.reservas.find((r) => r.mesa_numero === "07" && r.data_reserva === lotada);
  await fetch(A.MOCK + "/rest/v1/reservas?id=eq." + r7.id, { method: "PATCH", body: JSON.stringify({ cancelada: true }) });
  await adm.reload({ waitUntil: "networkidle2" });
  await adm.waitForFunction(() => /até 4 lugares livres em algum horário/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "cancelaram a mesa 07 das 12h: a fila mostra até 4 lugares livres em algum horário");

  // chamar no WhatsApp (o link real é trocado para não abrir o WhatsApp de verdade no teste)
  await adm.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) => /Chamar no WhatsApp/.test(x.innerText));
    window.__linkWhatsapp = a.href;
    a.setAttribute("href", "about:blank");
  });
  const link = await adm.evaluate(() => window.__linkWhatsapp);
  ok(/^https:\/\/wa\.me\/5541988881111\?text=/.test(link) && decodeURIComponent(link).includes("/fila/" + codAna), "o botao abre o WhatsApp da Ana com a mensagem e o link da espera dela");
  await clicar(adm, "a", "Chamar no WhatsApp");
  await adm.bringToFront(); // o clique abre uma aba nova; o painel volta para a frente
  await adm.waitForFunction(() => /Chamado/.test(document.body.innerText), { timeout: 20000 });
  ok(true, "Ana passa a 'Chamado' no painel");
  for (const p of await browser.pages()) if (p.url() === "about:blank" && p !== adm) await p.close().catch(() => {});

  await ana.bringToFront();
  await ana.evaluate(() => window.dispatchEvent(new Event("focus")));
  await ana.waitForFunction(() => /Chegou a sua vez/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "na pagina da Ana aparece 'Chegou a sua vez' sem recarregar");
  await foto(ana, "_fila-chamado.png");
  await beto.bringToFront();
  await beto.evaluate(() => window.dispatchEvent(new Event("focus")));
  await beto.waitForFunction(() => /1º/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "Beto sobe para 1º");

  // reservar a mesa liberada para a Ana, pelo painel (aba do painel de volta à frente:
  // o navegador de teste congela aba em segundo plano)
  await adm.bringToFront();
  await clicar(adm, "button", "Reservar mesa");
  await adm.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.placeholder === "Nome do cliente" && i.value === "Ana Lima"), { timeout: 20000 });
  ok(true, "'Reservar mesa' abre a nova reserva ja com nome, telefone e pessoas da Ana, na data dela");
  await espera(400);
  await adm.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && /^07\s*4p$/.test(x.innerText.replace(/\n/g, " ").trim())); b.click(); });
  await clicar(adm, "button", "Confirmar reserva");
  await adm.waitForFunction(() => /Virou reserva|Ninguém na fila|Beto Souza/.test(document.body.innerText) && !document.querySelector('input[placeholder="Nome do cliente"]'), { timeout: 20000 });
  await espera(600);
  m = await estado();
  const reservaAna = m.reservas.find((r) => r.nome === "Ana Lima" && r.mesa_numero === "07" && !r.cancelada);
  const filaAna = m.fila.find((f) => f.codigo === codAna);
  ok(reservaAna && filaAna.status === "atendido" && filaAna.reserva_id === reservaAna.id, "reserva criada na mesa 07 e a espera da Ana vira 'atendido', ligada a reserva");
  await ana.bringToFront();
  await ana.evaluate(() => window.dispatchEvent(new Event("focus")));
  await ana.waitForFunction(() => /Sua mesa está reservada/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "a pagina da Ana mostra 'Sua mesa está reservada'");

  console.log("\n--- sair da fila ---");
  await beto.bringToFront();
  await clicar(beto, "button", "Sair da fila");
  await clicar(beto, "button", "Sim, sair");
  await beto.waitForFunction(() => /Você não está mais na fila/.test(document.body.innerText), { timeout: 20000 });
  ok(true, "Beto sai da fila pela pagina dele");
  await adm.bringToFront();
  await adm.reload({ waitUntil: "networkidle2" });
  await adm.waitForFunction(() => /Ninguém na fila/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "o painel fica sem ninguem na fila");
  await clicar(adm, "button", "Mostrar também as encerradas");
  await espera(300);
  t = await texto(adm);
  ok(/Virou reserva/.test(t) && /Saiu da fila/.test(t), "com 'mostrar encerradas': Ana 'Virou reserva', Beto 'Saiu da fila'");

  console.log("\n--- codigo inventado e celular do painel ---");
  await ir(beto, "/fila/00000000-0000-0000-0000-000000000000");
  await esperarTexto(beto, "Espera não encontrada");
  ok(true, "link com codigo inventado: 'Espera não encontrada'");
  const admCel = await nova(await browser.createBrowserContext(), "painel-cel", true);
  await logar(admCel);
  ok(Boolean(await admCel.$('header a[href="/admin/fila"]')), "no celular, a faixa do topo do painel tem o atalho da fila");

  ok(erros.filter((e) => !/WebSocket|realtime/i.test(e)).length === 0, `nenhum erro de pagina ${erros.join(" | ")}`);
  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
