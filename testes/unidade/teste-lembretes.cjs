// Testa lib/lembretes/processar.ts (o miolo do envio dos lembretes) com
// envio e banco de mentira: nada sai para a Meta nem para o Supabase.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const dir = path.join(__dirname, "_lemb", "lembretes");
fs.mkdirSync(dir, { recursive: true });
const compilar = (origem, destino) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(origem, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  fs.writeFileSync(destino, outputText);
};
const L = path.join(__dirname, "../../lib") + "/" + "";
compilar(L + "lembretes/processar.ts", path.join(dir, "processar.js"));
compilar(L + "lembretes/mensagem.ts", path.join(dir, "mensagem.js"));
compilar(L + "regras.ts", path.join(__dirname, "_lemb", "regras.js"));
const { processarLote } = require(path.join(dir, "processar.js"));

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };

const item = (n, extra = {}) => ({
  lembrete_id: `L${n}`, reserva_id: `R${n}`, nome: `Cliente ${n}`, telefone: `4199999000${n}`,
  pessoas: 2, mesa_numero: String(n).padStart(2, "0"), horario: "19:30", data_reserva: "2026-10-16", tentativas: 1, ...extra,
});

function cenario({ ativas, respostas = [], gravacaoFalha = false, tempos = null }) {
  const gravado = new Map(); // id -> campos
  const enviados = [];
  let passo = 0;
  return {
    gravado, enviados,
    deps: {
      ativas,
      zonaPorMesa: new Map([["01", "Salão principal"], ["02", "Salão principal"], ["11", "Salão anexo"]]),
      enviar: async (telefone, parametros) => { enviados.push({ telefone, parametros }); return respostas.shift() ?? { ok: true, messageId: "wamid.x" }; },
      gravar: async (ids, campos) => { for (const id of ids) gravado.set(id, campos(id)); return !gravacaoFalha; },
      decorrido: () => (tempos ? tempos[Math.min(passo++, tempos.length - 1)] : 0),
      orcamentoMs: 40000,
      agora: () => "2026-10-16T19:00:00Z",
    },
  };
}

(async () => {
  console.log("--- tudo certo ---");
  let c = cenario({ ativas: new Set(["R1", "R2"]) });
  let r = await processarLote([item(1), item(2)], c.deps);
  ok(r.enviados === 2 && c.gravado.get("L1").status === "enviado" && c.gravado.get("L2").wa_message_id === "wamid.x", "dois lembretes: dois envios, gravados como enviado");
  ok(JSON.stringify(c.enviados[0].parametros) === JSON.stringify(["Cliente", "19h30", "2 pessoas", "Mesa 01", "Salão principal", "19:50", "R1"]), `parametros do template: ${c.enviados[0].parametros.join(" | ")}`);

  console.log("\n--- grupo em duas mesas = um aviso so ---");
  c = cenario({ ativas: new Set(["R1", "R11"]) });
  r = await processarLote([item(1, { nome: "Ana", telefone: "(41) 99999-0001" }), item(11, { nome: "ana ", telefone: "41999990001" })], c.deps);
  ok(r.enviados === 1 && c.enviados.length === 1, "mesmo telefone, nome e data: um envio so");
  ok(c.enviados[0].parametros[3] === "Mesas 01 e 11" && c.enviados[0].parametros[2] === "4 pessoas" && c.enviados[0].parametros[4] === "Salão principal e Salão anexo", `o aviso lista as duas mesas, soma as pessoas e as areas (${c.enviados[0].parametros.slice(2, 5).join(" | ")})`);
  ok(c.gravado.get("L1").status === "enviado" && c.gravado.get("L11").status === "enviado", "os dois lembretes do grupo ficam como enviados");

  console.log("\n--- reserva cancelada no meio-tempo ---");
  c = cenario({ ativas: new Set(["R2"]) });
  r = await processarLote([item(1), item(2)], c.deps);
  ok(r.cancelados === 1 && c.gravado.get("L1").status === "cancelado" && c.enviados.length === 1 && c.enviados[0].telefone.endsWith("2"), "a cancelada nao recebe; a outra recebe");

  console.log("\n--- CORRECAO: falha ao conferir as reservas ---");
  c = cenario({ ativas: null });
  r = await processarLote([item(1, { tentativas: 1 }), item(2, { tentativas: 2 })], c.deps);
  ok(c.enviados.length === 0 && r.cancelados === 0, "nao envia nada e NAO cancela nada (antes: cancelava o lote inteiro)");
  ok(c.gravado.get("L1").status === "pendente" && c.gravado.get("L1").tentativas === 0 && c.gravado.get("L2").tentativas === 1, "tudo volta pra fila, devolvendo a tentativa que nao foi usada");
  ok(r.devolvidos === 2, "resumo conta 2 devolvidos");

  console.log("\n--- falha da Meta ---");
  c = cenario({ ativas: new Set(["R1", "R2", "R3"]), respostas: [
    { ok: false, erro: "limite de taxa", tentarDeNovo: true },
    { ok: false, erro: "limite de taxa", tentarDeNovo: true },
    { ok: false, erro: "numero sem WhatsApp", tentarDeNovo: false },
  ] });
  r = await processarLote([item(1, { tentativas: 1 }), item(2, { tentativas: 3 }), item(3, { tentativas: 1 })], c.deps);
  ok(c.gravado.get("L1").status === "pendente" && /Tentativa 1\/3/.test(c.gravado.get("L1").erro), "falha temporaria na 1a tentativa: volta pra fila");
  ok(c.gravado.get("L2").status === "falhou", "falha temporaria na 3a tentativa: desiste (falhou)");
  ok(c.gravado.get("L3").status === "falhou" && /sem WhatsApp/.test(c.gravado.get("L3").erro), "falha definitiva: falhou na hora");

  console.log("\n--- CORRECAO: acabou o tempo da rodada ---");
  c = cenario({ ativas: new Set(["R1", "R2", "R3"]), tempos: [1000, 41000, 41000] });
  r = await processarLote([item(1), item(2, { tentativas: 2 }), item(3)], c.deps);
  ok(r.enviados === 1 && c.enviados.length === 1, "envia o que deu tempo (1) e para");
  ok(c.gravado.get("L2").status === "pendente" && c.gravado.get("L2").tentativas === 1 && c.gravado.get("L3").status === "pendente" && c.gravado.get("L3").tentativas === 0,
    "o resto volta pra fila sem gastar tentativa (antes: ficava preso em 'enviando' e virava falha)");
  ok(r.devolvidos === 2, "resumo conta 2 devolvidos");

  console.log("\n--- gravacao que falha aparece no resumo ---");
  c = cenario({ ativas: new Set(["R1"]), gravacaoFalha: true });
  r = await processarLote([item(1)], c.deps);
  ok(r.erros_ao_gravar === 1 && r.enviados === 1, "erro ao gravar fica contado (vai pro log da Vercel)");

  console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> lembretes validados");
  process.exit(falhas ? 1 : 0);
})();
