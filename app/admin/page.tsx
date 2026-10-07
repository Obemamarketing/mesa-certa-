"use client";

import { useEffect, useState } from "react";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  DIAS,
  HORARIO_FIXO,
  ROTULO_STATUS_CHEGADA,
  TOLERANCIA_MINUTOS,
  cancelarReserva,
  dataDoDia,
  desfazerCheckin,
  fazerCheckin,
  formatarDataCurta,
  horarios,
  listarClientes,
  minutosDoHorario,
  statusChegada,
  useReservas,
  type Mesa,
  type Reserva,
} from "@/lib/reservas";
import PlantaRestaurante, { LegendaPlanta } from "../PlantaRestaurante";
import { useMesasConfig } from "@/lib/mesas";
import DetalheMesaConteudo from "./DetalheMesa";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import NewReservationModal from "./NewReservationModal";

const ICONE_CALENDARIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
);
const ICONE_GRUPO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="8.5" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M2.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M14.5 15c2.3.2 4 2 4 4.3" /></svg>
);
const ICONE_MESA = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
);
const ICONE_ORDENAR = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 9 5-5 5 5M7 15l5 5 5-5" /></svg>
);
const ICONE_NOTA = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 16.5h5" /></svg>
);

export default function ReservasAdminPage() {
  const { reservas, carregando } = useReservas();
  const { mesas } = useMesasConfig();
  const [diaIndex, setDiaIndex] = useState(0);
  const [painelMobile, setPainelMobile] = useState<"planta" | "reservas" | "lista">("planta");
  const [horarioPlanta, setHorarioPlanta] = useState(HORARIO_FIXO);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"dia" | "todos">("dia");
  const [modalAberto, setModalAberto] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState<"horario" | "pessoas">("horario");
  const [ordemAsc, setOrdemAsc] = useState(true);
  const [mesaFoco, setMesaFoco] = useState<string | null>(null);
  const [reservaFocoId, setReservaFocoId] = useState<string | null>(null);
  const [minutosAgora, setMinutosAgora] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setMinutosAgora(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const diaAtivo = DIAS[diaIndex];
  const clientes = listarClientes(reservas);

  const baseReservas = filtro === "dia" ? reservas.filter((r) => r.dia === diaAtivo.chave) : reservas;
  const buscaNormalizada = busca.trim().toLowerCase();
  const reservasFiltradas = (buscaNormalizada
    ? baseReservas.filter(
        (r) =>
          r.nome.toLowerCase().includes(buscaNormalizada) ||
          r.telefone.includes(buscaNormalizada) ||
          r.mesaNumero.includes(buscaNormalizada)
      )
    : baseReservas
  ).filter((r) => !r.cancelada || filtro === "todos");

  const reservasOrdenadas = [...reservasFiltradas].sort((a, b) => {
    const dir = ordemAsc ? 1 : -1;
    if (ordenarPor === "horario") return (minutosDoHorario(a.horario) - minutosDoHorario(b.horario)) * dir;
    return (a.pessoas - b.pessoas) * dir;
  });

  function alternarOrdenacao(campo: "horario" | "pessoas") {
    if (ordenarPor === campo) setOrdemAsc((a) => !a);
    else {
      setOrdenarPor(campo);
      setOrdemAsc(true);
    }
  }

  const reservasDoDia = reservas.filter((r) => r.dia === diaAtivo.chave && !r.cancelada);
  const pessoasDoDia = reservasDoDia.reduce((s, r) => s + r.pessoas, 0);
  const mesasOcupadas = new Set(reservasDoDia.map((r) => r.mesaNumero)).size;
  const ocupacaoPct = Math.round((mesasOcupadas / mesas.length) * 100);

  const proximasDuasHoras =
    minutosAgora !== null
      ? reservasDoDia.filter((r) => {
          const m = minutosDoHorario(r.horario);
          return m >= minutosAgora && m <= minutosAgora + 120;
        }).length
      : null;

  const picoHorario = horarios
    .map((h) => ({ h, total: reservasDoDia.filter((r) => r.horario === h).reduce((s, r) => s + r.pessoas, 0) }))
    .reduce((max, cur) => (cur.total > max.total ? cur : max), { h: "", total: 0 });

  const mesaFocoObj = mesaFoco ? mesas.find((m) => m.numero === mesaFoco) : undefined;
  const reservaFoco = reservaFocoId
    ? reservasDoDia.find((r) => r.id === reservaFocoId)
    : mesaFoco
    ? reservasDoDia.find((r) => r.mesaNumero === mesaFoco && r.horario === horarioPlanta) ??
      reservasDoDia.find((r) => r.mesaNumero === mesaFoco)
    : undefined;

  function focarReserva(r: Reserva) {
    setMesaFoco(r.mesaNumero);
    setReservaFocoId(r.id);
    setHorarioPlanta(r.horario);
    setPainelMobile("planta");
  }

  function focarMesa(numero: string) {
    setReservaFocoId(null);
    setMesaFoco((atual) => (numero === atual ? null : numero));
  }

  return (
    <>
      {modalAberto && <NewReservationModal reservas={reservas} diaInicial={diaAtivo.chave} onFechar={() => setModalAberto(false)} />}

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-[40px] leading-tight">Reservas</h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              Gerencie as reservas, visualize as mesas e acompanhe o movimento do {reservaBrand.restauranteAtual}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex items-center justify-between gap-1 border px-1.5 py-1.5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}>
              <button onClick={() => setDiaIndex((i) => (i - 1 + DIAS.length) % DIAS.length)} aria-label="Dia anterior" className="w-7 h-7 flex items-center justify-center shrink-0" style={{ color: "var(--color-text-muted)" }}>‹</button>
              <span className="text-sm font-medium px-2 text-center whitespace-nowrap flex items-center gap-1.5">
                {ICONE_CALENDARIO}
                {diaAtivo.label}, {formatarDataCurta(dataDoDia(diaAtivo.chave))}
              </span>
              <button onClick={() => setDiaIndex((i) => (i + 1) % DIAS.length)} aria-label="Próximo dia" className="w-7 h-7 flex items-center justify-center shrink-0" style={{ color: "var(--color-text-muted)" }}>›</button>
            </div>
            <button
              onClick={() => setModalAberto(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white shrink-0"
              style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
            >
              <span className="text-base leading-none">+</span> Nova reserva
            </button>
          </div>
        </div>

        {/* KPIs operacionais */}
        <div className={`flex-wrap gap-3 ${painelMobile === "reservas" ? "flex" : "hidden lg:flex"}`}>
          <StatCard
            icon={ICONE_CALENDARIO}
            label="reservas hoje"
            valor={String(reservasDoDia.length)}
            rodape={proximasDuasHoras !== null ? `${proximasDuasHoras} nas próximas 2 horas` : undefined}
          />
          <StatCard
            icon={ICONE_GRUPO}
            label="pessoas"
            valor={String(pessoasDoDia)}
            rodape={picoHorario.total > 0 ? `Pico às ${picoHorario.h}` : "Sem reservas ainda"}
          />
          <StatCard
            icon={ICONE_MESA}
            label="mesas reservadas"
            valor={`${mesasOcupadas}/${mesas.length}`}
            progresso={ocupacaoPct}
            rodape={`${ocupacaoPct}% de ocupação`}
          />
        </div>

        {/* TABS (mobile) + BUSCA */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-5 border-b lg:hidden" style={{ borderColor: "var(--color-border)" }}>
            {(["planta", "reservas", "lista"] as const).map((a) => {
              const ativo = painelMobile === a;
              const rotulo = a === "planta" ? "Planta" : a === "reservas" ? "Reservas" : "Lista";
              return (
                <button
                  key={a}
                  onClick={() => setPainelMobile(a)}
                  className="py-2 text-sm border-b-2"
                  style={{ borderColor: ativo ? "var(--color-primary)" : "transparent", color: ativo ? "var(--color-primary)" : "var(--color-text-muted)", fontWeight: ativo ? 600 : 500 }}
                >
                  {rotulo}
                </button>
              );
            })}
          </div>
          <div className={`flex-1 gap-2.5 ${painelMobile === "lista" ? "flex" : "hidden lg:flex"}`}>
            <div className="relative flex-1 max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, telefone ou mesa..."
                className="w-full border pl-9 pr-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as "dia" | "todos")}
              className="border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
            >
              <option value="dia">Hoje</option>
              <option value="todos">Todos os dias</option>
            </select>
          </div>
        </div>

        {/* LISTA + PLANTA */}
        {/* a planta agora é a deitada, larga: precisa de mais espaço que a antiga */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5 items-start">
          <section
            className={`${painelMobile === "lista" ? "flex" : "hidden lg:flex"} flex-col border`}
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="font-display text-lg">Reservas de {filtro === "dia" ? diaAtivo.label.toLowerCase() : "todos os dias"}</p>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{reservasOrdenadas.length} reserva{reservasOrdenadas.length === 1 ? "" : "s"}</span>
            </div>

            {reservasOrdenadas.length > 0 && (
              <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>
                <button onClick={() => alternarOrdenacao("horario")} className="flex items-center gap-1 w-12 shrink-0">Horário {ICONE_ORDENAR}</button>
                <span className="flex-1 min-w-[140px]">Cliente</span>
                <button onClick={() => alternarOrdenacao("pessoas")} className="flex items-center gap-1 w-20 shrink-0">Pessoas {ICONE_ORDENAR}</button>
                <span className="w-20 shrink-0">Mesa</span>
                <span className="w-24 shrink-0">Status</span>
                <span className="w-5 shrink-0" />
              </div>
            )}

            {carregando ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>
            ) : reservasOrdenadas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Nenhuma reserva ainda pra esse dia.</p>
            ) : (
              <div className="flex flex-col">
                {reservasOrdenadas.map((r, i) => (
                  <LinhaReserva key={r.id} reserva={r} comBorda={i > 0} focada={r.id === reservaFocoId} minutosAgora={minutosAgora} onFocar={() => focarReserva(r)} />
                ))}
              </div>
            )}
          </section>

          <section
            className={`${painelMobile === "planta" ? "flex" : "hidden lg:flex"} flex-col border p-4 lg:p-5 gap-3`}
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg whitespace-nowrap">Planta de mesas</p>
              <span className="text-xs font-medium px-2.5 py-1.5 shrink-0" style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                {horarioPlanta} · fixo
              </span>
            </div>

            {/* planta em cima, detalhe da mesa embaixo: empilhar deixa a planta usar a largura toda */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <PlantaRestaurante
                  reservas={reservas}
                  dia={diaAtivo.chave}
                  horario={horarioPlanta}
                  mesaSelecionada={mesaFoco}
                  mesas={mesas}
                  aoSelecionar={focarMesa}
                  destaque="anel"
                />
                <LegendaPlanta completa />
              </div>

              {/* DETALHE — desktop (painel ao lado) */}
              {mesaFocoObj && (
                <div className="hidden xl:flex border p-4 flex-col gap-3" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
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

        {/* DETALHE — mobile (ficha inferior) */}
        {mesaFocoObj && (
          <div className="xl:hidden fixed inset-0 z-20 flex items-end" style={{ background: "rgba(42,23,18,0.4)" }} onClick={() => focarMesa(mesaFocoObj.numero)}>
            <div
              className="w-full p-5 flex flex-col gap-3"
              style={{ background: "var(--color-surface)", borderRadius: "20px 20px 0 0" }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background: "var(--color-border)" }} />
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
          </div>
        )}

        {/* CLIENTES */}
        <section className="border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <p className="font-display text-lg">Clientes</p>
            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>cadastro por telefone</span>
          </div>
          {clientes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Nenhum cliente cadastrado ainda.</p>
          ) : (
            <div className="flex flex-col">
              {clientes.slice(0, 6).map((c, i) => (
                <div key={c.telefone} className="flex items-center gap-3 px-5 py-3" style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                    {c.nome.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-semibold block truncate">{c.nome}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.telefone}</span>
                  </div>
                  <span className="text-xs font-semibold shrink-0" style={{ color: "var(--color-text-muted)" }}>{c.totalReservas} reserva{c.totalReservas === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function LinhaReserva({
  reserva,
  comBorda,
  focada,
  minutosAgora,
  onFocar,
}: {
  reserva: Reserva;
  comBorda: boolean;
  focada: boolean;
  minutosAgora: number | null;
  onFocar: () => void;
}) {
  return (
    <button
      onClick={onFocar}
      className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap text-left w-full"
      style={{
        ...(comBorda ? { borderTop: "1px solid var(--color-border)" } : {}),
        background: focada ? "var(--color-primary-tint)" : "transparent",
        borderLeft: focada ? "3px solid var(--color-primary)" : "3px solid transparent",
      }}
    >
      <span className="text-[15px] font-semibold tabular-nums w-12 shrink-0">{reserva.horario}</span>
      <div className="flex-1 min-w-[140px]">
        <span className="text-[16px] font-semibold block truncate">{reserva.nome}</span>
        <span className="text-xs block" style={{ color: "var(--color-text-muted)" }}>{reserva.telefone}</span>
        {reserva.observacao && (
          <span className="text-xs flex items-center gap-1 mt-0.5 italic" style={{ color: "var(--color-primary)" }}>
            {ICONE_NOTA}
            <span className="truncate">{reserva.observacao}</span>
          </span>
        )}
      </div>
      <span className="text-[14px] w-20 shrink-0" style={{ color: "var(--color-text-muted)" }}>{reserva.pessoas} pessoa{reserva.pessoas === 1 ? "" : "s"}</span>
      <span className="flex items-center gap-1.5 text-xs w-20 shrink-0" style={{ color: "var(--color-text-muted)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
        Mesa {reserva.mesaNumero}
      </span>
      <span className="w-28 shrink-0"><StatusBadge cancelada={reserva.cancelada} chegada={statusChegada(reserva, minutosAgora)} /></span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" className="shrink-0"><path d="m9 18 6-6-6-6" /></svg>
    </button>
  );
}
