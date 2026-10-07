"use client";

// Menu lateral do celular, aberto pelo botão de três linhas no topo da página
// inicial. Só mostra o que o sistema realmente faz — nada de link morto.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { HORARIO_FIXO, TOLERANCIA_MINUTOS, horaLimiteDaTolerancia } from "@/lib/regras";

export default function MenuMobile({
  aberto,
  aoFechar,
  aoReservar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Leva a pessoa até o cartão de reserva da página. */
  aoReservar: () => void;
}) {
  const [regrasAbertas, setRegrasAbertas] = useState(false);

  // Esc fecha; enquanto aberto, a página de trás não rola.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const itemEstilo = { borderBottom: "1px solid var(--color-border)", color: "var(--color-dark)" } as const;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      {/* fundo escurecido: tocar fora fecha */}
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={aoFechar}
        className="absolute inset-0 w-full h-full"
        style={{ background: "rgba(20, 11, 8, 0.55)" }}
      />

      <nav
        className="absolute right-0 top-0 h-full w-[84%] max-w-[330px] flex flex-col"
        style={{ background: "var(--color-surface)", boxShadow: "-12px 0 32px rgba(20,11,8,0.28)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2.5">
            <Image src="/logo-zeplin.jpg" alt="" width={38} height={38} className="rounded-full" />
            <span className="font-display text-[21px] leading-none" style={{ color: "var(--color-dark)" }}>
              {reservaBrand.restauranteAtual}
            </span>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar menu"
            className="w-10 h-10 flex items-center justify-center -mr-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto px-5">
          <li>
            <button
              type="button"
              onClick={() => {
                aoFechar();
                // espera a página destravar a rolagem (o menu a travava) antes de rolar
                setTimeout(aoReservar, 80);
              }}
              className="w-full flex items-center justify-between py-4 text-left text-[16px] font-medium"
              style={itemEstilo}
            >
              Reservar uma mesa
              <Seta />
            </button>
          </li>

          <li>
            <Link href="/consulta" onClick={aoFechar} className="w-full flex items-center justify-between py-4 text-[16px] font-medium" style={itemEstilo}>
              Consultar minha reserva
              <Seta />
            </Link>
          </li>

          <li style={itemEstilo}>
            <button
              type="button"
              onClick={() => setRegrasAbertas((v) => !v)}
              aria-expanded={regrasAbertas}
              className="w-full flex items-center justify-between py-4 text-left text-[16px] font-medium"
            >
              Como funciona a reserva
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="2.25"
                style={{ transform: regrasAbertas ? "rotate(90deg)" : undefined, transition: "transform 150ms" }}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            {regrasAbertas && (
              <ul className="pb-4 flex flex-col gap-2.5 text-[14px] leading-snug" style={{ color: "var(--color-text-muted)" }}>
                <li>• As reservas são feitas só para as {HORARIO_FIXO.replace(":", "h")}.</li>
                <li>
                  • Há {TOLERANCIA_MINUTOS} minutos de tolerância: chegue até as {horaLimiteDaTolerancia(HORARIO_FIXO).replace(":", "h")} para
                  garantir a mesa.
                </li>
                <li>• Grupo maior que a maior mesa reserva mais de uma mesa; o sistema soma os lugares para você.</li>
                <li>• Para ver ou cancelar, use “Consultar minha reserva” com o nome da reserva.</li>
              </ul>
            )}
          </li>
        </ul>

        <div className="px-5 py-5" style={{ borderTop: "1px solid var(--color-border)" }}>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
            Funcionamento
          </p>
          <p className="text-[14.5px] mt-1.5" style={{ color: "var(--color-dark)" }}>
            {reservaBrand.diasFuncionamento}
          </p>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Reservas às {HORARIO_FIXO.replace(":", "h")}
          </p>
        </div>
      </nav>
    </div>
  );
}

function Seta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.25">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
