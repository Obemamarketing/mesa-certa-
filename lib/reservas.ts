"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ANTECEDENCIA_DIAS, HORARIO_FIXO, TOLERANCIA_MINUTOS, mesas, minutosDoHorario, type Mesa } from "./regras";
import { soDigitos } from "./validacao";

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

// A data em que a reserva vale. Reserva sem data gravada (anterior à migração)
// cai na próxima ocorrência do dia da semana, como sempre foi.
export function dataDaReserva(reserva: Reserva): Date {
  return reserva.dataReserva ? dataDoIso(reserva.dataReserva) : dataDoDia(reserva.dia);
}

// "Sexta-feira, 16/10" — com a data real da reserva, não a da próxima sexta.
export function rotuloDaReserva(reserva: Reserva): string {
  const dia = DIAS.find((d) => d.chave === reserva.dia)?.label ?? reserva.dia;
  return `${dia}, ${formatarDataCurta(dataDaReserva(reserva))}`;
}

// A reserva vale para esse dia (da semana) nessa data? Reserva sem data
// gravada vale pelo dia da semana apenas.
export function reservaNaData(reserva: Reserva, dia: DiaReserva, dataIso: string): boolean {
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

async function buscarReservas(): Promise<Reserva[]> {
  const desde = new Date(dataHoje());
  desde.setDate(desde.getDate() - JANELA_DE_DIAS);
  const desdeIso = isoDaData(desde);

  async function pagina(de: number, comJanela: boolean) {
    let consulta = supabase.from("reservas").select("*");
    if (comJanela) consulta = consulta.gte("data_reserva", desdeIso);
    return consulta.order("criada_em", { ascending: true }).range(de, de + TAMANHO_DA_PAGINA - 1);
  }

  async function tudo(comJanela: boolean): Promise<{ linhas: ReservaRow[]; erro: string | null }> {
    const linhas: ReservaRow[] = [];
    for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
      const { data, error } = await pagina(de, comJanela);
      if (error) return { linhas: [], erro: error.message };
      linhas.push(...((data ?? []) as ReservaRow[]));
      if (!data || data.length < TAMANHO_DA_PAGINA) return { linhas, erro: null };
    }
  }

  // Se o banco ainda não tem a coluna data_reserva (migração por rodar), a
  // janela falha: cai pra leitura sem filtro em vez de mostrar tudo vazio.
  let r = await tudo(true);
  if (r.erro) r = await tudo(false);
  if (r.erro) {
    console.error("Erro ao buscar reservas:", r.erro);
    return [];
  }
  return ordenar(r.linhas.map(daRow));
}

// Cria a reserva direto no banco. O índice único (data, horário, mesa) do
// supabase-migration-datas.sql garante que duas pessoas não reservam a mesma
// mesa ao mesmo tempo, mesmo em dispositivos diferentes — a checagem é feita
// pelo próprio banco, não no navegador.
export async function criarReserva(
  dados: Omit<Reserva, "id" | "criadaEm">
): Promise<{ reserva: Reserva | null; erro?: string }> {
  const linha: Record<string, unknown> = {
    dia: dados.dia,
    horario: dados.horario,
    mesa_numero: dados.mesaNumero,
    pessoas: dados.pessoas,
    nome: dados.nome,
    telefone: dados.telefone,
    email: dados.email ?? null,
    observacao: dados.observacao ?? null,
  };
  // A data escolhida vai junto. Sem ela, o banco calcula a próxima ocorrência do
  // dia da semana, como sempre fez.
  if (dados.dataReserva) linha.data_reserva = dados.dataReserva;
  if (dados.aniversario) linha.aniversario = dados.aniversario;

  let { data, error } = await supabase.from("reservas").insert(linha).select().single();

  // Banco ainda sem a coluna "aniversario" (supabase-migration-agenda.sql por
  // rodar): a reserva não pode deixar de ser feita por causa disso — grava sem
  // o aniversário.
  if (error && "aniversario" in linha && /aniversario/i.test(error.message) && (error.code === "PGRST204" || error.code === "42703")) {
    console.error("Coluna 'aniversario' ausente no banco; reserva gravada sem ela. Rode supabase-migration-agenda.sql.");
    delete linha.aniversario;
    ({ data, error } = await supabase.from("reservas").insert(linha).select().single());
  }

  if (error) {
    if (/RESTAURANTE_FECHADO/.test(error.message)) {
      return { reserva: null, erro: "O restaurante estará fechado nesta data. Escolha outro dia." };
    }
    if (/DATA_FORA_DA_AGENDA/.test(error.message)) {
      return { reserva: null, erro: "Essa data não está mais disponível para reserva. Volte e escolha outra data." };
    }
    if (/reservas_aniversario_valido/.test(error.message)) {
      return { reserva: null, erro: "A data de aniversário não é válida. Use dia e mês, por exemplo 12/03." };
    }
    if (error.code === "23505") {
      return { reserva: null, erro: "Essa mesa acabou de ser reservada por outra pessoa. Escolha outra." };
    }
    console.error("Erro ao criar reserva:", error.message);
    return { reserva: null, erro: "Não foi possível confirmar a reserva agora. Tente de novo." };
  }

  return { reserva: daRow(data as ReservaRow) };
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
  return {};
}

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

// minúsculas e sem acento: "José" e "jose" são a mesma coisa na busca por nome
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export const MINIMO_LETRAS_NA_BUSCA = 3;

// Consulta pública pelo NOME de quem reservou. Cada palavra digitada precisa
// aparecer no nome (em qualquer ordem), então "maria silva" acha "Maria Souza
// Silva". Busca tudo e filtra no cliente — base pequena de protótipo.
export async function buscarReservaDoCliente(termo: string): Promise<Reserva[]> {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (palavras.join("").length < MINIMO_LETRAS_NA_BUSCA) return [];

  const todas = await buscarReservas();
  const encontradas = todas.filter((r) => {
    const nome = semAcento(r.nome);
    return palavras.every((p) => nome.includes(p));
  });

  return encontradas.sort((a, b) => b.criadaEm - a.criadaEm);
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
  reservas: Reserva[],
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
export function statusChegada(reserva: Reserva, minutosAgora: number | null): StatusChegada {
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

export function mesasDisponiveisPara(reservas: Reserva[], dia: DiaReserva, horario: string, pessoas: number): Mesa[] {
  return mesas.filter((m) => statusMesa(reservas, dia, horario, m, pessoas) === "livre");
}

// O mesmo telefone escrito de jeitos diferentes — "(41) 99999-9999",
// "41999999999", "+55 41 99999-9999" — é a mesma pessoa.
function chaveDoTelefone(telefone: string): string {
  const digitos = soDigitos(telefone);
  const local = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  return local || telefone.trim();
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
      supabase.removeChannel(canal);
    };
  }, []);

  return { reservas, carregando };
}
