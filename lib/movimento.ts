// Números do movimento do restaurante: quantas mesas foram reservadas, quantas
// pessoas vieram, dia a dia e semana a semana. Funções puras (sem navegador e
// sem Supabase), por isso dá pra testar à parte.
//
// O restaurante abre sexta, sábado e domingo, então cada "dia" é uma noite de
// serviço e cada "semana" é um fim de semana (segunda a domingo no calendário).
//
// Regras de contagem:
//  - mesas / pessoas reservadas: só reservas ativas (não canceladas). Cada mesa
//    é uma linha em "reservas", então um grupo de duas mesas conta 2 mesas;
//  - "chegaram": pessoas das reservas com check-in feito no Modo operação.
//    Quem chega sem reserva não passa pelo sistema e não entra nessa conta;
//  - "não vieram": pessoas de reservas ativas, de dia que já passou, sem
//    check-in. O dia de hoje ainda não conta (a noite está em andamento).

import type { Reserva } from "./reservas";

export type Metrica = "chegaram" | "pessoas" | "mesas";

export type DiaMovimento = {
  /** "2026-10-16" */
  data: string;
  /** 0 = domingo … 6 = sábado */
  diaSemana: number;
  /** segunda-feira da semana desse dia, "2026-10-12" */
  semana: string;
  situacao: "passada" | "hoje" | "futura";
  /** Reservas de clientes (um grupo em duas mesas conta uma vez). */
  reservas: number;
  mesas: number;
  pessoas: number;
  chegaram: number;
  naoVieram: number;
  /** Mesas de reservas canceladas. */
  canceladas: number;
};

export type Totais = {
  reservas: number;
  mesas: number;
  pessoas: number;
  chegaram: number;
  naoVieram: number;
  canceladas: number;
  /** Noites com pelo menos uma reserva ativa. */
  noites: number;
};

export type Semana = {
  /** segunda-feira, "2026-10-12" */
  segunda: string;
  /** a sexta do fim de semana, "2026-10-16" (é por ela que a semana é chamada) */
  sexta: string;
  dias: Map<number, DiaMovimento>;
  totais: Totais;
};

const MS_DIA = 86_400_000;
const utc = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

export function somarDias(iso: string, n: number): string {
  return new Date(utc(iso) + n * MS_DIA).toISOString().slice(0, 10);
}

export function diaDaSemana(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

export function segundaDaSemana(iso: string): string {
  return somarDias(iso, -((diaDaSemana(iso) + 6) % 7));
}

// o domingo fecha o fim de semana: fica 6 dias depois da segunda
export function dataDoDiaNaSemana(segunda: string, diaSemana: number): string {
  return somarDias(segunda, diaSemana === 0 ? 6 : diaSemana - 1);
}

const soDigitos = (t: string) => t.replace(/\D/g, "");

function totaisVazios(): Totais {
  return { reservas: 0, mesas: 0, pessoas: 0, chegaram: 0, naoVieram: 0, canceladas: 0, noites: 0 };
}

export function somar(dias: DiaMovimento[]): Totais {
  const t = totaisVazios();
  for (const d of dias) {
    t.reservas += d.reservas;
    t.mesas += d.mesas;
    t.pessoas += d.pessoas;
    t.chegaram += d.chegaram;
    t.naoVieram += d.naoVieram;
    t.canceladas += d.canceladas;
    if (d.mesas > 0) t.noites += 1;
  }
  return t;
}

// Uma linha por data que tem alguma reserva (ativa ou cancelada). Reserva sem
// data gravada (anterior à migração de datas) fica de fora: não dá pra saber
// em que noite ela cai.
export function montarDias(reservas: Reserva[], hojeIso: string): DiaMovimento[] {
  const porData = new Map<string, Reserva[]>();
  for (const r of reservas) {
    if (!r.dataReserva) continue;
    const lista = porData.get(r.dataReserva);
    if (lista) lista.push(r);
    else porData.set(r.dataReserva, [r]);
  }

  const dias: DiaMovimento[] = [];
  for (const [data, lista] of porData) {
    const situacao: DiaMovimento["situacao"] = data < hojeIso ? "passada" : data === hojeIso ? "hoje" : "futura";
    const ativas = lista.filter((r) => !r.cancelada);
    const clientes = new Set(ativas.map((r) => `${soDigitos(r.telefone)}|${r.nome.trim().toLowerCase()}`));
    const chegaram = ativas.filter((r) => r.checkinEm).reduce((s, r) => s + r.pessoas, 0);
    const pessoas = ativas.reduce((s, r) => s + r.pessoas, 0);
    dias.push({
      data,
      diaSemana: diaDaSemana(data),
      semana: segundaDaSemana(data),
      situacao,
      reservas: clientes.size,
      mesas: ativas.length,
      pessoas,
      chegaram,
      naoVieram: situacao === "passada" ? ativas.filter((r) => !r.checkinEm).reduce((s, r) => s + r.pessoas, 0) : 0,
      canceladas: lista.length - ativas.length,
    });
  }
  return dias.sort((a, b) => a.data.localeCompare(b.data));
}

// As semanas de `desdeSegunda` até `ateSegunda`, uma atrás da outra — inclusive
// as sem nenhuma reserva, pra comparação não "pular" semana.
export function montarSemanas(dias: DiaMovimento[], desdeSegunda: string, ateSegunda: string): Semana[] {
  const porSemana = new Map<string, DiaMovimento[]>();
  for (const d of dias) {
    const lista = porSemana.get(d.semana);
    if (lista) lista.push(d);
    else porSemana.set(d.semana, [d]);
  }

  const semanas: Semana[] = [];
  for (let segunda = desdeSegunda; segunda <= ateSegunda; segunda = somarDias(segunda, 7)) {
    const doDia = porSemana.get(segunda) ?? [];
    semanas.push({
      segunda,
      sexta: somarDias(segunda, 4),
      dias: new Map(doDia.map((d) => [d.diaSemana, d])),
      totais: somar(doDia),
    });
  }
  return semanas;
}

export function valorDaMetrica(d: DiaMovimento | undefined, metrica: Metrica): number {
  if (!d) return 0;
  return d[metrica === "chegaram" ? "chegaram" : metrica === "pessoas" ? "pessoas" : "mesas"];
}

// null = "ainda não dá pra saber": a noite não aconteceu, e por isso chegada
// não é zero, é desconhecida. (Reservas e mesas de noite futura já existem.)
export function valorNaData(semana: Semana, diaSemana: number, metrica: Metrica, hojeIso: string): number | null {
  const data = dataDoDiaNaSemana(semana.segunda, diaSemana);
  if (metrica === "chegaram" && data > hojeIso) return null;
  return valorDaMetrica(semana.dias.get(diaSemana), metrica);
}

export function totalDaMetrica(t: Totais, metrica: Metrica): number {
  return metrica === "chegaram" ? t.chegaram : metrica === "pessoas" ? t.pessoas : t.mesas;
}

// (atual - anterior) / anterior. Sem base de comparação (anterior = 0) não
// existe percentual: devolve null em vez de "infinito".
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return (atual - anterior) / anterior;
}

