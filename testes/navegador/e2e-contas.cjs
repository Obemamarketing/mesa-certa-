// Contas de TESTE do Supabase falso (banco-falso.cjs). Só existem dentro
// dele, na máquina local — não são contas de verdade de lugar nenhum. As
// senhas são sorteadas a cada vez que o servidor falso sobe e ficam num
// arquivo ao lado, que os testes leem.
const fs = require("fs");
const path = require("path");

const ARQUIVO = path.join(__dirname, "_contas-de-teste.json");

function sortear() {
  const senha = () => `teste-${crypto.randomUUID().slice(0, 13)}`;
  const contas = [
    { id: crypto.randomUUID(), email: "dono@zepelin.test", senha: senha(), admin: true },
    { id: crypto.randomUUID(), email: "curioso@zepelin.test", senha: senha(), admin: false },
  ];
  fs.writeFileSync(ARQUIVO, JSON.stringify(contas, null, 2));
  return contas;
}

// O servidor falso sorteia (MOCK_SORTEAR=1); os testes só leem.
const CONTAS = process.env.MOCK_SORTEAR === "1" || !fs.existsSync(ARQUIVO) ? sortear() : JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));

module.exports = { CONTAS, ADMIN: CONTAS[0], NAO_ADMIN: CONTAS[1] };
