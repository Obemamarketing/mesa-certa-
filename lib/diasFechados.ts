"use client";

// Dias em que o restaurante está FECHADO. O administrador marca no calendário
// (Admin > Calendário) e a tabela "dias_fechados" do Supabase guarda. Nesses
// dias o cliente não consegue reservar mesa — e o banco recusa a reserva mesmo
// que alguém tente por fora da tela (ver supabase-migration-dias-fechados.sql).
//
// Mesmo desenho de lib/mesas.ts: UM estado e UM canal em tempo real
// compartilhados por todas as telas.

import { useCallback, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type DiaFechado = { data: string; motivo: string | null };

type Estado = { fechados: Map<string, DiaFechado>; carregando: boolean; semTabela: boolean };

const VAZIO = new Map<string, DiaFechado>();

let estado: Estado = { fechados: VAZIO, carregando: true, semTabela: false };
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
    const { data, error } = await supabase.from("dias_fechados").select("data, motivo");
    if (error || !data) {
      // sem a tabela (migração ainda não rodada): tudo aberto, sem quebrar nada
      publicar({ fechados: VAZIO, carregando: false, semTabela: true });
      return;
    }
    const mapa = new Map<string, DiaFechado>();
    for (const linha of data as DiaFechado[]) mapa.set(linha.data, linha);
    publicar({ fechados: mapa, carregando: false, semTabela: false });
  } finally {
    buscando = false;
  }
}

// Nome exclusivo por carga do módulo: o Supabase devolve o canal existente
// quando o nome se repete (ver o mesmo cuidado em lib/mesas.ts).
const NOME_CANAL = `dias-fechados-${Math.random().toString(36).slice(2, 10)}`;

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  if (!canal) {
    canal = supabase
      .channel(NOME_CANAL)
      .on("postgres_changes", { event: "*", schema: "public", table: "dias_fechados" }, () => {
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

export function useDiasFechados() {
  const atual = useSyncExternalStore(assinar, ler, ler);
  const recarregar = useCallback(async () => {
    await buscar();
  }, []);
  return { ...atual, recarregar };
}

// Fecha o restaurante numa data ("2026-10-16"). Se já estava fechado, só
// atualiza o motivo.
export async function fecharDia(data: string, motivo: string): Promise<{ erro?: string }> {
  const { error } = await supabase
    .from("dias_fechados")
    .upsert({ data, motivo: motivo.trim() || null }, { onConflict: "data" });
  if (error) return { erro: mensagemDeErro(error.message) };
  await buscar();
  return {};
}

export async function reabrirDia(data: string): Promise<{ erro?: string }> {
  const { error } = await supabase.from("dias_fechados").delete().eq("data", data);
  if (error) return { erro: mensagemDeErro(error.message) };
  await buscar();
  return {};
}

function mensagemDeErro(msg: string): string {
  if (/dias_fechados|schema cache|does not exist/i.test(msg)) {
    return "O calendário ainda não foi ativado no banco. Rode supabase-migration-dias-fechados.sql no Supabase.";
  }
  return "Não foi possível salvar agora. Tente de novo.";
}
