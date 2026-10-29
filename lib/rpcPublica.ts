"use client";

// As três ações públicas que um robô poderia abusar — reservar, entrar na fila
// e pedir algo sobre os próprios dados — passam por aqui.
//
// SEM captcha configurado (NEXT_PUBLIC_TURNSTILE_SITE_KEY vazio): vão direto ao
// banco, como sempre foi.
// COM captcha: vão para a rota /api/protegido, que confere o captcha
// (Cloudflare Turnstile) no servidor e só então chama o banco. Depois que o
// supabase-fechar-reserva-direta.sql for rodado, o banco só aceita esse caminho.

import { supabase } from "./supabaseClient";

export type FuncaoProtegida = "reservar" | "entrar_na_fila" | "pedir_sobre_meus_dados";

export const CHAVE_DO_CAPTCHA = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const captchaLigado = CHAVE_DO_CAPTCHA !== "";

export type RespostaDoBanco<T> = { data: T | null; error: { message: string; code?: string } | null };

export async function chamarFuncaoPublica<T>(funcao: FuncaoProtegida, parametros: Record<string, unknown>, captcha?: string | null): Promise<RespostaDoBanco<T>> {
  if (!captchaLigado) {
    const { data, error } = await supabase.rpc(funcao, parametros);
    return { data: (data as T) ?? null, error: error ? { message: error.message ?? "", code: error.code } : null };
  }
  if (!captcha) return { data: null, error: { message: "CAPTCHA_PENDENTE", code: "CAPTCHA" } };
  try {
    const r = await fetch("/api/protegido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funcao, parametros, captcha }),
    });
    const corpo = (await r.json().catch(() => null)) as RespostaDoBanco<T> | null;
    if (!corpo) return { data: null, error: { message: "Resposta inválida do servidor", code: "REDE" } };
    return corpo;
  } catch {
    return { data: null, error: { message: "Sem conexão", code: "REDE" } };
  }
}

// Mensagem para o cliente quando o problema foi o captcha (ou a conexão).
export function erroDoCaptcha(error: { message: string; code?: string } | null): string | null {
  if (!error) return null;
  if (error.code === "CAPTCHA") {
    return error.message === "CAPTCHA_PENDENTE"
      ? "Confirme que você não é um robô (o quadradinho logo acima) e tente de novo."
      : "Não deu para confirmar que você não é um robô. Marque o quadradinho de novo e tente outra vez.";
  }
  if (error.code === "REDE") return "Não foi possível falar com o servidor agora. Confira a conexão e tente de novo.";
  return null;
}
