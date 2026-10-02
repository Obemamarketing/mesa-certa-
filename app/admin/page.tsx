"use client";

import { useState } from "react";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  DIAS,
  cancelarReserva,
  dataDoDia,
  formatarDataCurta,
  horarios,
  listarClientes,
  mesas,
  useReservas,
  type Reserva,
} from "@/lib/reservas";
import MesaMapa from "../MesaMapa";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import NewReservationModal from "./NewReservationModal";

const TICKET_MEDIO_ESTIMADO = 56.5;

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ReservasAdminPage() {
  const { reservas, carregando } = useReservas();
  const [diaIndex, setDiaIndex] = useState(0);
  const [painelMobile, setPainelMobile] = useState<"lista" | "planta">("lista");
  const [horarioPlanta, setHorarioPlanta] = useState(horarios[2]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"dia" | "todos">("dia");
  const [modalAberto, setModalAberto] = useState(false);

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

  const reservasDoDia = reservas.filter((r) => r.dia === diaAtivo.chave && !r.cancelada);
  const pessoasDoDia = reservasDoDia.reduce((s, r) => s + r.pessoas, 0);
  const mesasOcupadas = new Set(reservasDoDia.map((r) => r.mesaNumero)).size;
  const faturamentoEstimado = pessoasDoDia * TICKET_MEDIO_ESTIMADO;
  const ocupacaoPct = Math.round((mesasOcupadas / mesas.length) * 100);

  return (
    <>
      {modalAberto && <NewReservationModal reservas={reservas} diaInicial={diaAtivo.chave} onFechar={() => setModalAberto(false)} />}

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-[40px] leading-tight">Reservas de mesa</h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              Gerencie as reservas, visualize as mesas e acompanhe o movimento do {reservaBrand.restauranteAtual}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex items-center justify-between gap-1 border px-1.5 py-1.5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}>
              <button onClick={() => setDiaIndex((i) => (i - 1 + DIAS.length) % DIAS.length)} aria-label="Dia anterior" className="w-7 h-7 flex items-center justify-center shrink-0" style={{ color: "var(--color-text-muted)" }}>‹</button>
              <span className="text-sm font-medium px-2 text-center whitespace-nowrap">
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

        {/* KPIs */}
        <div className="flex flex-wrap gap-3">
          <StatCard
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>}
            label="Reservas hoje"
            valor={String(reservasDoDia.length)}
            rodape="em relação a ontem"
          />
          <StatCard
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" /></svg>}
            label="Pessoas"
            valor={String(pessoasDoDia)}
            rodape="em relação a ontem"
          />
          <StatCard
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>}
            label="Mesas ocupadas"
            valor={`${mesasOcupadas}/${mesas.length}`}
            progresso={ocupacaoPct}
          />
          <StatCard
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 20V10M12 20V4M20 20v-7" /></svg>}
            label="Faturamento estimado"
            valor={formatBRL(faturamentoEstimado)}
            rodape="em relação a ontem"
          />
        </div>

        {/* TABS (mobile) + BUSCA */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-5 border-b lg:hidden" style={{ borderColor: "var(--color-border)" }}>
            {(["lista", "planta"] as const).map((a) => {
              const ativo = painelMobile === a;
              return (
                <button
                  key={a}
                  onClick={() => setPainelMobile(a)}
                  className="py-2 text-sm border-b-2"
                  style={{ borderColor: ativo ? "var(--color-primary)" : "transparent", color: ativo ? "var(--color-primary)" : "var(--color-text-muted)", fontWeight: ativo ? 600 : 500 }}
                >
                  {a === "lista" ? "Lista de reservas" : "Planta de mesas"}
                </button>
              );
            })}
          </div>
          <div className="flex-1 flex gap-2.5">
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
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5 items-start">
          <section
            className={`${painelMobile === "planta" ? "hidden lg:flex" : "flex"} flex-col border`}
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="font-display text-lg">{diaAtivo.label} — {formatarDataCurta(dataDoDia(diaAtivo.chave))}</p>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{reservasFiltradas.length} reserva{reservasFiltradas.length === 1 ? "" : "s"}</span>
            </div>
            {carregando ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>
            ) : reservasFiltradas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Nenhuma reserva ainda pra esse dia.</p>
            ) : (
              <div className="flex flex-col">
                {reservasFiltradas.map((r, i) => (
                  <LinhaReserva key={r.id} reserva={r} comBorda={i > 0} />
                ))}
              </div>
            )}
          </section>

          <section
            className={`${painelMobile === "lista" ? "hidden lg:flex" : "flex"} flex-col border p-5 gap-4`}
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg whitespace-nowrap">Planta de mesas</p>
              <select
                value={horarioPlanta}
                onChange={(e) => setHorarioPlanta(e.target.value)}
                className="border px-2.5 py-1.5 text-xs outline-none shrink-0"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
              >
                {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <MesaMapa reservas={reservas} dia={diaAtivo.chave} horario={horarioPlanta} somenteLeitura />
          </section>
        </div>

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

function LinhaReserva({ reserva, comBorda }: { reserva: Reserva; comBorda: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap" style={comBorda ? { borderTop: "1px solid var(--color-border)" } : undefined}>
      <span className="text-[15px] font-semibold tabular-nums w-12 shrink-0">{reserva.horario}</span>
      <div className="flex-1 min-w-[140px]">
        <span className="text-[16px] font-semibold block truncate">{reserva.nome}</span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{reserva.pessoas} pessoa{reserva.pessoas === 1 ? "" : "s"}</span>
      </div>
      <span className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
        Mesa {reserva.mesaNumero}
      </span>
      <StatusBadge cancelada={reserva.cancelada} />
      {!reserva.cancelada && (
        <button onClick={() => cancelarReserva(reserva.id)} className="text-xs font-semibold shrink-0 px-2 py-1" style={{ color: "var(--color-text-muted)" }}>
          Cancelar
        </button>
      )}
    </div>
  );
}
