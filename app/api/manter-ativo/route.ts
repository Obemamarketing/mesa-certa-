// Visita diária ao banco, para o Supabase grátis não pausar o projeto por
// falta de uso (ele pausa depois de uns 7 dias parado). A Vercel chama esta
// rota uma vez por dia (vercel.json > crons). Só faz uma leitura pequena e
// pública — não lê nem grava dado de cliente.
//
// Se CRON_SECRET estiver configurado na Vercel, só aceita a chamada da
// própria Vercel (que manda "Authorization: Bearer <CRON_SECRET>").

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { error } = await supabase.rpc("acesso_fechado");
  if (error) {
    console.error("Visita diária ao banco falhou:", error.message);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true, em: new Date().toISOString() });
}
