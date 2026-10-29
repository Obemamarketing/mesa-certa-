"use client";

// Fila de espera, no painel: quem pediu mesa numa data lotada, em ordem de
// chegada. O restaurante chama pelo WhatsApp quando uma mesa libera, reserva a
// mesa para a pessoa e ela sai da fila.

import { useMemo, useState } from "react";
import { reservaBrand } from "@/lib/reservaBrand";
import { diaDaData, lugaresLivresNoDia, rotuloDaData, useReservas } from "@/lib/reservas";
import { useMesasConfig } from "@/lib/mesas";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  chamarDaFila,
  linkDaEspera,
  marcarAtendido,
  tirarDaFila,
  useFilaDeEspera,
  voltarParaFila,
  type Espera,
} from "@/lib/fila";
import NewReservationModal from "../NewReservationModal";

const cartao = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" } as const;

const ROTULO: Record<Espera["status"], { texto: string; cor: string; fundo: string }> = {
  aguardando: { texto: "Aguardando", cor: "var(--color-text-muted)", fundo: "var(--color-border)" },
  chamado: { texto: "Chamado", cor: "var(--color-secondary-dark)", fundo: "var(--color-secondary-soft)" },
  atendido: { texto: "Virou reserva", cor: "var(--color-accent-dark)", fundo: "var(--color-accent-soft)" },
  saiu: { texto: "Saiu da fila", cor: "var(--color-text-muted)", fundo: "var(--color-border)" },
  removido: { texto: "Tirado da fila", cor: "var(--color-text-muted)", fundo: "var(--color-border)" },
};

function mensagemDeChamada(e: Espera): string {
  return [
    `Olá, ${e.nome.split(" ")[0]}! Aqui é do ${reservaBrand.restauranteAtual}.`,
    `Liberou uma mesa para ${rotuloDaData(e.dataReserva)}, às ${e.horario.replace(":", "h")}, para ${e.pessoas} pessoa${e.pessoas === 1 ? "" : "s"}.`,
    "Quer confirmar a reserva? É só responder esta mensagem.",
    "",
    `Sua espera: ${linkDaEspera(e.codigo)}`,
  ].join("\n");
}

