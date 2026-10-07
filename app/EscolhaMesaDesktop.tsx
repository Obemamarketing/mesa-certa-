"use client";

// Etapa "Escolha sua mesa" — SOMENTE DESKTOP (renderizada dentro de um
// container hidden lg:flex em app/page.tsx). A versão mobile dessa etapa
// continua intacta no page.tsx e não passa por aqui.
//
// Divisão da tela: planta do salão à esquerda (referência visual) e painel de
// seleção à direita (onde o cliente realmente escolhe). Disponibilidade,
// capacidade e regras vêm do mesmo statusMesa usado no resto do sistema.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  DIAS,
  dataDoDia,
  formatarDataCurta,
  situacaoDoGrupo,
  statusMesa,
  type DiaReserva,
  type Mesa,
  type Reserva,
} from "@/lib/reservas";
import { useMesasConfig } from "@/lib/mesas";
import PlantaRestaurante, { LegendaPlanta } from "./PlantaRestaurante";
import { MesaMiniatura, type EstadoMesa } from "./MesaDesenho";

// Só as 3 áreas que existem de verdade no sistema (lib/regras.ts).
const AREAS: { chave: Mesa["zona"] | "todas"; label: string }[] = [
  { chave: "todas", label: "Todas" },
  { chave: "Salão principal", label: "Salão principal" },
  { chave: "Salão anexo", label: "Salão anexo" },
  { chave: "Palco", label: "Palco" },
  { chave: "Área externa", label: "Área externa" },
];

const ETAPAS = ["Escolha da mesa", "Seus dados", "Confirmação"];

function descricaoDaMesa(mesa: Mesa): string {
  const tamanho =
    mesa.capacidade >= 6
      ? "Mesa ampla, ideal para grupos."
      : mesa.capacidade <= 2
      ? "Mesa para dois, mais reservada."
      : `Mesa confortável para até ${mesa.capacidade} pessoas.`;
  const lugar: Record<Mesa["zona"], string> = {
    Palco: "Fica de frente para o palco, pertinho da música.",
    "Salão principal": "Fica no centro do salão principal.",
    "Salão anexo": "Fica no salão anexo, num canto mais tranquilo.",
    "Área externa": "Fica na área externa, sob os guarda-sóis.",
  };
  return `${tamanho} ${lugar[mesa.zona]}`;
}

