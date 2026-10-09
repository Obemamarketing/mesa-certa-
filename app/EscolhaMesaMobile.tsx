"use client";

// Etapa "Escolha sua mesa" no celular. Mesma lógica da versão de desktop
// (EscolhaMesaDesktop) — planta como referência, escolha pelos cards — mas
// empilhada: planta em pé no topo, lista embaixo e o botão Continuar sempre
// colado no rodapé, pra nunca sumir enquanto a pessoa rola a lista.

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
import AvisoFalta from "./AvisoFalta";

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
    Palco: "Fica de frente para o palco.",
    "Salão principal": "Fica no centro do salão principal.",
    "Salão anexo": "Fica no salão anexo, num canto mais tranquilo.",
    "Área externa": "Fica na área externa, sob os guarda-sóis.",
  };
  return `${tamanho} ${lugar[mesa.zona]}`;
}

export default function EscolhaMesaMobile({
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
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={38} height={38} className="rounded-full" />
          <span className="font-display text-[19px] leading-none" style={{ color: "var(--color-dark)" }}>
            {reservaBrand.restauranteAtual}
          </span>
        </Link>
        <Link href="/consulta" className="text-[13px] font-medium" style={{ color: "var(--color-primary)" }}>
          Consultar reserva
        </Link>
      </header>

      {/* ---------------- ETAPAS ---------------- */}
      <div className="flex items-center justify-between gap-1 px-4 pb-3">
        <button onClick={onVoltar} aria-label="Voltar" className="shrink-0 pr-1.5" style={{ color: "var(--color-text-muted)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <ol className="flex items-center gap-1 flex-1 justify-end">
          {ETAPAS.map((rotulo, i) => {
            const ativo = i === 0;
            return (
              <li key={rotulo} className="flex items-center gap-1">
                <span
                  className="w-[21px] h-[21px] rounded-full flex items-center justify-center text-[10.5px] font-semibold shrink-0"
                  style={
                    ativo
                      ? { background: "var(--color-primary)", color: "#fff" }
                      : { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }
                  }
                >
                  {i + 1}
                </span>
                <span
                  className="text-[10.5px] whitespace-nowrap"
                  style={{ color: ativo ? "var(--color-dark)" : "var(--color-text-muted)", fontWeight: ativo ? 600 : 400 }}
                >
                  {rotulo}
                </span>
                {i < ETAPAS.length - 1 && <span className="w-3 h-px shrink-0" style={{ background: "var(--color-border)" }} />}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ---------------- PLANTA ---------------- */}
      <div
        className="px-2 py-3"
        style={{
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <PlantaRestaurante
          reservas={reservas}
          dia={dia}
          horario={horario}
          mesaSelecionada={null}
          mesasSelecionadas={mesasNumeros}
          mesas={mesas}
          statusSimplificado
          zoomavel
        />
        <div className="mt-3 pt-3 px-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
          <LegendaPlanta compacta />
        </div>
      </div>

      {/* ---------------- SELEÇÃO ---------------- */}
      <div className="px-4 pt-5 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[29px] leading-tight" style={{ color: "var(--color-dark)" }}>
            Escolha sua mesa
          </h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--color-text-muted)" }}>
            Selecione uma área e escolha uma mesa disponível.
          </p>
          <p className="text-[12.5px] mt-2.5 pt-2.5" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
            {diaLabel} · {horario} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
          </p>
          {precisaDeVarias && (
            <p
              className="text-[12.5px] mt-2.5 px-3 py-2 leading-snug"
              style={{ background: "var(--color-secondary-soft)", color: "var(--color-secondary-dark)", borderRadius: "10px" }}
            >
              Grupo maior que a maior mesa ({maiorMesa} lugares): escolha mais de uma.
            </p>
          )}
        </div>

        {/* filtros — rolam de lado quando não cabem */}
        <div
          className="flex gap-2 overflow-x-auto -mx-4 px-4"
          style={{ scrollbarWidth: "none" }}
        >
          {AREAS.map((a) => {
            const ativo = area === a.chave;
            return (
              <button
                key={a.chave}
                onClick={() => setArea(a.chave)}
                className="px-3.5 py-1.5 text-[12.5px] font-medium border shrink-0"
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

        {/* lista de mesas */}
        <div>
          <p className="text-[10.5px] font-bold tracking-[0.14em] uppercase mb-2.5" style={{ color: "var(--color-text-muted)" }}>
            {rotuloLista}
          </p>
          <div className="grid grid-cols-4 gap-2">
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
                  aria-pressed={selecionada}
                  aria-label={`Mesa ${m.numero}, ${m.capacidade} lugares, ${m.zona}`}
                  className="relative flex flex-col items-center gap-0.5 py-2 px-1 border disabled:cursor-not-allowed"
                  style={{
                    borderRadius: "10px",
                    borderColor: selecionada ? "var(--color-primary)" : "var(--color-border)",
                    background: selecionada ? "var(--color-primary)" : "var(--color-surface)",
                    opacity: indisponivel ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <MesaMiniatura mesa={m} estado={estado} tamanho={24} compacta />
                    <span
                      className="font-display text-[18px] leading-none"
                      style={{ color: selecionada ? "#fff" : "var(--color-dark)" }}
                    >
                      {m.numero}
                    </span>
                  </div>
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: selecionada ? "rgba(255,255,255,0.85)" : "var(--color-text-muted)" }}
                  >
                    {m.capacidade} lugares
                  </span>
                  {selecionada && (
                    <span
                      className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ background: "var(--color-primary)", border: "2px solid var(--color-surface)" }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {visiveis.length === 0 && (
            <p className="text-[13.5px] py-5 text-center" style={{ color: "var(--color-text-muted)" }}>
              Nenhuma mesa nessa área.
            </p>
          )}
        </div>

        {/* mesas selecionadas */}
        <div
          className="p-3.5"
          style={{
            borderRadius: "14px",
            background: escolhidas.length ? "var(--color-surface)" : "transparent",
            border: `1px ${escolhidas.length ? "solid" : "dashed"} var(--color-border)`,
          }}
        >
          <p className="text-[10.5px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>
            {escolhidas.length > 1 ? "Mesas selecionadas" : "Mesa selecionada"}
          </p>
          {mesaObj ? (
            <div className="flex items-center gap-3.5 mt-2.5">
              <MesaMiniatura mesa={mesaObj} estado="selecionada" tamanho={56} compacta />
              <div className="min-w-0">
                <p className="font-display text-[25px] leading-none" style={{ color: "var(--color-dark)" }}>
                  Mesa {mesaObj.numero}
                </p>
                <p className="text-[12.5px] mt-1.5" style={{ color: "var(--color-dark)" }}>
                  {mesaObj.capacidade} lugares · {mesaObj.zona}
                </p>
                <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: "var(--color-text-muted)" }}>
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
                    className="inline-flex items-baseline gap-1.5 px-2.5 py-1"
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "10px" }}
                  >
                    <strong className="font-display text-[18px] leading-none" style={{ color: "var(--color-dark)" }}>{m.numero}</strong>
                    <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      {parte ? `${parte.pessoas} pessoa${parte.pessoas === 1 ? "" : "s"}` : `${m.capacidade} lugares`}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Escolha uma mesa acima. Ela aparece destacada na planta.
            </p>
          )}

          {situacao.aviso && (
            <div className="mt-3">
              <AvisoFalta faltam={situacao.faltam} pessoas={pessoas} compacto />
            </div>
          )}
          {situacao.cobre && escolhidas.length > 1 && (
            <p className="text-[12px] mt-3 leading-snug" style={{ color: "var(--color-accent-dark)" }}>
              Tudo certo: as mesas acomodam o grupo de {pessoas}.
            </p>
          )}
        </div>
      </div>

      {/* ---------------- CONTINUAR (colado no rodapé) ---------------- */}
      <div
        className="sticky bottom-0 mt-5 px-4 py-3"
        style={{ background: "var(--color-bg)", borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={onContinuar}
          disabled={!situacao.cobre}
          className="w-full py-3.5 text-[15px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: "var(--color-primary)", borderRadius: "12px" }}
        >
          {escolhidas.length > 0 && !situacao.cobre ? `Falta${situacao.faltam === 1 ? "" : "m"} ${situacao.faltam} lugar${situacao.faltam === 1 ? "" : "es"}` : "Continuar"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