export default function FilaPage() {
  const { esperas, carregando, erro } = useFilaDeEspera();
  const { reservas } = useReservas();
  const { mesas } = useMesasConfig();
  const [verEncerradas, setVerEncerradas] = useState(false);
  const [reservandoPara, setReservandoPara] = useState<Espera | null>(null);
  const [confirmandoTirar, setConfirmandoTirar] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const maiorMesa = Math.max(1, ...mesas.map((m) => m.capacidade));

  const porData = useMemo(() => {
    const mapa = new Map<string, Espera[]>();
    for (const e of esperas) mapa.set(e.dataReserva, [...(mapa.get(e.dataReserva) ?? []), e]);
    return [...mapa.entries()];
  }, [esperas]);

  async function executar(acao: Promise<{ erro?: string }>) {
    setErroAcao(null);
    const r = await acao;
    if (r.erro) setErroAcao(r.erro);
  }

  const ativas = esperas.filter((e) => e.status === "aguardando" || e.status === "chamado").length;

  return (
    <>
      {reservandoPara && (
        <NewReservationModal
          reservas={reservas}
          dataInicial={reservandoPara.dataReserva}
          inicial={{ nome: reservandoPara.nome, telefone: reservandoPara.telefone, pessoas: reservandoPara.pessoas, observacao: reservandoPara.observacao }}
          onCriada={(criadas) => executar(marcarAtendido(reservandoPara.id, criadas[0]?.id))}
          onFechar={() => setReservandoPara(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[40px] leading-tight">Fila de espera</h1>
            <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--color-text-muted)" }}>
              Quem pediu mesa numa data lotada, por ordem de chegada. Quando uma mesa liberar, chame pelo WhatsApp e reserve para a pessoa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVerEncerradas((v) => !v)}
            aria-pressed={verEncerradas}
            className="px-4 py-2.5 text-sm font-semibold border"
            style={{ borderRadius: "999px", borderColor: verEncerradas ? "var(--color-primary)" : "var(--color-border)", background: verEncerradas ? "var(--color-primary-soft)" : "var(--color-surface)", color: verEncerradas ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            {verEncerradas ? "Mostrando também as encerradas" : "Mostrar também as encerradas"}
          </button>
        </div>

        {erroAcao && <p role="alert" className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>{erroAcao}</p>}
        {erro && <p role="alert" className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>Não foi possível carregar a fila. Confira a conexão.</p>}

        {carregando ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>
        ) : ativas === 0 && !verEncerradas ? (
          <div className="px-6 py-10 text-center" style={cartao}>
            <p className="font-display text-xl">Ninguém na fila</p>
            <p className="text-sm mt-1.5" style={{ color: "var(--color-text-muted)" }}>
              Quando uma data lotar, o site oferece a fila de espera e os pedidos aparecem aqui.
            </p>
          </div>
        ) : (
          porData.map(([data, lista]) => {
            const visiveis = lista.filter((e) => verEncerradas || e.status === "aguardando" || e.status === "chamado");
            if (visiveis.length === 0) return null;
            const dia = diaDaData(data) ?? "sabado";
            // lugares livres no horário com mais espaço do dia
            const livres = lugaresLivresNoDia(mesas, reservas, dia, data);
            let posicao = 0;
            return (
              <section key={data} style={cartao} aria-label={`Fila de ${rotuloDaData(data)}`}>
                <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <p className="font-display text-lg">{rotuloDaData(data)}</p>
                  <span
                    className="text-[12.5px] font-semibold px-3 py-1 rounded-full"
                    style={livres > 0 ? { background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" } : { background: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    {livres > 0 ? `até ${livres} lugares livres em algum horário` : "Lotado"}
                  </span>
                </div>
                <ul className="flex flex-col">
                  {visiveis.map((e, i) => {
                    if (e.status === "aguardando") posicao++;
                    const r = ROTULO[e.status];
                    const emAberto = e.status === "aguardando" || e.status === "chamado";
                    return (
                      <li key={e.id} className="px-5 py-4 flex flex-col gap-3" style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}>
                        <div className="flex items-start gap-3">
                          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 tabular-nums" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                            {e.status === "aguardando" ? `${posicao}º` : "–"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold">{e.nome}</p>
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {e.telefone} · {e.pessoas} pessoa{e.pessoas === 1 ? "" : "s"} · entrou {new Date(e.criadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                            </p>
                            {e.observacao && <p className="text-xs italic mt-0.5" style={{ color: "var(--color-primary)" }}>“{e.observacao}”</p>}
                          </div>
                          <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ color: r.cor, background: r.fundo }}>{r.texto}</span>
                        </div>

                        {emAberto && (
                          <div className="flex flex-wrap gap-2 pl-12">
                            <a
                              href={linkWhatsapp(e.telefone, mensagemDeChamada(e))}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => { if (e.status === "aguardando") executar(chamarDaFila(e.id)); }}
                              className="px-3.5 py-2 text-[13px] font-semibold text-white"
                              style={{ background: "var(--color-accent-dark)", borderRadius: "var(--radius-sm)" }}
                            >
                              {e.status === "chamado" ? "Chamar de novo no WhatsApp" : "Chamar no WhatsApp"}
                            </a>
                            {e.pessoas <= maiorMesa && (
                              <button type="button" onClick={() => setReservandoPara(e)} className="px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
                                Reservar mesa
                              </button>
                            )}
                            <button type="button" onClick={() => executar(marcarAtendido(e.id))} className="px-3.5 py-2 text-[13px] font-semibold border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                              Já reservei
                            </button>
                            {e.status === "chamado" && (
                              <button type="button" onClick={() => executar(voltarParaFila(e.id))} className="px-3.5 py-2 text-[13px] font-semibold border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}>
                                Voltar para a fila
                              </button>
                            )}
                            {confirmandoTirar === e.id ? (
                              <span className="flex items-center gap-2">
                                <button type="button" onClick={() => { setConfirmandoTirar(null); executar(tirarDaFila(e.id)); }} className="px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}>
                                  Sim, tirar
                                </button>
                                <button type="button" onClick={() => setConfirmandoTirar(null)} className="px-3 py-2 text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
                                  Não
                                </button>
                              </span>
                            ) : (
                              <button type="button" onClick={() => setConfirmandoTirar(e.id)} className="px-3.5 py-2 text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
                                Tirar da fila
                              </button>
                            )}
                          </div>
                        )}
                        {emAberto && e.pessoas > maiorMesa && (
                          <p className="text-xs pl-12" style={{ color: "var(--color-text-muted)" }}>
                            Grupo maior que uma mesa: reserve as mesas pelo site de reservas e depois toque em “Já reservei”.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
