"use client";

// Calendário para escolher a data da reserva. A tela inicial mostra só as
// próximas datas numa lista curta; as demais (a agenda vai até dois meses à
// frente) ficam aqui, pra lista não virar um painel enorme.
//
// Só os dias da lista `datas` podem ser escolhidos — sextas, sábados e domingos
// dentro da agenda. Dia marcado como fechado pelo administrador aparece
// riscado e não é clicável.

import { useState } from "react";
import { dataDoIso, formatarDataCurta, isoDaData, type DataDisponivel } from "@/lib/reservas";
import type { DiaFechado } from "@/lib/diasFechados";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANA_EXTENSO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export default function SeletorDeData({
  datas,
  fechados,
  selecionada,
  aoEscolher,
  aoFechar,
  titulo = "Escolha a data",
}: {
  /** Datas que podem ser escolhidas, em ordem. */
  datas: DataDisponivel[];
  fechados: Map<string, DiaFechado>;
  selecionada: string | null;
  aoEscolher: (iso: string) => void;
  aoFechar: () => void;
  titulo?: string;
}) {
  const primeira = datas[0]?.data ?? new Date();
  const ultima = datas[datas.length - 1]?.data ?? primeira;
  const inicial = selecionada && datas.some((d) => d.iso === selecionada) ? dataDoIso(selecionada) : primeira;
  // mês mostrado, contado em "meses desde o ano zero" pra navegar com +1 / -1
  const [mesAtual, setMesAtual] = useState(inicial.getFullYear() * 12 + inicial.getMonth());
  const mesMin = primeira.getFullYear() * 12 + primeira.getMonth();
  const mesMax = ultima.getFullYear() * 12 + ultima.getMonth();

  const ano = Math.floor(mesAtual / 12);
  const mes = mesAtual % 12;
  const disponiveis = new Set(datas.map((d) => d.iso));

  const celulas: (Date | null)[] = Array.from({ length: new Date(ano, mes, 1).getDay() }, () => null);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  for (let d = 1; d <= diasNoMes; d++) celulas.push(new Date(ano, mes, d));

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(42,23,18,0.55)" }}
      onClick={aoFechar}
      onKeyDown={(e) => e.key === "Escape" && aoFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full sm:max-w-[400px] sm:mx-4 p-5 pb-6 flex flex-col gap-4 rounded-t-[22px] sm:rounded-[22px]"
        style={{ background: "var(--color-surface)", color: "var(--color-dark)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[26px] leading-tight">{titulo}</h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
              Sextas, sábados e domingos, até {formatarDataCurta(ultima)}.
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={aoFechar}
            aria-label="Fechar o calendário"
            className="w-9 h-9 flex items-center justify-center shrink-0 text-[20px] leading-none"
            style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "10px" }}
          >
            ×
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMesAtual((m) => Math.max(mesMin, m - 1))}
            disabled={mesAtual <= mesMin}
            aria-label="Mês anterior"
            className="w-10 h-10 flex items-center justify-center text-[20px] disabled:opacity-25"
            style={{ border: "1px solid var(--color-border)", borderRadius: "10px" }}
          >
            ‹
          </button>
          <span className="font-display text-[20px]" aria-live="polite">
            {MESES[mes]} {ano}
          </span>
          <button
            type="button"
            onClick={() => setMesAtual((m) => Math.min(mesMax, m + 1))}
            disabled={mesAtual >= mesMax}
            aria-label="Próximo mês"
            className="w-10 h-10 flex items-center justify-center text-[20px] disabled:opacity-25"
            style={{ border: "1px solid var(--color-border)", borderRadius: "10px" }}
          >
            ›
          </button>
        </div>

        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {SEMANA.map((s, i) => (
              <span key={i} className="text-center text-[11.5px] font-semibold py-1" style={{ color: "var(--color-text-muted)" }}>
                {s}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((data, i) => {
              if (!data) return <span key={`v${i}`} />;
              const iso = isoDaData(data);
              const naAgenda = disponiveis.has(iso);
              const fechado = fechados.get(iso);
              const escolhida = iso === selecionada;
              const extenso = `${SEMANA_EXTENSO[data.getDay()]}, ${data.getDate()} de ${MESES[mes].toLowerCase()}`;

              // dia fora da agenda (terça, data que já passou, além dos dois meses)
              if (!naAgenda) {
                return (
                  <span key={iso} className="h-11 flex items-center justify-center text-[14px]" style={{ color: "var(--color-text-muted)", opacity: 0.45 }}>
                    {data.getDate()}
                  </span>
                );
              }

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={Boolean(fechado)}
                  onClick={() => aoEscolher(iso)}
                  aria-pressed={escolhida}
                  aria-label={`${extenso}${fechado ? `, fechado${fechado.motivo ? ` (${fechado.motivo})` : ""}` : ""}`}
                  title={fechado ? `Fechado${fechado.motivo ? ` — ${fechado.motivo}` : ""}` : undefined}
                  className="h-11 flex items-center justify-center text-[15px] font-bold disabled:cursor-not-allowed"
                  style={{
                    borderRadius: "11px",
                    background: escolhida ? "var(--color-primary)" : fechado ? "transparent" : "var(--color-primary-soft)",
                    color: escolhida ? "#fff" : fechado ? "var(--color-text-muted)" : "var(--color-primary)",
                    textDecoration: fechado ? "line-through" : undefined,
                    border: fechado ? "1px dashed var(--color-border)" : "1px solid transparent",
                  }}
                >
                  {data.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-5 flex-wrap text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          <span className="flex items-center gap-2">
            <span className="w-3.5 h-3.5" style={{ background: "var(--color-primary-soft)", borderRadius: "4px" }} /> Disponível
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3.5 h-3.5" style={{ background: "var(--color-primary)", borderRadius: "4px" }} /> Escolhida
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3.5 h-3.5" style={{ border: "1px dashed var(--color-text-muted)", borderRadius: "4px" }} /> Fechado
          </span>
        </div>
      </div>
    </div>
  );
}
