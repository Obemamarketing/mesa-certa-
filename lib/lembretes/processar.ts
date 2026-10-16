// O "miolo" do envio dos lembretes: recebe o lote já reivindicado no banco e
// decide o que enviar, o que cancelar e o que devolver para a fila. Não fala
// direto com o Supabase nem com a Meta — recebe as funções prontas — para dar
// para testar à parte (a rota /api/lembretes/cron é quem liga tudo).

import { parametrosDoTemplate } from "./mensagem";
import type { ResultadoEnvio } from "./whatsappCloud";

export const MAX_TENTATIVAS = 3;

export type Reivindicado = {
  lembrete_id: string;
  reserva_id: string;
  nome: string;
  telefone: string;
  pessoas: number;
  mesa_numero: string;
  horario: string;
  data_reserva: string | null;
  /** Já contando a tentativa desta rodada (o banco soma 1 ao reivindicar). */
  tentativas: number;
};

export type Resumo = {
  reivindicados: number;
  enviados: number;
  falhas: number;
  repetir: number;
  cancelados: number;
  /** Ficaram para a próxima rodada sem tentativa gasta (faltou tempo). */
  devolvidos: number;
  erros_ao_gravar: number;
};

export type Dependencias = {
  /** Reservas do lote que continuam ativas. null = não deu pra conferir. */
  ativas: Set<string> | null;
  zonaPorMesa: Map<string, string>;
  enviar: (telefone: string, parametros: string[]) => Promise<ResultadoEnvio>;
  /** Grava os campos em cada lembrete; devolve false se a gravação falhou. */
  gravar: (ids: string[], campos: (id: string) => Record<string, unknown>) => Promise<boolean>;
  /** Milissegundos desde o início da rodada. */
  decorrido: () => number;
  /** Até quando dá para começar um envio novo. Depois disso, o resto volta pra fila. */
  orcamentoMs: number;
  agora?: () => string;
};

const soDigitos = (t: string) => t.replace(/\D/g, "");

export async function processarLote(lote: Reivindicado[], d: Dependencias): Promise<Resumo> {
  const agora = d.agora ?? (() => new Date().toISOString());
  const resumo: Resumo = { reivindicados: lote.length, enviados: 0, falhas: 0, repetir: 0, cancelados: 0, devolvidos: 0, erros_ao_gravar: 0 };
  const tentativasDe = new Map(lote.map((i) => [i.lembrete_id, i.tentativas]));

  async function gravar(ids: string[], campos: (id: string) => Record<string, unknown>) {
    if (ids.length === 0) return;
    if (!(await d.gravar(ids, campos))) resumo.erros_ao_gravar++;
  }

  // Volta para a fila SEM gastar a tentativa: o envio nem foi tentado.
  async function devolver(itens: Reivindicado[]) {
    await gravar(
      itens.map((i) => i.lembrete_id),
      (id) => ({ status: "pendente", tentativas: Math.max(0, (tentativasDe.get(id) ?? 1) - 1), atualizado_em: agora() }),
    );
    resumo.devolvidos += itens.length;
  }

  // Não deu para conferir se as reservas foram canceladas: na dúvida não envia
  // nada — e também não cancela nada. Tudo volta pra fila e a próxima rodada
  // confere de novo. (Tratar "não sei" como "cancelada" apagaria os lembretes
  // de todo mundo por causa de uma falha passageira.)
  if (d.ativas === null) {
    await devolver(lote);
    return resumo;
  }

  const vivos: Reivindicado[] = [];
  for (const item of lote) {
    if (d.ativas.has(item.reserva_id)) vivos.push(item);
    else {
      await gravar([item.lembrete_id], () => ({ status: "cancelado", atualizado_em: agora() }));
      resumo.cancelados++;
    }
  }

  // Grupo que reservou mais de uma mesa tem uma reserva por mesa, mas o
  // cliente é um só: junta pelo mesmo WhatsApp, nome e data e manda UM aviso.
  const grupos = new Map<string, Reivindicado[]>();
  for (const item of vivos) {
    const chave = [soDigitos(item.telefone), item.nome.trim().toLowerCase(), item.data_reserva ?? ""].join("|");
    grupos.set(chave, [...(grupos.get(chave) ?? []), item]);
  }

  const fila = [...grupos.values()];
  for (let g = 0; g < fila.length; g++) {
    // Sem tempo para mais um envio (a Vercel encerra a rota no limite): o que
    // sobrou volta pra fila agora, em vez de ficar preso em "enviando" e virar
    // falha 15 minutos depois.
    if (d.decorrido() > d.orcamentoMs) {
      await devolver(fila.slice(g).flat());
      break;
    }

    const membros = fila[g];
    const lider = membros[0];
    const mesasDoGrupo = membros.map((m) => m.mesa_numero).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    const zonasDoGrupo = [...new Set(mesasDoGrupo.map((n) => d.zonaPorMesa.get(n)).filter((z): z is string => Boolean(z)))];
    const ids = membros.map((m) => m.lembrete_id);
    const tentativas = Math.max(...membros.map((m) => m.tentativas));

    const resultado = await d.enviar(
      lider.telefone,
      parametrosDoTemplate({
        reservaId: lider.reserva_id,
        nome: lider.nome,
        pessoas: membros.reduce((soma, m) => soma + m.pessoas, 0),
        mesaNumero: mesasDoGrupo[0],
        mesasDoGrupo,
        zonasDoGrupo,
        horario: lider.horario,
      }),
    );

    // o resultado vale pra todas as reservas do grupo
    const quando = agora();
    if (resultado.ok) {
      await gravar(ids, () => ({
        status: "enviado",
        enviado_em: quando,
        wa_message_id: resultado.messageId,
        erro: membros.length > 1 ? `Aviso único enviado para as mesas ${mesasDoGrupo.join(", ")}` : null,
        atualizado_em: quando,
      }));
      resumo.enviados++;
    } else if (resultado.tentarDeNovo && tentativas < MAX_TENTATIVAS) {
      // falha temporária: volta pra fila, a próxima rodada (5 min) tenta de novo
      await gravar(ids, () => ({ status: "pendente", erro: `Tentativa ${tentativas}/${MAX_TENTATIVAS}: ${resultado.erro}`, atualizado_em: quando }));
      resumo.repetir++;
    } else {
      await gravar(ids, () => ({ status: "falhou", erro: resultado.erro, atualizado_em: quando }));
      resumo.falhas++;
    }
  }

  return resumo;
}
