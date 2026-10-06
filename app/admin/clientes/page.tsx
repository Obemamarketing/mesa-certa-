"use client";

import { useState } from "react";
import { DIAS, dataDoDia, formatarDataCurta, historicoDoCliente, listarClientes, useReservas } from "@/lib/reservas";

export default function ClientesPage() {
  const { reservas, carregando } = useReservas();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const clientes = listarClientes(reservas);
  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = buscaNormalizada
    ? clientes.filter((c) => c.nome.toLowerCase().includes(buscaNormalizada) || c.telefone.includes(buscaNormalizada))
    : clientes;

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[40px] leading-tight">Clientes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Histórico básico das reservas de cada cliente — toque num nome para ver.
        </p>
      </div>

      <div className="relative max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full border pl-9 pr-3 py-2.5 text-sm outline-none"
          style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
        />
      </div>

      <section className="border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
        {carregando ? (
          <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>Nenhum cliente encontrado.</p>
        ) : (
          <div className="flex flex-col">
            {filtrados.map((c, i) => {
              const expandido = aberto === c.telefone;
              const historico = expandido ? historicoDoCliente(reservas, c.telefone) : [];
              return (
                <div key={c.telefone} style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}>
                  <button
                    onClick={() => setAberto(expandido ? null : c.telefone)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                  >
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                      {c.nome.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-semibold block truncate">{c.nome}</span>
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.telefone}{c.email ? ` · ${c.email}` : ""}</span>
                    </div>
                    <span className="text-xs font-semibold shrink-0 px-2.5 py-1" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)", borderRadius: "999px" }}>
                      {c.totalReservas} reserva{c.totalReservas === 1 ? "" : "s"}
                    </span>
                  </button>

                  {expandido && (
                    <div className="px-5 pb-4 flex flex-col gap-2" style={{ background: "var(--color-primary-tint)" }}>
                      <p className="text-[10.5px] font-semibold tracking-[0.12em] uppercase pt-3" style={{ color: "var(--color-text-muted)" }}>Reservas anteriores</p>
                      {historico.map((r) => (
                        <div key={r.id} className="flex flex-col gap-0.5 text-[13px] py-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">
                              {DIAS.find((d) => d.chave === r.dia)?.label}, {formatarDataCurta(dataDoDia(r.dia))} · {r.horario}
                            </span>
                            <span style={{ color: r.cancelada ? "var(--color-error)" : r.checkinEm ? "var(--color-accent-dark)" : "var(--color-text-muted)" }}>
                              {r.cancelada ? "Cancelada" : r.checkinEm ? "Compareceu" : "Confirmada"}
                            </span>
                          </div>
                          <span style={{ color: "var(--color-text-muted)" }}>
                            {r.pessoas} pessoa{r.pessoas === 1 ? "" : "s"} · Mesa {r.mesaNumero}
                          </span>
                          {r.observacao && <span className="italic" style={{ color: "var(--color-primary)" }}>“{r.observacao}”</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
