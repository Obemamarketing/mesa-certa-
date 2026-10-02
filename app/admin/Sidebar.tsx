"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";

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
    href: "/admin/cardapio",
    label: "Cardápio",
    ativo: (p: string) => p.startsWith("/admin/cardapio"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M5 3v18M5 3h11a3 3 0 0 1 3 3v6H5" />
      </svg>
    ),
  },
  {
    href: "/admin/relatorios",
    label: "Relatórios",
    ativo: (p: string) => p.startsWith("/admin/relatorios"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 20V10M12 20V4M20 20v-7" />
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

      <div
        className="flex items-center gap-3 px-3 py-3 cursor-pointer"
        style={{ borderRadius: "var(--radius-sm)", background: "rgba(0,0,0,0.18)" }}
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
          style={{ background: "var(--color-secondary)", color: "var(--color-dark)" }}
        >
          {reservaBrand.admin.nome.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold block text-white truncate">{reservaBrand.admin.nome}</span>
          <span className="text-xs block truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{reservaBrand.admin.cargo}</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
      </div>
    </aside>
  );
}
