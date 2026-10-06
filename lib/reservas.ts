"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { HORARIO_FIXO, TOLERANCIA_MINUTOS, codigoDaReserva, mesas, minutosDoHorario, type Mesa } from "./regras";

export { HORARIO_FIXO, TOLERANCIA_MINUTOS, codigoDaReserva, horaLimiteDaTolerancia, mesas, minutosDoHorario } from "./regras";
export type { FormatoMesa, Mesa, ZonaMesa } from "./regras";

// "Hoje" fixo pro protótipo — terça-feira, 30 de setembro de 2026.
export const dataHoje = new Date(2026, 8, 30);

export type DiaReserva = "sexta" | "sabado" | "domingo";

export const DIAS: { chave: DiaReserva; label: string; diaSemana: number }[] = [
  { chave: "sexta", label: "Sexta-feira", diaSemana: 5 },
  { chave: "sabado", label: "Sábado", diaSemana: 6 },
  { chave: "domingo", label: "Domingo", diaSemana: 0 },
];

export const horarios = [HORARIO_FIXO];

function proximaData(diaSemanaAlvo: number): Date {
  const base = new Date(dataHoje);
  const diff = (diaSemanaAlvo - base.getDay() + 7) % 7 || 7;
  base.setDate(base.getDate() + diff);
  return base;
}

export function dataDoDia(chave: DiaReserva): Date {
  const dia = DIAS.find((d) => d.chave === chave)!;
  return proximaData(dia.diaSemana);
}

