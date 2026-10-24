"use client";

import { cloneElement, isValidElement, useId, type ReactElement } from "react";

// Campo de formulário acessível: o nome do campo fica ligado à caixa de texto
// (o leitor de tela anuncia "WhatsApp, editar texto"), o aviso de erro e a dica
// são lidos junto, e a caixa ganha contorno quando recebe o foco do teclado.

export default function Campo({
  label,
  aviso,
  dica,
  grande = false,
  children,
}: {
  label: string;
  aviso?: string | null;
  /** Explicação curta embaixo do campo (para que serve o dado). */
  dica?: string;
  /** Versão do computador, um pouco maior. */
  grande?: boolean;
  /** Um único input, textarea ou select. */
  children: React.ReactNode;
}) {
  const id = useId();
  const idAviso = `${id}-aviso`;
  const idDica = `${id}-dica`;
  const descricao = [aviso ? idAviso : null, dica ? idDica : null].filter(Boolean).join(" ") || undefined;

  const controle = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": aviso ? true : undefined,
        "aria-describedby": descricao,
      })
    : children;

  return (
    <div>
      <div
        className={`campo-foco border flex flex-col gap-1 ${grande ? "px-5 py-3.5" : "px-4 py-3"}`}
        style={{
          borderColor: aviso ? "var(--color-error)" : "var(--color-border-field)",
          borderRadius: grande ? "14px" : "var(--radius-sm)",
          background: "var(--color-surface)",
          color: "var(--color-dark)",
        }}
      >
        <label htmlFor={id} className={grande ? "text-[12.5px]" : "text-xs font-medium"} style={{ color: "var(--color-text-muted)" }}>
          {label}
        </label>
        {controle}
      </div>
      {dica && !aviso && (
        <p id={idDica} className="text-[12px] mt-1.5 px-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
          {dica}
        </p>
      )}
      {dica && aviso && (
        <span id={idDica} hidden>
          {dica}
        </span>
      )}
      {aviso && (
        <p id={idAviso} role="alert" className={`${grande ? "text-[12.5px]" : "text-xs"} font-medium mt-1.5 px-1`} style={{ color: "var(--color-error)" }}>
          {aviso}
        </p>
      )}
    </div>
  );
}
