"use client";

// Login do painel do restaurante.
//
// Quem guarda e confere a senha é o Supabase Auth. Estar logado NÃO basta: a
// conta precisa estar na tabela "administradores" do banco (função eh_admin,
// supabase-migration-acesso.sql). Criar uma conta sozinho não abre nada.
//
// Esta tela é só a porta. Quem protege os dados de verdade é o banco, que não
// entrega as reservas a quem não é administrador — mesmo que alguém pule a
// tela.
//
// Mesmo desenho de lib/mesas.ts: UM estado compartilhado por todas as telas.

import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type Acesso =
  /** Ainda conferindo (ou a página ainda não montou no navegador). */
  | { estado: "carregando" }
  /** Ninguém logado. */
  | { estado: "fora" }
  /** Logado, mas a conta não é de administrador. */
  | { estado: "sem-permissao"; email: string }
  /** Logado, mas não deu pra conferir se é administrador (sem conexão, banco sem a migração). */
  | { estado: "erro"; email: string; mensagem: string }
  /** Administrador logado. */
  | { estado: "dentro"; email: string };

const CARREGANDO: Acesso = { estado: "carregando" };

let acesso: Acesso = CARREGANDO;
let usuarioConferido: string | null = null;
let escutando = false;
let rodada = 0; // só a conferência mais recente publica o resultado
const ouvintes = new Set<() => void>();

function publicar(novo: Acesso) {
  acesso = novo;
  for (const avisar of ouvintes) avisar();
}

async function conferir(sessao: Session | null) {
  if (!sessao) {
    rodada++;
    usuarioConferido = null;
    publicar({ estado: "fora" });
    return;
  }

  // O Supabase avisa "logado" de novo cada vez que a aba volta ao foco e a cada
  // renovação do login. Quem já está dentro não é conferido outra vez: isso
  // desmontaria o painel inteiro no meio do serviço.
  if (acesso.estado === "dentro" && usuarioConferido === sessao.user.id) return;

  const minha = ++rodada;
  const email = sessao.user.email ?? "";
  const { data, error } = await supabase.rpc("eh_admin");
  if (minha !== rodada) return;

  if (error) {
    console.error("Erro ao conferir o acesso:", error.message);
    usuarioConferido = null;
    publicar({
      estado: "erro",
      email,
      mensagem:
        error.code === "PGRST202"
          ? "O banco de dados ainda não foi preparado para o login. Rode supabase-completo.sql no Supabase."
          : "Não foi possível conferir o seu acesso. Verifique a conexão com a internet.",
    });
    return;
  }

  usuarioConferido = data === true ? sessao.user.id : null;
  publicar(data === true ? { estado: "dentro", email } : { estado: "sem-permissao", email });
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  if (!escutando) {
    escutando = true;
    // O primeiro aviso ("INITIAL_SESSION") traz o login guardado neste
    // aparelho, se houver. O setTimeout tira a conferência de dentro do aviso:
    // o Supabase trava se uma consulta é feita ali dentro.
    supabase.auth.onAuthStateChange((_evento, sessao) => {
      setTimeout(() => conferir(sessao), 0);
    });
  }
  return () => {
    ouvintes.delete(avisar);
  };
}

const ler = () => acesso;
const lerNoServidor = () => CARREGANDO;

// Quem está usando o painel agora. No servidor (e no primeiro instante no
// navegador) é sempre "carregando".
export function useAcesso(): Acesso {
  return useSyncExternalStore(assinar, ler, lerNoServidor);
}

export async function entrar(email: string, senha: string): Promise<{ erro?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (!error) return {}; // o aviso do Supabase (acima) cuida do resto

  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return { erro: "E-mail ou senha incorretos." };
  }
  if (error.code === "email_not_confirmed") {
    return { erro: "Este e-mail ainda não foi confirmado. Peça ao suporte para confirmar a conta." };
  }
  if (error.status === 429) {
    return { erro: "Muitas tentativas seguidas. Espere um minuto e tente de novo." };
  }
  console.error("Erro ao entrar:", error.message);
  return { erro: "Não foi possível entrar agora. Verifique a conexão com a internet e tente de novo." };
}

// Sai só deste aparelho: o tablet do salão não é deslogado porque alguém saiu
// no computador do escritório.
export async function sair(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("Erro ao sair:", error.message);
}

// Confere de novo se a conta logada é de administrador (botão "Tentar de novo").
export async function conferirDeNovo(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  await conferir(data.session);
}

// O banco já está fechado para quem não é administrador? (Parte 2 do login,
// supabase-fechar-acesso.sql.) null = não deu pra saber.
export async function bancoProtegido(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("acesso_fechado");
  if (error) return null;
  return data === true;
}
