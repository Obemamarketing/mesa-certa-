// Testa lib/exportar.ts (funções puras das planilhas de clientes e de reservas):
// transpila o TypeScript e confere o que sai.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const dir = path.join(__dirname, "_exp");
fs.mkdirSync(dir, { recursive: true });
for (const nome of ["exportar", "regras", "validacao"]) {
  const fonte = fs.readFileSync(`${path.join(__dirname, "../../lib")}/${nome}.ts`, "utf8");
  const { outputText } = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  fs.writeFileSync(path.join(dir, `${nome}.js`), outputText);
}
const x = require(path.join(dir, "exportar.js"));

let falhas = 0;
const ok = (c, msg) => { console.log((c ? "OK    " : "FALHA ") + msg); if (!c) falhas++; };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}${JSON.stringify(a) === JSON.stringify(b) ? "" : `  (veio ${JSON.stringify(a)}, esperava ${JSON.stringify(b)})`}`);

console.log("--- campo de texto (aspas, ponto e virgula e formulas) ---");
eq(x.campoDeTexto("Maria Souza"), "Maria Souza", "texto comum passa igual");
eq(x.campoDeTexto("=HYPERLINK(\"http://mal\")"), "\"'=HYPERLINK(\"\"http://mal\"\")\"", "formula no nome: ganha apostrofo e aspas dobradas");
eq(x.campoDeTexto("+55 41 99999"), "'+55 41 99999", "comeca com +: apostrofo");
eq(x.campoDeTexto("-10"), "'-10", "comeca com -: apostrofo");
eq(x.campoDeTexto("@SUM(1)"), "'@SUM(1)", "comeca com @: apostrofo");
eq(x.campoDeTexto("  =1+1"), "'=1+1", "espaco antes do = nao engana");
eq(x.campoDeTexto("mesa perto; sem gluten"), "\"mesa perto; sem gluten\"", "ponto e virgula: vai entre aspas");
eq(x.campoDeTexto("disse \"oi\""), "\"disse \"\"oi\"\"\"", "aspas: dobradas e entre aspas");
eq(x.campoDeTexto("linha 1\r\nlinha 2\nlinha 3"), "linha 1 linha 2 linha 3", "quebra de linha vira espaco");
eq(x.campoDeTexto(null), "", "null vira vazio");
eq(x.campoDeTexto(undefined), "", "undefined vira vazio");
eq(x.campoDeTexto(4), "4", "numero vira texto");
eq(x.campoDeTexto(0), "0", "zero nao some");

console.log("\n--- telefone ---");
for (const t of ["41999991234", "(41) 99999-1234", "+55 41 99999-1234", "5541999991234", "41 99999 1234"]) eq(x.telefoneParaPlanilha(t), "(41) 99999-1234", `'${t}' -> (41) 99999-1234`);
eq(x.telefoneParaPlanilha("4133334444"), "(41) 3333-4444", "fixo de 10 digitos");
eq(x.telefoneParaPlanilha("+1 415 555 0123"), "+1 415 555 0123", "numero de fora do Brasil fica como foi escrito");
eq(x.telefoneParaPlanilha("12345"), "12345", "numero estranho fica como foi escrito");

// ---------------------------------------------------------------- reservas
const HOJE = "2026-10-13";
const em = (iso) => new Date(iso).getTime();
const R = (id, data, mesa, pessoas, nome, telefone, extra = {}) => ({
  id, dia: "sexta", dataReserva: data, horario: "19:30", mesaNumero: mesa, pessoas, nome, telefone,
  criadaEm: em("2026-09-20T18:05:00-03:00"), cancelada: false, ...extra,
});
const reservas = [
  // Ana: veio em 02/10 (duas mesas, mesma noite), faltou em 09/10, tem reserva em 16/10, cancelou 23/10
  R("aaaaaaaa-0000-0000-0000-000000000001", "2026-10-02", "05", 6, "Ana Lima", "41999990001", { checkinEm: em("2026-10-02T19:42:00-03:00"), email: "ana@velho.com" }),
  R("aaaaaaaa-0000-0000-0000-000000000002", "2026-10-02", "06", 2, "Ana Lima", "(41) 99999-0001", { checkinEm: em("2026-10-02T19:42:00-03:00") }),
  R("aaaaaaaa-0000-0000-0000-000000000003", "2026-10-09", "01", 2, "Ana Lima", "+55 41 99999-0001"),
  R("aaaaaaaa-0000-0000-0000-000000000004", "2026-10-16", "01", 4, "Ana L. Souza", "5541999990001", { criadaEm: em("2026-10-12T23:30:00-03:00"), email: "ana@novo.com", aniversario: "12/03", observacao: "=cmd|' /C calc'!A0; alergia a \"camarao\"" }),
  R("aaaaaaaa-0000-0000-0000-000000000005", "2026-10-23", "02", 2, "Ana Lima", "41999990001", { cancelada: true }),
  // Beto: só cancelou
  R("bbbbbbbb-0000-0000-0000-000000000001", "2026-10-03", "10", 3, "Beto", "41988880002", { cancelada: true }),
  // Écio (acento: tem que vir depois de Beto e antes de Zeca): reserva hoje, ainda sem chegada
  R("cccccccc-0000-0000-0000-000000000001", HOJE, "03", 2, "Écio", "41977770003"),
  // Zeca: uma noite com uma mesa cancelada e outra de pé -> a noite vale; não veio
  R("dddddddd-0000-0000-0000-000000000001", "2026-10-04", "07", 4, "Zeca", "41966660004", { cancelada: true }),
  R("dddddddd-0000-0000-0000-000000000002", "2026-10-04", "08", 4, "Zeca", "41966660004"),
];

console.log("\n--- situacao da reserva ---");
eq(x.situacaoDaReserva(reservas[0], HOJE), "Compareceu", "com chegada registrada: Compareceu");
eq(x.situacaoDaReserva(reservas[2], HOJE), "Não compareceu", "noite passada sem chegada: Não compareceu");
eq(x.situacaoDaReserva(reservas[3], HOJE), "Confirmada", "noite futura: Confirmada");
eq(x.situacaoDaReserva(reservas[4], HOJE), "Cancelada", "cancelada: Cancelada");
eq(x.situacaoDaReserva(reservas[6], HOJE), "Confirmada", "noite de HOJE sem chegada ainda: Confirmada (a noite nao acabou)");

console.log("\n--- planilha de reservas ---");
const areas = { "05": "Salão principal", "06": "Salão principal", "01": "Salão principal", "10": "Salão principal", "03": "Salão principal", "07": "Salão principal", "08": "Salão principal" };
const csvR = x.csvDeReservas(reservas, HOJE, (n) => areas[n]);
ok(csvR.charCodeAt(0) === 0xfeff, "comeca com BOM (acentos certos no Excel)");
ok(csvR.endsWith("\r\n") && !/[^\r]\n/.test(csvR), "todas as linhas terminam em CRLF");
const linhasR = csvR.slice(1).split("\r\n").filter(Boolean);
eq(linhasR[0], "Data;Dia da semana;Horário;Mesa;Área;Pessoas;Nome;Telefone;E-mail;Aniversário;Observação;Situação;Chegada registrada às;Reserva feita em;Código", "cabecalho");
eq(linhasR.length, 1 + reservas.length, `uma linha por reserva (${reservas.length})`);
eq(linhasR[1], "02/10/2026;Sexta;19:30;05;Salão principal;6;Ana Lima;(41) 99999-0001;ana@velho.com;;;Compareceu;19:42;20/09/2026 18:05;AAAAAA", "linha da reserva com chegada (hora de Sao Paulo)");
eq(linhasR.map((l) => l.split(";")[0] + " m" + l.split(";")[3]).slice(1), ["02/10/2026 m05", "02/10/2026 m06", "03/10/2026 m10", "04/10/2026 m07", "04/10/2026 m08", "09/10/2026 m01", "13/10/2026 m03", "16/10/2026 m01", "23/10/2026 m02"], "da mais antiga para a mais nova, e por mesa dentro da noite");
const linhaForm = linhasR.find((l) => l.startsWith("16/10/2026"));
eq(linhaForm, "16/10/2026;Sexta;19:30;01;Salão principal;4;Ana L. Souza;(41) 99999-0001;ana@novo.com;12/03;\"'=cmd|' /C calc'!A0; alergia a \"\"camarao\"\"\";Confirmada;;12/10/2026 23:30;AAAAAA", "observacao com formula, ; e aspas: neutralizada e sem quebrar as colunas");
eq(linhasR.find((l) => l.startsWith("04/10/2026;Domingo")) !== undefined, true, "dia da semana calculado pela data (04/10/2026 e domingo)");
// conferindo que cada linha tem 15 colunas quando lida como CSV de verdade
const colunas = (linha) => { const out = []; let cur = "", q = false; for (let i = 0; i < linha.length; i++) { const c = linha[i]; if (q) { if (c === '"' && linha[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ";") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
ok(linhasR.every((l) => colunas(l).length === 15), "todas as linhas tem 15 colunas quando lidas como CSV");
eq(colunas(linhaForm)[10], "'=cmd|' /C calc'!A0; alergia a \"camarao\"", "  e a observacao volta inteira, com o apostrofo na frente");
eq(x.csvDeReservas([], HOJE, () => undefined).slice(1).split("\r\n").filter(Boolean).length, 1, "sem reservas: so o cabecalho");

console.log("\n--- clientes ---");
const cs = x.clientesParaPlanilha(reservas, HOJE);
eq(cs.map((c) => c.nome), ["Ana L. Souza", "Beto", "Écio", "Zeca"], "um cliente por telefone (formatos diferentes juntam), em ordem alfabetica com acento");
eq(cs[0], { nome: "Ana L. Souza", telefone: "(41) 99999-0001", email: "ana@novo.com", aniversario: "12/03", noites: 3, compareceu: 1, naoCompareceu: 1, cancelou: 1, primeira: "2026-10-02", ultimaVisita: "2026-10-02", proxima: "2026-10-16" },
  "Ana: 3 noites (2 mesas na mesma noite contam 1), veio 1, faltou 1, cancelou 1; nome e e-mail da reserva mais recente");
eq(cs[1], { nome: "Beto", telefone: "(41) 98888-0002", email: "", aniversario: "", noites: 0, compareceu: 0, naoCompareceu: 0, cancelou: 1, primeira: "", ultimaVisita: "", proxima: "" }, "Beto: so cancelou");
eq([cs[2].noites, cs[2].naoCompareceu, cs[2].proxima], [1, 0, HOJE], "Écio: reserva de hoje conta como proxima e ainda nao e falta");
eq([cs[3].noites, cs[3].naoCompareceu, cs[3].cancelou], [1, 1, 0], "Zeca: noite com uma mesa cancelada e outra de pe vale como noite (e faltou)");

const csvC = x.csvDeClientes(reservas, HOJE);
const linhasC = csvC.slice(1).split("\r\n").filter(Boolean);
ok(csvC.charCodeAt(0) === 0xfeff && csvC.endsWith("\r\n"), "planilha de clientes: BOM e CRLF");
eq(linhasC[0], "Nome;Telefone;E-mail;Aniversário;Dias reservados;Compareceu;Não compareceu;Cancelou;Primeira reserva;Última visita;Próxima reserva", "cabecalho de clientes");
eq(linhasC[1], "Ana L. Souza;(41) 99999-0001;ana@novo.com;12/03;3;1;1;1;02/10/2026;02/10/2026;16/10/2026", "linha da Ana");
eq(linhasC[2], "Beto;(41) 98888-0002;;;0;0;0;1;;;", "linha do Beto (zeros aparecem, datas vazias)");
eq(linhasC.length, 5, "4 clientes + cabecalho");

console.log("\n--- nome do arquivo ---");
eq(x.nomeDoArquivo("clientes", "ZéPelin", HOJE), "clientes-zepelin-2026-10-13.csv", "sem acento, minusculo, com a data");
eq(x.nomeDoArquivo("reservas", "Bar do João & Cia.", HOJE), "reservas-bar-do-joao-cia-2026-10-13.csv", "nome com espaco e simbolo vira tracos");

console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : "\n>>> planilhas validadas");
process.exitCode = falhas ? 1 : 0;
