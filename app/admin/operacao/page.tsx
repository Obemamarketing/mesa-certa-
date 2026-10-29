"use client";

import { useState } from "react";
import {
  ATENDIMENTO,
  DIAS,
  DIAS_ABERTOS,
  HORARIOS,
  horaBonita,
  reservaDaMesa,
  cancelarReserva,
  dataDeOperacao,
  desfazerCheckin,
  fazerCheckin,
  formatarDataCurta,
  isoDaData,
  minutosDoHorario,
  relogioSaoPaulo,
  reservaNaData,
  statusChegada,
  useReservas,
  type DiaReserva,
  type ResultadoAcao,
} from "@/lib/reservas";
import { useAgora } from "@/lib/relogio";
import PlantaRestaurante, { LegendaPlanta } from "../../PlantaRestaurante";
import DetalheMesaConteudo from "../DetalheMesa";
import StatusBadge from "../StatusBadge";
import NewReservationModal from "../NewReservationModal";
import { useMesasConfig } from "@/lib/mesas";

export default function ModoOperacaoPage() {
  const { reservas, carregando } = useReservas();
  const { mesas } = useMesasConfig();
  // O relógio é o de São Paulo (o do restaurante), não o do aparelho. O dia
  // mostrado começa em "hoje" e só muda quando alguém escolhe outro.
  const agora = useAgora(15000);
  const relogio = agora ? relogioSaoPaulo(agora) : null;
  const hojeDaSemana = relogio ? DIAS.find((d) => d.diaSemana === relogio.diaSemana)?.chave : undefined;
  const [diaEscolhido, setDiaEscolhido] = useState<DiaReserva | null>(null);
  const dia: DiaReserva = diaEscolhido ?? (DIAS_ABERTOS.some((d) => d.chave === hojeDaSemana) ? hojeDaSemana : undefined) ?? DIAS_ABERTOS[0]?.chave ?? "sabado";
  const [mesaFoco, setMesaFoco] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [liberarId, setLiberarId] = useState<string | null>(null);

  const minutosAgora = relogio ? relogio.minutos : null;
  const inicio = minutosDoHorario(HORARIOS[0]);
  const fim = minutosDoHorario(ATENDIMENTO.fecha);

  // A data que a tela mostra: o dia da semana de hoje vale HOJE. Sem olhar a
  // data, a lista misturava as reservas desta sexta com as das sextas futuras.
  const dataOperacao = isoDaData(dataDeOperacao(dia));
  const ehHoje = relogio !== null && dataOperacao === relogio.iso;

  // Toda ação do painel passa por aqui: se o banco recusar, o erro aparece —
  // antes o botão "funcionava" sem fazer nada.
  async function acao(fn: () => Promise<ResultadoAcao> | void) {
    setErroAcao(null);
    const r = await fn();
    if (r && r.erro) setErroAcao(r.erro);
  }

  // "Liberar" cancela a reserva: pede um segundo toque (e desiste sozinho).
  function liberar(id: string) {
    if (liberarId === id) {
      setLiberarId(null);
      acao(() => cancelarReserva(id));
      return;
    }
    setLiberarId(id);
    setTimeout(() => setLiberarId((atual) => (atual === id ? null : atual)), 4000);
  }

  const doDia = reservas.filter((r) => reservaNaData(r, dia, dataOperacao) && !r.cancelada);
  const pendentes = doDia.filter((r) => !r.checkinEm);
  const chegaram = doDia.filter((r) => r.checkinEm);
  const lista = [...pendentes, ...chegaram].sort((a, b) => {
    if (!!a.checkinEm !== !!b.checkinEm) return a.checkinEm ? 1 : -1;
    return minutosDoHorario(a.horario) - minutosDoHorario(b.horario) || a.mesaNumero.localeCompare(b.mesaNumero, "pt-BR", { numeric: true });
  });

  const mesaFocoObj = mesaFoco ? mesas.find((m) => m.numero === mesaFoco) : undefined;
  // A planta mostra um horário de cada vez. Hoje, durante o almoço, começa no
  // horário em andamento; nos outros casos, no primeiro. Quem mexe escolhe outro.
  const [horarioEscolhido, setHorarioEscolhido] = useState<string | null>(null);
  const horarioAgora = ehHoje && minutosAgora !== null ? [...HORARIOS].reverse().find((h) => minutosDoHorario(h) <= minutosAgora) : undefined;
  const horarioPlanta = horarioEscolhido ?? horarioAgora ?? HORARIOS[0];
  const reservaFoco = mesaFoco ? reservaDaMesa(doDia, dia, horarioPlanta, mesaFoco, dataOperacao) : undefined;

  // contador da tolerância — só sinaliza, nunca cancela sozinho
  // (só vale para o dia de hoje: nas abas de outros dias a contagem seria mentira)
  // Com vários horários, a faixa conta as reservas: quantas estão na
  // tolerância e quantas já passaram dela sem chegar.
  let faixa: { texto: string; tom: "neutro" | "alerta" | "perigo" | "ok" } = { texto: "", tom: "neutro" };
  if (!ehHoje) {
    faixa = { texto: `Reservas de ${formatarDataCurta(dataDeOperacao(dia))}`, tom: "neutro" };
  } else if (minutosAgora !== null) {
    const atrasadas = pendentes.filter((r) => statusChegada(r, minutosAgora) === "atrasado").length;
    const naTolerancia = pendentes.filter((r) => statusChegada(r, minutosAgora) === "tolerancia").length;
    const s = (n: number) => (n === 1 ? "" : "s");
    if (atrasadas > 0) faixa = { texto: `${atrasadas} reserva${s(atrasadas)} passou da tolerância — decida sobre a mesa`, tom: "perigo" };
    else if (naTolerancia > 0) faixa = { texto: `${naTolerancia} reserva${s(naTolerancia)} dentro da tolerância`, tom: "alerta" };
    else if (minutosAgora < inicio) faixa = { texto: `Faltam ${inicio - minutosAgora} min para as primeiras reservas (${horaBonita(HORARIOS[0])})`, tom: "neutro" };
    else if (minutosAgora < fim) faixa = { texto: "Almoço em andamento", tom: "ok" };
    else faixa = { texto: "Almoço encerrado", tom: "neutro" };
  }
  const corFaixa = {
    neutro: { bg: "var(--color-surface)", cor: "var(--color-text-muted)", borda: "var(--color-border)" },
    alerta: { bg: "var(--color-secondary-soft)", cor: "var(--color-secondary-dark)", borda: "var(--color-secondary)" },
    perigo: { bg: "var(--color-error-soft)", cor: "var(--color-error)", borda: "var(--color-error)" },
    ok: { bg: "var(--color-accent-soft)", cor: "var(--color-accent-dark)", borda: "var(--color-accent)" },
  }[faixa.tom];

  return (
    <>
      {modalAberto && <NewReservationModal reservas={reservas} dataInicial={dataOperacao} onFechar={() => setModalAberto(false)} />}

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-6 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--color-primary)" }}>Modo operação</span>
            <div className="flex items-baseline gap-4 mt-1">
              <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Agora</span>
              <span className="text-[56px] font-bold leading-none tabular-nums" style={{ color: "var(--color-dark)" }}>
                {agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "--:--"}
              </span>
              <span className="text-[15px]" style={{ color: "var(--color-text-muted)" }}>almoço, {horaBonita(ATENDIMENTO.abre)} às {horaBonita(ATENDIMENTO.fecha)}</span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex gap-1.5">
              {DIAS_ABERTOS.map((d) => (
                <button
                  key={d.chave}
                  onClick={() => { setDiaEscolhido(d.chave); setMesaFoco(null); }}
                  className="px-3.5 py-2 text-[13px] font-semibold border"
                  style={{
                    borderRadius: "999px",
                    borderColor: dia === d.chave ? "var(--color-primary)" : "var(--color-border)",
                    background: dia === d.chave ? "var(--color-primary)" : "var(--color-surface)",
                    color: dia === d.chave ? "#fff" : "var(--color-text-muted)",
                  }}
                >
                  {d.label.split("-")[0]}
                </button>
              ))}
            </div>
            {faixa.texto && (
              <span className="text-[14px] font-semibold px-4 py-2 border" style={{ background: corFaixa.bg, color: corFaixa.cor, borderColor: corFaixa.borda, borderRadius: "var(--radius-sm)" }}>
                {faixa.texto}
              </span>
            )}
          </div>
        </div>

        {erroAcao && (
          <p role="alert" className="text-[14px] font-semibold px-4 py-3 border" style={{ background: "var(--color-error-soft)", color: "var(--color-error)", borderColor: "var(--color-error)", borderRadius: "var(--radius-sm)" }}>
            {erroAcao}
          </p>
        )}

        {/* a planta é o elemento principal da operação: fica com a maior parte */}
        <div className="grid xl:grid-cols-[minmax(0,470px)_minmax(0,1.35fr)] gap-5 items-start">
          {/* PRÓXIMAS RESERVAS */}
          <section className="border flex flex-col" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="font-display text-xl">Próximas reservas</p>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {pendentes.length} aguardando · {chegaram.length} na casa
              </span>
            </div>
            {carregando ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>
            ) : lista.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Nenhuma reserva para este dia.</p>
            ) : (
              lista.map((r, i) => {
                const chegada = statusChegada(r, minutosAgora);
                const focada = mesaFoco === r.mesaNumero;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                      background: focada ? "var(--color-primary-tint)" : "transparent",
                      borderLeft: focada ? "3px solid var(--color-primary)" : "3px solid transparent",
                    }}
                  >
                    <button onClick={() => setMesaFoco(focada ? null : r.mesaNumero)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className="text-[18px] font-bold tabular-nums w-14 shrink-0">{r.horario}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[17px] font-semibold block truncate">{r.nome}</span>
                        <span className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                          {r.pessoas} pessoa{r.pessoas === 1 ? "" : "s"} · Mesa {r.mesaNumero}
                        </span>
                        {r.observacao && (
                          <span className="text-[13px] block italic truncate" style={{ color: "var(--color-primary)" }}>“{r.observacao}”</span>
                        )}
                      </div>
                    </button>
                    <StatusBadge chegada={chegada} />
                    {r.checkinEm ? (
                      <button
                        onClick={() => acao(() => desfazerCheckin(r.id))}
                        className="text-[12px] font-semibold px-3 py-2 border shrink-0"
                        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}
                      >
                        Desfazer
                      </button>
                    ) : (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => acao(() => fazerCheckin(r.id))}
                          className="text-[13px] font-semibold px-4 py-2.5 text-white"
                          style={{ background: "var(--color-accent)", borderRadius: "var(--radius-sm)" }}
                        >
                          Chegou
                        </button>
                        {chegada === "atrasado" && (
                          <button
                            onClick={() => liberar(r.id)}
                            className="text-[13px] font-semibold px-3 py-2.5 text-white"
                            style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}
                          >
                            {liberarId === r.id ? "Confirmar?" : "Liberar"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {/* PLANTA */}
          <section className="border p-4 flex flex-col gap-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}>
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">Planta das mesas · {horaBonita(horarioPlanta)}</p>
              <button
                onClick={() => setModalAberto(true)}
                className="text-[13px] font-semibold px-4 py-2 text-white"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                + Nova reserva
              </button>
            </div>
            <div className="grid grid-cols-1 2xl:grid-cols-[1fr_260px] gap-4 items-start">
              <div className="flex flex-col gap-3 w-full">
                <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Horário da planta">
                  {HORARIOS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={horarioPlanta === h}
                      onClick={() => setHorarioEscolhido(h)}
                      className="px-3 py-1.5 text-[12.5px] font-semibold border tabular-nums"
                      style={{
                        borderRadius: "999px",
                        borderColor: horarioPlanta === h ? "var(--color-primary)" : "var(--color-border-field)",
                        background: horarioPlanta === h ? "var(--color-primary)" : "var(--color-surface)",
                        color: horarioPlanta === h ? "#fff" : "var(--color-dark)",
                      }}
                    >
                      {horaBonita(h)}
                    </button>
                  ))}
                </div>
                <PlantaRestaurante
                  reservas={reservas}
                  dia={dia}
                  data={dataOperacao}
                  horario={horarioPlanta}
                  mesaSelecionada={mesaFoco}
                  mesas={mesas}
                  aoSelecionar={(n) => setMesaFoco((atual) => (atual === n ? null : n))}
                  destaque="anel"
                />
                <LegendaPlanta completa />
              </div>
              {mesaFocoObj && (
                <div className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                  <DetalheMesaConteudo
                    mesaFocoObj={mesaFocoObj}
                    reservaFoco={reservaFoco}
                    horarioPlanta={horarioPlanta}
                    minutosAgora={minutosAgora}
                    onCancelar={() => cancelarReserva(reservaFoco!.id)}
                    onNovaReserva={() => setModalAberto(true)}
                    onCheckin={() => fazerCheckin(reservaFoco!.id)}
                    onDesfazerCheckin={() => desfazerCheckin(reservaFoco!.id)}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
