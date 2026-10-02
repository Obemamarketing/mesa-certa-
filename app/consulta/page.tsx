"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  DIAS,
  buscarReservaDoCliente,
  cancelarReserva,
  codigoDaReserva,
  dataDoDia,
  formatarDataCurta,
  type Reserva,
} from "@/lib/reservas";

export default function ConsultaPage() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Reserva[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  async function buscar() {
    if (!termo.trim() || buscando) return;
    setBuscando(true);
    const r = await buscarReservaDoCliente(termo);
    setResultados(r);
    setBuscando(false);
  }

  async function cancelar(id: string) {
    setCancelandoId(id);
    await cancelarReserva(id);
    const r = await buscarReservaDoCliente(termo);
    setResultados(r);
    setCancelandoId(null);
  }

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" />
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>← Início</Link>
      </header>

      <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-5 sm:px-8 pb-12 gap-6 pt-4 sm:pt-8">
        <div>
          <h1 className="font-display text-2xl">Consultar minha reserva</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            Digite o WhatsApp usado na reserva, ou o código que você recebeu na confirmação.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="WhatsApp ou código da reserva"
            className="flex-1 border px-4 py-3 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
          />
          <button
            onClick={buscar}
            disabled={!termo.trim() || buscando}
            className="px-5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
          >
            {buscando ? "..." : "Consultar"}
          </button>
        </div>

        {resultados !== null && (
          resultados.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>
              Nenhuma reserva encontrada com esses dados.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {resultados.map((r) => (
                <div key={r.id} className="border p-4 flex flex-col gap-2.5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={r.cancelada
                        ? { background: "var(--color-error-soft)", color: "var(--color-error)" }
                        : { background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" }}
                    >
                      {r.cancelada ? "Cancelada" : "Confirmada"}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>#{codigoDaReserva(r.id)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 text-sm">
                    <Linha label="Data" valor={`${DIAS.find((d) => d.chave === r.dia)?.label}, ${formatarDataCurta(dataDoDia(r.dia))}`} />
                    <Linha label="Horário" valor={r.horario} />
                    <Linha label="Mesa" valor={`Mesa ${r.mesaNumero}`} />
                    <Linha label="Pessoas" valor={`${r.pessoas}`} />
                    <Linha label="Nome" valor={r.nome} />
                  </div>
                  {!r.cancelada && (
                    <button
                      onClick={() => cancelar(r.id)}
                      disabled={cancelandoId === r.id}
                      className="text-xs font-semibold self-start mt-1 disabled:opacity-50"
                      style={{ color: "var(--color-error)" }}
                    >
                      {cancelandoId === r.id ? "Cancelando…" : "Cancelar reserva"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span className="font-medium text-right">{valor}</span>
    </div>
  );
}