export default function EscolhaMesaDesktop({
  reservas,
  dia,
  horario,
  pessoas,
  mesasNumeros,
  onAlternar,
  onVoltar,
  onContinuar,
}: {
  reservas: Reserva[];
  dia: DiaReserva;
  horario: string;
  pessoas: number;
  /** Mesas escolhidas, na ordem em que foram escolhidas. */
  mesasNumeros: string[];
  /** Escolhe ou desmarca uma mesa. */
  onAlternar: (numero: string) => void;
  onVoltar: () => void;
  onContinuar: () => void;
}) {
  const [area, setArea] = useState<Mesa["zona"] | "todas">("todas");
  const { mesas } = useMesasConfig();

  const escolhidas = mesasNumeros.map((n) => mesas.find((m) => m.numero === n)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const situacao = situacaoDoGrupo(escolhidas, pessoas);
  const maiorMesa = Math.max(...mesas.map((m) => m.capacidade));
  const precisaDeVarias = pessoas > maiorMesa;
  const mesaObj = escolhidas.length === 1 ? escolhidas[0] : null;
  const visiveis = area === "todas" ? mesas : mesas.filter((m) => m.zona === area);
  const rotuloLista = area === "todas" ? "Todas as mesas" : `Mesas do ${area.toLowerCase()}`;
  const diaLabel = `${DIAS.find((d) => d.chave === dia)?.label.split("-")[0]}, ${formatarDataCurta(dataDoDia(dia))}`;

  return (
    <div className="flex-1 flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* ---------------- HEADER ---------------- */}
      <header className="flex items-center justify-between gap-8 px-10 py-5">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={46} height={46} className="rounded-full" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[23px]" style={{ color: "var(--color-dark)" }}>
              {reservaBrand.restauranteAtual}
            </span>
            <span className="text-[10px] tracking-[0.2em] uppercase mt-1" style={{ color: "var(--color-text-muted)" }}>
              Restaurante &amp; Bar
            </span>
          </span>
        </Link>

        <ol className="flex items-center gap-1">
          {ETAPAS.map((rotulo, i) => {
            const ativo = i === 0;
            return (
              <li key={rotulo} className="flex items-center gap-3">
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
                    style={
                      ativo
                        ? { background: "var(--color-primary)", color: "#fff" }
                        : { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }
                    }
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="text-[13.5px] whitespace-nowrap"
                    style={{ color: ativo ? "var(--color-dark)" : "var(--color-text-muted)", fontWeight: ativo ? 600 : 400 }}
                  >
                    {rotulo}
                  </span>
                </span>
                {i < ETAPAS.length - 1 && <span className="w-10 h-px" style={{ background: "var(--color-border)" }} />}
              </li>
            );
          })}
        </ol>
      </header>

      <div style={{ borderTop: "1px solid var(--color-border)" }} />

      {/* ---------------- CORPO ---------------- */}
      <div className="flex-1 px-10 py-7">
        <div className="grid gap-8 items-start" style={{ gridTemplateColumns: "minmax(0, 1.62fr) minmax(390px, 1fr)" }}>
          {/* ========== ESQUERDA — PLANTA ========== */}
          <div className="flex flex-col gap-4 sticky top-6">
            <button
              onClick={onVoltar}
              className="flex items-center gap-2 text-[13.5px] font-medium self-start"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Voltar
            </button>

            <div
              className="p-5"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px" }}
            >
              <PlantaRestaurante
                reservas={reservas}
                dia={dia}
                horario={horario}
                mesaSelecionada={null}
                mesasSelecionadas={mesasNumeros}
                mesas={mesas}
                statusSimplificado
              />
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                <LegendaPlanta />
              </div>
            </div>
          </div>

          {/* ========== DIREITA — PAINEL ========== */}
          <aside
            className="flex flex-col sticky top-6"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "18px",
              // o painel inteiro cabe na tela: só a lista de mesas rola,
              // o resumo e o botão ficam sempre à vista
              maxHeight: "calc(100vh - 104px)",
            }}
          >
            <div className="px-7 pt-6 pb-4 shrink-0">
              <h1 className="font-display text-[38px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>
                Escolha sua mesa
              </h1>
              <p className="text-[15px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                {pessoas > 1
                  ? "A soma dos lugares das mesas precisa cobrir o grupo."
                  : "Selecione uma área e escolha uma mesa disponível."}
              </p>
              <p className="text-[13px] mt-3.5 pt-3.5" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
                {diaLabel} · {horario} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
              </p>
              {precisaDeVarias && (
                <p
                  className="text-[13px] mt-3 px-3.5 py-2.5 leading-snug"
                  style={{ background: "var(--color-secondary-soft)", color: "var(--color-secondary-dark)", borderRadius: "10px" }}
                >
                  Grupo maior que a maior mesa ({maiorMesa} lugares): escolha mais de uma.
                </p>
              )}
            </div>

            {/* filtros por área */}
            <div className="px-7 pb-3.5 flex flex-wrap gap-1.5 shrink-0">
              {AREAS.map((a) => {
                const ativo = area === a.chave;
                return (
                  <button
                    key={a.chave}
                    onClick={() => setArea(a.chave)}
                    className="px-3 py-1.5 text-[12.5px] font-medium border transition-colors"
                    style={{
                      borderRadius: "999px",
                      borderColor: ativo ? "var(--color-primary)" : "var(--color-border)",
                      background: ativo ? "var(--color-primary)" : "transparent",
                      color: ativo ? "#fff" : "var(--color-text-muted)",
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>

            {/* lista de mesas — única parte que rola */}
            <div className="px-7 pb-2 flex-1 min-h-0 overflow-y-auto">
              <p className="text-[11px] font-bold tracking-[0.16em] uppercase mb-3" style={{ color: "var(--color-text-muted)" }}>
                {rotuloLista}
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {visiveis.map((m) => {
                  // sem filtro por capacidade: mesa pequena também serve, o grupo só junta mesas
                  const status = statusMesa(reservas, dia, horario, m);
                  const selecionada = mesasNumeros.includes(m.numero);
                  // grupo já acomodado: as outras mesas travam, pra ninguém reservar mesa a mais
                  const jaAcomodado = situacao.cobre && !selecionada;
                  const indisponivel = (status !== "livre" && !selecionada) || jaAcomodado;
                  const estado: EstadoMesa = selecionada ? "selecionada" : status;
                  return (
                    <button
                      key={m.numero}
                      disabled={indisponivel}
                      onClick={() => onAlternar(m.numero)}
                      title={jaAcomodado ? "Seu grupo já está acomodado. Desmarque uma mesa para trocar." : undefined}
                      aria-pressed={selecionada}
                      className="relative flex flex-col gap-1.5 p-3 border text-left transition-transform disabled:cursor-not-allowed"
                      style={{
                        borderRadius: "12px",
                        borderColor: selecionada ? "var(--color-primary)" : "var(--color-border)",
                        background: selecionada ? "var(--color-primary)" : "var(--color-bg)",
                        opacity: indisponivel ? 0.5 : 1,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <MesaMiniatura mesa={m} estado={estado} tamanho={44} />
                        <span
                          className="font-display text-[26px] leading-none"
                          style={{ color: selecionada ? "#fff" : "var(--color-dark)" }}
                        >
                          {m.numero}
                        </span>
                      </div>
                      <span
                        className="text-[12.5px] font-medium leading-tight"
                        style={{ color: selecionada ? "rgba(255,255,255,0.95)" : "var(--color-dark)" }}
                      >
                        {m.capacidade} lugares
                      </span>
                      <span
                        className="text-[11.5px] leading-tight"
                        style={{ color: selecionada ? "rgba(255,255,255,0.75)" : "var(--color-text-muted)" }}
                      >
                        {m.zona}
                      </span>
                      {selecionada && (
                        <span
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: "#fff" }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {visiveis.length === 0 && (
                <p className="text-[14px] py-6 text-center" style={{ color: "var(--color-text-muted)" }}>
                  Nenhuma mesa nessa área.
                </p>
              )}
            </div>

            {/* mesas selecionadas — ficam sempre visíveis, junto do botão */}
            <div className="px-7 pt-5 shrink-0" style={{ borderTop: "1px solid var(--color-border)" }}>
              <div
                className="p-4"
                style={{
                  borderRadius: "14px",
                  background: escolhidas.length ? "var(--color-bg)" : "transparent",
                  border: `1px ${escolhidas.length ? "solid" : "dashed"} var(--color-border)`,
                }}
              >
                <p className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
                  {escolhidas.length > 1 ? "Mesas selecionadas" : "Mesa selecionada"}
                </p>

                {mesaObj ? (
                  <div className="flex items-center gap-4 mt-2.5">
                    <MesaMiniatura mesa={mesaObj} estado="selecionada" tamanho={70} />
                    <div className="min-w-0">
                      <p className="font-display text-[30px] leading-none" style={{ color: "var(--color-dark)" }}>
                        Mesa {mesaObj.numero}
                      </p>
                      <p className="text-[13.5px] mt-1.5" style={{ color: "var(--color-dark)" }}>
                        {mesaObj.capacidade} lugares · {mesaObj.zona}
                      </p>
                      <p className="text-[12.5px] mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
                        {descricaoDaMesa(mesaObj)}
                      </p>
                    </div>
                  </div>
                ) : escolhidas.length > 1 ? (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {escolhidas.map((m) => {
                      const parte = situacao.partes.find((p) => p.numero === m.numero);
                      return (
                        <span
                          key={m.numero}
                          className="inline-flex items-baseline gap-2 px-3 py-1.5"
                          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px" }}
                        >
                          <strong className="font-display text-[20px] leading-none" style={{ color: "var(--color-dark)" }}>{m.numero}</strong>
                          <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
                            {parte ? `${parte.pessoas} pessoa${parte.pessoas === 1 ? "" : "s"}` : `${m.capacidade} lugares`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    Escolha uma mesa acima. Ela aparece destacada na planta ao lado.
                  </p>
                )}

                {situacao.aviso && (
                  <p
                    role="status"
                    className="text-[13px] font-medium mt-3 px-3 py-2 leading-snug"
                    style={{ background: "var(--color-secondary-soft)", color: "var(--color-secondary-dark)", borderRadius: "8px" }}
                  >
                    {situacao.aviso}
                  </p>
                )}
                {situacao.cobre && escolhidas.length > 1 && (
                  <p className="text-[12.5px] mt-3 leading-snug" style={{ color: "var(--color-accent-dark)" }}>
                    Tudo certo: as mesas acomodam o grupo de {pessoas}.
                  </p>
                )}
              </div>
            </div>

            {/* continuar */}
            <div className="px-7 py-5 shrink-0">
              <button
                onClick={onContinuar}
                disabled={!situacao.cobre}
                className="w-full py-4 text-[15px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--color-primary)", borderRadius: "12px" }}
              >
                {escolhidas.length > 0 && !situacao.cobre ? "Escolha mais uma mesa" : "Continuar"}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
