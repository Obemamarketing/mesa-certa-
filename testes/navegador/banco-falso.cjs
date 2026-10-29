// Supabase FALSO com estado, só para testar a interface sem tocar no banco real.
// Imita o que importa do banco novo:
//  - reservas por data (gatilhos de data, índice único por data/horário/mesa);
//  - login (Supabase Auth) com duas contas de teste: uma administradora, uma não;
//  - as funções do site do cliente (mesas_ocupadas, reservar, consultar_reservas,
//    cancelar_minha_reserva), eh_admin e acesso_fechado;
//  - o banco "fechado" (parte 2): com /__fechar-acesso, a tabela de reservas só
//    responde a administrador logado.
// Cada pedido fica no log com QUEM pediu (visitante ou a conta logada).
const http = require("http");
const { CONTAS } = require("./e2e-contas.cjs");

let reservas = [];
let fila = [];
let pedidos = [];
let recuperacoes = []; // e-mails que pediram "esqueci minha senha" (com o redirectTo)
let senhaExigeAal2 = false; // simula o Supabase exigindo o código do app para trocar a senha
const sessoesDeOutros = new Set(); // tokens derrubados por signOut({ scope: "others" })
let fechados = new Map();
let log = [];
let corpos = []; // uma entrada por mesa reservada (o que foi gravado)
let chamadas = []; // corpo de cada chamada à função reservar
let falharProximoPatch = false;
let falharProximoCancelamento = false;
let acessoFechado = false;
let reservaDiretaFechada = false; // supabase-fechar-reserva-direta.sql (captcha ligado)
let alteracoes = []; // trocas feitas por alterar_minha_reserva
let recusarProximaReserva = null; // { mesa } -> a funcao reservar responde 23505 e grava a mesa como tomada por outro
const tokens = new Map(); // access_token -> conta
const refreshes = new Map(); // refresh_token -> conta

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Expose-Headers": "*",
};

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const soma = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const DOW = { sexta: 5, sabado: 6, domingo: 0 };
// almoço de sábado (supabase-migration-almoco.sql): dias, horários e 1h30 por reserva
const ABERTOS = [6];
const HORARIOS_SITE = ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"];
const DURACAO = 90;
const minutos = (h) => { const [a, b] = String(h).split(":").map(Number); return a * 60 + b; };
const cruza = (a, b) => Math.abs(minutos(a) - minutos(b)) < DURACAO;
const NOME_DIA = { 5: "sexta", 6: "sabado", 0: "domingo" };
const CAPACIDADE = { "05": 6, "10": 6, "17": 2 }; // as demais: 4 (lib/regras.ts)
const capacidade = (n) => (/^(0[1-9]|1[0-9]|20)$/.test(n) ? CAPACIDADE[n] ?? 4 : null);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (t) => String(t ?? "").replace(/\D/g, "");

// TOTP (RFC 6238) de verdade, para o teste digitar o mesmo código que um app mostraria
const { totp, base32 } = require("./e2e-totp.cjs");
const fatores = new Map(); // conta.id -> [{ id, status, secret, friendly_name }]
const fatoresDe = (c) => fatores.get(c.id) ?? [];
const temFatorVerificado = (c) => fatoresDe(c).some((f) => f.status === "verified");