const NOME_DO_DIA: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };
const SITUACAO: Record<DiaMovimento["situacao"], string> = { passada: "Realizada", hoje: "Hoje", futura: "Prevista" };

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

// Planilha das noites, pronta para o Excel e o Google Planilhas em português:
// separador ";" (o Excel brasileiro usa a vírgula como decimal), decimal com
// vírgula, linhas com CRLF e BOM no começo (sem ele os acentos viram lixo).
// Do que ainda não aconteceu a coluna fica VAZIA, não zero: zero diria que
// ninguém veio.
export function csvDoMovimento(dias: DiaMovimento[], totalDeMesas: number): string {
  const cabecalho = [
    "Data",
    "Dia da semana",
    "Semana (sexta)",
    "Situação",
    "Mesas reservadas",
    "Reservas de clientes",
    "Pessoas reservadas",
    "Pessoas que vieram",
    "Pessoas que não vieram",
    "Mesas canceladas",
    "Ocupação das mesas (%)",
  ];

  const linhas = dias.map((d) => [
    dataBr(d.data),
    NOME_DO_DIA[d.diaSemana],
    dataBr(somarDias(d.semana, 4)),
    SITUACAO[d.situacao],
    String(d.mesas),
    String(d.reservas),
    String(d.pessoas),
    d.situacao === "futura" ? "" : String(d.chegaram),
    d.situacao === "passada" ? String(d.naoVieram) : "",
    String(d.canceladas),
    totalDeMesas > 0 ? ((d.mesas / totalDeMesas) * 100).toFixed(1).replace(".", ",") : "",
  ]);

  return "﻿" + [cabecalho, ...linhas].map((l) => l.join(";")).join("\r\n") + "\r\n";
}

export type LinhaRanking = { chave: string; total: number };

// Quantas reservas ativas cada chave teve (mesa, área…) nas datas até hoje.
export function contarPor(reservas: Reserva[], desdeIso: string, ateIso: string, chaveDe: (r: Reserva) => string | undefined): LinhaRanking[] {
  const contagem = new Map<string, number>();
  for (const r of reservas) {
    if (r.cancelada || !r.dataReserva) continue;
    if (r.dataReserva < desdeIso || r.dataReserva > ateIso) continue;
    const chave = chaveDe(r);
    if (!chave) continue;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave, "pt-BR", { numeric: true }));
}
