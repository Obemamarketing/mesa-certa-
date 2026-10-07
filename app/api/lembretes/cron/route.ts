// Dispara os lembretes de reserva pelo WhatsApp (API oficial da Meta).
// Chamada a cada 5 minutos pelo pg_cron do Supabase (supabase-cron-lembretes.sql),
// com "Authorization: Bearer <CRON_SECRET>". Roda no servidor: não depende de
// o cliente ter aberto o site.

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { criarSupabaseServidor, supabaseServidorConfigurado } from "@/lib/lembretes/supabaseServidor";
import { enviarTemplate, lerConfigWhatsapp } from "@/lib/lembretes/whatsappCloud";
import { parametrosDoTemplate } from "@/lib/lembretes/mensagem";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TENTATIVAS = 3;
const LOTE = 20;

type Reivindicado = {
  lembrete_id: string;
  reserva_id: string;
  nome: string;
  telefone: string;
  pessoas: number;
  mesa_numero: string;
  horario: string;
  tentativas: number;
};

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false; // sem segredo configurado, a rota fica fechada
  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function executar(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ erro: "CRON_SECRET não configurado no servidor" }, { status: 503 });
  }
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!supabaseServidorConfigurado()) {
    return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor" }, { status: 503 });
  }

  const supabase = criarSupabaseServidor();

  // Administrador desligou os lembretes: não reivindica nada, os pendentes ficam como estão.
  const { data: cfg, error: erroCfg } = await supabase.from("config_lembretes").select("ativo").eq("id", 1).maybeSingle();
  if (erroCfg) {
    return NextResponse.json({ erro: `config_lembretes: ${erroCfg.message}` }, { status: 500 });
  }
  if (cfg && cfg.ativo === false) {
    return NextResponse.json({ ok: true, ignorado: "lembretes_desativados" });
  }

  // Sem credenciais da Meta não há como enviar: não toca em nada (nada vira "enviado" de mentira).
  const { config, faltando } = lerConfigWhatsapp();
  if (!config) {
    return NextResponse.json({ ok: true, ignorado: "whatsapp_nao_configurado", faltando });
  }

  const { data, error } = await supabase.rpc("reivindicar_lembretes", { limite: LOTE });
  if (error) {
    return NextResponse.json({ erro: `reivindicar_lembretes: ${error.message}` }, { status: 500 });
  }

  const lote = (data ?? []) as Reivindicado[];
  const resumo = { reivindicados: lote.length, enviados: 0, falhas: 0, repetir: 0, cancelados: 0 };

  // Área de cada mesa vem da configuração central: se o administrador renomeou
  // uma mesa, a lista do código estaria desatualizada.
  const zonaPorMesa = new Map<string, string>();
  if (lote.length > 0) {
    const { data: mesas } = await supabase.from("mesas").select("numero, zona");
    for (const m of (mesas ?? []) as { numero: string; zona: string }[]) zonaPorMesa.set(m.numero, m.zona);
  }

  for (const item of lote) {
    // Última conferência antes de enviar: a reserva pode ter sido cancelada nesse meio-tempo.
    const { data: reserva } = await supabase.from("reservas").select("cancelada").eq("id", item.reserva_id).maybeSingle();
    if (!reserva || reserva.cancelada) {
      await supabase.from("lembretes_whatsapp").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", item.lembrete_id);
      resumo.cancelados++;
      continue;
    }

    const resultado = await enviarTemplate(
      config,
      item.telefone,
      parametrosDoTemplate({
        reservaId: item.reserva_id,
        nome: item.nome,
        pessoas: item.pessoas,
        mesaNumero: item.mesa_numero,
        horario: item.horario,
        zona: zonaPorMesa.get(item.mesa_numero),
      }),
    );

    const agora = new Date().toISOString();
    if (resultado.ok) {
      await supabase
        .from("lembretes_whatsapp")
        .update({ status: "enviado", enviado_em: agora, wa_message_id: resultado.messageId, erro: null, atualizado_em: agora })
        .eq("id", item.lembrete_id);
      resumo.enviados++;
    } else if (resultado.tentarDeNovo && item.tentativas < MAX_TENTATIVAS) {
      // falha temporária: volta pra fila, o próximo ciclo (5 min) tenta de novo
      await supabase
        .from("lembretes_whatsapp")
        .update({ status: "pendente", erro: `Tentativa ${item.tentativas}/${MAX_TENTATIVAS}: ${resultado.erro}`, atualizado_em: agora })
        .eq("id", item.lembrete_id);
      resumo.repetir++;
    } else {
      await supabase
        .from("lembretes_whatsapp")
        .update({ status: "falhou", erro: resultado.erro, atualizado_em: agora })
        .eq("id", item.lembrete_id);
      resumo.falhas++;
    }
  }

  return NextResponse.json({ ok: true, ...resumo });
}

export async function POST(request: NextRequest) {
  return executar(request);
}

export async function GET(request: NextRequest) {
  return executar(request);
}
