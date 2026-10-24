"use client";

// Pedidos do cliente sobre os próprios dados (LGPD) — supabase-migration-lgpd.sql.
//
// Visitante: só faz o pedido (função do banco). Painel: lê os pedidos, marca
// como respondidos e apaga os dados de um telefone.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type TipoDePedido = "exclusao" | "acesso" | "correcao" | "outro";

export const TIPOS_DE_PEDIDO: { valor: TipoDePedido; rotulo: string; explicacao: string }[] = [
  { valor: "exclusao", rotulo: "Apagar meus dados", explicacao: "Apagamos seu nome, WhatsApp, aniversário e observações. Reservas futuras são canceladas." },
  { valor: "acesso", rotulo: "Ver meus dados", explicacao: "Mandamos pelo WhatsApp tudo o que temos guardado sobre você." },
  { valor: "correcao", rotulo: "Corrigir meus dados", explicacao: "Conte na mensagem o que está errado." },
  { valor: "outro", rotulo: "Outro assunto", explicacao: "Retirar consentimento, tirar dúvidas ou qualquer outro pedido." },
];

export function rotuloDoTipo(tipo: TipoDePedido): string {
  return TIPOS_DE_PEDIDO.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

export async function pedirSobreMeusDados(dados: {
  tipo: TipoDePedido;
  nome: string;
  telefone: string;
  mensagem?: string;
}): Promise<{ protocolo?: string; erro?: string }> {
  const { data, error } = await supabase.rpc("pedir_sobre_meus_dados", {
    p_tipo: dados.tipo,
    p_nome: dados.nome,
    p_telefone: dados.telefone,
    p_mensagem: dados.mensagem ?? null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/LIMITE_DE_PEDIDOS/.test(msg)) return { erro: "Recebemos muitos pedidos deste número hoje. Tente amanhã ou fale com o restaurante pelo WhatsApp." };
    if (/DADOS_INVALIDOS: telefone/.test(msg)) return { erro: "Confira o WhatsApp: DDD + número." };
    if (/DADOS_INVALIDOS: nome/.test(msg)) return { erro: "Confira o nome." };
    console.error("Erro ao registrar pedido sobre dados:", msg);
    return { erro: "Não foi possível enviar agora. Tente de novo ou fale com o restaurante pelo WhatsApp." };
  }
  return { protocolo: String(data) };
}

// ------------------------------------------------------------------- painel

export type PedidoSobreDados = {
  id: string;
  tipo: TipoDePedido;
  nome: string;
  telefone: string;
  mensagem: string | null;
  status: "aberto" | "concluido" | "recusado";
  criadoEm: string;
  concluidoEm: string | null;
  nota: string | null;
};

type Linha = {
  id: string;
  tipo: TipoDePedido;
  nome: string;
  telefone: string;
  mensagem: string | null;
  status: PedidoSobreDados["status"];
  criado_em: string;
  concluido_em: string | null;
  nota: string | null;
};

export function protocoloDoPedido(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function usePedidosSobreDados() {
  const [pedidos, setPedidos] = useState<PedidoSobreDados[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("pedidos_titular")
      .select("id, tipo, nome, telefone, mensagem, status, criado_em, concluido_em, nota")
      .order("criado_em", { ascending: false })
      .limit(200);
    if (error) {
      // banco sem a parte da LGPD ainda (SQL não rodado): o painel segue funcionando
      setErro(/pedidos_titular/.test(error.message ?? "") ? "sem-tabela" : "falha");
      setCarregando(false);
      return;
    }
    setErro(null);
    setPedidos(
      ((data ?? []) as Linha[]).map((l) => ({
        id: l.id,
        tipo: l.tipo,
        nome: l.nome,
        telefone: l.telefone,
        mensagem: l.mensagem,
        status: l.status,
        criadoEm: l.criado_em,
        concluidoEm: l.concluido_em,
        nota: l.nota,
      })),
    );
    setCarregando(false);
  }, []);

  useEffect(() => {
    // primeira leitura; o estado muda só quando a resposta do banco chega
    const id = setTimeout(recarregar, 0);
    return () => clearTimeout(id);
  }, [recarregar]);

  return { pedidos, carregando, erro, recarregar };
}

export async function concluirPedido(id: string, status: "concluido" | "recusado", nota: string): Promise<boolean> {
  const { error } = await supabase
    .from("pedidos_titular")
    .update({ status, nota: nota.trim() || null, concluido_em: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("Erro ao concluir pedido:", error.message);
  return !error;
}

export async function apagarDadosDoCliente(
  telefone: string,
): Promise<{ reservas: number; canceladas: number; fila: number } | { erro: string }> {
  const { data, error } = await supabase.rpc("apagar_dados_do_cliente", { p_telefone: telefone });
  if (error) {
    if (/DADOS_INVALIDOS: telefone/.test(error.message ?? "")) return { erro: "Telefone incompleto: confira o DDD e o número." };
    console.error("Erro ao apagar dados:", error.message);
    return { erro: "Não foi possível apagar agora. Tente de novo." };
  }
  return data as { reservas: number; canceladas: number; fila: number };
}
