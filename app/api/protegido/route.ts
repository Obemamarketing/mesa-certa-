// Porta das ações públicas quando o captcha está ligado: confere o captcha
// (Cloudflare Turnstile) e só então chama a função do banco. Assim um robô que
// chame o banco direto não consegue reservar, entrar na fila nem mandar pedidos
// (depois de rodado o supabase-fechar-reserva-direta.sql, o banco só aceita
// estas três funções vindas daqui).
//
// Precisa, na Vercel: TURNSTILE_SECRET_KEY e SUPABASE_SERVICE_ROLE_KEY.

import { NextResponse, type NextRequest } from "next/server";
import { criarSupabaseServidor, supabaseServidorConfigurado } from "@/lib/lembretes/supabaseServidor";

export const dynamic = "force-dynamic";

const PERMITIDAS = new Set(["reservar", "entrar_na_fila", "pedir_sobre_meus_dados"]);

// Freio simples por endereço (por instância do servidor): 20 envios a cada 10 min.
const JANELA_MS = 10 * 60 * 1000;
const MAXIMO = 20;
const tentativas = new Map<string, number[]>();
function demais(ip: string): boolean {
  const agora = Date.now();
  const lista = (tentativas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  lista.push(agora);
  tentativas.set(ip, lista);
  if (tentativas.size > 5000) tentativas.clear();
  return lista.length > MAXIMO;
}

const erro = (message: string, code: string, status = 400) => NextResponse.json({ data: null, error: { message, code } }, { status });

async function captchaValido(token: string, ip: string): Promise<boolean> {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return false;
  const corpo = new URLSearchParams({ secret: segredo, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const r = await fetch(process.env.TURNSTILE_VERIFICAR_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.TURNSTILE_SECRET_KEY || !supabaseServidorConfigurado()) {
    console.error("Captcha ligado no site, mas faltam TURNSTILE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY na Vercel.");
    return erro("O site está em manutenção. Tente de novo em alguns minutos.", "CONFIG", 503);
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (demais(ip || "sem-ip")) return erro("LIMITE_DE_RESERVAS: muitas reservas agora", "P0001", 429);

  let corpo: { funcao?: string; parametros?: Record<string, unknown>; captcha?: string };
  try {
    corpo = await request.json();
  } catch {
    return erro("pedido inválido", "PEDIDO");
  }
  if (!corpo.funcao || !PERMITIDAS.has(corpo.funcao) || typeof corpo.parametros !== "object" || !corpo.parametros) {
    return erro("pedido inválido", "PEDIDO");
  }
  if (!corpo.captcha || !(await captchaValido(corpo.captcha, ip))) return erro("captcha", "CAPTCHA");

  const { data, error } = await criarSupabaseServidor().rpc(corpo.funcao, corpo.parametros);
  if (error) return NextResponse.json({ data: null, error: { message: error.message ?? "", code: error.code } }, { status: 400 });
  return NextResponse.json({ data, error: null });
}
