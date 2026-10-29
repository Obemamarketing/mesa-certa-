// Planilhas para o restaurante guardar uma cópia dos próprios dados: a lista
// de reservas e a lista de clientes. (A do movimento fica em lib/movimento.ts.)
//
// Mesmo formato da planilha do movimento, que abre direto no Excel e no Google
// Planilhas em português: separador ";", linhas com CRLF e BOM no começo (sem
// ele os acentos viram lixo).
//
// As montadoras de CSV são funções puras — sem navegador e sem Supabase.

import type { Reserva } from "./reservas";
import { codigoDaReserva } from "./regras";
import { chaveDoTelefone, soDigitos } from "./validacao";

const NOME_DO_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return NOME_DO_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

// Data e hora de um instante, no relógio do restaurante (São Paulo).
function partesEmSaoPaulo(ms: number): { data: string; hora: string } {
  const p: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms))) {
    p[parte.type] = parte.value;
  }
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}` };
}

// Um campo de texto pronto pra planilha.
//  - Texto que começa com = + - @ é lido pelo Excel como FÓRMULA. Um cliente
//    pode escrever isso no nome ou na observação (de propósito ou não), e a
//    planilha do restaurante rodaria a fórmula ao abrir. O apóstrofo na frente
//    faz o Excel tratar como texto.
//  - Campo com ";" , aspas ou quebra de linha vai entre aspas, senão quebraria
//    as colunas.
export function campoDeTexto(valor: string | number | null | undefined): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  texto = texto.replace(/\r\n?|\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(texto)) texto = `'${texto}`;
  return /[;"]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// "(41) 99999-9999": o mesmo telefone sempre do mesmo jeito, qualquer que
// tenha sido o jeito de digitar. Escrito assim o Excel não tenta transformá-lo
// em número (o que cortaria zeros e viraria 4,2E+10). Número de fora do Brasil
// fica como a pessoa escreveu.
export function telefoneParaPlanilha(telefone: string): string {
  const digitos = soDigitos(telefone);
  const estrangeiro = telefone.trim().startsWith("+") && !telefone.trim().startsWith("+55");
  const local = !estrangeiro && digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (!estrangeiro && local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (!estrangeiro && local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return telefone.trim();
}

function montarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(campoDeTexto).join(";")).join("\r\n") + "\r\n";
}

export type SituacaoDaReserva = "Cancelada" | "Compareceu" | "Não compareceu" | "Confirmada";

// Como a reserva terminou (ou está). "Não compareceu" só vale para noite que já
// passou: a de hoje ainda está acontecendo.
export function situacaoDaReserva(r: Reserva, hojeIso: string): SituacaoDaReserva {
  if (r.cancelada) return "Cancelada";
  if (r.checkinEm) return "Compareceu";
  if (r.dataReserva && r.dataReserva < hojeIso) return "Não compareceu";
  return "Confirmada";
}

// Todas as reservas, uma linha por mesa reservada, da mais antiga à mais nova.
// areaDaMesa: de qual área do salão é cada mesa (vem da planta).
export function csvDeReservas(reservas: Reserva[], hojeIso: string, areaDaMesa: (numero: string) => string | undefined): string {
  const ordenadas = [...reservas].sort(
    (a, b) =>
      (a.dataReserva ?? "").localeCompare(b.dataReserva ?? "") ||
      a.horario.localeCompare(b.horario) ||
      a.mesaNumero.localeCompare(b.mesaNumero, "pt-BR", { numeric: true }),
  );

  return montarCsv(
    ["Data", "Dia da semana", "Horário", "Mesa", "Área", "Pessoas", "Nome", "Telefone", "E-mail", "Aniversário", "Observação", "Situação", "Chegada registrada às", "Reserva feita em", "Código"],
    ordenadas.map((r) => {
      const feita = partesEmSaoPaulo(r.criadaEm);
      return [
        r.dataReserva ? dataBr(r.dataReserva) : "",
        r.dataReserva ? diaDaSemana(r.dataReserva) : "",
        r.horario,
        r.mesaNumero,
        areaDaMesa(r.mesaNumero) ?? "",
        r.pessoas,
        r.nome,
        telefoneParaPlanilha(r.telefone),
        r.email ?? "",
        r.aniversario ?? "",
        r.observacao ?? "",
        situacaoDaReserva(r, hojeIso),
        r.checkinEm ? partesEmSaoPaulo(r.checkinEm).hora : "",
        `${feita.data} ${feita.hora}`,
        codigoDaReserva(r.id),
      ];
    }),
  );
}

export type ClienteDaPlanilha = {
  nome: string;
  telefone: string;
  email: string;
  aniversario: string;
  /** Noites com reserva ativa (um grupo em duas mesas na mesma noite conta uma vez). */
  noites: number;
  compareceu: number;
  naoCompareceu: number;
  /** Noites em que todas as mesas reservadas foram canceladas. */
  cancelou: number;
  /** Primeira noite reservada ("2026-10-16"). */
  primeira: string;
  /** Última noite em que a chegada foi registrada. */
  ultimaVisita: string;
  /** Próxima noite reservada, de hoje em diante. */
  proxima: string;
};

// Um cliente por telefone. As contas são por NOITE, não por mesa: quem veio
// com um grupo grande em três mesas veio uma vez, não três.
export function clientesParaPlanilha(reservas: Reserva[], hojeIso: string): ClienteDaPlanilha[] {
  const porTelefone = new Map<string, Reserva[]>();
  for (const r of reservas) {
    const chave = chaveDoTelefone(r.telefone);
    // dados apagados a pedido do cliente ou pelo prazo de guarda
    if (!chave) continue;
    const lista = porTelefone.get(chave);
    if (lista) lista.push(r);
    else porTelefone.set(chave, [r]);
  }

  const clientes: ClienteDaPlanilha[] = [];
  for (const lista of porTelefone.values()) {
    // a mais recente primeiro: nome, e-mail e aniversário valem os últimos informados
    const recentes = [...lista].sort((a, b) => b.criadaEm - a.criadaEm);

    const porNoite = new Map<string, Reserva[]>();
    for (const r of lista) {
      if (!r.dataReserva) continue;
      const daNoite = porNoite.get(r.dataReserva);
      if (daNoite) daNoite.push(r);
      else porNoite.set(r.dataReserva, [r]);
    }

    let naoCompareceu = 0, cancelou = 0;
    const ativas: string[] = [];
    const visitas: string[] = [];
    for (const [data, daNoite] of porNoite) {
      const mesasAtivas = daNoite.filter((r) => !r.cancelada);
      if (mesasAtivas.length === 0) { cancelou++; continue; }
      ativas.push(data);
      if (mesasAtivas.some((r) => r.checkinEm)) visitas.push(data);
      else if (data < hojeIso) naoCompareceu++;
    }
    ativas.sort();
    visitas.sort();
    const futuras = ativas.filter((d) => d >= hojeIso);

    clientes.push({
      nome: recentes[0].nome,
      telefone: telefoneParaPlanilha(recentes[0].telefone),
      email: recentes.find((r) => r.email)?.email ?? "",
      aniversario: recentes.find((r) => r.aniversario)?.aniversario ?? "",
      noites: ativas.length,
      compareceu: visitas.length,
      naoCompareceu,
      cancelou,
      primeira: ativas[0] ?? "",
      ultimaVisita: visitas[visitas.length - 1] ?? "",
      proxima: futuras[0] ?? "",
    });
  }

  return clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function csvDeClientes(reservas: Reserva[], hojeIso: string): string {
  return montarCsv(
    ["Nome", "Telefone", "E-mail", "Aniversário", "Dias reservados", "Compareceu", "Não compareceu", "Cancelou", "Primeira reserva", "Última visita", "Próxima reserva"],
    clientesParaPlanilha(reservas, hojeIso).map((c) => [
      c.nome,
      c.telefone,
      c.email,
      c.aniversario,
      c.noites,
      c.compareceu,
      c.naoCompareceu,
      c.cancelou,
      c.primeira ? dataBr(c.primeira) : "",
      c.ultimaVisita ? dataBr(c.ultimaVisita) : "",
      c.proxima ? dataBr(c.proxima) : "",
    ]),
  );
}

// "reservas-zepelin-2026-10-13.csv"
export function nomeDoArquivo(prefixo: string, restaurante: string, hojeIso: string): string {
  const nome = restaurante.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefixo}-${nome}-${hojeIso}.csv`;
}

// Entrega o arquivo ao navegador (só roda no navegador).
export function baixarCsv(nome: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
