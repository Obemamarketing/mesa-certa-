// Cliente do Supabase para uso EXCLUSIVO no backend (rotas /api).
// Usa a chave de serviço, que ignora as políticas de acesso — por isso
// nunca importe este arquivo de um componente de tela.

import { createClient } from "@supabase/supabase-js";

export function supabaseServidorConfigurado(): boolean {
  return Boolean((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function criarSupabaseServidor() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Faltam SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.");
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