export function formatarDataCurta(data: Date): string {
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export type Reserva = {
  id: string;
  dia: DiaReserva;
  horario: string;
  mesaNumero: string;
  pessoas: number;
  nome: string;
  telefone: string;
  email?: string;
  observacao?: string;
  criadaEm: number;
  cancelada?: boolean;
  checkinEm?: number;
};

type ReservaRow = {
  id: string;
  dia: DiaReserva;
  horario: string;
  mesa_numero: string;
  pessoas: number;
  nome: string;
  telefone: string;
  email: string | null;
  observacao: string | null;
  criada_em: string;
  cancelada: boolean;
  checkin_em: string | null;
};

function daRow(row: ReservaRow): Reserva {
  return {
    id: row.id,
    dia: row.dia,
    horario: row.horario,
    mesaNumero: row.mesa_numero,
    pessoas: row.pessoas,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email ?? undefined,
    observacao: row.observacao ?? undefined,
    criadaEm: new Date(row.criada_em).getTime(),
    cancelada: row.cancelada,
    checkinEm: row.checkin_em ? new Date(row.checkin_em).getTime() : undefined,
  };
}

const ORDEM_DIA: Record<DiaReserva, number> = { sexta: 0, sabado: 1, domingo: 2 };

function ordenar(reservas: Reserva[]): Reserva[] {
  return [...reservas].sort((a, b) => {
    if (a.dia !== b.dia) return ORDEM_DIA[a.dia] - ORDEM_DIA[b.dia];
    if (a.horario !== b.horario) return a.horario.localeCompare(b.horario);
    return a.mesaNumero.localeCompare(b.mesaNumero, "pt-BR", { numeric: true });
  });
}

async function buscarReservas(): Promise<Reserva[]> {
  const { data, error } = await supabase.from("reservas").select("*");
  if (error) {
    console.error("Erro ao buscar reservas:", error.message);
    return [];
  }
  return ordenar((data as ReservaRow[]).map(daRow));
}

// Cria a reserva direto no banco. O índice único (dia, horário, mesa) do
// supabase-schema.sql garante que duas pessoas não reservam a mesma mesa ao
// mesmo tempo, mesmo em dispositivos diferentes — a checagem é feita pelo
// próprio banco, não no navegador.
export async function criarReserva(
  dados: Omit<Reserva, "id" | "criadaEm">
): Promise<{ reserva: Reserva | null; erro?: string }> {
  const { data, error } = await supabase
    .from("reservas")
    .insert({
      dia: dados.dia,
      horario: dados.horario,
      mesa_numero: dados.mesaNumero,
      pessoas: dados.pessoas,
      nome: dados.nome,
      telefone: dados.telefone,
      email: dados.email ?? null,
      observacao: dados.observacao ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { reserva: null, erro: "Essa mesa acabou de ser reservada por outra pessoa. Escolha outra." };
    }
    console.error("Erro ao criar reserva:", error.message);
    return { reserva: null, erro: "Não foi possível confirmar a reserva agora. Tente de novo." };
  }

  return { reserva: daRow(data as ReservaRow) };
}

export async function cancelarReserva(id: string): Promise<void> {
  const { error } = await supabase.from("reservas").update({ cancelada: true }).eq("id", id);
  if (error) console.error("Erro ao cancelar reserva:", error.message);
}

// Check-in: registra o horário de chegada do cliente. A mesa passa a
// aparecer como "ocupada" (em vez de só "reservada") na planta.
export async function fazerCheckin(id: string): Promise<void> {
  const { error } = await supabase.from("reservas").update({ checkin_em: new Date().toISOString() }).eq("id", id);
  if (error) console.error("Erro ao registrar check-in:", error.message);
}

export async function desfazerCheckin(id: string): Promise<void> {
  const { error } = await supabase.from("reservas").update({ checkin_em: null }).eq("id", id);
  if (error) console.error("Erro ao desfazer check-in:", error.message);
}

// Consulta pública: por telefone (mais comum) ou pelo código curto. Busca
// tudo e filtra no cliente — base pequena de protótipo, evita depender de
// como o telefone foi formatado na hora de reservar.
export async function buscarReservaDoCliente(termo: string): Promise<Reserva[]> {
  const termoLimpo = termo.trim();
  if (!termoLimpo) return [];

  const somenteDigitos = termoLimpo.replace(/\D/g, "");
  const todas = await buscarReservas();

  const encontradas = todas.filter((r) => {
    if (somenteDigitos.length >= 4 && r.telefone.replace(/\D/g, "").includes(somenteDigitos)) return true;
    return codigoDaReserva(r.id).toLowerCase() === termoLimpo.toLowerCase();
  });

  return encontradas.sort((a, b) => b.criadaEm - a.criadaEm);
}

export type StatusMesa = "livre" | "reservada" | "ocupada" | "pequena";

// Status calculado em cima de uma lista de reservas já carregada (via
// useReservas) — não bate no banco a cada mesa desenhada na planta.
// "reservada" = tem reserva ativa mas o cliente ainda não fez check-in.
// "ocupada" = check-in feito, cliente já está na mesa.
export function statusMesa(reservas: Reserva[], dia: DiaReserva, horario: string, mesa: Mesa, pessoasMin?: number): StatusMesa {
  const reserva = reservas.find((r) => !r.cancelada && r.dia === dia && r.horario === horario && r.mesaNumero === mesa.numero);
  if (reserva) return reserva.checkinEm ? "ocupada" : "reservada";
  if (pessoasMin && mesa.capacidade < pessoasMin) return "pequena";
  return "livre";
}

export function reservaDaMesa(reservas: Reserva[], dia: DiaReserva, horario: string, mesaNumero: string): Reserva | undefined {
  return reservas.find((r) => !r.cancelada && r.dia === dia && r.horario === horario && r.mesaNumero === mesaNumero);
}

// Tolerância (TOLERANCIA_MINUTOS, em regras.ts): o sistema NUNCA cancela ou
// libera a mesa sozinho, só sinaliza visualmente pro administrador decidir.
export type StatusChegada = "aguardando" | "tolerancia" | "atrasado" | "chegou" | "cancelada";

// minutosAgora: minutos desde 00:00 do horário real atual (null até o
// relógio montar no cliente, pra evitar mismatch de hidratação).
export function statusChegada(reserva: Reserva, minutosAgora: number | null): StatusChegada {
  if (reserva.cancelada) return "cancelada";
  if (reserva.checkinEm) return "chegou";
  if (minutosAgora === null) return "aguardando";
  const minutosReserva = minutosDoHorario(reserva.horario);
  if (minutosAgora < minutosReserva) return "aguardando";
  if (minutosAgora <= minutosReserva + TOLERANCIA_MINUTOS) return "tolerancia";
  return "atrasado";
}

export const ROTULO_STATUS_CHEGADA: Record<StatusChegada, string> = {
  aguardando: "Aguardando horário",
  tolerancia: "Reserva dentro da tolerância",
  atrasado: "Cliente não chegou",
  chegou: "Cliente chegou",
  cancelada: "Cancelada",
};

export function mesasDisponiveisPara(reservas: Reserva[], dia: DiaReserva, horario: string, pessoas: number): Mesa[] {
  return mesas.filter((m) => statusMesa(reservas, dia, horario, m, pessoas) === "livre");
}

// CRM simples: agrupa reservas pelo telefone.
export type Cliente = { nome: string; telefone: string; email?: string; totalReservas: number };

export function listarClientes(reservas: Reserva[]): Cliente[] {
  const mapa = new Map<string, Cliente>();
  for (const r of reservas) {
    const existente = mapa.get(r.telefone);
    if (existente) {
      existente.totalReservas += 1;
      if (r.email) existente.email = r.email;
    } else {
      mapa.set(r.telefone, { nome: r.nome, telefone: r.telefone, email: r.email, totalReservas: 1 });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.totalReservas - a.totalReservas);
}

// Histórico básico de um cliente (não é CRM — só a lista de reservas dele,
// mais recentes primeiro, pra consulta rápida no admin).
export function historicoDoCliente(reservas: Reserva[], telefone: string): Reserva[] {
  return reservas.filter((r) => r.telefone === telefone).sort((a, b) => b.criadaEm - a.criadaEm);
}

// Carrega as reservas e escuta o realtime do Supabase — qualquer reserva ou
// cancelamento feito em QUALQUER dispositivo aparece aqui sozinho, sem
// precisar recarregar a página.
export function useReservas(): { reservas: Reserva[]; carregando: boolean } {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const dados = await buscarReservas();
      if (ativo) {
        setReservas(dados);
        setCarregando(false);
      }
    }
    carregar();

    const canal = supabase
      .channel("reservas-mudancas")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => {
        carregar();
      })
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  return { reservas, carregando };
}