function novaSessao(conta, aal = "aal1") {
  const agora = Math.floor(Date.now() / 1000);
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: conta.id, role: "authenticated", aud: "authenticated", email: conta.email, aal, amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: agora }], iat: agora, exp: agora + 3600 })}.${crypto.randomUUID().replace(/-/g, "")}`;
  const refresh = crypto.randomUUID().replace(/-/g, "");
  tokens.set(access, conta);
  nivelDoToken.set(access, aal);
  refreshes.set(refresh, conta);
  refreshDoToken.set(access, refresh);
  nivelDoRefresh.set(refresh, aal);
  return {
    access_token: access, token_type: "bearer", expires_in: 3600, expires_at: agora + 3600, refresh_token: refresh,
    user: usuario(conta),
  };
}
const nivelDoToken = new Map();
const refreshDoToken = new Map();
const nivelDoRefresh = new Map();
const usuario = (c) => ({ factors: fatoresDe(c).map((f) => ({ id: f.id, status: f.status, factor_type: "totp", friendly_name: f.friendly_name, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" })), id: c.id, aud: "authenticated", role: "authenticated", email: c.email, email_confirmed_at: "2026-10-01T12:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-01T12:00:00Z" });

// Quantas palavras de pelo menos 2 letras (mesma conta do banco).
const palavrasDoNome = (t) => String(t ?? "").trim().split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2).length;

// A função reservar do banco: devolve { ok, criadas } ou { ok: false, status, code, message }.
function tentarReservar(d, ehAdmin) {
  const hoje = hojeSP();
  const erro = (message, code = "P0001", status = 400) => ({ ok: false, status, code, message });
  const nome = String(d.p_nome ?? "").trim();
  if (nome.length < 2 || nome.length > 80) return erro("DADOS_INVALIDOS: nome");
  if (!ehAdmin && palavrasDoNome(nome) < 2) return erro("DADOS_INVALIDOS: nome e sobrenome");
  if (digitos(d.p_telefone).length < 8 || digitos(d.p_telefone).length > 15) return erro("DADOS_INVALIDOS: telefone");
  if (!Array.isArray(d.p_mesas) || d.p_mesas.length < 1) return erro("DADOS_INVALIDOS: mesas");
  const w = dow(d.p_data);
  if (!ABERTOS.includes(w) || d.p_data <= hoje || d.p_data > soma(hoje, 62)) return erro("DATA_FORA_DA_AGENDA: data fora da agenda");
  if (fechados.has(d.p_data)) return erro("RESTAURANTE_FECHADO: fechado nesta data");
  if (!ehAdmin && !HORARIOS_SITE.includes(d.p_horario)) return erro("DADOS_INVALIDOS: horario");
  if (d.p_aniversario != null && !/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/.test(d.p_aniversario)) {
    return erro('new row for relation "reservas" violates check constraint "reservas_aniversario_valido"', "23514");
  }
  for (const m of d.p_mesas) {
    const cap = capacidade(m.numero);
    if (cap === null) return erro(`DADOS_INVALIDOS: a mesa ${m.numero} nao existe`);
    if (!(m.pessoas >= 1 && m.pessoas <= cap)) return erro(`DADOS_INVALIDOS: a mesa ${m.numero} nao comporta ${m.pessoas} pessoas`);
  }
  // outra pessoa leva uma das mesas neste exato instante (simulado pelo teste)
  if (recusarProximaReserva) {
    const mesa = recusarProximaReserva.mesa;
    recusarProximaReserva = null;
    reservas.push(novaReserva({ dia: NOME_DIA[w], data_reserva: d.p_data, horario: d.p_horario, mesa_numero: mesa, pessoas: 2, nome: "Outro Cliente", telefone: "41900000000" }));
  }
  // tudo ou nada: confere TODAS as mesas antes de gravar qualquer uma
  const numeros = d.p_mesas.map((m) => m.numero);
  const tomada = d.p_mesas.find((m) => reservas.some((r) => !r.cancelada && r.data_reserva === d.p_data && cruza(r.horario, d.p_horario) && r.mesa_numero === m.numero));
  if (tomada || new Set(numeros).size !== numeros.length) return erro("duplicate key value violates unique constraint", "23505", 409);
  const criadas = d.p_mesas.map((m) => novaReserva({
    dia: NOME_DIA[w], data_reserva: d.p_data, horario: d.p_horario, mesa_numero: m.numero, pessoas: m.pessoas, nome,
    telefone: String(d.p_telefone).trim(), email: d.p_email ? String(d.p_email).trim() : null,
    aniversario: d.p_aniversario || null, observacao: d.p_observacao ? String(d.p_observacao).trim().slice(0, 200) : null,
    origem: ehAdmin ? "painel" : "site",
  }));
  reservas.push(...criadas);
  corpos.push(...criadas.map((r) => ({ ...r })));
  return { ok: true, criadas: [...criadas].sort((a, b) => a.mesa_numero.localeCompare(b.mesa_numero)) };
}

function novaReserva(reg) {
  return { id: crypto.randomUUID(), criada_em: new Date().toISOString(), cancelada: false, checkin_em: null, email: null, observacao: null, aniversario: null, tentativas_cancelamento: 0, ...reg };
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const json = (status, obj) => { res.writeHead(status, { ...CORS, "Content-Type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
      const caminho = url.pathname;
      const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const conta = tokens.get(bearer) || null;
      const quem = conta ? conta.email : "visitante";
      // a chave de serviço do servidor do site (rota /api/protegido)
      const servico = bearer === "chave-de-servico";
      const admin = Boolean(conta && conta.admin && (!temFatorVerificado(conta) || nivelDoToken.get(bearer) === "aal2"));
      const dados = () => { try { return JSON.parse(corpo || "{}"); } catch { return {}; } };
      if (!caminho.startsWith("/__")) log.push({ quem, metodo: req.method, caminho, busca: url.search });

      // ------------------------------------------------------ controle do teste
      if (caminho === "/__log") return json(200, { log, reservas, corpos, chamadas, acessoFechado, fila, pedidos, recuperacoes, alteracoes, reservaDiretaFechada });
      if (caminho === "/__reset") { reservaDiretaFechada = false; alteracoes = []; recuperacoes = []; senhaExigeAal2 = false; fila = []; pedidos = []; reservas = []; fechados = new Map(); log = []; corpos = []; chamadas = []; acessoFechado = false; falharProximoPatch = false; falharProximoCancelamento = false; recusarProximaReserva = null; return json(200, {}); }
      if (caminho === "/__fatores") return json(200, Object.fromEntries([...fatores].map(([id, l]) => [id, l])));
      if (caminho === "/__limpar-log") { log = []; return json(200, {}); }
      if (caminho === "/__fechar" && req.method === "POST") { const f = dados(); fechados.set(f.data, { data: f.data, motivo: f.motivo ?? null }); return json(200, {}); }
      if (caminho === "/__senha-exige-aal2") { senhaExigeAal2 = true; return json(200, {}); }
      // o "link do e-mail": uma sessão nova da conta, no formato que o Supabase põe depois do "#"
      if (caminho === "/__link-recuperacao") {
        const c = CONTAS.find((x) => x.email === url.searchParams.get("email"));
        if (!c) return json(404, {});
        const ses = novaSessao(c);
        return json(200, { hash: `#access_token=${ses.access_token}&expires_at=${ses.expires_at}&expires_in=3600&refresh_token=${ses.refresh_token}&token_type=bearer&type=recovery` });
      }
      if (caminho === "/__fechar-reserva-direta") { reservaDiretaFechada = true; return json(200, {}); }
      // a "Cloudflare" do teste: confere o passe do captcha (o do modo de teste da Cloudflare ou "passe-...")
      if (caminho === "/__turnstile") {
        const passe = new URLSearchParams(corpo).get("response") || "";
        return json(200, { success: passe === "XXXX.DUMMY.TOKEN.XXXX" || passe.startsWith("passe-") });
      }
      if (caminho === "/__fechar-acesso") { acessoFechado = true; return json(200, {}); }
      if (caminho === "/__seed" && req.method === "POST") {
        for (const r of dados()) reservas.push(novaReserva(r));
        return json(200, { n: reservas.length });
      }
      if (caminho === "/__falhar-proximo-patch") { falharProximoPatch = true; return json(200, {}); }
      if (caminho === "/__falhar-proximo-cancelamento") { falharProximoCancelamento = true; return json(200, {}); }
      if (caminho === "/__tomar-na-proxima-reserva" && req.method === "POST") { recusarProximaReserva = dados(); return json(200, {}); }

      // ------------------------------------------------------------------ login
      if (caminho === "/auth/v1/token") {
        const tipo = url.searchParams.get("grant_type");
        const d = dados();
        if (tipo === "password") {
          const c = CONTAS.find((x) => x.email.toLowerCase() === String(d.email || "").toLowerCase());
          if (!c || c.senha !== d.password) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
          return json(200, novaSessao(c));
        }
        if (tipo === "refresh_token") {
          const c = refreshes.get(d.refresh_token);
          const nivelAnterior = nivelDoRefresh.get(d.refresh_token) ?? "aal1";
          if (!c) return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
          return json(200, novaSessao(c, nivelAnterior));
        }
        return json(400, { code: 400, error_code: "bad_request", msg: "grant_type" });
      }
      if (caminho === "/auth/v1/recover" && req.method === "POST") {
        recuperacoes.push({ email: dados().email, redirectTo: url.searchParams.get("redirect_to") });
        return json(200, {});
      }
      if (caminho === "/auth/v1/user" && req.method === "PUT") {
        if (!conta) return json(401, { code: 401, error_code: "no_authorization", msg: "no session" });
        const d = dados();
        if (d.password !== undefined) {
          if (senhaExigeAal2 && temFatorVerificado(conta) && nivelDoToken.get(bearer) !== "aal2") return json(401, { code: 401, error_code: "insufficient_aal", msg: "AAL2 session is required to update email or password when MFA is enabled." });
          if (String(d.password).length < 6) return json(422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
          if (d.password === conta.senha) return json(422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
          conta.senha = d.password;
        }
        return json(200, usuario(conta));
      }
      if (caminho === "/auth/v1/user") return conta ? json(200, usuario(conta)) : json(401, { code: 401, error_code: "no_authorization", msg: "no session" });
      // ---------------------------------------------- duas etapas (MFA TOTP)
      if (caminho === "/auth/v1/factors" && req.method === "POST") {
        if (!conta) return json(401, { code: 401, msg: "no session" });
        const d = dados();
        if (fatoresDe(conta).some((f) => f.friendly_name === d.friendly_name)) return json(422, { code: 422, error_code: "mfa_factor_name_conflict", msg: "A factor with the friendly name already exists" });
        const f = { id: crypto.randomUUID(), status: "unverified", secret: base32(crypto.getRandomValues(new Uint8Array(20))), friendly_name: d.friendly_name };
        fatores.set(conta.id, [...fatoresDe(conta), f]);
        return json(200, { id: f.id, type: "totp", friendly_name: f.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#222"/></svg>', secret: f.secret, uri: "otpauth://totp/x?secret=" + f.secret } });
      }
      const mFator = caminho.match(/^\/auth\/v1\/factors\/([^/]+)(\/challenge|\/verify)?$/);
      if (mFator) {
        if (!conta) return json(401, { code: 401, msg: "no session" });
        const f = fatoresDe(conta).find((x) => x.id === mFator[1]);
        if (!f) return json(404, { code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" });
        if (req.method === "DELETE") {
          if (temFatorVerificado(conta) && nivelDoToken.get(bearer) !== "aal2") return json(403, { code: 403, error_code: "insufficient_aal", msg: "AAL2 required" });
          fatores.set(conta.id, fatoresDe(conta).filter((x) => x.id !== f.id));
          return json(200, { id: f.id });
        }
        if (mFator[2] === "/challenge") return json(200, { id: crypto.randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
        if (mFator[2] === "/verify") {
          const d = dados();
          if (String(d.code) !== totp(f.secret)) return json(422, { code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
          f.status = "verified";
          return json(200, novaSessao(conta, "aal2"));
        }
      }

      if (caminho === "/auth/v1/logout") {
        if (url.searchParams.get("scope") === "others") {
          // como o Supabase: os outros logins da conta não renovam mais (o
          // acesso atual deles vale até vencer, no máximo 1 hora); este fica
          const meu = refreshDoToken.get(bearer);
          for (const [rf, c] of refreshes) if (conta && c.id === conta.id && rf !== meu) { refreshes.delete(rf); sessoesDeOutros.add(rf); }
        } else tokens.delete(bearer);
        res.writeHead(204, CORS); return res.end();
      }

      // ----------------------------------------------------------------- funções
      if (caminho === "/rest/v1/rpc/eh_admin") return json(200, admin);
      if (caminho === "/rest/v1/rpc/acesso_fechado") return json(200, acessoFechado);

      if (caminho === "/rest/v1/rpc/mesas_ocupadas") {
        const hoje = hojeSP();
        return json(200, reservas.filter((r) => !r.cancelada && r.data_reserva >= hoje).map((r) => ({ data: r.data_reserva, horario: r.horario, mesa: r.mesa_numero, chegou: Boolean(r.checkin_em) })));
      }

      // captcha ligado e banco fechado: as três ações públicas só pelo servidor
      if (reservaDiretaFechada && !conta && !servico && ["/rest/v1/rpc/reservar", "/rest/v1/rpc/entrar_na_fila", "/rest/v1/rpc/pedir_sobre_meus_dados"].includes(caminho)) {
        return json(401, { code: "42501", message: "permission denied for function" });
      }

      if (caminho === "/rest/v1/rpc/reservar") {
        const d = dados();
        chamadas.push({ quem: servico ? "servidor" : quem, ...d });
        const r = tentarReservar(d, admin);
        if (!r.ok) return json(r.status, { code: r.code, message: r.message });
        return json(200, r.criadas);
      }

      if (caminho === "/rest/v1/rpc/conferir_minha_reserva" || caminho === "/rest/v1/rpc/alterar_minha_reserva") {
        const d = dados();
        const alterar = caminho.endsWith("alterar_minha_reserva");
        const responder = (status) => json(200, alterar ? { status } : status);
        const r = reservas.find((x) => x.id === d.p_id);
        if (!r) return responder("nao_encontrada");
        if (r.cancelada) return responder("ja_cancelada");
        if (r.checkin_em || r.data_reserva < hojeSP()) return responder("encerrada");
        if (r.tentativas_cancelamento >= 5) return responder("bloqueada");
        const informado = digitos(d.p_final_telefone);
        if (informado.length !== 4 || digitos(r.telefone).slice(-4) !== informado) {
          r.tentativas_cancelamento++;
          return responder(r.tentativas_cancelamento >= 5 ? "bloqueada" : "telefone");
        }
        if (!alterar) return responder("ok");
        // tudo ou nada: cancela o grupo, tenta a nova; se falhar, desfaz
        const grupo = reservas.filter((g) => !g.cancelada && g.data_reserva === r.data_reserva && g.horario === r.horario && g.nome === r.nome && digitos(g.telefone) === digitos(r.telefone));
        grupo.forEach((g) => { g.cancelada = true; });
        const nova = tentarReservar({ p_data: d.p_data, p_horario: d.p_horario, p_mesas: d.p_mesas, p_nome: r.nome, p_telefone: r.telefone, p_email: r.email, p_aniversario: r.aniversario, p_observacao: r.observacao }, false);
        if (!nova.ok) {
          grupo.forEach((g) => { g.cancelada = false; });
          return json(200, { status: "erro", codigo: nova.code, mensagem: nova.message });
        }
        alteracoes.push({ de: grupo.map((g) => g.id), para: nova.criadas.map((x) => x.id) });
        return json(200, { status: "ok", reservas: nova.criadas });
      }

      if (caminho === "/rest/v1/rpc/consultar_reservas") {
        // nome e sobrenome (2 palavras), cada uma palavra INTEIRA do nome
        const termo = semAcento(String(dados().p_nome ?? "").trim());
        const palavras = termo.split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2);
        if (palavras.length < 2) return json(200, []);
        const desde = soma(hojeSP(), -30);
        return json(200, reservas
          .filter((r) => r.data_reserva >= desde && palavras.every((p) => semAcento(r.nome).split(/\s+/).includes(p)))
          .sort((a, b) => b.criada_em.localeCompare(a.criada_em))
          .slice(0, 30)
          .map((r) => ({ id: r.id, dia: r.dia, data_reserva: r.data_reserva, horario: r.horario, mesa_numero: r.mesa_numero, pessoas: r.pessoas, cancelada: r.cancelada, chegou: Boolean(r.checkin_em), criada_em: r.criada_em })));
      }

      if (caminho === "/rest/v1/rpc/cancelar_minha_reserva") {
        if (falharProximoCancelamento) { falharProximoCancelamento = false; return json(500, { code: "XX000", message: "falha simulada" }); }
        const d = dados();
        const r = reservas.find((x) => x.id === d.p_id);
        if (!r) return json(200, "nao_encontrada");
        if (r.cancelada) return json(200, "ja_cancelada");
        if (r.checkin_em || r.data_reserva < hojeSP()) return json(200, "encerrada");
        if (r.tentativas_cancelamento >= 5) return json(200, "bloqueada");
        const informado = digitos(d.p_final_telefone);
        if (informado.length !== 4 || digitos(r.telefone).slice(-4) !== informado) {
          r.tentativas_cancelamento++;
          return json(200, r.tentativas_cancelamento >= 5 ? "bloqueada" : "telefone");
        }
        r.cancelada = true;
        return json(200, "ok");
      }

      // ------------------------------------------------------------ fila de espera
      if (caminho === "/rest/v1/rpc/entrar_na_fila") {
        const d = dados();
        const hoje = hojeSP();
        const w = dow(d.p_data);
        if (String(d.p_nome ?? "").trim().length < 2) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: nome" });
        if (palavrasDoNome(d.p_nome) < 2) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: nome e sobrenome" });
        if (digitos(d.p_telefone).length < 8) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: telefone" });
        if (!ABERTOS.includes(w) || d.p_data <= hoje || d.p_data > soma(hoje, 62)) return json(400, { code: "P0001", message: "DATA_FORA_DA_AGENDA: x" });
        if (!HORARIOS_SITE.includes(d.p_horario)) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: horario" });
        const chave = (t) => { const x = digitos(t); return x.length > 11 && x.startsWith("55") ? x.slice(2) : x; };
        if (fila.some((f) => f.data_reserva === d.p_data && ["aguardando", "chamado"].includes(f.status) && chave(f.telefone) === chave(d.p_telefone))) {
          return json(400, { code: "P0001", message: "JA_NA_FILA: x" });
        }
        const e = { id: crypto.randomUUID(), codigo: crypto.randomUUID(), data_reserva: d.p_data, horario: d.p_horario, pessoas: d.p_pessoas, nome: String(d.p_nome).trim(), telefone: String(d.p_telefone).trim(), observacao: d.p_observacao || null, status: "aguardando", criada_em: new Date().toISOString(), chamada_em: null, reserva_id: null };
        fila.push(e);
        return json(200, [{ codigo: e.codigo, posicao: fila.filter((f) => f.data_reserva === d.p_data && f.status === "aguardando").length }]);
      }
      if (caminho === "/rest/v1/rpc/ver_minha_fila") {
        const f = fila.find((x) => x.codigo === dados().p_codigo);
        if (!f) return json(200, []);
        const expirado = ["aguardando", "chamado"].includes(f.status) && f.data_reserva < hojeSP();
        const posicao = f.status === "aguardando" ? fila.filter((o) => o.data_reserva === f.data_reserva && o.status === "aguardando" && o.criada_em <= f.criada_em).length : null;
        return json(200, [{ data_reserva: f.data_reserva, horario: f.horario, pessoas: f.pessoas, primeiro_nome: f.nome.split(" ")[0], status: expirado ? "expirado" : f.status, posicao, chamada_em: f.chamada_em, criada_em: f.criada_em }]);
      }
      if (caminho === "/rest/v1/rpc/sair_da_fila") {
        const f = fila.find((x) => x.codigo === dados().p_codigo);
        if (!f) return json(200, "nao_encontrada");
        if (!["aguardando", "chamado"].includes(f.status)) return json(200, "encerrada");
        f.status = "saiu";
        return json(200, "ok");
      }
      if (caminho === "/rest/v1/fila_espera") {
        if (!conta) return json(401, { code: "42501", message: "permission denied for table fila_espera" });
        if (!admin) return json(200, []);
        if (req.method === "GET") {
          const gte = (url.searchParams.get("data_reserva") || "").replace(/^gte./, "");
          return json(200, fila.filter((f) => !gte || f.data_reserva >= gte).sort((a, b) => a.data_reserva.localeCompare(b.data_reserva) || a.criada_em.localeCompare(b.criada_em)));
        }
        if (req.method === "PATCH") {
          const alvo = (url.searchParams.get("id") || "").replace(/^eq./, "");
          const f = fila.find((x) => x.id === alvo);
          if (!f) return json(200, []);
          Object.assign(f, dados());
          return json(200, [{ id: f.id }]);
        }
      }

      // ------------------------------------------------- dados do cliente (LGPD)
      if (caminho === "/rest/v1/rpc/pedir_sobre_meus_dados") {
        const d = dados();
        const chave = (t) => { const x = digitos(t); return x.length > 11 && x.startsWith("55") ? x.slice(2) : x; };
        if (!["exclusao", "acesso", "correcao", "outro"].includes(d.p_tipo)) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: tipo" });
        if (String(d.p_nome ?? "").trim().length < 2) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: nome" });
        if (chave(d.p_telefone).length < 8) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: telefone" });
        if (pedidos.filter((p) => chave(p.telefone) === chave(d.p_telefone)).length >= 3) return json(400, { code: "P0001", message: "LIMITE_DE_PEDIDOS" });
        const p = { id: crypto.randomUUID(), tipo: d.p_tipo, nome: String(d.p_nome).trim(), telefone: String(d.p_telefone).trim(), mensagem: d.p_mensagem || null, status: "aberto", criado_em: new Date().toISOString(), concluido_em: null, nota: null };
        pedidos.push(p);
        return json(200, p.id.replace(/-/g, "").slice(0, 8).toUpperCase());
      }
      if (caminho === "/rest/v1/pedidos_titular") {
        if (!conta) return json(401, { code: "42501", message: "permission denied for table pedidos_titular" });
        if (!admin) return json(200, []);
        if (req.method === "GET") return json(200, pedidos.slice().sort((a, b) => b.criado_em.localeCompare(a.criado_em)));
        if (req.method === "PATCH") {
          const p = pedidos.find((x) => x.id === (url.searchParams.get("id") || "").replace(/^eq./, ""));
          if (p) Object.assign(p, dados());
          return json(200, p ? [p] : []);
        }
      }
      if (caminho === "/rest/v1/rpc/apagar_dados_do_cliente") {
        if (!admin) return json(403, { code: "42501", message: "SEM_PERMISSAO" });
        const chave = (t) => { const x = digitos(t); return x.length > 11 && x.startsWith("55") ? x.slice(2) : x; };
        const alvo = chave(dados().p_telefone);
        if (alvo.length < 8) return json(400, { code: "P0001", message: "DADOS_INVALIDOS: telefone" });
        const hoje = hojeSP();
        let canceladas = 0, n = 0;
        for (const r of reservas) {
          if (chave(r.telefone) !== alvo) continue;
          if (!r.cancelada && r.data_reserva >= hoje) { r.cancelada = true; canceladas++; }
          Object.assign(r, { nome: "Dados removidos", telefone: "", email: null, aniversario: null, observacao: null, dados_removidos_em: new Date().toISOString() });
          n++;
        }
        const antes = fila.length;
        fila = fila.filter((f) => chave(f.telefone) !== alvo);
        return json(200, { reservas: n, canceladas, fila: antes - fila.length });
      }

      // ------------------------------------------------------------------ tabelas
      if (caminho === "/rest/v1/dias_fechados") {
        if (req.method === "GET") return json(200, [...fechados.values()]);
        if (acessoFechado && !admin) return json(401, { code: "42501", message: "permission denied for table dias_fechados" });
        if (req.method === "POST") { const f = dados(); fechados.set(f.data, { data: f.data, motivo: f.motivo ?? null }); return json(201, []); }
        if (req.method === "DELETE") { fechados.delete((url.searchParams.get("data") || "").replace(/^eq\./, "")); return json(200, []); }
        return json(200, []);
      }

      if (caminho === "/rest/v1/reservas") {
        // Banco fechado: visitante leva "permissão negada"; conta logada que não
        // é administradora não enxerga linha nenhuma (é o que o RLS faz).
        if (acessoFechado && !conta) return json(401, { code: "42501", message: "permission denied for table reservas" });
        const semLinhas = acessoFechado && !admin;

        if (req.method === "GET") {
          let lista = semLinhas ? [] : reservas.slice();
          const gte = url.searchParams.get("data_reserva");
          if (gte && gte.startsWith("gte.")) lista = lista.filter((r) => r.data_reserva >= gte.slice(4));
          lista.sort((a, b) => a.criada_em.localeCompare(b.criada_em) || a.id.localeCompare(b.id));
          const off = Number(url.searchParams.get("offset") || 0);
          const lim = Number(url.searchParams.get("limit") || 1000);
          return json(200, lista.slice(off, off + lim));
        }
        if (req.method === "POST") {
          if (semLinhas) return json(403, { code: "42501", message: "new row violates row-level security policy" });
          const reg = dados();
          const hoje = hojeSP();
          if (!reg.data_reserva) reg.data_reserva = soma(hoje, (DOW[reg.dia] - dow(hoje) + 7) % 7 || 7);
          const w = dow(reg.data_reserva);
          if (![5, 6, 0].includes(w) || reg.data_reserva <= hoje || reg.data_reserva > soma(hoje, 62)) return json(400, { code: "P0001", message: "DATA_FORA_DA_AGENDA: data fora da agenda" });
          reg.dia = NOME_DIA[w];
          if (reservas.find((r) => !r.cancelada && r.data_reserva === reg.data_reserva && r.horario === reg.horario && r.mesa_numero === reg.mesa_numero)) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" });
          const reserva = novaReserva(reg);
          reservas.push(reserva);
          corpos.push({ ...reserva });
          return json(201, reserva);
        }
        if (req.method === "PATCH") {
          if (falharProximoPatch) { falharProximoPatch = false; return json(500, { code: "XX000", message: "falha simulada" }); }
          if (semLinhas) return json(200, []);
          const alvo = (url.searchParams.get("id") || "").replace(/^eq\./, "");
          const r = reservas.find((x) => x.id === alvo);
          if (!r) return json(200, []);
          Object.assign(r, dados());
          return json(200, [r]);
        }
      }

      // mesas e o resto: como se a tabela nao existisse (o app cai no padrao do codigo)
      return json(404, { code: "PGRST205", message: "Could not find the table in the schema cache" });
    });
  })
  .listen(54321, "127.0.0.1", () => console.log("supabase falso (com login) em http://127.0.0.1:54321"));
