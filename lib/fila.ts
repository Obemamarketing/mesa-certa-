"use client";

// Fila de espera para data lotada (supabase-migration-fila.sql).
//
// Visitante: entra na fila, acompanha a própria espera pelo código do link
// (/fila/<código>) e sai da fila — sempre por funções do banco, nunca lendo a
// tabela. Painel (administrador logado): lê e altera a fila inteira.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { dataHoje, isoDaData } from "./reservas";
import { chamarFuncaoPublica, erroDoCaptcha } from "./rpcPublica";

// ------------------------------------------------------------------ visitante

export type DadosDaEspera = {
  dataReserva: string;
  horario: string;
  pessoas: number;
  nome: string;
  telefone: string;
  observacao?: string;
};

export async function entrarNaFila(dados: DadosDaEspera, captcha?: string | null): Promise<{ codigo?: string; posicao?: number; erro?: string; captcha?: boolean }> {
  const { data, error } = await chamarFuncaoPublica<{ codigo: string; posicao: number }[]>(
    "entrar_na_fila",
    {
      p_data: dados.dataReserva,
      p_horario: dados.horario,
      p_pessoas: dados.pessoas,
      p_nome: dados.nome,
      p_telefone: dados.telefone,
      p_observacao: dados.observacao ?? null,
    },
    captcha,
  );
  if (error) {
    const msg = error.message ?? "";
    const doCaptcha = erroDoCaptcha(error);
    if (doCaptcha) return { erro: doCaptcha, captcha: true };
    if (/DADOS_INVALIDOS: nome e sobrenome/.test(msg)) return { erro: "Digite nome e sobrenome, como em um documento." };
    if (/JA_NA_FILA/.test(msg)) return { erro: "Este telefone já está na fila de espera desta data." };
    if (/RESTAURANTE_FECHADO/.test(msg)) return { erro: "O restaurante estará fechado nesta data. Escolha outro dia." };
    if (/DATA_FORA_DA_AGENDA/.test(msg)) return { erro: "Essa data não está mais disponível. Volte e escolha outra." };
    if (/LIMITE_DE_RESERVAS/.test(msg)) return { erro: "Estamos recebendo muitos pedidos neste momento. Tente de novo em alguns minutos." };
    if (/DADOS_INVALIDOS: telefone/.test(msg)) return { erro: "Confira o WhatsApp: DDD + número." };
    if (/DADOS_INVALIDOS: nome/.test(msg)) return { erro: "Confira o nome." };
    console.error("Erro ao entrar na fila:", msg);
    return { erro: "Não foi possível entrar na fila agora. Tente de novo." };
  }
  const linha = ((data ?? []) as { codigo: string; posicao: number }[])[0];
  if (!linha) return { erro: "Não foi possível entrar na fila agora. Tente de novo." };
  return { codigo: linha.codigo, posicao: linha.posicao };
}

export type StatusDaEspera = "aguardando" | "chamado" | "atendido" | "saiu" | "removido" | "expirado";

export type MinhaEspera = {
  dataReserva: string;
  horario: string;
  pessoas: number;
  primeiroNome: string;
  status: StatusDaEspera;
  /** Só enquanto aguardando. */
  posicao: number | null;
  chamadaEm: number | null;
};

// null = esse código não existe; erro = não deu para consultar agora.
export async function verMinhaEspera(codigo: string): Promise<{ espera: MinhaEspera | null; erro?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(codigo)) return { espera: null };
  const { data, error } = await supabase.rpc("ver_minha_fila", { p_codigo: codigo });
  if (error) {
    console.error("Erro ao consultar a fila:", error.message);
    return { espera: null, erro: "Não foi possível atualizar agora. Confira a conexão." };
  }
  const l = ((data ?? []) as {
    data_reserva: string; horario: string; pessoas: number; primeiro_nome: string;
    status: StatusDaEspera; posicao: number | null; chamada_em: string | null;
  }[])[0];
  if (!l) return { espera: null };
  return {
    espera: {
      dataReserva: l.data_reserva,
      horario: l.horario,
      pessoas: l.pessoas,
      primeiroNome: l.primeiro_nome,
      status: l.status,
      posicao: l.posicao,
      chamadaEm: l.chamada_em ? new Date(l.chamada_em).getTime() : null,
    },
  };
}

