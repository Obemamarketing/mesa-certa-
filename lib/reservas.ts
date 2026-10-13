"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { ANTECEDENCIA_DIAS, HORARIO_FIXO, TOLERANCIA_MINUTOS, mesas, minutosDoHorario, type Mesa } from "./regras";
import { chaveDoTelefone } from "./validacao";

// QUEM LÊ O QUÊ
//   Site do cliente (visitante, sem login): nunca toca na tabela "reservas".
//   Usa as funções do banco — mesas_ocupadas, reservar, consultar_reservas e
//   cancelar_minha_reserva (supabase-migration-acesso.sql) —, que entregam só o
//   necessário e nunca o telefone de ninguém.
//   Painel (/admin, com login de administrador): lê e altera a tabela direto.

export { ANTECEDENCIA_DIAS, DATAS_NA_LISTA, HORARIO_FIXO, TOLERANCIA_MINUTOS, codigoDaReserva, distribuirPessoas, horaLimiteDaTolerancia, listaDeMesas, lugaresDasMesas, lugaresQueFaltam, mesas, minutosDoHorario, situacaoDoGrupo } from "./regras";
export type { MesaDoGrupo } from "./regras";
export type { FormatoMesa, Mesa, ZonaMesa } from "./regras";

const SEMANA_CURTA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// O relógio do RESTAURANTE (fuso de São Paulo), não o do aparelho de quem está
// olhando: é o fuso que o banco usa pra calcular a data da reserva. Devolve o
// dia ("2026-10-16"), o dia da semana (0 = domingo) e os minutos desde 00:00.
export function relogioSaoPaulo(agora: Date = new Date()): { iso: string; diaSemana: number; minutos: number } {
  const partes: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora)) {
    partes[p.type] = p.value;
  }
  return {
    iso: `${partes.year}-${partes.month}-${partes.day}`,
    diaSemana: SEMANA_CURTA.indexOf(partes.weekday),
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

// "Hoje" de verdade, no fuso de São Paulo. Devolve meia-noite local do dia.
export function dataHoje(): Date {
  const [ano, mes, dia] = relogioSaoPaulo().iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// "2026-10-16": formato que o banco guarda e que dias_fechados usa como chave.
export function isoDaData(data: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

export type DiaReserva = "sexta" | "sabado" | "domingo";

export const DIAS: { chave: DiaReserva; label: string; diaSemana: number }[] = [
  { chave: "sexta", label: "Sexta-feira", diaSemana: 5 },
  { chave: "sabado", label: "Sábado", diaSemana: 6 },
  { chave: "domingo", label: "Domingo", diaSemana: 0 },
];

export const horarios = [HORARIO_FIXO];

function proximaData(diaSemanaAlvo: number): Date {
  const base = dataHoje();
  // mesma regra do banco: se hoje já é esse dia da semana, vale o da semana que vem
  const diff = (diaSemanaAlvo - base.getDay() + 7) % 7 || 7;
  base.setDate(base.getDate() + diff);
  return base;
}

export function dataDoDia(chave: DiaReserva): Date {
  const dia = DIAS.find((d) => d.chave === chave)!;
  return proximaData(dia.diaSemana);
}

// Data de OPERAÇÃO, usada pelo painel do restaurante: o dia da semana de hoje
// vale hoje (na hora de reservar, o próprio dia só vale na semana seguinte).
export function dataDeOperacao(chave: DiaReserva): Date {
  const dia = DIAS.find((d) => d.chave === chave)!;
  const base = dataHoje();
  base.setDate(base.getDate() + ((dia.diaSemana - base.getDay() + 7) % 7));
  return base;
}

export function formatarDataCurta(data: Date): string {
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// "2026-10-16" → meia-noite local desse dia
export function dataDoIso(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// ---------------------------------------------------------------------------
// Agenda: as datas em que dá pra reservar
// ---------------------------------------------------------------------------
// O cliente reserva por DATA (não mais só "a próxima sexta"): qualquer dia de
// funcionamento de amanhã até ANTECEDENCIA_DIAS à frente. O próprio dia de hoje
// continua de fora, como sempre foi. O banco confere a mesma regra.

export type DataDisponivel = { iso: string; dia: DiaReserva; data: Date };

// sexta/sábado/domingo de uma data, ou undefined se o restaurante não abre nela
export function diaDaData(iso: string): DiaReserva | undefined {
  const dow = dataDoIso(iso).getDay();
  return DIAS.find((d) => d.diaSemana === dow)?.chave;
}

// Dias de funcionamento a partir de `deIso` (incluído), por `quantosDias` dias.
export function datasDeFuncionamento(deIso: string, quantosDias: number): DataDisponivel[] {
  const lista: DataDisponivel[] = [];
  const base = dataDoIso(deIso);
  for (let i = 0; i <= quantosDias; i++) {
    const data = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const dia = DIAS.find((d) => d.diaSemana === data.getDay());
    if (dia) lista.push({ iso: isoDaData(data), dia: dia.chave, data });
  }
  return lista;
}

// As datas que o CLIENTE pode reservar: de amanhã até dois meses à frente.
export function datasParaReserva(hojeIso: string): DataDisponivel[] {
  return datasDeFuncionamento(hojeIso, ANTECEDENCIA_DIAS).filter((d) => d.iso > hojeIso);
}

// "Sexta, 16/10" (curto) ou "Sexta-feira, 16/10"
export function rotuloDaData(iso: string, curto = false): string {
  const label = DIAS.find((d) => d.chave === diaDaData(iso))?.label ?? "";
  return `${curto ? label.split("-")[0] : label}, ${formatarDataCurta(dataDoIso(iso))}`;
}

export type Reserva = {
  id: string;
  dia: DiaReserva;
  /** Data real da reserva ("2026-10-16"). Ausente só em reservas muito antigas. */
  dataReserva?: string;
  horario: string;
  mesaNumero: string;
  pessoas: number;
  nome: string;
  telefone: string;
  email?: string;
  /** Aniversário do cliente, só dia e mês ("12/03"). Opcional. */
  aniversario?: string;
  observacao?: string;
  criadaEm: number;
  cancelada?: boolean;
  checkinEm?: number;
};

type ReservaRow = {
  id: string;
  dia: DiaReserva;
  data_reserva?: string | null;
  horario: string;
  mesa_numero: string;
  pessoas: number;
  nome: string;
  telefone: string;
  email: string | null;
  aniversario?: string | null;
  observacao: string | null;
  criada_em: string;
  cancelada: boolean;
  checkin_em: string | null;
};

function daRow(row: ReservaRow): Reserva {
  return {
    id: row.id,
    dia: row.dia,
    dataReserva: row.data_reserva ?? undefined,
    horario: row.horario,
    mesaNumero: row.mesa_numero,
    pessoas: row.pessoas,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email ?? undefined,
    aniversario: row.aniversario ?? undefined,
    observacao: row.observacao ?? undefined,
    criadaEm: new Date(row.criada_em).getTime(),
    cancelada: row.cancelada,
    checkinEm: row.checkin_em ? new Date(row.checkin_em).getTime() : undefined,
  };
}

// Quando a reserva vale. É o que várias funções abaixo precisam saber dela —
// serve a reserva completa do painel e também o resumo que o site do cliente
// recebe.
type QuandoDaReserva = Pick<Reserva, "dia" | "dataReserva">;

// O que a planta precisa saber pra pintar uma mesa: quando, qual mesa e se o
// cliente já chegou. O site do cliente só recebe isto (sem nome nem telefone);
// o painel passa as reservas completas, que servem do mesmo jeito.
export type Ocupacao = QuandoDaReserva &
  Pick<Reserva, "horario" | "mesaNumero" | "cancelada"> & {
    /** A hora da chegada (painel) ou só "chegou" (site do cliente). */
    checkinEm?: number | boolean;
  };

// A data em que a reserva vale. Reserva sem data gravada (anterior à migração)
// cai na próxima ocorrência do dia da semana, como sempre foi.
export function dataDaReserva(reserva: QuandoDaReserva): Date {
  return reserva.dataReserva ? dataDoIso(reserva.dataReserva) : dataDoDia(reserva.dia);
}

// "Sexta-feira, 16/10" — com a data real da reserva, não a da próxima sexta.
export function rotuloDaReserva(reserva: QuandoDaReserva): string {
  const dia = DIAS.find((d) => d.chave === reserva.dia)?.label ?? reserva.dia;
  return `${dia}, ${formatarDataCurta(dataDaReserva(reserva))}`;
}

// A reserva vale para esse dia (da semana) nessa data? Reserva sem data
// gravada vale pelo dia da semana apenas.
export function reservaNaData(reserva: QuandoDaReserva, dia: DiaReserva, dataIso: string): boolean {
  return reserva.dia === dia && (!reserva.dataReserva || reserva.dataReserva === dataIso);
}

export function dataIsoDoDia(chave: DiaReserva): string {
  return isoDaData(dataDoDia(chave));
}

const ORDEM_DIA: Record<DiaReserva, number> = { sexta: 0, sabado: 1, domingo: 2 };

function ordenar(reservas: Reserva[]): Reserva[] {
  return [...reservas].sort((a, b) => {
    const da = a.dataReserva ?? "";
    const db = b.dataReserva ?? "";
    if (da !== db) return da.localeCompare(db);
    if (a.dia !== b.dia) return ORDEM_DIA[a.dia] - ORDEM_DIA[b.dia];
    if (a.horario !== b.horario) return a.horario.localeCompare(b.horario);
    return a.mesaNumero.localeCompare(b.mesaNumero, "pt-BR", { numeric: true });
  });
}

// O Supabase devolve no máximo 1000 linhas por consulta, em silêncio. Sem
// paginar, a partir da reserva 1001 o sistema passaria a "esquecer" reservas.
const TAMANHO_DA_PAGINA = 1000;
// O painel e a planta só precisam do que é recente e do que vem pela frente.
const JANELA_DE_DIAS = 400;

// Lê a tabela de reservas, página por página. Só funciona para administrador
// logado — o banco não entrega esta tabela a visitante. desdeIso limita às
// reservas dessa data em diante; null traz todas.
async function lerReservas(desdeIso: string | null): Promise<{ linhas: ReservaRow[]; erro: string | null }> {
  const linhas: ReservaRow[] = [];
  for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
    let consulta = supabase.from("reservas").select("*");
    if (desdeIso) consulta = consulta.gte("data_reserva", desdeIso);
    // o id desempata reservas criadas no mesmo instante (as mesas de um grupo):
    // sem isso, uma linha poderia cair em duas páginas ou em nenhuma
    const { data, error } = await consulta
      .order("criada_em", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) return { linhas: [], erro: error.message };
    linhas.push(...((data ?? []) as ReservaRow[]));
    if (!data || data.length < TAMANHO_DA_PAGINA) return { linhas, erro: null };
  }
}

// null = a leitura falhou (não é o mesmo que "não há reservas").
async function buscarReservas(): Promise<Reserva[] | null> {
  const desde = new Date(dataHoje());
  desde.setDate(desde.getDate() - JANELA_DE_DIAS);
  const r = await lerReservas(isoDaData(desde));
  if (r.erro) {
    console.error("Erro ao buscar reservas:", r.erro);
    return null;
  }
  return ordenar(r.linhas.map(daRow));
}

// TODAS as reservas, sem a janela de dias: é o que vai para a planilha de
// cópia dos dados. Erro é erro — nunca devolve "lista vazia" no lugar, senão a
// cópia sairia em branco parecendo que deu certo.
export async function buscarTodasAsReservas(): Promise<{ reservas: Reserva[]; erro?: string }> {
  const r = await lerReservas(null);
  if (r.erro) {
    console.error("Erro ao buscar todas as reservas:", r.erro);
    return { reservas: [], erro: "Não foi possível ler as reservas agora. Confira a conexão e tente de novo." };
  }
  return { reservas: ordenar(r.linhas.map(daRow)) };
}

export type DadosDaReserva = {
  /** Data da reserva ("2026-10-16"). */
  dataReserva: string;
  horario: string;
  /** Uma entrada por mesa, com as pessoas que sentam nela. */
  mesas: { numero: string; pessoas: number }[];
  nome: string;
  telefone: string;
  email?: string;
  aniversario?: string;
  observacao?: string;
};

export type ResultadoDaReserva = {
  /** Uma reserva por mesa. Vazio quando deu erro. */
  reservas: Reserva[];
  erro?: string;
  /** O erro foi "alguém levou uma das mesas no meio-tempo". */
  mesaTomada?: boolean;
};

// Cria a reserva pela função "reservar" do banco: o grupo inteiro ou nada. Se
// uma das mesas foi levada por outra pessoa no meio-tempo, nenhuma é gravada —
// o cliente nunca fica com só parte das mesas. Quem garante que duas pessoas
// não reservam a mesma mesa é o índice único do próprio banco, não o navegador.
export async function reservar(dados: DadosDaReserva): Promise<ResultadoDaReserva> {
  const { data, error } = await supabase.rpc("reservar", {
    p_data: dados.dataReserva,
    p_horario: dados.horario,
    p_mesas: dados.mesas,
    p_nome: dados.nome,
    p_telefone: dados.telefone,
    p_email: dados.email ?? null,
    p_aniversario: dados.aniversario ?? null,
    p_observacao: dados.observacao ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    const varias = dados.mesas.length > 1;
    if (/RESTAURANTE_FECHADO/.test(msg)) {
      return { reservas: [], erro: "O restaurante estará fechado nesta data. Escolha outro dia." };
    }
    if (/DATA_FORA_DA_AGENDA/.test(msg)) {
      return { reservas: [], erro: "Essa data não está mais disponível para reserva. Volte e escolha outra data." };
    }
    if (/reservas_aniversario_valido/.test(msg)) {
      return { reservas: [], erro: "A data de aniversário não é válida. Use dia e mês, por exemplo 12/03." };
    }
    if (error.code === "23505") {
      return {
        reservas: [],
        mesaTomada: true,
        erro: varias
          ? "Uma das mesas acabou de ser reservada por outra pessoa. Nenhuma mesa foi reservada — volte e escolha de novo."
          : "Essa mesa acabou de ser reservada por outra pessoa. Volte e escolha outra.",
      };
    }
    if (/DADOS_INVALIDOS: telefone/.test(msg)) return { reservas: [], erro: "Confira o telefone: DDD + número." };
    if (/DADOS_INVALIDOS: nome/.test(msg)) return { reservas: [], erro: "Confira o nome da reserva." };
    if (/DADOS_INVALIDOS: email/.test(msg)) return { reservas: [], erro: "Confira o e-mail." };
    if (/nao existe|nao comporta/.test(msg)) {
      return { reservas: [], erro: "As mesas do salão mudaram enquanto você escolhia. Volte e escolha a mesa de novo." };
    }
    if (error.code === "PGRST202") {
      console.error("A função 'reservar' não existe no banco. Rode supabase-completo.sql no Supabase.");
      return { reservas: [], erro: "As reservas estão em atualização. Tente de novo em alguns minutos." };
    }
    console.error("Erro ao criar reserva:", msg);
    return { reservas: [], erro: "Não foi possível confirmar a reserva agora. Tente de novo." };
  }

  avisarMudanca();
  return { reservas: ((data ?? []) as ReservaRow[]).map(daRow) };
}

// As telas do painel abertas NESTE aparelho recarregam assim que ele próprio
// grava alguma coisa — sem depender do tempo real, que pode estar fora do ar
// (wi-fi que bloqueia a conexão, por exemplo). Sem isso, tocar em "Cliente
// chegou" poderia parecer que não funcionou.
const aoMudarReservas = new Set<() => void>();
function avisarMudanca() {
  for (const recarregar of aoMudarReservas) recarregar();
}

export type ResultadoAcao = { erro?: string };

// Atualiza UMA reserva e diz se deu certo. Antes essas ações engoliam o erro:
// a tela agia como se tivesse funcionado e a mesa continuava reservada. O
// .select() devolve a linha alterada — vazio quer dizer que nada foi mudado.
async function atualizarReserva(id: string, campos: Record<string, unknown>, falha: string): Promise<ResultadoAcao> {
  const { data, error } = await supabase.from("reservas").update(campos).eq("id", id).select("id");
  if (error) {
    console.error(`${falha}:`, error.message);
    return { erro: `${falha}. Confira a conexão e tente de novo.` };
  }
  if (!data || data.length === 0) {
    return { erro: `${falha}: a reserva não foi encontrada. Atualize a página.` };
  }
  avisarMudanca();
  return {};
}

// Cancelamento feito pelo PAINEL (administrador logado). O cliente cancela a
// própria reserva por cancelarMinhaReserva, mais abaixo.
export function cancelarReserva(id: string): Promise<ResultadoAcao> {
  return atualizarReserva(id, { cancelada: true }, "Não foi possível cancelar a reserva");
}

// Check-in: registra o horário de chegada do cliente. A mesa passa a
// aparecer como "ocupada" (em vez de só "reservada") na planta.
export function fazerCheckin(id: string): Promise<ResultadoAcao> {
  return atualizarReserva(id, { checkin_em: new Date().toISOString() }, "Não foi possível registrar a chegada");
}

export function desfazerCheckin(id: string): Promise<ResultadoAcao> {
  return atualizarReserva(id, { checkin_em: null }, "Não foi possível desfazer a chegada");
}

export const MINIMO_LETRAS_NA_BUSCA = 3;

// O que a consulta pública devolve de cada reserva: o suficiente pra pessoa
// reconhecer a dela (data, mesa, quantas pessoas). Sem nome, telefone, e-mail,
// aniversário nem observação — quem digita três letras quaisquer não leva os
// dados de ninguém.
export type ReservaConsultada = Pick<Reserva, "id" | "dia" | "dataReserva" | "horario" | "mesaNumero" | "pessoas" | "criadaEm"> & {
  cancelada: boolean;
  chegou: boolean;
};

type ConsultaRow = {
  id: string;
  dia: DiaReserva;
  data_reserva: string;
  horario: string;
  mesa_numero: string;
  pessoas: number;
  cancelada: boolean;
  chegou: boolean;
  criada_em: string;
};

// Consulta pública pelo NOME de quem reservou. A busca é feita pelo banco
// (função consultar_reservas): cada palavra digitada precisa aparecer no nome,
// em qualquer ordem e sem ligar pra acento — "maria silva" acha "Maria Souza
// Silva". O navegador não recebe mais a lista de todas as reservas.
export async function consultarReservas(termo: string): Promise<{ reservas: ReservaConsultada[]; erro?: string }> {
  if (termo.replace(/\s/g, "").length < MINIMO_LETRAS_NA_BUSCA) return { reservas: [] };

  const { data, error } = await supabase.rpc("consultar_reservas", { p_nome: termo.trim() });
  if (error) {
    console.error("Erro ao consultar reservas:", error.message);
    return { reservas: [], erro: "Não foi possível consultar agora. Confira a conexão e tente de novo." };
  }
  return {
    reservas: ((data ?? []) as ConsultaRow[]).map((l) => ({
      id: l.id,
      dia: l.dia,
      dataReserva: l.data_reserva,
      horario: l.horario,
      mesaNumero: l.mesa_numero,
      pessoas: l.pessoas,
      cancelada: l.cancelada,
      chegou: l.chegou,
      criadaEm: new Date(l.criada_em).getTime(),
    })),
  };
}

// "ok": cancelada. "telefone": os dígitos não conferem. "bloqueada": erraram
// demais (só o restaurante cancela agora). "encerrada": já passou ou o cliente
// já chegou. "ja_cancelada" e "nao_encontrada" dizem o que são.
export type ResultadoDoCancelamento = "ok" | "telefone" | "bloqueada" | "encerrada" | "ja_cancelada" | "nao_encontrada" | "erro";

// Cancelamento feito pelo CLIENTE, na tela de consulta. Como a consulta é pelo
// nome, o banco só cancela se vierem os 4 últimos dígitos do telefone usado na
// reserva — senão qualquer pessoa cancelaria a reserva de qualquer outra.
export async function cancelarMinhaReserva(id: string, finalDoTelefone: string): Promise<ResultadoDoCancelamento> {
  const { data, error } = await supabase.rpc("cancelar_minha_reserva", { p_id: id, p_final_telefone: finalDoTelefone });
  if (error) {
    console.error("Erro ao cancelar a reserva:", error.message);
    return "erro";
  }
  const respostas: ResultadoDoCancelamento[] = ["ok", "telefone", "bloqueada", "encerrada", "ja_cancelada", "nao_encontrada"];
  return respostas.includes(data) ? (data as ResultadoDoCancelamento) : "erro";
}

export type StatusMesa = "livre" | "reservada" | "ocupada" | "pequena";

// Status calculado em cima de uma lista de reservas já carregada (via
// useReservas) — não bate no banco a cada mesa desenhada na planta.
// "reservada" = tem reserva ativa mas o cliente ainda não fez check-in.
// "ocupada" = check-in feito, cliente já está na mesa.
// dataIso: a data que a tela está mostrando. Sem ela vale a próxima ocorrência
// do dia da semana (é o que o cliente enxerga ao reservar). O painel do
// restaurante passa a data de operação, onde o dia de hoje vale hoje.
// Sem filtrar pela data, a reserva da semana passada continuaria "ocupando"
// a mesa nas semanas seguintes.
export function statusMesa(
  reservas: Ocupacao[],
  dia: DiaReserva,
  horario: string,
  mesa: Mesa,
  pessoasMin?: number,
  dataIso: string = dataIsoDoDia(dia),
): StatusMesa {
  const reserva = reservas.find((r) => !r.cancelada && reservaNaData(r, dia, dataIso) && r.horario === horario && r.mesaNumero === mesa.numero);
  if (reserva) return reserva.checkinEm ? "ocupada" : "reservada";
  if (pessoasMin && mesa.capacidade < pessoasMin) return "pequena";
  return "livre";
}

export function reservaDaMesa(
  reservas: Reserva[],
  dia: DiaReserva,
  horario: string,
  mesaNumero: string,
  dataIso: string = dataIsoDoDia(dia),
): Reserva | undefined {
  return reservas.find((r) => !r.cancelada && reservaNaData(r, dia, dataIso) && r.horario === horario && r.mesaNumero === mesaNumero);
}

// Tolerância (TOLERANCIA_MINUTOS, em regras.ts): o sistema NUNCA cancela ou
// libera a mesa sozinho, só sinaliza visualmente pro administrador decidir.
export type StatusChegada = "aguardando" | "tolerancia" | "atrasado" | "chegou" | "cancelada";

// minutosAgora: minutos desde 00:00 (no fuso de São Paulo) do horário real
// atual (null até o relógio montar no cliente, pra evitar mismatch de
// hidratação). A data da reserva também conta: reserva de outro dia não está
// "na tolerância" só porque o relógio de hoje passou das 19h30.
export function statusChegada(
  reserva: QuandoDaReserva & Pick<Reserva, "horario" | "cancelada"> & { checkinEm?: number | boolean },
  minutosAgora: number | null,
): StatusChegada {
  if (reserva.cancelada) return "cancelada";
  if (reserva.checkinEm) return "chegou";
  if (minutosAgora === null) return "aguardando";
  const hoje = relogioSaoPaulo();
  if (reserva.dataReserva) {
    if (reserva.dataReserva < hoje.iso) return "atrasado";
    if (reserva.dataReserva > hoje.iso) return "aguardando";
  } else {
    // reserva antiga, sem data gravada: só vale a conta do relógio se hoje é
    // o dia da semana dela
    const dia = DIAS.find((d) => d.chave === reserva.dia);
    if (dia && dia.diaSemana !== hoje.diaSemana) return "aguardando";
  }
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

export function mesasDisponiveisPara(reservas: Ocupacao[], dia: DiaReserva, horario: string, pessoas: number): Mesa[] {
  return mesas.filter((m) => statusMesa(reservas, dia, horario, m, pessoas) === "livre");
}

// CRM simples: agrupa reservas pelo telefone.
export type Cliente = { nome: string; telefone: string; email?: string; aniversario?: string; totalReservas: number };

export function listarClientes(reservas: Reserva[]): Cliente[] {
  const mapa = new Map<string, Cliente>();
  for (const r of reservas) {
    const chave = chaveDoTelefone(r.telefone);
    const existente = mapa.get(chave);
    if (existente) {
      existente.totalReservas += 1;
      if (r.email) existente.email = r.email;
      if (r.aniversario) existente.aniversario = r.aniversario;
    } else {
      mapa.set(chave, { nome: r.nome, telefone: r.telefone, email: r.email, aniversario: r.aniversario, totalReservas: 1 });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.totalReservas - a.totalReservas);
}

// Quantos dias faltam (ou passaram, se negativo) entre uma data e o aniversário
// "dd/mm" mais próximo dela. Serve pra avisar "aniversário perto da reserva".
export function diasAteAniversario(aniversario: string, dataIso: string): number | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(aniversario);
  if (!m) return null;
  const ref = dataDoIso(dataIso);
  let melhor: number | null = null;
  for (const ano of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
    const niver = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    const dif = Math.round((niver.getTime() - ref.getTime()) / 86_400_000);
    if (melhor === null || Math.abs(dif) < Math.abs(melhor)) melhor = dif;
  }
  return melhor;
}

// Histórico básico de um cliente (não é CRM — só a lista de reservas dele,
// mais recentes primeiro, pra consulta rápida no admin).
export function historicoDoCliente(reservas: Reserva[], telefone: string): Reserva[] {
  const chave = chaveDoTelefone(telefone);
  return reservas.filter((r) => chaveDoTelefone(r.telefone) === chave).sort((a, b) => b.criadaEm - a.criadaEm);
}

type OcupacaoRow = { data: string; horario: string; mesa: string; chegou: boolean };

// De quanto em quanto tempo a tela do cliente confere de novo as mesas livres.
const INTERVALO_DAS_MESAS_MS = 20_000;

async function buscarMesasOcupadas(): Promise<Ocupacao[] | null> {
  const { data, error } = await supabase.rpc("mesas_ocupadas");
  if (error) {
    console.error("Erro ao buscar as mesas ocupadas:", error.message);
    return null;
  }
  const ocupadas: Ocupacao[] = [];
  for (const l of (data ?? []) as OcupacaoRow[]) {
    const dia = diaDaData(l.data);
    if (dia) ocupadas.push({ dia, dataReserva: l.data, horario: l.horario, mesaNumero: l.mesa, checkinEm: l.chegou });
  }
  return ocupadas;
}

// As mesas tomadas, para a tela do CLIENTE: só data, horário e mesa — sem nome
// nem telefone de ninguém. Visitante não recebe o tempo real da tabela de
// reservas, então a lista é conferida de novo de tempos em tempos e sempre que
// a pessoa volta pra aba. Se duas pessoas tentarem a mesma mesa no intervalo,
// o banco recusa a segunda (índice único) — isto aqui é só o que a tela mostra.
export function useMesasOcupadas(): {
  ocupadas: Ocupacao[];
  carregando: boolean;
  /** Confere agora e devolve a lista nova (null se a leitura falhou). */
  recarregar: () => Promise<Ocupacao[] | null>;
} {
  const [ocupadas, setOcupadas] = useState<Ocupacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregarAgora = useRef<() => Promise<Ocupacao[] | null>>(async () => null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const dados = await buscarMesasOcupadas();
      if (!ativo) return dados;
      // leitura que falhou não apaga o que já estava na tela
      if (dados) setOcupadas(dados);
      setCarregando(false);
      return dados;
    }
    carregarAgora.current = carregar;
    carregar();

    const seVisivel = () => {
      if (document.visibilityState === "visible") carregar();
    };
    const relogio = setInterval(seVisivel, INTERVALO_DAS_MESAS_MS);
    document.addEventListener("visibilitychange", seVisivel);
    window.addEventListener("focus", seVisivel);

    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", seVisivel);
      window.removeEventListener("focus", seVisivel);
    };
  }, []);

  const recarregar = useCallback(() => carregarAgora.current(), []);
  return { ocupadas, carregando, recarregar };
}

// De quanto em quanto tempo o painel confere as reservas por conta própria.
const INTERVALO_DO_PAINEL_MS = 60_000;

// PAINEL: carrega as reservas e escuta o realtime do Supabase — qualquer
// reserva ou cancelamento feito em QUALQUER dispositivo aparece aqui sozinho,
// sem precisar recarregar a página. Exige administrador logado.
export function useReservas(): { reservas: Reserva[]; carregando: boolean } {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const dados = await buscarReservas();
      if (!ativo) return;
      // leitura que falhou (internet do salão oscilou) não esvazia o painel
      if (dados) setReservas(dados);
      setCarregando(false);
    }
    carregar();
    aoMudarReservas.add(carregar);

    // Rede de segurança do tempo real: se a conexão dele cair (wi-fi do salão,
    // tablet que dormiu), o painel não fica parado no tempo — confere de novo a
    // cada minuto e sempre que a pessoa volta pra tela.
    const seVisivel = () => {
      if (document.visibilityState === "visible") carregar();
    };
    const relogio = setInterval(seVisivel, INTERVALO_DO_PAINEL_MS);
    document.addEventListener("visibilitychange", seVisivel);
    window.addEventListener("focus", seVisivel);

    // Nome próprio a cada assinatura: o Supabase devolve o canal que já existe
    // quando o nome se repete, e fechar um canal leva um instante. Trocar de
    // tela nesse intervalo caía num canal já inscrito e o .on() estourava
    // "cannot add callbacks after subscribe()".
    const canal = supabase
      .channel(`reservas-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => {
        carregar();
      })
      .subscribe();

    return () => {
      ativo = false;
      aoMudarReservas.delete(carregar);
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", seVisivel);
      window.removeEventListener("focus", seVisivel);
      supabase.removeChannel(canal);
    };
  }, []);

  return { reservas, carregando };
}
