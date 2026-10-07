// Monta as variáveis do template "lembrete_reserva" (ver whatsappCloud.ts).
// A ORDEM importa: é a das variáveis {{1}} a {{7}} cadastradas na Meta.

import { codigoDaReserva, horaLimiteDaTolerancia, mesas } from "../regras";

export type DadosLembrete = {
  reservaId: string;
  nome: string;
  pessoas: number;
  mesaNumero: string;
  horario: string; // "19:30"
  /** Área da mesa vinda da configuração central (tabela "mesas"). Sem ela,
   *  cai na lista do código — que fica desatualizada se a mesa for renomeada. */
  zona?: string;
};

// "19:30" → "19h30"; "20:00" → "20h"
function horarioFalado(horario: string): string {
  const [hh, mm] = horario.split(":");
  const h = String(Number(hh));
  return mm === "00" ? `${h}h` : `${h}h${mm}`;
}

// A Meta recusa variável com quebra de linha, tabulação ou 5+ espaços seguidos.
function limpar(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

export function parametrosDoTemplate(d: DadosLembrete): string[] {
  const zona = d.zona ?? mesas.find((m) => m.numero === d.mesaNumero)?.zona;
  const primeiroNome = limpar(d.nome).split(" ")[0] || "cliente";
  return [
    primeiroNome, // {{1}}
    horarioFalado(d.horario), // {{2}}
    `${d.pessoas} ${d.pessoas === 1 ? "pessoa" : "pessoas"}`, // {{3}}
    `Mesa ${d.mesaNumero}`, // {{4}}
    zona ?? "ZéPelin", // {{5}}
    horaLimiteDaTolerancia(d.horario), // {{6}}
    codigoDaReserva(d.reservaId), // {{7}}
  ];
}
