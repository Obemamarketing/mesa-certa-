import { ROTULO_STATUS_CHEGADA, type StatusChegada } from "@/lib/reservas";

const ESTILOS: Record<StatusChegada, { bg: string; cor: string }> = {
  aguardando: { bg: "var(--color-accent-soft)", cor: "var(--color-accent-dark)" },
  tolerancia: { bg: "var(--color-secondary-soft)", cor: "var(--color-secondary-dark)" },
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

export default function StatusBadge({ cancelada, chegada }: { cancelada?: boolean; chegada?: StatusChegada }) {
  const status: StatusChegada = cancelada ? "cancelada" : chegada ?? "aguardando";
  const estilo = ESTILOS[status];
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap"
      style={{ background: estilo.bg, color: estilo.cor }}
      title={ROTULO_STATUS_CHEGADA[status]}
    >
      {ROTULO_CURTO[status]}
    </span>
  );
}
