"use client";

import { mesas, statusMesa, type DiaReserva, type Reserva } from "@/lib/reservas";

const CORES: Record<string, { bg: string; border: string; text: string }> = {
  livre: { bg: "var(--color-accent)", border: "var(--color-accent-dark)", text: "#fff" },
  selecionada: { bg: "var(--color-primary)", border: "var(--color-primary-dark)", text: "#fff" },
  reservada: { bg: "var(--color-secondary)", border: "var(--color-secondary-dark)", text: "#fff" },
  ocupada: { bg: "var(--color-primary)", border: "var(--color-primary-dark)", text: "#fff" },
  pequena: { bg: "var(--color-border)", border: "var(--color-border)", text: "var(--color-text-muted)" },
};

const ZONAS: { nome: string; classe: string }[] = [
  { nome: "Palco", classe: "col-span-4" },
  { nome: "Salão principal", classe: "col-span-4" },
  { nome: "Salão anexo", classe: "col-span-4" },
];

export default function MesaMapa({
  reservas,
  dia,
  horario,
  pessoasMin,
  mesaSelecionada,
  onSelecionar,
  onInspecionar,
  somenteLeitura,
  rotuloLivre = "Livre",
  rotuloSelecionada = "Selecionada",
}: {
  reservas: Reserva[];
  dia: DiaReserva;
  horario: string;
  pessoasMin?: number;
  mesaSelecionada?: string | null;
  onSelecionar?: (numero: string) => void;
  onInspecionar?: (numero: string) => void;
  somenteLeitura?: boolean;
  rotuloLivre?: string;
  rotuloSelecionada?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {ZONAS.map((zona) => {
        const mesasDaZona = mesas.filter((m) => m.zona === zona.nome);
        if (mesasDaZona.length === 0) return null;
        return (
          <div key={zona.nome} className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--color-text-muted)" }}>
              {zona.nome}
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {mesasDaZona.map((m) => {
                const status = statusMesa(reservas, dia, horario, m, pessoasMin);
                const selecionada = mesaSelecionada === m.numero;
                const cor = selecionada ? CORES.selecionada : CORES[status];
                const clicavel = !somenteLeitura && ((onSelecionar && (status === "livre" || selecionada)) || onInspecionar);
                return (
                  <button
                    key={m.numero}
                    onClick={() => {
                      if (!clicavel) return;
                      if (onInspecionar) onInspecionar(m.numero);
                      else onSelecionar!(m.numero);
                    }}
                    disabled={!clicavel}
                    className={`flex flex-col items-center justify-center gap-0.5 aspect-square border-2 transition ${m.formato === "redonda" ? "rounded-full" : ""}`}
                    style={{
                      borderRadius: m.formato === "redonda" ? "9999px" : "var(--radius-sm)",
                      background: cor.bg,
                      borderColor: cor.border,
                      color: cor.text,
                      cursor: clicavel ? "pointer" : "default",
                      opacity: status === "pequena" && !selecionada ? 0.6 : 1,
                    }}
                  >
                    <span className="text-sm font-semibold">{m.numero}</span>
                    <span className="text-[10px] opacity-90">{m.capacidade}p</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-4 flex-wrap pt-1">
        <Legenda cor="var(--color-accent)" label={rotuloLivre} />
        <Legenda cor="var(--color-primary)" label={rotuloSelecionada} />
        <Legenda cor="var(--color-secondary)" label="Reservada" />
        {pessoasMin !== undefined && <Legenda cor="var(--color-border)" label="Indisponível" />}
      </div>
    </div>
  );
}

function Legenda({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} />
      {label}
    </span>
  );
}