export async function sairDaFila(codigo: string): Promise<{ erro?: string }> {
  const { data, error } = await supabase.rpc("sair_da_fila", { p_codigo: codigo });
  if (error) {
    console.error("Erro ao sair da fila:", error.message);
    return { erro: "Não foi possível sair da fila agora. Tente de novo." };
  }
  return data === "ok" || data === "encerrada" ? {} : { erro: "Não encontramos esta espera." };
}

// ---------------------------------------------------------------------- painel

export type Espera = {
  id: string;
  codigo: string;
  dataReserva: string;
  horario: string;
  pessoas: number;
  nome: string;
  telefone: string;
  observacao?: string;
  status: Exclude<StatusDaEspera, "expirado">;
  criadaEm: number;
  chamadaEm: number | null;
  reservaId: string | null;
};

type EsperaRow = {
  id: string; codigo: string; data_reserva: string; horario: string; pessoas: number; nome: string; telefone: string;
  observacao: string | null; status: Espera["status"]; criada_em: string; chamada_em: string | null; reserva_id: string | null;
};

const daRow = (l: EsperaRow): Espera => ({
  id: l.id,
  codigo: l.codigo,
  dataReserva: l.data_reserva,
  horario: l.horario,
  pessoas: l.pessoas,
  nome: l.nome,
  telefone: l.telefone,
  observacao: l.observacao ?? undefined,
  status: l.status,
  criadaEm: new Date(l.criada_em).getTime(),
  chamadaEm: l.chamada_em ? new Date(l.chamada_em).getTime() : null,
  reservaId: l.reserva_id,
});

// Telas do painel abertas neste aparelho recarregam logo depois de uma ação
// (mesma ideia de lib/reservas.ts: não depender só do tempo real).
const aoMudarFila = new Set<() => void>();
const avisarMudanca = () => { for (const f of aoMudarFila) f(); };

// A fila de hoje em diante, em ordem de chegada dentro de cada data.
export function useFilaDeEspera(): { esperas: Espera[]; carregando: boolean; erro: boolean } {
  const [esperas, setEsperas] = useState<Espera[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const { data, error } = await supabase
        .from("fila_espera")
        .select("id, codigo, data_reserva, horario, pessoas, nome, telefone, observacao, status, criada_em, chamada_em, reserva_id")
        .gte("data_reserva", isoDaData(dataHoje()))
        .order("data_reserva", { ascending: true })
        .order("criada_em", { ascending: true });
      if (!ativo) return;
      if (error) {
        console.error("Erro ao buscar a fila de espera:", error.message);
        setErro(true);
      } else {
        setErro(false);
        setEsperas(((data ?? []) as EsperaRow[]).map(daRow));
      }
      setCarregando(false);
    }
    carregar();
    aoMudarFila.add(carregar);

    const canal = supabase
      .channel(`fila-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_espera" }, () => carregar())
      .subscribe();
    const seVisivel = () => { if (document.visibilityState === "visible") carregar(); };
    const relogio = setInterval(seVisivel, 60_000);
    document.addEventListener("visibilitychange", seVisivel);
    window.addEventListener("focus", seVisivel);

    return () => {
      ativo = false;
      aoMudarFila.delete(carregar);
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", seVisivel);
      window.removeEventListener("focus", seVisivel);
      supabase.removeChannel(canal);
    };
  }, []);

  return { esperas, carregando, erro };
}

async function atualizar(id: string, campos: Record<string, unknown>): Promise<{ erro?: string }> {
  const { data, error } = await supabase
    .from("fila_espera")
    .update({ ...campos, atualizada_em: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("Erro ao atualizar a fila:", error.message);
    return { erro: "Não foi possível atualizar a fila. Confira a conexão e tente de novo." };
  }
  avisarMudanca();
  return {};
}

export const chamarDaFila = (id: string) => atualizar(id, { status: "chamado", chamada_em: new Date().toISOString() });
export const voltarParaFila = (id: string) => atualizar(id, { status: "aguardando", chamada_em: null });
export const marcarAtendido = (id: string, reservaId?: string) => atualizar(id, { status: "atendido", reserva_id: reservaId ?? null });
export const tirarDaFila = (id: string) => atualizar(id, { status: "removido" });

// Endereço da página de acompanhamento, para mandar no WhatsApp.
export function linkDaEspera(codigo: string): string {
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  return `${origem}/fila/${codigo}`;
}
