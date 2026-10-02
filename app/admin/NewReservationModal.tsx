"use client";

import { useState } from "react";
import {
  DIAS,
  HORARIO_FIXO,
  criarReserva,
  dataDoDia,
  formatarDataCurta,
  type DiaReserva,
  type Reserva,
} from "@/lib/reservas";
import MesaMapa from "../MesaMapa";

export default function NewReservationModal({
  reservas,
  diaInicial,
  onFechar,
}: {
  reservas: Reserva[];
  diaInicial: DiaReserva;
  onFechar: () => void;
}) {
  const [dia, setDia] = useState<DiaReserva>(diaInicial);
  const horario = HORARIO_FIXO;
  const [pessoas, setPessoas] = useState(2);
  const [mesaNumero, setMesaNumero] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!mesaNumero || !nome.trim() || !telefone.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    const { reserva, erro: mensagemErro } = await criarReserva({
      dia,
      horario,
      mesaNumero,
      pessoas,
      nome: nome.trim(),
      telefone: telefone.trim(),
    });
    setEnviando(false);
    if (!reserva) {
      setErro(mensagemErro ?? "Não foi possível criar a reserva.");
      return;
    }
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: "rgba(42,23,18,0.45)" }} onClick={onFechar}>
      <div
        className="w-full sm:max-w-lg sm:mx-4 max-h-[92vh] overflow-y-auto flex flex-col gap-5 p-5 sm:p-6"
        style={{ background: "var(--color-surface)", borderRadius: "var(--radius-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Nova reserva</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-lg" style={{ color: "var(--color-text-muted)" }}>×</button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {DIAS.map((d) => {
            const ativo = dia === d.chave;
            return (
              <button
                key={d.chave}
                onClick={() => { setDia(d.chave); setMesaNumero(null); }}
                className="border py-2 flex flex-col items-center gap-0.5"
                style={{
                  borderRadius: "var(--radius-sm)",
                  borderColor: ativo ? "var(--color-primary)" : "var(--color-border)",
                  background: ativo ? "var(--color-primary-soft)" : "transparent",
                }}
              >
                <span className="text-sm font-semibold">{d.label.split("-")[0]}</span>
                <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{formatarDataCurta(dataDoDia(d.chave))}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Horário</label>
            <div className="border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}>
              {horario} <span className="text-xs">(fixo)</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Pessoas</label>
            <div className="flex items-center justify-between border px-3 py-2" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
              <button onClick={() => { setPessoas((p) => Math.max(1, p - 1)); setMesaNumero(null); }} className="text-lg font-semibold w-5">−</button>
              <span className="text-sm font-semibold">{pessoas}</span>
              <button onClick={() => { setPessoas((p) => p + 1); setMesaNumero(null); }} className="text-lg font-semibold w-5">+</button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Mesa</label>
          <MesaMapa reservas={reservas} dia={dia} horario={horario} pessoasMin={pessoas} mesaSelecionada={mesaNumero} onSelecionar={setMesaNumero} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" className="border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }} />
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone" inputMode="tel" className="border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }} />
        </div>

        {erro && <p className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onFechar} className="flex-1 py-2.5 text-sm font-semibold border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!mesaNumero || !nome.trim() || !telefone.trim() || enviando}
            className="flex-1 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
          >
            {enviando ? "Confirmando…" : "Confirmar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}
