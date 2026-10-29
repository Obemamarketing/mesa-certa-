import type { CSSProperties } from "react";
import { ROTULO_STATUS_CHEGADA, type StatusChegada } from "@/lib/reservas";

const ESTILOS: Record<StatusChegada, { bg: string; cor: string }> = {
  aguardando: { bg: "var(--color-accent-soft)", cor: "var(--color-accent-dark)" },
  // texto mostarda um pouco mais escuro: contraste 5,7:1 (antes 4,1:1)
  tolerancia: { bg: "var(--color-secondary-soft)", cor: "color-mix(in srgb, var(--color-secondary-dark) 75%, var(--color-dark))" },
  atrasado: { bg: "var(--color-error-soft)", cor: "var(--color-error)" },
  chegou: { bg: "var(--color-accent)", cor: "#fff" },
  cancelada: { bg: "var(--color-error-soft)", cor: "var(--color-error)" },
};

const ROTULO_CURTO: Record<StatusChegada, string> = {
  aguardando: "Confirmada",
  tolerancia: "Na tolerância",
  atrasado: "Não chegou",
  chegou: "Chegou",
  cancelada: "Cancelada",
};

/** Faixa na lateral de cada reserva: dá para ver a situação sem ler. */
const COR_FAIXA: Record<StatusChegada, string> = {
  aguardando: "var(--color-border-field)",
  tolerancia: "var(--color-secondary)",
  atrasado: "var(--color-error)",
  chegou: "var(--color-accent)",
  cancelada: "var(--color-border)",
};

export function statusDaReserva(cancelada?: boolean, chegada?: StatusChegada): StatusChegada {
  return cancelada ? "cancelada" : chegada ?? "aguardando";
}

/** Fundo do "bloquinho" de cada reserva nas listas do painel (um tom mais
 *  escuro que o cartão, para uma reserva não se misturar com a outra). */
export function estiloDoBloco(status: StatusChegada, focada: boolean): CSSProperties {
  return {
    background: focada ? "var(--color-primary-tint)" : "var(--color-bloco)",
    borderLeft: `5px solid ${COR_FAIXA[status]}`,
    borderRadius: "var(--radius-sm)",
    boxShadow: focada ? "inset 0 0 0 2px var(--color-primary)" : undefined,
  };
}

/** `compacto`: versão menor, para as listas do celular (sobra espaço para o nome). */
export default function StatusBadge({ cancelada, chegada, compacto }: { cancelada?: boolean; chegada?: StatusChegada; compacto?: boolean }) {
  const status = statusDaReserva(cancelada, chegada);
  const estilo = ESTILOS[status];
  return (
    <span
      className={`font-semibold rounded-full shrink-0 whitespace-nowrap ${compacto ? "text-[11px] px-2 py-0.5 text-center" : "text-xs px-2.5 py-1"}`}
      style={{ background: estilo.bg, color: estilo.cor }}
      title={ROTULO_STATUS_CHEGADA[status]}
    >
      {ROTULO_CURTO[status]}
    </span>
  );
}
