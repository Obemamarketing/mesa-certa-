"use client";

const ETAPAS = ["Horário", "Mesa", "Dados", "Confirmação"];

export default function StepIndicator({ atual }: { atual: number }) {
  return (
    <div className="flex items-center gap-2">
      {ETAPAS.map((rotulo, i) => {
        const numero = i + 1;
        const ativo = numero === atual;
        const concluido = numero < atual;
        return (
          <div key={rotulo} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                style={{
                  background: ativo || concluido ? "var(--color-primary)" : "var(--color-border)",
                  color: ativo || concluido ? "#fff" : "var(--color-text-muted)",
                }}
              >
                {numero}
              </span>
              <span
                className="text-[12px] font-medium hidden sm:inline"
                style={{ color: ativo ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {rotulo}
              </span>
            </div>
            {numero < ETAPAS.length && <span className="w-4 h-px" style={{ background: "var(--color-border)" }} />}
          </div>
        );
      })}
    </div>
  );
}
