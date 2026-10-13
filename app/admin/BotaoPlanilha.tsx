"use client";

// Botão que baixa uma planilha com TODOS os dados de um tipo (clientes,
// reservas ou movimento) — é a cópia que o restaurante guarda consigo. Lê o
// banco na hora do clique, sem a janela de dias das telas, para a cópia sair
// completa.

import { useState } from "react";
import { buscarTodasAsReservas, relogioSaoPaulo } from "@/lib/reservas";
import { baixarCsv, csvDeClientes, csvDeReservas, nomeDoArquivo } from "@/lib/exportar";
import { csvDoMovimento, montarDias } from "@/lib/movimento";
import { useMesasConfig } from "@/lib/mesas";
import { reservaBrand } from "@/lib/reservaBrand";

export type TipoDePlanilha = "clientes" | "reservas" | "movimento";

const O_QUE: Record<TipoDePlanilha, { um: string; varios: string; vazio: string }> = {
  clientes: { um: "cliente", varios: "clientes", vazio: "Ainda não há clientes para baixar." },
  reservas: { um: "reserva", varios: "reservas", vazio: "Ainda não há reservas para baixar." },
  movimento: { um: "noite", varios: "noites", vazio: "Ainda não há movimento para baixar." },
};

export default function BotaoPlanilha({
  tipo,
  rotulo = "Baixar planilha",
  alinhar = "esquerda",
}: {
  tipo: TipoDePlanilha;
  rotulo?: string;
  /** Para que lado fica o recado que aparece embaixo do botão. */
  alinhar?: "esquerda" | "direita";
}) {
  const { mesas } = useMesasConfig();
  const [preparando, setPreparando] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);

  async function baixar() {
    if (preparando) return;
    setPreparando(true);
    setRecado(null);
    const { reservas, erro } = await buscarTodasAsReservas();
    setPreparando(false);
    if (erro) {
      setRecado({ texto: erro, erro: true });
      return;
    }

    const hojeIso = relogioSaoPaulo().iso;
    const zonaDaMesa = new Map(mesas.map((m) => [m.numero, m.zona as string]));
    const csv =
      tipo === "clientes"
        ? csvDeClientes(reservas, hojeIso)
        : tipo === "reservas"
        ? csvDeReservas(reservas, hojeIso, (numero) => zonaDaMesa.get(numero))
        : csvDoMovimento(
            montarDias(reservas, hojeIso).filter((d) => d.mesas > 0 || d.canceladas > 0),
            mesas.length,
          );

    // cabeçalho + uma linha por item + a quebra de linha do fim
    const linhas = csv.split("\r\n").length - 2;
    if (linhas <= 0) {
      setRecado({ texto: O_QUE[tipo].vazio, erro: false });
      return;
    }
    baixarCsv(nomeDoArquivo(tipo, reservaBrand.restauranteAtual, hojeIso), csv);
    setRecado({ texto: `Planilha baixada: ${linhas.toLocaleString("pt-BR")} ${linhas === 1 ? O_QUE[tipo].um : O_QUE[tipo].varios}.`, erro: false });
  }

  return (
    <div className={`flex flex-col gap-1.5 ${alinhar === "direita" ? "items-end text-right" : "items-start"}`}>
      <button
        type="button"
        onClick={baixar}
        disabled={preparando}
        title="Baixa um arquivo que abre no Excel e no Google Planilhas"
        className="flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold border disabled:opacity-50 whitespace-nowrap"
        style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
        </svg>
        {preparando ? "Preparando…" : rotulo}
      </button>
      <span aria-live="polite" className="text-[12.5px] font-medium" style={{ color: recado?.erro ? "var(--color-error)" : "var(--color-text-muted)" }}>
        {recado?.texto}
      </span>
    </div>
  );
}
