"use client";

import { mesas, statusMesa, type DiaReserva, type Mesa, type Reserva } from "@/lib/reservas";

const CORES: Record<string, string> = {
  livre: "var(--color-accent)",
  selecionada: "var(--color-primary)",
  ocupada: "var(--color-secondary)",
  pequena: "var(--color-border)",
};

function corDaMesa(status: string, selecionada: boolean) {
  if (selecionada) return CORES.selecionada;
  return CORES[status] ?? CORES.pequena;
}

// Posições fixas (protótipo) — não representam a planta real do ZéPelin ainda,
// só organizam as 15 mesas em 3 ambientes de forma visualmente clara.
const POSICOES: Record<string, { x: number; y: number }> = {
  "01": { x: 75, y: 190 }, "02": { x: 155, y: 190 },
  "03": { x: 75, y: 265 }, "04": { x: 155, y: 265 },
  "12": { x: 256, y: 205 }, "13": { x: 336, y: 205 },
  "14": { x: 256, y: 280 }, "15": { x: 336, y: 280 },
  "05": { x: 100, y: 400 }, "06": { x: 200, y: 400 }, "07": { x: 300, y: 400 },
  "08": { x: 100, y: 495 }, "09": { x: 200, y: 495 }, "10": { x: 300, y: 495 },
  "11": { x: 200, y: 590 },
};

export default function PlantaVisual({
  reservas,
  dia,
  horario,
  mesaSelecionada,
  onSelecionar,
}: {
  reservas: Reserva[];
  dia: DiaReserva;
  horario: string;
  mesaSelecionada: string | null;
  onSelecionar: (numero: string) => void;
}) {
  return (
    <svg viewBox="0 0 400 740" className="w-full h-auto select-none" role="img" aria-label="Planta de mesas do ZéPelin">
      {/* contorno geral */}
      <rect x="10" y="10" width="380" height="700" rx="18" fill="var(--color-bg)" stroke="var(--color-border)" strokeWidth="2" />

      {/* PALCO */}
      <g>
        <rect x="20" y="20" width="172" height="300" rx="14" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
        <text x="34" y="40" fontSize="12" fontWeight="700" letterSpacing="1.5" fill="var(--color-text-muted)">PALCO</text>
        <rect x="36" y="50" width="140" height="62" rx="8" fill="var(--color-dark)" opacity="0.88" />
        <rect x="52" y="64" width="22" height="34" rx="3" fill="var(--color-secondary)" opacity="0.8" />
        <rect x="84" y="72" width="40" height="10" rx="2" fill="var(--color-secondary)" opacity="0.6" />
        <circle cx="146" cy="81" r="11" fill="none" stroke="var(--color-secondary)" strokeWidth="2" opacity="0.7" />
      </g>

      {/* COZINHA */}
      <g>
        <rect x="208" y="20" width="172" height="80" rx="14" fill="var(--color-border)" opacity="0.35" stroke="var(--color-border)" strokeWidth="1.5" />
        <text x="222" y="40" fontSize="12" fontWeight="700" letterSpacing="1.5" fill="var(--color-text-muted)">COZINHA</text>
        <rect x="222" y="52" width="144" height="34" rx="6" fill="var(--color-border)" opacity="0.6" />
      </g>

      {/* SALÃO ANEXO */}
      <g>
        <rect x="208" y="112" width="172" height="208" rx="14" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
        <text x="222" y="132" fontSize="12" fontWeight="700" letterSpacing="1.5" fill="var(--color-text-muted)">SALÃO ANEXO</text>
      </g>

      {/* SALÃO PRINCIPAL */}
      <g>
        <rect x="20" y="334" width="360" height="346" rx="14" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
        <text x="34" y="354" fontSize="12" fontWeight="700" letterSpacing="1.5" fill="var(--color-text-muted)">SALÃO PRINCIPAL</text>
      </g>

      {/* infraestrutura inferior */}
      <g fill="var(--color-text-muted)" fontSize="11" fontWeight="600" letterSpacing="1">
        <text x="70" y="712" textAnchor="middle">RECEPÇÃO</text>
        <text x="200" y="712" textAnchor="middle">ENTRADA</text>
        <text x="330" y="712" textAnchor="middle">WC</text>
      </g>

      {/* mesas */}
      {mesas.map((m) => {
        const pos = POSICOES[m.numero];
        if (!pos) return null;
        const status = statusMesa(reservas, dia, horario, m);
        const selecionada = mesaSelecionada === m.numero;
        const indisponivel = status !== "livre" && !selecionada;
        const cor = corDaMesa(status, selecionada);
        const raio = 25;
        return (
          <g
            key={m.numero}
            onClick={() => onSelecionar(m.numero)}
            style={{ cursor: indisponivel ? "default" : "pointer" }}
          >
            {m.formato === "redonda" ? (
              <circle cx={pos.x} cy={pos.y} r={raio} fill={cor} opacity={indisponivel ? 0.55 : 1} stroke={selecionada ? "#fff" : "none"} strokeWidth="2.5" />
            ) : (
              <rect x={pos.x - raio} y={pos.y - raio} width={raio * 2} height={raio * 2} rx="10" fill={cor} opacity={indisponivel ? 0.55 : 1} stroke={selecionada ? "#fff" : "none"} strokeWidth="2.5" />
            )}
            <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="700" fill={status === "livre" && !selecionada ? "#fff" : "#fff"}>
              {m.numero}
            </text>
            <text x={pos.x} y={pos.y + raio + 15} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-text-muted)">
              {m.capacidade}p
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LegendaPlanta() {
  return (
    <div className="flex items-center justify-center gap-4 flex-wrap pt-1">
      <LegendaItem cor="var(--color-accent)" label="Disponível" />
      <LegendaItem cor="var(--color-secondary)" label="Reservada" />
      <LegendaItem cor="var(--color-primary)" label="Ocupada" />
      <LegendaItem cor="var(--color-border)" label="Indisponível" />
    </div>
  );
}

function LegendaItem({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--color-text-muted)" }}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
      {label}
    </span>
  );
}

export function mesaPorNumero(numero: string): Mesa | undefined {
  return mesas.find((m) => m.numero === numero);
}
