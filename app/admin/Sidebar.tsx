"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import { DIAS, relogioSaoPaulo } from "@/lib/reservas";
import { useDiasFechados } from "@/lib/diasFechados";
import { useAgora } from "@/lib/relogio";

const ITENS = [
  {
    href: "/admin",
    label: "Reservas",
    ativo: (p: string) => p === "/admin",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/admin/operacao",
    label: "Modo operação",
    ativo: (p: string) => p.startsWith("/admin/operacao"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/admin/mesas",
    label: "Mesas",
    ativo: (p: string) => p.startsWith("/admin/mesas"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" />
      </svg>
    ),
  },
  {
    href: "/admin/calendario",
    label: "Calendário",
    ativo: (p: string) => p.startsWith("/admin/calendario"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M10 14l4 4M14 14l-4 4" />
      </svg>
    ),
  },
  {
    href: "/admin/movimento",
    label: "Movimento",
    ativo: (p: string) => p.startsWith("/admin/movimento"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/admin/clientes",
    label: "Clientes",
    ativo: (p: string) => p.startsWith("/admin/clientes"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6M16 4.6c1.7.4 3 1.9 3 3.5 0 1.6-1.3 3.1-3 3.5M21.5 20c0-2.8-2-4.6-4.5-5.2" />
      </svg>
    ),
  },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    ativo: (p: string) => p.startsWith("/admin/configuracoes"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const agora = useAgora(30000);
  const { fechados } = useDiasFechados();

  // O cartão dizia "Restaurante aberto" o tempo todo, até na segunda-feira e
  // em dia marcado como fechado no calendário. Agora responde pelo relógio de
  // São Paulo, pelos dias de funcionamento e pelo calendário.
  const relogio = agora ? relogioSaoPaulo(agora) : null;
  const diaFechado = relogio ? fechados.get(relogio.iso) : undefined;
  const diaDeFuncionamento = relogio ? DIAS.some((d) => d.diaSemana === relogio.diaSemana) : true;
  const estado = !relogio
    ? { texto: " ", cor: "var(--color-border)" }
    : diaFechado
    ? { texto: "Fechado hoje", cor: "#e08a7a" }
    : !diaDeFuncionamento
    ? { texto: "Fora do dia de funcionamento", cor: "rgba(255,255,255,0.45)" }
    : { texto: "Dia de funcionamento", cor: "var(--color-secondary)" };

  return (
    <aside
      className="hidden lg:flex w-[260px] shrink-0 flex-col justify-between px-5 py-6"
      style={{ background: reservaBrand.heroGradiente }}
    >
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-2.5 px-1">
          <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={40} height={40} className="rounded-full shrink-0" />
          <span className="font-display text-[22px] leading-none tracking-wide text-white">
            {reservaBrand.restauranteAtual.toUpperCase()}
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {ITENS.map((item) => {
            const ativo = item.ativo(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3.5 py-2.5 text-[15px] font-medium"
                style={{
                  borderRadius: "var(--radius-sm)",
                  background: ativo ? "var(--color-surface)" : "transparent",
                  color: ativo ? "var(--color-primary)" : "rgba(255,255,255,0.82)",
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-1.5 px-3.5 py-3.5" style={{ borderRadius: "var(--radius-sm)", background: "rgba(0,0,0,0.18)" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: estado.cor }} />
          <span className="text-[13.5px] font-semibold text-white">{estado.texto}</span>
        </div>
        {diaFechado?.motivo && (
          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.65)" }}>{diaFechado.motivo}</span>
        )}
        <span className="text-[12px] first-letter:uppercase" style={{ color: "rgba(255,255,255,0.65)" }}>
          {agora ? agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" }) : " "}
        </span>
        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.65)" }}>
          {agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : " "}
        </span>
      </div>
    </aside>
  );
}
