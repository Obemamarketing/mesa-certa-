"use client";

import { useEffect, useState } from "react";
import {
  DIAS,
  HORARIO_FIXO,
  TOLERANCIA_MINUTOS,
  cancelarReserva,
  desfazerCheckin,
  fazerCheckin,
  mesas,
  minutosDoHorario,
  statusChegada,
  useReservas,
  type DiaReserva,
} from "@/lib/reservas";
import PlantaVisual, { LegendaPlanta } from "../PlantaVisual";
import DetalheMesaConteudo from "../DetalheMesa";
import StatusBadge from "../StatusBadge";
import NewReservationModal from "../NewReservationModal";

function diaDeHoje(): DiaReserva {
  const d = new Date().getDay();
  return DIAS.find((x) => x.diaSemana === d)?.chave ?? "sexta";
}

export default function ModoOperacaoPage() {
  const { reservas, carregando } = useReservas();
  const [agora, setAgora] = useState<Date | null>(null);
  const [dia, setDia] = useState<DiaReserva>("sexta");
  const [mesaFoco, setMesaFoco] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    setDia(diaDeHoje());
    setAgora(new Date());
    const id = setInterval(() => setAgora(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const minutosAgora = agora ? agora.getHours() * 60 + agora.getMinutes() : null;
  const inicio = minutosDoHorario(HORARIO_FIXO);
  const fimTolerancia = inicio + TOLERANCIA_MINUTOS;

  const doDia = reservas.filter((r) => r.dia === dia && !r.cancelada);
  const pendentes = doDia.filter((r) => !r.checkinEm);
  const chegaram = doDia.filter((r) => r.checkinEm);
  const lista = [...pendentes, ...chegaram].sort((a, b) => {
    if (!!a.checkinEm !== !!b.checkinEm) return a.checkinEm ? 1 : -1;
    return minutosDoHorario(a.horario) - minutosDoHorario(b.horario) || a.mesaNumero.localeCompare(b.mesaNumero, "pt-BR", { numeric: true });
  });

  const mesaFocoObj = mesaFoco ? mesas.find((m) => m.numero === mesaFoco) : undefined;
  const reservaFoco = mesaFoco ? doDia.find((r) => r.mesaNumero === mesaFoco) : undefined;

  // contador da tolerância — só sinaliza, nunca cancela sozinho
  let faixa: { texto: string; tom: "neutro" | "alerta" | "perigo" | "ok" } = { texto: "", tom: "neutro" };
  if (minutosAgora !== null) {
    if (minutosAgora < inicio) faixa = { texto: `Faltam ${inicio - minutosAgora} min para as 19h30`, tom: "neutro" };
    else if (minutosAgora <= fimTolerancia) {
      const restam = fimTolerancia - minutosAgora;
      faixa = { texto: `Dentro da tolerância — restam ${restam} min`, tom: restam <= 5 ? "perigo" : "alerta" };
    } else faixa = { texto: "Tolerância encerrada — decida sobre as mesas sem check-in", tom: "perigo" };
  }
  const corFaixa = {
    neutro: { bg: "var(--color-surface)", cor: "var(--color-text-muted)", borda: "var(--color-border)" },
    alerta: { bg: "var(--color-secondary-soft)", cor: "var(--color-secondary-dark)", borda: "var(--color-secondary)" },
    perigo: { bg: "var(--color-error-soft)", cor: "var(--color-error)", borda: "var(--color-error)" },
    ok: { bg: "var(--color-accent-soft)", cor: "var(--color-accent-dark)", borda: "var(--color-accent)" },
  }[faixa.tom];

  return (
    <>
      {modalAberto && <NewReservationModal reservas={reservas} diaInicial={dia} onFechar={() => setModalAberto(false)} />}

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-6 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--color-primary)" }}>Modo operação</span>
            <div className="flex items-baseline gap-4 mt-1">
              <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Agora</span>
              <span className="text-[56px] font-bold leading-none tabular-nums" style={{ color: "var(--color-dark)" }}>
                {agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </span>
              <span className="text-[15px]" style={{ color: "var(--color-text-muted)" }}>reservas às {HORARIO_FIXO}</span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex gap-1.5">
              {DIAS.map((d) => (
                <button
                  key={d.chave}
                  onClick={() => { setDia(d.chave); setMesaFoco(null); }}
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

        <div className="grid xl:grid-cols-[1.1fr_1fr] gap-5 items-start">
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
                        onClick={() => desfazerCheckin(r.id)}
                        className="text-[12px] font-semibold px-3 py-2 border shrink-0"
                        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}
                      >
                        Desfazer
                      </button>
                    ) : (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => fazerCheckin(r.id)}
                          className="text-[13px] font-semibold px-4 py-2.5 text-white"
                          style={{ background: "var(--color-accent)", borderRadius: "var(--radius-sm)" }}
                        >
                          Chegou
                        </button>
                        {chegada === "atrasado" && (
                          <button
                            onClick={() => cancelarReserva(r.id)}
                            className="text-[13px] font-semibold px-3 py-2.5 text-white"
                            style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}
                          >
                            Liberar
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
              <p className="font-display text-xl">Planta das mesas</p>
              <button
                onClick={() => setModalAberto(true)}
                className="text-[13px] font-semibold px-4 py-2 text-white"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                + Nova reserva
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] xl:grid-cols-1 2xl:grid-cols-[1fr_220px] gap-4 items-start">
              <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
                <PlantaVisual
                  reservas={reservas}
                  dia={dia}
                  horario={HORARIO_FIXO}
                  mesaSelecionada={mesaFoco}
                  onSelecionar={(n) => setMesaFoco((atual) => (atual === n ? null : n))}
                />
                <LegendaPlanta />
              </div>
              {mesaFocoObj && (
                <div className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                  <DetalheMesaConteudo
                    mesaFocoObj={mesaFocoObj}
                    reservaFoco={reservaFoco}
                    horarioPlanta={HORARIO_FIXO}
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
