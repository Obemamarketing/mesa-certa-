// Envio de mensagens pela API OFICIAL do WhatsApp Business (Cloud API, Meta).
//
// O QUE DEPENDE DE CONFIGURAÇÃO EXTERNA (nada disso existe no código):
//   1. Uma conta WhatsApp Business verificada no Meta Business Manager, com
//      um número comercial registrado na Cloud API.
//   2. Um template de mensagem APROVADO pela Meta (texto sugerido abaixo).
//      Lembrete é mensagem iniciada pela empresa, e fora da janela de 24h da
//      conversa a API só aceita template aprovado — texto livre é recusado.
//   3. Variáveis de ambiente no servidor (Vercel > Settings > Environment
//      Variables):
//        WHATSAPP_ACCESS_TOKEN      token permanente (usuário do sistema)
//        WHATSAPP_PHONE_NUMBER_ID   ID do número comercial (não é o telefone)
//        WHATSAPP_TEMPLATE_NAME     opcional, padrão "lembrete_reserva"
//        WHATSAPP_TEMPLATE_LANG     opcional, padrão "pt_BR"
//        WHATSAPP_API_VERSION       opcional, padrão "v21.0"
//        CRON_SECRET                protege a rota que dispara os envios
//
// Enquanto as duas primeiras variáveis não existirem, o sistema NÃO envia
// nada e NÃO finge que enviou: a rota do cron devolve "whatsapp_nao_configurado"
// e os lembretes ficam pendentes até a configuração ser feita.
//
// TEMPLATE A CADASTRAR NA META (categoria: UTILITY, idioma: pt_BR,
// nome: lembrete_reserva). Corpo, com variáveis posicionais:
//
//   🍷 Lembrete — ZéPelin
//
//   Olá, {{1}}! Sua reserva é hoje às {{2}}.
//
//   👥 {{3}}
//   🪑 {{4}} — {{5}}
//
//   ⏱️ Temos tolerância de 20 minutos para sua chegada, até {{6}}.
//
//   Até logo!
//   Código da reserva: {{7}}.
//
//   {{1}} nome · {{2}} horário (19h30) · {{3}} "4 pessoas" · {{4}} "Mesa 05"
//   {{5}} área · {{6}} limite da tolerância (19:50) · {{7}} código
//
//   (A Meta não aceita variável no começo nem no fim do corpo; por isso o
//   ponto final depois de {{7}}. Se a Meta pedir ajustes no texto, mantenha
//   a ORDEM das 7 variáveis — é ela que o código usa.)

export type ConfigWhatsapp = {
  token: string;
  phoneNumberId: string;
  template: string;
  idioma: string;
  versao: string;
};

export function lerConfigWhatsapp(): { config: ConfigWhatsapp | null; faltando: string[] } {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const faltando: string[] = [];
  if (!token) faltando.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) faltando.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return { config: null, faltando };
  return {
    faltando,
    config: {
      token,
      phoneNumberId,
      template: process.env.WHATSAPP_TEMPLATE_NAME || "lembrete_reserva",
      idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
      versao: process.env.WHATSAPP_API_VERSION || "v21.0",
    },
  };
}

// Número no formato internacional, só dígitos. Assume Brasil (55) quando vier
// só DDD + número.
export function normalizarTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

export type ResultadoEnvio =
  | { ok: true; messageId: string | null }
  | { ok: false; erro: string; tentarDeNovo: boolean };

// Códigos de erro da API que valem nova tentativa (limite de taxa, falha
// temporária do lado da Meta). Os demais (número sem WhatsApp, template
// inválido, token inválido…) não se resolvem sozinhos.
const CODIGOS_TEMPORARIOS = new Set([1, 2, 4, 17, 80007, 130429, 131000, 131016, 131048, 131056]);

export async function enviarTemplate(config: ConfigWhatsapp, telefone: string, parametros: string[]): Promise<ResultadoEnvio> {
  const url = `https://graph.facebook.com/${config.versao}/${config.phoneNumberId}/messages`;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 15000);

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: controle.signal,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizarTelefone(telefone),
        type: "template",
        template: {
          name: config.template,
          language: { code: config.idioma },
          components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }],
        },
      }),
    });

    const corpo = (await resposta.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } } }
      | null;

    if (resposta.ok && corpo?.messages?.length) {
      return { ok: true, messageId: corpo.messages[0]?.id ?? null };
    }

    const erroApi = corpo?.error;
    const detalhe = erroApi?.error_data?.details ?? erroApi?.message ?? `HTTP ${resposta.status}`;
    const codigo = erroApi?.code;
    const temporario = resposta.status === 429 || resposta.status >= 500 || (codigo !== undefined && CODIGOS_TEMPORARIOS.has(codigo));
    return {
      ok: false,
      erro: `WhatsApp API ${resposta.status}${codigo !== undefined ? ` (código ${codigo})` : ""}: ${detalhe}`.slice(0, 500),
      tentarDeNovo: temporario,
    };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      erro: abortou ? "WhatsApp API: tempo esgotado (15s)" : `Falha de rede ao chamar a WhatsApp API: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      tentarDeNovo: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
