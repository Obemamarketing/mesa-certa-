"use client";

// Botão "Sair" do painel. Pede confirmação no próprio lugar (um toque sem
// querer no celular não derruba o painel no meio do serviço) e sai só deste
// aparelho.

import { useState } from "react";
import { sair } from "@/lib/auth";

export default function SairDoPainel({ fundo = "claro" }: { /** "escuro": sobre a barra lateral vinho. */ fundo?: "claro" | "escuro" }) {
  const [confirmando, setConfirmando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const corTexto = fundo === "escuro" ? "rgba(255,255,255,0.82)" : "var(--color-text-muted)";
  const corBorda = fundo === "escuro" ? "rgba(255,255,255,0.3)" : "var(--color-border)";

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border shrink-0"
        style={{ color: corTexto, borderColor: corBorda, borderRadius: "var(--radius-sm)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Sair
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Confirmar saída do painel">
      <span className="text-[13px] font-semibold" style={{ color: corTexto }}>Sair?</span>
      <button
        type="button"
        disabled={saindo}
        onClick={async () => { setSaindo(true); await sair(); setSaindo(false); setConfirmando(false); }}
        className="px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        style={{ background: fundo === "escuro" ? "rgba(0,0,0,0.35)" : "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
      >
        {saindo ? "Saindo…" : "Sim"}
      </button>
      <button
        type="button"
        disabled={saindo}
        onClick={() => setConfirmando(false)}
        className="px-3 py-2 text-[13px] font-semibold border"
        style={{ color: corTexto, borderColor: corBorda, borderRadius: "var(--radius-sm)" }}
      >
        Não
      </button>
    </span>
  );
}
