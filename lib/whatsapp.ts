// Integração com WhatsApp — fase 1 (sem credenciais de API).
//
// O botão "Enviar confirmação pelo WhatsApp" abre um link wa.me com a
// mensagem já escrita, pro próprio administrador mandar com um clique.
// É uma integração real (o link funciona de verdade), só que manual.
//
// Pra lembrete automático / envio sem intervenção humana, é necessário o
// WhatsApp Business Platform (Cloud API) da Meta: número comercial
// verificado, token de acesso e um backend que chame a API de template
// messages. Quando essas credenciais existirem, a função
// `mensagemConfirmacao` abaixo pode ser reaproveitada como o corpo da
// mensagem enviada pelo backend — só a forma de envio muda.

import { reservaBrand } from "./reservaBrand";
import { DIAS, TOLERANCIA_MINUTOS, dataDoDia, formatarDataCurta, type Reserva } from "./reservas";

export function mensagemConfirmacao(reserva: Reserva): string {
  const diaLabel = DIAS.find((d) => d.chave === reserva.dia)?.label ?? reserva.dia;
  const dataLabel = formatarDataCurta(dataDoDia(reserva.dia));

  const linhas = [
    reservaBrand.restauranteAtual,
    "Reserva confirmada ✅",
    "",
    `Data: ${diaLabel}, ${dataLabel}`,
    `Horário: ${reserva.horario.replace(":", "h")}`,
    `Pessoas: ${reserva.pessoas}`,
    reserva.mesaNumero ? `Mesa: ${reserva.mesaNumero}` : null,
    reserva.observacao ? `Observação: ${reserva.observacao}` : null,
    "",
    `Pedimos até ${TOLERANCIA_MINUTOS} minutos de tolerância após o horário. Depois disso a mesa pode ser remanejada.`,
  ].filter((linha) => linha !== null);

  return linhas.join("\n");
}

// Assume DDI 55 (Brasil) quando o telefone vier só com DDD + número.
export function linkWhatsapp(telefone: string, mensagem: string): string {
  const digitos = telefone.replace(/\D/g, "");
  const comDDI = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}
