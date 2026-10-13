"use client";

// Cópia dos dados: o restaurante baixa as próprias planilhas e guarda onde
// quiser (computador, pendrive, Google Drive). Os dados são do restaurante —
// com isto ele não depende do sistema para tê-los em mãos.

import BotaoPlanilha, { type TipoDePlanilha } from "../BotaoPlanilha";

const PLANILHAS: { tipo: TipoDePlanilha; titulo: string; descricao: string }[] = [
  {
    tipo: "clientes",
    titulo: "Clientes",
    descricao: "Um cliente por linha: nome, telefone, e-mail, aniversário e quantas vezes reservou, veio, faltou ou cancelou.",
  },
  {
    tipo: "reservas",
    titulo: "Reservas",
    descricao: "Todas as reservas já feitas, uma mesa por linha: data, mesa, pessoas, contato, observação e como terminou.",
  },
  {
    tipo: "movimento",
    titulo: "Movimento",
    descricao: "Uma noite por linha: mesas reservadas, pessoas que vieram, faltas, cancelamentos e ocupação.",
  },
];

export default function CopiaDosDados() {
  return (
    <div className="border p-5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
      <p className="font-display text-lg">Cópia dos dados</p>
      <p className="text-xs mt-0.5 mb-4 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Baixe as planilhas e guarde uma cópia com o restaurante — no computador ou no Google Drive. Elas abrem no Excel e no Google Planilhas e trazem tudo,
        desde a primeira reserva. Vale baixar toda semana.
      </p>

      <ul className="flex flex-col">
        {PLANILHAS.map((p, i) => (
          <li
            key={p.tipo}
            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-3.5"
            style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}
          >
            <div className="min-w-0">
              <span className="text-sm font-semibold block">{p.titulo}</span>
              <span className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{p.descricao}</span>
            </div>
            <BotaoPlanilha tipo={p.tipo} rotulo="Baixar" />
          </li>
        ))}
      </ul>

      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        As planilhas têm nome e telefone dos clientes. Guarde em lugar seguro e não repasse a terceiros.
      </p>
    </div>
  );
}
