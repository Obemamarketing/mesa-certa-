// Informa ao painel se o envio está configurado no servidor. Devolve só
// NOMES de variáveis que faltam — nunca valores.

import { NextResponse } from "next/server";
import { lerConfigWhatsapp } from "@/lib/lembretes/whatsappCloud";
import { supabaseServidorConfigurado } from "@/lib/lembretes/supabaseServidor";

export const dynamic = "force-dynamic";

export async function GET() {
  const { faltando } = lerConfigWhatsapp();
  if (!process.env.CRON_SECRET) faltando.push("CRON_SECRET");
  if (!supabaseServidorConfigurado()) faltando.push("SUPABASE_SERVICE_ROLE_KEY");
  return NextResponse.json({ configurado: faltando.length === 0, faltando });
}
