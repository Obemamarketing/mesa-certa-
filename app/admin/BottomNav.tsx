"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  {
    href: "/admin",
    label: "Reservas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/admin/mesas",
    label: "Mesas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" />
      </svg>
    ),
  },
  {
    href: "/admin/clientes",
    label: "Clientes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" />
      </svg>
    ),
  },
  {
    href: "/admin/relatorios",
    label: "Relatórios",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 20V10M12 20V4M20 20v-7" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 flex items-stretch z-10"
      style={{ background: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
    >
      {ITENS.map((item) => {
        const ativo = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5"
            style={{ color: ativo ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            {item.icon}
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
