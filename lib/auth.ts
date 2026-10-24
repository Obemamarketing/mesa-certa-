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
  /** Senha certa, falta o código do app autenticador (duas etapas ativadas). */
  | { estado: "codigo"; email: string; fatorId: string }
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

  const minha = ++rodada;
  const email = sessao.user.email ?? "";

  // Duas etapas ativadas e a sessão ainda só com a senha: antes de qualquer
  // coisa, pede o código do app. (O banco também exige: sem o código, ele não
  // trata a pessoa como administradora.) Vale também para quem já estava
  // dentro: se as duas etapas foram ativadas em outro aparelho, este passa a
  // pedir o código na próxima renovação do login.
  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (minha !== rodada) return;
  const precisaDoCodigo = Boolean(nivel && nivel.nextLevel === "aal2" && nivel.currentLevel !== "aal2");

  // O Supabase avisa "logado" de novo cada vez que a aba volta ao foco e a cada
  // renovação do login. Quem já está dentro não é conferido outra vez: isso
  // desmontaria o painel inteiro no meio do serviço.
  if (!precisaDoCodigo && acesso.estado === "dentro" && usuarioConferido === sessao.user.id) return;

  if (precisaDoCodigo) {
    const { data: fatores } = await supabase.auth.mfa.listFactors();
    if (minha !== rodada) return;
    const fator = fatores?.totp.find((f) => f.status === "verified");
    if (fator) {
      usuarioConferido = null;
      publicar({ estado: "codigo", email, fatorId: fator.id });
      return;
    }
  }

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

// Segunda etapa do login: o código de 6 números do app autenticador.
export async function confirmarCodigo(fatorId: string, codigo: string): Promise<{ erro?: string }> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo.replace(/\D/g, "") });
  if (!error) return {}; // o aviso do Supabase abre o painel
  if (/invalid|incorrect|expired/i.test(error.message)) return { erro: "Código incorreto ou vencido. Confira o app e digite o código atual." };
  if (error.status === 429) return { erro: "Muitas tentativas seguidas. Espere um minuto e tente de novo." };
  console.error("Erro ao confirmar o código:", error.message);
  return { erro: "Não foi possível confirmar o código agora. Tente de novo." };
}

// --------------------------------------------- ativar / desativar duas etapas

export type DuasEtapas = { ativadas: boolean; fatorId: string | null };

export async function situacaoDuasEtapas(): Promise<DuasEtapas | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  const fator = data.totp.find((f) => f.status === "verified");
  return { ativadas: Boolean(fator), fatorId: fator?.id ?? null };
}

export type NovaAtivacao = { fatorId: string; qrCode: string; segredo: string };

// Começa a ativação: o Supabase devolve o QR Code para o app autenticador.
// Ativação que ficou pela metade antes é descartada (senão o Supabase recusa
// criar outra com o mesmo nome).
export async function comecarDuasEtapas(): Promise<{ ativacao?: NovaAtivacao; erro?: string }> {
  const { data: atuais } = await supabase.auth.mfa.listFactors();
  for (const f of atuais?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Painel ${new Date().toISOString().slice(0, 16)}` });
  if (error || !data) {
    console.error("Erro ao ativar duas etapas:", error?.message);
    return { erro: /disabled|not enabled/i.test(error?.message ?? "") ? "As duas etapas estão desligadas no Supabase (Authentication > Multi-Factor). Peça ao suporte para ligar." : "Não foi possível começar a ativação agora. Tente de novo." };
  }
  return { ativacao: { fatorId: data.id, qrCode: imagemDoQr(data.totp.qr_code), segredo: data.totp.secret } };
}

// O Supabase devolve o QR Code como SVG colado num "data:" sem codificar. Um
// "#" de cor dentro do SVG corta o endereço da imagem e ela não aparece:
// codifica a parte do SVG antes de usar.
function imagemDoQr(qr: string): string {
  const virgula = qr.indexOf(",");
  if (!qr.startsWith("data:image/svg+xml") || virgula < 0) return qr;
  const svg = qr.slice(virgula + 1);
  return svg.trimStart().startsWith("<") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : qr;
}

// Termina a ativação com o primeiro código que o app mostra.
export async function terminarDuasEtapas(fatorId: string, codigo: string): Promise<{ erro?: string }> {
  return confirmarCodigo(fatorId, codigo);
}

export async function desativarDuasEtapas(fatorId: string): Promise<{ erro?: string }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });
  if (error) {
    console.error("Erro ao desativar duas etapas:", error.message);
    return { erro: "Não foi possível desativar agora. Tente de novo." };
  }
  return {};
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
