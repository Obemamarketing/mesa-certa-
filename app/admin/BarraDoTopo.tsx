"use client";

// Faixa do topo do painel NO CELULAR. No computador quem cumpre esse papel é a
// barra lateral. A barra de baixo do celular não tem espaço para Configurações
// nem para o Sair — os dois ficam aqui.

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import SairDoPainel from "./SairDoPainel";

export default function BarraDoTopo() {
  const pathname = usePathname();
  const emConfiguracoes = pathname.startsWith("/admin/configuracoes");

  return (
    <header
      className="lg:hidden flex items-center justify-between gap-3 pl-5 pr-3 py-2"
      style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
    >
      <Link href="/admin" className="flex items-center gap-2 min-w-0">
        <Image src="/logo-zeplin.jpg" alt="" width={30} height={30} className="rounded-full shrink-0" />
        <span className="font-display text-[18px] leading-none truncate" style={{ color: "var(--color-dark)" }}>
          {reservaBrand.restauranteAtual}
        </span>
      </Link>

      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          href="/admin/configuracoes"
          aria-label="Configurações"
          aria-current={emConfiguracoes ? "page" : undefined}
          className="w-10 h-10 flex items-center justify-center"
          style={{ color: emConfiguracoes ? "var(--color-primary)" : "var(--color-text-muted)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
          </svg>
        </Link>
        <SairDoPainel />
      </div>
    </header>
  );
}
