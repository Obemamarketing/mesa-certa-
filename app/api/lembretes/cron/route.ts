// Dispara os lembretes de reserva pelo WhatsApp (API oficial da Meta).
// Chamada a cada 5 minutos pelo pg_cron do Supabase (supabase-cron-lembretes.sql),
// com "Authorization: Bearer <CRON_SECRET>". Roda no servidor: não depende de
// o cliente ter aberto o site.

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { criarSupabaseServidor, supabaseServidorConfigurado } from "@/lib/lembretes/supabaseServidor";
import { enviarTemplate, lerConfigWhatsapp } from "@/lib/lembretes/whatsappCloud";
import { processarLote, type Reivindicado } from "@/lib/lembretes/processar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOTE = 20;
// A Vercel encerra a rota em maxDuration (60 s). Depois de 40 s não começa
// envio novo: o que sobrou volta pra fila para a próxima rodada.
const ORCAMENTO_MS = 40_000;

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
  const inicio = Date.now();
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

  // Nada vencido neste ciclo (o normal, na maioria das vezes de 5 em 5 min).
  if (lote.length === 0) {
    return NextResponse.json({ ok: true, reivindicados: 0 });
  }

  // Área de cada mesa vem da configuração central: se o administrador renomeou
  // uma mesa, a lista do código estaria desatualizada.
  const zonaPorMesa = new Map<string, string>();
  {
    const { data: mesas } = await supabase.from("mesas").select("numero, zona");
    for (const m of (mesas ?? []) as { numero: string; zona: string }[]) zonaPorMesa.set(m.numero, m.zona);
  }

  // Última conferência antes de enviar: a reserva pode ter sido cancelada
  // nesse meio-tempo. Uma consulta só, pra todo o lote. Se ela falhar, ativas
  // fica null e nada é enviado nem cancelado nesta rodada.
  const { data: estados, error: erroEstados } = await supabase
    .from("reservas")
    .select("id, cancelada")
    .in("id", lote.map((i) => i.reserva_id));
  if (erroEstados) console.error(`lembretes: não conferiu as reservas do lote: ${erroEstados.message}`);
  const ativas = erroEstados
    ? null
    : new Set(((estados ?? []) as { id: string; cancelada: boolean }[]).filter((r) => !r.cancelada).map((r) => r.id));

  const resumo = await processarLote(lote, {
    ativas,
    zonaPorMesa,
    enviar: (telefone, parametros) => enviarTemplate(config, telefone, parametros),
    // Gravar o resultado é o que impede o mesmo lembrete de sair duas vezes.
    // Se a gravação falhar depois de enviar, não dá pra desfazer o envio — mas
    // o erro não passa em silêncio: vai pro log da Vercel e pro resumo.
    gravar: async (ids, campos) => {
      let tudoCerto = true;
      const porValor = new Map<string, string[]>();
      for (const id of ids) {
        const chave = JSON.stringify(campos(id));
        porValor.set(chave, [...(porValor.get(chave) ?? []), id]);
      }
      for (const [chave, grupo] of porValor) {
        const { error } = await supabase.from("lembretes_whatsapp").update(JSON.parse(chave)).in("id", grupo);
        if (error) {
          tudoCerto = false;
          console.error(`lembretes: não gravou o resultado de ${grupo.join(", ")}: ${error.message}`);
        }
      }
      return tudoCerto;
    },
    decorrido: () => Date.now() - inicio,
    orcamentoMs: ORCAMENTO_MS,
  });

  return NextResponse.json({ ok: !erroEstados, ...resumo }, { status: erroEstados ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return executar(request);
}

export async function GET(request: NextRequest) {
  return executar(request);
}
