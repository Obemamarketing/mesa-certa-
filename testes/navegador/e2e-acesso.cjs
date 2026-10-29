// Ponta a ponta do login do painel e do site do cliente sem acesso direto às
// reservas. Roda no site local ligado ao Supabase FALSO — nunca no banco real.
const path = require("path");
const A = require("./e2e-ajuda.cjs");
const { irParaData } = A;
const { puppeteer, EDGE, BASE, ADMIN, NAO_ADMIN, espera, hoje, soma, dow, curta, datas, estado, mock, semear, visivel, clicar, digitar, texto, esperarTexto, marcador, pressionado, ir, preencherLogin, logar, prepararCaptura, arquivoBaixado } = A;

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const foto = (page, nome) => page.screenshot({ path: path.join(__dirname, nome) });

const primeira = datas[0], segunda = datas[1];
// uma sexta que já passou, para ter "compareceu" e "faltou" nas planilhas
let passada = soma(hoje, -1); while (dow(passada) !== 5) passada = soma(passada, -1);

// o visitante (ou qualquer um) pediu a TABELA de reservas?
const pedidosDaTabela = (log, quem) => log.filter((l) => l.caminho === "/rest/v1/reservas" && (!quem || l.quem === quem));

(async () => {
  console.log(`hoje=${hoje}  primeira=${primeira}  segunda=${segunda}  sexta passada=${passada}`);
  await mock("/__reset");
  await semear([
    { data_reserva: primeira, mesa_numero: "02", nome: "Primeira Data", telefone: "41999990001" },
    { data_reserva: segunda, mesa_numero: "07", pessoas: 4, nome: "Maria Consulta Souza", telefone: "(41) 98888-4321" },
    { data_reserva: segunda, mesa_numero: "08", pessoas: 3, nome: "Maria Consulta Souza", telefone: "(41) 98888-4321" },
    { data_reserva: passada, mesa_numero: "01", pessoas: 4, nome: "Cliente Antigo", telefone: "41977770001", email: "antigo@exemplo.com", aniversario: "05/11", checkin_em: new Date().toISOString() },
    { data_reserva: passada, mesa_numero: "03", pessoas: 2, nome: "Faltou Silva", telefone: "41977770002", observacao: "=1+1; \"teste\"" },
  ]);

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
  const erros = [];
  const novaPagina = async (ctx, rotulo) => { const p = await ctx.newPage(); p.on("pageerror", (e) => erros.push(`[${rotulo}] ${String(e.message).slice(0, 200)}`)); return p; };

  // =====================================================================
  console.log("\n=== A) VISITANTE: reservar sem nunca ler a tabela de reservas ===");
  const ctxCliente = await browser.createBrowserContext();
  const page = await novaPagina(ctxCliente, "cliente");
  await page.setViewport({ width: 1366, height: 900 });
  await ir(page, "/");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await clicar(page, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  await clicar(page, "button", "Continuar");
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("01"));
  await espera(700);
  await clicar(page, marcador("02"));
  await espera(250);
  ok(/mesa 02 já está reservada/i.test(await texto(page)), "a planta do visitante mostra a mesa 02 como reservada (veio de mesas_ocupadas)");
  await clicar(page, marcador("01"));
  await espera(250);
  ok(await pressionado(page, marcador("01")), "mesa 01 livre: seleciona");
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Vera Visitante");
  await digitar(page, "(41) 99999-9999", "(41) 97777-1111");
  await digitar(page, "dd/mm", "2012");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  let m = await estado();
  const vera = m.reservas.find((r) => r.nome === "Vera Visitante");
  ok(vera && vera.data_reserva === primeira && vera.mesa_numero === "01" && vera.aniversario === "20/12", `reserva gravada: mesa ${vera && vera.mesa_numero} em ${vera && vera.data_reserva}, aniversario ${vera && vera.aniversario}`);
  const chamada = m.chamadas.find((c) => c.p_nome === "Vera Visitante");
  ok(chamada && chamada.quem === "visitante" && JSON.stringify(chamada.p_mesas) === '[{"numero":"01","pessoas":2}]', "a reserva foi feita pela funcao 'reservar', como visitante, numa chamada so");
  ok(pedidosDaTabela(m.log).length === 0, `o site do cliente NAO pediu a tabela de reservas nenhuma vez (${pedidosDaTabela(m.log).length} pedidos)`);
  ok(m.log.some((l) => l.caminho === "/rest/v1/rpc/mesas_ocupadas"), "as mesas ocupadas vieram da funcao mesas_ocupadas");

  console.log("\n--- grupo de 7: uma das mesas e levada por outra pessoa na hora de confirmar ---");
  await clicar(page, "button", "Fazer nova reserva");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Pessoas"]')].some((s) => s.offsetParent), { timeout: 30000 });
  await (await visivel(page, 'select[aria-label="Pessoas"]')).asElement().select("7");
  await clicar(page, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  await clicar(page, "button", "Continuar");
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("05"));
  await espera(700);
  await clicar(page, marcador("01"));
  await espera(250);
  ok(/mesa 01 já está reservada/i.test(await texto(page)), "a mesa que o proprio visitante acabou de reservar ja aparece tomada na planta");
  await clicar(page, marcador("05"));
  await espera(200);
  await clicar(page, marcador("06"));
  await espera(250);
  ok((await pressionado(page, marcador("05"))) && (await pressionado(page, marcador("06"))), "grupo de 7 escolhe as mesas 05 (6 lugares) e 06");
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  await digitar(page, "Ex.: Maria Souza", "Grupo Sete");
  await digitar(page, "(41) 99999-9999", "41966662222");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  await mock("/__tomar-na-proxima-reserva", { mesa: "06" }); // outro cliente leva a 06 neste instante
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Uma das mesas acabou de ser reservada por outra pessoa");
  ok(true, "aviso: 'Uma das mesas acabou de ser reservada por outra pessoa. Nada foi reservado…'");
  await espera(300);
  m = await estado();
  ok(!m.reservas.some((r) => r.nome === "Grupo Sete"), "NENHUMA mesa do grupo ficou reservada (tudo ou nada — antes podia sobrar metade)");
  ok((await pressionado(page, marcador("05"))) && !(await pressionado(page, marcador("06"))), "o visitante voltou para a planta: a 05 continua escolhida e a 06, que foi levada, saiu da escolha");
  ok(/Falta 1 lugar/.test(await texto(page)), "e a tela diz que falta 1 lugar");
  await foto(page, "_ac-mesa-tomada.png");
  await clicar(page, marcador("06"));
  await espera(250);
  ok(/mesa 06 já está reservada/i.test(await texto(page)), "a 06 agora aparece como reservada");
  await clicar(page, marcador("04"));
  await espera(250);
  await clicar(page, "button", "Continuar");
  await esperarTexto(page, "Quase tudo pronto");
  ok((await (await visivel(page, "input", "Ex.: Maria Souza")).asElement().evaluate((i) => i.value)) === "Grupo Sete", "os dados que a pessoa ja tinha digitado continuam la");
  await clicar(page, "button", "Revisar reserva");
  await esperarTexto(page, "Revise sua reserva");
  await clicar(page, "button", "Confirmar reserva");
  await esperarTexto(page, "Reserva confirmada!");
  m = await estado();
  const grupo = m.reservas.filter((r) => r.nome === "Grupo Sete").sort((a, b) => a.mesa_numero.localeCompare(b.mesa_numero));
  ok(grupo.length === 2 && grupo[0].mesa_numero === "04" && grupo[0].pessoas === 1 && grupo[1].mesa_numero === "05" && grupo[1].pessoas === 6, `grupo gravado em duas mesas: ${grupo.map((r) => `${r.mesa_numero} (${r.pessoas})`).join(" + ")}`);
  ok(m.chamadas.filter((c) => c.p_nome === "Grupo Sete").pop().p_mesas.length === 2, "as duas mesas foram numa unica chamada (uma transacao)");
  ok(/04 e 05/.test(await texto(page)), "confirmacao mostra as mesas 04 e 05");

  console.log("\n--- a planta se atualiza sozinha ---");
  await clicar(page, "button", "Fazer nova reserva");
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Pessoas"]')].some((s) => s.offsetParent), { timeout: 30000 });
  await clicar(page, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(page);
  await clicar(page, "button", "Continuar");
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("09"));
  await espera(500);
  await semear([{ data_reserva: primeira, mesa_numero: "09", nome: "Chegou Depois", telefone: "41955550000" }]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); // a pessoa volta pra aba
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent && /reservada|indispon/i.test(b.getAttribute("aria-label"))), { timeout: 15000 }, marcador("09")).catch(() => {});
  await clicar(page, marcador("09"));
  await espera(250);
  ok(/mesa 09 já está reservada/i.test(await texto(page)), "reserva feita por outra pessoa aparece na planta quando o visitante volta pra aba (sem recarregar)");

  // =====================================================================
  console.log("\n=== B) VISITANTE: consultar e cancelar com o final do telefone ===");
  await ir(page, "/consulta");
  await digitar(page, "Ex.: Maria Souza", "maria consulta");
  await clicar(page, "button", "Consultar reserva");
  await page.waitForFunction(() => document.querySelectorAll("article").length === 2, { timeout: 30000 });
  let t = await texto(page);
  ok(t.includes("Mesa 07") && t.includes("Mesa 08") && t.includes(curta(segunda)), "consulta por 'maria consulta' acha as duas mesas da reserva");
  ok(!/98888|4321|Maria Consulta Souza/.test(t), "a tela nao mostra telefone nem nome de quem reservou");
  m = await estado();
  const respostaConsulta = m.log.filter((l) => l.caminho === "/rest/v1/rpc/consultar_reservas").length;
  ok(respostaConsulta >= 1 && pedidosDaTabela(m.log).length === 0, "a consulta foi pela funcao consultar_reservas; a tabela continua sem ser pedida");

  const cartao = (mesa) => `article:has(dd)`; // os cartões são poucos: acha pelo texto
  const noCartao = async (mesa, seletor, filtro) => {
    const h = await page.evaluateHandle((mesa, sel, f) => {
      const art = [...document.querySelectorAll("article")].find((a) => a.innerText.includes(`Mesa ${mesa}`));
      return art ? [...art.querySelectorAll(sel)].find((el) => !f || el.innerText.includes(f)) || null : null;
    }, mesa, seletor, filtro || "");
    return h.asElement();
  };
  void cartao;
  await (await noCartao("07", "button", "Cancelar reserva")).click();
  await espera(200);
  let botaoSim = await noCartao("07", "button", "Sim, cancelar");
  ok(await botaoSim.evaluate((b) => b.disabled), "sem os 4 digitos, 'Sim, cancelar' fica travado");
  ok(/4 últimos números do telefone/.test(await texto(page)), "a tela pede os 4 ultimos numeros do telefone da reserva");
  const campo = await noCartao("07", "input");
  await campo.type("0000");
  await (await noCartao("07", "button", "Sim, cancelar")).click();
  await esperarTexto(page, "não conferem com o telefone");
  m = await estado();
  ok(m.reservas.find((r) => r.mesa_numero === "07" && r.data_reserva === segunda).cancelada === false, "digitos errados: recusado, a reserva continua de pe");
  await foto(page, "_ac-consulta-digitos.png");
  await campo.focus();
  await campo.evaluate((e) => e.select());
  await page.keyboard.press("Backspace");
  await campo.type("43a21"); // letra no meio: o campo só aceita número
  ok((await campo.evaluate((i) => i.value)) === "4321", "o campo so aceita numeros (43a21 vira 4321)");
  await (await noCartao("07", "button", "Sim, cancelar")).click();
  await page.waitForFunction(() => [...document.querySelectorAll("article")].some((a) => a.innerText.includes("Mesa 07") && a.innerText.includes("Cancelada")), { timeout: 20000 });
  m = await estado();
  ok(m.reservas.find((r) => r.mesa_numero === "07" && r.data_reserva === segunda).cancelada === true, "digitos certos: reserva cancelada");
  await (await noCartao("08", "button", "Cancelar reserva")).click();
  await espera(200);
  ok((await (await noCartao("08", "input")).evaluate((i) => i.value)) === "4321", "na segunda mesa do mesmo cliente os digitos ja vem preenchidos");
  await (await noCartao("08", "button", "Sim, cancelar")).click();
  await page.waitForFunction(() => [...document.querySelectorAll("article")].every((a) => a.innerText.includes("Cancelada")), { timeout: 20000 });
  ok(true, "segunda mesa cancelada tambem");
  await digitar(page, "Ex.: Maria Souza", "fulano inexistente");
  await clicar(page, "button", "Consultar reserva");
  await esperarTexto(page, "Reserva não encontrada");
  ok(true, "nome que nao existe: 'Reserva nao encontrada'");
  m = await estado();
  ok(pedidosDaTabela(m.log).length === 0, "visitante terminou reserva, consulta e cancelamento sem pedir a tabela de reservas");

  // =====================================================================
  console.log("\n=== C) PAINEL: so entra com login de administrador ===");
  const ctxPainel = await browser.createBrowserContext();
  const adm = await novaPagina(ctxPainel, "painel");
  await adm.setViewport({ width: 1440, height: 1000 });
  await mock("/__limpar-log");
  await ir(adm, "/admin");
  await adm.waitForSelector("#login-email", { timeout: 60000 });
  t = await texto(adm);
  ok(/Painel do ZéPelin/.test(t) && /Área restrita/.test(t) && !/Gerencie as reservas|Nova reserva/.test(t), "/admin sem login mostra a tela de entrada, e nada do painel");
  await foto(adm, "_ac-login.png");
  for (const rota of ["/admin/clientes", "/admin/movimento", "/admin/operacao", "/admin/mesas", "/admin/calendario", "/admin/configuracoes"]) {
    await ir(adm, rota);
    await adm.waitForSelector("#login-email", { timeout: 60000 });
    t = await texto(adm);
    if (/Primeira Data|Cliente Antigo|Vera Visitante|Baixar/.test(t)) ok(false, `${rota} sem login mostrou dado do painel`);
  }
  ok(true, "clientes, movimento, operacao, mesas, calendario e configuracoes: todas pedem login, nenhuma mostra dado");
  m = await estado();
  ok(pedidosDaTabela(m.log).length === 0, "sem login, o painel nem chega a pedir as reservas ao banco");

  await ir(adm, "/admin");
  await adm.waitForSelector("#login-email", { timeout: 60000 });
  await preencherLogin(adm, ADMIN, "senha-errada-de-proposito");
  await esperarTexto(adm, "E-mail ou senha incorretos.");
  ok(!/Gerencie as reservas/.test(await texto(adm)), "senha errada: 'E-mail ou senha incorretos.' e continua fora");

  await preencherLogin(adm, NAO_ADMIN);
  await esperarTexto(adm, "Esta conta não tem acesso ao painel");
  t = await texto(adm);
  ok(t.includes(NAO_ADMIN.email) && !/Gerencie as reservas|Primeira Data/.test(t), "conta que nao e administradora: entra no Supabase mas NAO no painel");
  m = await estado();
  ok(pedidosDaTabela(m.log, NAO_ADMIN.email).length === 0, "e o painel nao pediu as reservas em nome dela");
  await foto(adm, "_ac-sem-permissao.png");
  await clicar(adm, "button", "Sair e entrar com outra conta");
  await adm.waitForSelector("#login-email", { timeout: 20000 });
  ok(true, "'Sair e entrar com outra conta' volta para a tela de entrada");

  await preencherLogin(adm, ADMIN);
  await esperarTexto(adm, "Gerencie as reservas", 60000);
  await adm.waitForFunction(() => /Vera Visitante/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "administrador entra e ve as reservas (com nome)");
  ok((await texto(adm)).includes(ADMIN.email), "a barra lateral mostra quem esta logado");
  m = await estado();
  ok(pedidosDaTabela(m.log, ADMIN.email).length > 0 && pedidosDaTabela(m.log, "visitante").length === 0, "as reservas foram pedidas com o login do administrador, nunca como visitante");
  await foto(adm, "_ac-painel.png");
  await adm.reload({ waitUntil: "networkidle2" });
  await esperarTexto(adm, "Gerencie as reservas", 60000);
  ok(!(await adm.$("#login-email")), "recarregar a pagina mantem o login");

  console.log("\n--- painel logado: cancelar, registrar chegada e nova reserva ---");
  await irParaData(adm, primeira);
  await adm.waitForFunction(() => [...document.querySelectorAll("section button")].some((b) => b.innerText.includes("Vera Visitante")), { timeout: 30000 });
  await clicar(adm, "section button", "Vera Visitante");
  await esperarTexto(adm, "Cliente chegou");
  await clicar(adm, "button", "Cliente chegou");
  await adm.waitForFunction(() => /Desfazer check-in/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await espera(400);
  m = await estado();
  ok(Boolean(m.reservas.find((r) => r.nome === "Vera Visitante").checkin_em), "'Cliente chegou' gravou a chegada");
  await ir(adm, "/admin");
  await irParaData(adm, primeira);
  await adm.waitForFunction(() => [...document.querySelectorAll("section button")].some((b) => b.innerText.includes("Primeira Data")), { timeout: 30000 });
  await clicar(adm, "section button", "Primeira Data");
  await esperarTexto(adm, "Cancelar reserva");
  await clicar(adm, "button", "Cancelar reserva");
  await clicar(adm, "button", "Sim, cancelar");
  await adm.waitForFunction(async () => true);
  await espera(900);
  m = await estado();
  ok(m.reservas.find((r) => r.nome === "Primeira Data").cancelada === true, "o painel cancela reserva sem pedir telefone (e administrador)");
  ok(m.log.some((l) => l.metodo === "PATCH" && l.caminho === "/rest/v1/reservas" && l.quem === ADMIN.email), "a alteracao foi feita com o login do administrador");

  await ir(adm, "/admin");
  await esperarTexto(adm, "Gerencie as reservas");
  await clicar(adm, "button", "Nova reserva");
  await esperarTexto(adm, "Nome do cliente").catch(() => {});
  await adm.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.placeholder === "Nome do cliente"), { timeout: 20000 });
  await espera(400);
  await adm.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && /^11\s*4p$/.test(x.innerText.replace(/\n/g, " ").trim())); b.click(); });
  await digitar(adm, "Nome do cliente", "Balcao Painel");
  await digitar(adm, "Telefone", "41933334444");
  await clicar(adm, "button", "Confirmar reserva");
  await adm.waitForFunction(() => ![...document.querySelectorAll("input")].some((i) => i.placeholder === "Nome do cliente"), { timeout: 20000 }).catch(() => {});
  await espera(500);
  m = await estado();
  const balcao = m.reservas.find((r) => r.nome === "Balcao Painel");
  const chBalcao = m.chamadas.find((c) => c.p_nome === "Balcao Painel");
  ok(balcao && balcao.mesa_numero === "11" && chBalcao && chBalcao.quem === ADMIN.email, `'Nova reserva' do painel grava pela mesma funcao, logado (mesa ${balcao && balcao.mesa_numero})`);

  // =====================================================================
  console.log("\n=== D) PLANILHAS de clientes, reservas e movimento ===");
  await ir(adm, "/admin/clientes");
  await esperarTexto(adm, "Cliente Antigo");
  await prepararCaptura(adm);
  await clicar(adm, "button", "Baixar planilha");
  let arq = await arquivoBaixado(adm);
  console.log(`      ${arq.nome} | ${arq.linhas.length} linhas`);
  ok(/^clientes-zepelin-\d{4}-\d{2}-\d{2}\.csv$/.test(arq.nome), `arquivo de clientes: ${arq.nome}`);
  ok(arq.bytes.join(",") === "239,187,191", "com BOM (acentos certos no Excel)");
  ok(arq.linhas[0] === "Nome;Telefone;E-mail;Aniversário;Dias reservados;Compareceu;Não compareceu;Cancelou;Primeira reserva;Última visita;Próxima reserva", "cabecalho de clientes");
  const linhaAntigo = arq.linhas.find((l) => l.startsWith("Cliente Antigo;"));
  ok(linhaAntigo === `Cliente Antigo;(41) 97777-0001;antigo@exemplo.com;05/11;1;1;0;0;${passada.split("-").reverse().join("/")};${passada.split("-").reverse().join("/")};`, `linha do cliente que veio: ${linhaAntigo}`);
  ok(arq.linhas.some((l) => l.startsWith("Faltou Silva;(41) 97777-0002;;;1;0;1;0;")), "quem faltou aparece com 1 falta");
  ok(arq.linhas.some((l) => l.startsWith("Maria Consulta Souza;(41) 98888-4321;;;0;0;0;1;")), "quem cancelou as duas mesas da mesma noite conta UM cancelamento");
  ok(/Planilha baixada: \d+ clientes\./.test(await texto(adm)), "a tela confirma: 'Planilha baixada: N clientes.'");
  const nClientes = arq.linhas.length - 1;

  await ir(adm, "/admin");
  await esperarTexto(adm, "Todas as reservas, de todas as datas, em planilha");
  await prepararCaptura(adm);
  await clicar(adm, "button", "Baixar planilha");
  arq = await arquivoBaixado(adm);
  console.log(`      ${arq.nome} | ${arq.linhas.length} linhas`);
  m = await estado();
  ok(/^reservas-zepelin-\d{4}-\d{2}-\d{2}\.csv$/.test(arq.nome) && arq.linhas.length - 1 === m.reservas.length, `planilha de reservas tem TODAS as ${m.reservas.length} reservas (passadas, futuras e canceladas)`);
  ok(arq.linhas[0].startsWith("Data;Dia da semana;Horário;Mesa;Área;Pessoas;Nome;Telefone;E-mail;Aniversário;Observação;Situação;"), "cabecalho de reservas");
  const linhaFaltou = arq.linhas.find((l) => l.includes("Faltou Silva"));
  ok(linhaFaltou.includes(`;"'=1+1; ""teste""";Não compareceu;`), "observacao com formula e ; chega neutralizada e sem quebrar as colunas");
  ok(arq.linhas.some((l) => l.includes("Cliente Antigo") && l.includes(";Compareceu;")) && arq.linhas.some((l) => l.includes("Primeira Data") && l.includes(";Cancelada;")), "situacao de cada reserva: Compareceu, Cancelada…");

  await ir(adm, "/admin/configuracoes");
  await esperarTexto(adm, "Cópia dos dados");
  t = await texto(adm);
  ok(t.includes(ADMIN.email) && !/maninho/i.test(t), "Configuracoes > Acesso mostra o e-mail de quem esta logado (nao mais um nome fixo)");
  await esperarTexto(adm, "Proteção do banco pendente");
  ok(true, "com o banco ainda aberto (parte 2 por rodar), a tela avisa: 'Protecao do banco pendente'");
  await foto(adm, "_ac-configuracoes.png");
  const baixarDoCartao = async (titulo) => {
    await prepararCaptura(adm);
    await adm.evaluate((titulo) => {
      const li = [...document.querySelectorAll("li")].find((x) => x.querySelector("span")?.innerText.trim() === titulo);
      li.querySelector("button").click();
    }, titulo);
    return arquivoBaixado(adm);
  };
  arq = await baixarDoCartao("Clientes");
  ok(arq.nome.startsWith("clientes-zepelin-") && arq.linhas.length - 1 === nClientes, `Configuracoes > Clientes baixa a mesma planilha (${arq.linhas.length - 1} clientes)`);
  arq = await baixarDoCartao("Reservas");
  ok(arq.nome.startsWith("reservas-zepelin-") && arq.linhas.length > 5, `Configuracoes > Reservas: ${arq.nome}`);
  arq = await baixarDoCartao("Movimento");
  ok(arq.nome.startsWith("movimento-zepelin-") && arq.linhas[0].startsWith("Data;Dia da semana;Semana (sexta);Situação;Mesas reservadas"), `Configuracoes > Movimento: ${arq.nome} (${arq.linhas.length - 1} noites)`);

  // =====================================================================
  console.log("\n=== E) SAIR ===");
  await ir(adm, "/admin");
  await esperarTexto(adm, "Gerencie as reservas");
  await clicar(adm, "aside button", "Sair");
  await esperarTexto(adm, "Sair?");
  ok(/Gerencie as reservas/.test(await texto(adm)), "'Sair' pede confirmacao antes (um clique sem querer nao derruba o painel)");
  await clicar(adm, "aside button", "Não");
  await espera(200);
  ok(!/Sair\?/.test(await texto(adm)), "'Nao' desiste de sair");
  await clicar(adm, "aside button", "Sair");
  await clicar(adm, "aside button", "Sim");
  await adm.waitForSelector("#login-email", { timeout: 20000 });
  ok(!/Gerencie as reservas|Vera Visitante/.test(await texto(adm)), "depois de sair, volta a tela de entrada e os dados somem da tela");
  await ir(adm, "/admin/clientes");
  await adm.waitForSelector("#login-email", { timeout: 60000 });
  ok(!/Cliente Antigo/.test(await texto(adm)), "e nao da para voltar ao painel so digitando o endereco");

  // =====================================================================
  console.log("\n=== F) BANCO FECHADO (parte 2 rodada) ===");
  await mock("/__fechar-acesso");
  await mock("/__limpar-log");
  const p2 = await novaPagina(ctxCliente, "cliente-fechado");
  await p2.setViewport({ width: 1366, height: 900 });
  await ir(p2, "/");
  await p2.waitForFunction(() => [...document.querySelectorAll('select[aria-label="Data"]')].some((s) => s.offsetParent && s.options.length > 2), { timeout: 60000 });
  await clicar(p2, "button", "Buscar mesas");
  await require("./e2e-ajuda.cjs").escolherHorario(p2);
  await clicar(p2, "button", "Continuar");
  await p2.waitForFunction((s) => [...document.querySelectorAll(s)].some((b) => b.offsetParent), { timeout: 60000 }, marcador("12"));
  await espera(700);
  await clicar(p2, marcador("05"));
  await espera(250);
  ok(/mesa 05 já está reservada/i.test(await texto(p2)), "banco fechado: o visitante continua vendo as mesas ocupadas");
  await clicar(p2, marcador("12"));
  await clicar(p2, "button", "Continuar");
  await esperarTexto(p2, "Quase tudo pronto");
  await digitar(p2, "Ex.: Maria Souza", "Depois de Fechar");
  await digitar(p2, "(41) 99999-9999", "41922225555");
  await clicar(p2, "button", "Revisar reserva");
  await esperarTexto(p2, "Revise sua reserva");
  await clicar(p2, "button", "Confirmar reserva");
  await esperarTexto(p2, "Reserva confirmada!");
  m = await estado();
  ok(m.reservas.some((r) => r.nome === "Depois de Fechar" && r.mesa_numero === "12"), "banco fechado: o visitante continua reservando");
  await ir(p2, "/consulta");
  await digitar(p2, "Ex.: Maria Souza", "depois de fechar");
  await clicar(p2, "button", "Consultar reserva");
  await p2.waitForFunction(() => document.querySelectorAll("article").length === 1, { timeout: 30000 });
  ok(/Mesa 12/.test(await texto(p2)), "banco fechado: o visitante continua consultando a propria reserva");
  m = await estado();
  ok(pedidosDaTabela(m.log, "visitante").length === 0, "e em nenhum momento o site do cliente bateu na tabela (que agora responderia 'permissao negada')");

  await ir(adm, "/admin");
  await adm.waitForSelector("#login-email", { timeout: 60000 });
  await preencherLogin(adm, NAO_ADMIN);
  await esperarTexto(adm, "Esta conta não tem acesso ao painel");
  ok(true, "banco fechado: conta nao administradora continua barrada");
  await clicar(adm, "button", "Sair e entrar com outra conta");
  await adm.waitForSelector("#login-email", { timeout: 20000 });
  await preencherLogin(adm, ADMIN);
  await esperarTexto(adm, "Gerencie as reservas", 60000);
  await adm.waitForFunction(() => /Depois de Fechar|Vera Visitante/.test(document.body.innerText), { timeout: 30000 });
  ok(true, "banco fechado: o administrador logado continua vendo as reservas");
  await ir(adm, "/admin/configuracoes");
  await esperarTexto(adm, "Banco de dados protegido");
  ok(!/Proteção do banco pendente/.test(await texto(adm)), "Configuracoes passa a dizer 'Banco de dados protegido'");

  // =====================================================================
  console.log("\n=== G) CELULAR ===");
  const ctxCel = await browser.createBrowserContext();
  const cel = await novaPagina(ctxCel, "celular");
  await cel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ir(cel, "/admin");
  await cel.waitForSelector("#login-email", { timeout: 60000 });
  let rol = await cel.evaluate(() => ({ r: document.documentElement.scrollWidth, j: window.innerWidth }));
  ok(rol.r <= rol.j + 1, `tela de entrada no celular sem rolagem lateral (${rol.r} <= ${rol.j})`);
  ok(!(await cel.evaluate(() => [...document.querySelectorAll("nav a")].some((a) => a.offsetParent))), "sem login o celular nao mostra o menu do painel");
  await foto(cel, "_ac-cel-login.png");
  await clicar(cel, "button", "Mostrar");
  await cel.type("#login-senha", "abc");
  ok((await cel.$eval("#login-senha", (i) => i.type)) === "text", "'Mostrar' deixa ver a senha digitada");
  await preencherLogin(cel, ADMIN);
  await esperarTexto(cel, "Gerencie as reservas", 60000);
  await espera(600);
  rol = await cel.evaluate(() => ({ r: document.documentElement.scrollWidth, j: window.innerWidth }));
  ok(rol.r <= rol.j + 1, `painel no celular sem rolagem lateral (${rol.r} <= ${rol.j})`);
  const topo = await cel.evaluate(() => { const h = document.querySelector("header"); return h && h.offsetParent ? { sair: /Sair/.test(h.innerText), config: Boolean(h.querySelector('a[href="/admin/configuracoes"]')) } : null; });
  ok(topo && topo.sair && topo.config, "no celular a faixa do topo tem Configuracoes e Sair");
  await foto(cel, "_ac-cel-painel.png");
  await (await visivel(cel, 'header a[href="/admin/configuracoes"]')).asElement().tap();
  await esperarTexto(cel, "Cópia dos dados");
  await espera(500);
  rol = await cel.evaluate(() => ({ r: document.documentElement.scrollWidth, j: window.innerWidth }));
  ok(rol.r <= rol.j + 1, `Configuracoes no celular sem rolagem lateral (${rol.r} <= ${rol.j})`);
  await cel.evaluate(() => document.querySelector(".overflow-y-auto")?.scrollTo(0, 0));
  await foto(cel, "_ac-cel-configuracoes.png");
  await (await visivel(cel, "header button", "Sair")).asElement().tap();
  await esperarTexto(cel, "Sair?");
  rol = await cel.evaluate(() => ({ r: document.documentElement.scrollWidth, j: window.innerWidth }));
  ok(rol.r <= rol.j + 1, "a confirmacao de saida cabe na faixa do topo");
  await (await visivel(cel, "header button", "Sim")).asElement().tap();
  await cel.waitForSelector("#login-email", { timeout: 20000 });
  ok(true, "sair pelo celular volta para a tela de entrada");

  console.log("\n--- erros de JavaScript no navegador ---");
  const relevantes = erros.filter((e) => !/WebSocket|realtime/i.test(e));
  ok(relevantes.length === 0, `nenhum erro de pagina (${relevantes.length})${relevantes.length ? ": " + relevantes.join(" | ") : ""}`);

  await browser.close();
  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
