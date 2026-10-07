"use client";

// Configuração da planta: número, capacidade, área e posição de cada mesa.
//
// Fonte de verdade é a tabela "mesas" do Supabase (supabase-migration-mesas.sql),
// editada pelo administrador em Mesas > Editar planta. O painel, o modo
// operação e a tela do cliente leem daqui — não existe planta por tela.
//
// Enquanto a migração não for rodada, cai no padrão de lib/regras.ts para o
// sistema continuar funcionando normalmente.

import { useCallback, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { POSICOES_PADRAO, mesas as mesasPadrao, type FormatoMesa, type Mesa, type ZonaMesa } from "./regras";

export type MesaConfig = Mesa & {
  id: string | null; // null = veio do padrão do código, ainda não existe no banco
  /** Centro do marcador sobre a imagem da planta, em % da largura (0–100). */
  x: number;
  /** Centro do marcador sobre a imagem da planta, em % da altura (0–100). */
  y: number;
};

type LinhaMesa = {
  id: string;
  numero: string;
  capacidade: number;
  formato: FormatoMesa;
  zona: ZonaMesa;
  pos_x: number | string;
  pos_y: number | string;
};

export const MESAS_PADRAO: MesaConfig[] = mesasPadrao.map((m) => ({
  ...m,
  id: null,
  x: POSICOES_PADRAO[m.numero]?.x ?? 0,
  y: POSICOES_PADRAO[m.numero]?.y ?? 0,
}));

function ordenar(lista: MesaConfig[]): MesaConfig[] {
  return [...lista].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
}

function daLinha(l: LinhaMesa): MesaConfig {
  return {
    id: l.id,
    numero: l.numero,
    capacidade: l.capacidade,
    formato: l.formato,
    zona: l.zona,
    x: Number(l.pos_x),
    y: Number(l.pos_y),
  };
}

export async function carregarMesas(): Promise<{ mesas: MesaConfig[]; semTabela: boolean }> {
  const { data, error } = await supabase.from("mesas").select("id, numero, capacidade, formato, zona, pos_x, pos_y");
  if (error || !data) return { mesas: MESAS_PADRAO, semTabela: true };
  if (data.length === 0) return { mesas: MESAS_PADRAO, semTabela: false };
  return { mesas: ordenar((data as LinhaMesa[]).map(daLinha)), semTabela: false };
}

// ---------------------------------------------------------------------------
// A planta é lida uma vez e compartilhada por todas as telas montadas. Várias
// telas chamam useMesasConfig ao mesmo tempo (a página do cliente monta a
// versão de desktop e a de celular juntas) e o Supabase recusa dois canais com
// o mesmo nome — por isso aqui existe UM canal e um estado só.

type Estado = { mesas: MesaConfig[]; carregando: boolean; semTabela: boolean };

let estado: Estado = { mesas: MESAS_PADRAO, carregando: true, semTabela: false };
let canal: RealtimeChannel | null = null;
let buscando = false;
const ouvintes = new Set<() => void>();

function publicar(novo: Estado) {
  estado = novo;
  for (const avisar of ouvintes) avisar();
}

async function buscar() {
  if (buscando) return;
  buscando = true;
  try {
    const r = await carregarMesas();
    publicar({ mesas: r.mesas, carregando: false, semTabela: r.semTabela });
  } finally {
    buscando = false;
  }
}

// Nome exclusivo desta carga do módulo: supabase.channel() devolve o canal já
// existente quando o nome se repete, e remover um canal é assíncrono. Sem isso,
// ao remontar (StrictMode, troca de tela) cairíamos num canal já inscrito e o
// .on() seguinte estoura "cannot add callbacks after subscribe()".
const NOME_CANAL = `planta-mesas-${Math.random().toString(36).slice(2, 10)}`;

function assinar(avisar: () => void) {
  ouvintes.add(avisar);

  // Um canal por aba, criado uma vez e mantido: não vale a pena derrubar e
  // reabrir a cada troca de tela.
  if (!canal) {
    canal = supabase
      .channel(NOME_CANAL)
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => {
        buscar();
      })
      .subscribe();
  }
  if (estado.carregando) buscar();

  return () => {
    ouvintes.delete(avisar);
  };
}

const ler = () => estado;

// Lê a planta e acompanha mudanças feitas em qualquer tela.
export function useMesasConfig() {
  const atual = useSyncExternalStore(assinar, ler, ler);
  const recarregar = useCallback(async () => {
    await buscar();
  }, []);
  return { ...atual, recarregar };
}

// Salva a posição calibrada dos marcadores. x e y são % da imagem (0 a 100),
// guardados com duas casas. Uma chamada por mesa movida — são poucas.
export async function salvarPosicoes(itens: { id: string; x: number; y: number }[]): Promise<{ erro?: string }> {
  const dec = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
  for (const item of itens) {
    const { error } = await supabase
      .from("mesas")
      .update({ pos_x: dec(item.x), pos_y: dec(item.y) })
      .eq("id", item.id);
    if (error) return { erro: error.message };
  }
  return {};
}

// Renomear passa pela função do banco: ela leva junto as reservas que apontam
// pra essa mesa e recusa número repetido (ver supabase-migration-mesas.sql).
export async function renomearMesa(id: string, numero: string): Promise<{ erro?: string }> {
  const { error } = await supabase.rpc("renomear_mesa", { mesa_id: id, novo_numero: numero.trim() });
  if (!error) return {};
  const msg = error.message ?? "";
  if (/Já existe uma mesa/.test(msg)) return { erro: `Já existe uma mesa com o número ${numero.trim()}.` };
  if (/em branco/.test(msg)) return { erro: "O número da mesa não pode ficar em branco." };
  if (/conflitantes/.test(msg)) return { erro: "Há reservas conflitantes nesse número. Resolva as reservas antes de renomear." };
  if (/function|does not exist|schema cache/i.test(msg)) {
    return { erro: "A planta ainda não foi ativada no banco. Rode supabase-migration-mesas.sql no Supabase." };
  }
  return { erro: msg || "Não foi possível renomear a mesa." };
}
