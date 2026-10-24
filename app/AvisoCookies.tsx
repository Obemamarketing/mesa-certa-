"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Aviso de cookies. O site só usa armazenamento ESSENCIAL (a lembrança deste
// aviso e o login do painel), que não depende de autorização — por isso o
// aviso informa, em vez de pedir permissão. Por isso também some sozinho
// quando a pessoa toca em qualquer outra parte da página (ou aperta Esc): ele
// fica preso embaixo da tela e não pode tapar o botão de continuar a reserva.
//
// SE UM DIA ENTRAR Google Analytics, pixel ou qualquer rastreamento: isto
// precisa virar um pedido de permissão ("Aceitar" / "Recusar"), e o script só
// pode carregar depois do "Aceitar". Atualize também a Política de privacidade.

const CHAVE = "aviso-cookies-visto";
const ouvintes = new Set<() => void>();

function jaViu(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    ouvintes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

function marcarVisto() {
  try {
    localStorage.setItem(CHAVE, "1");
  } catch {
    // navegador sem armazenamento: o aviso só some até recarregar
  }
  escondidoNestaVisita = true;
  ouvintes.forEach((f) => f());
}

let escondidoNestaVisita = false;

export default function AvisoCookies() {
  const caminho = usePathname();
  // no servidor, "já viu": o aviso só aparece depois que a página abre no navegador
  const visto = useSyncExternalStore(assinar, () => escondidoNestaVisita || jaViu(), () => true);
  const aviso = useRef<HTMLDivElement>(null);
  const mostrar = !visto && !caminho?.startsWith("/admin");

  useEffect(() => {
    if (!mostrar) return;
    const aoTocar = (e: PointerEvent) => {
      if (aviso.current && !aviso.current.contains(e.target as Node)) marcarVisto();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") marcarVisto();
    };
    document.addEventListener("pointerdown", aoTocar, true);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocar, true);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [mostrar]);

  if (!mostrar) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-5 sm:pb-5 pointer-events-none"
    >
      <div
        ref={aviso}
        className="foco-claro pointer-events-auto max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 px-4 py-3.5 sm:px-5"
        style={{
          background: "var(--color-dark)",
          color: "rgba(255,255,255,0.9)",
          borderRadius: "16px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        }}
      >
        <p className="text-[13.5px] leading-snug flex-1">
          Usamos só o armazenamento essencial para o site funcionar. Nada de cookies de propaganda ou de rastreamento.{" "}
          <Link href="/privacidade#cookies" className="font-semibold underline underline-offset-4 text-white">
            Saiba mais
          </Link>
        </p>
        <button
          type="button"
          onClick={marcarVisto}
          className="shrink-0 px-5 py-2.5 text-[14px] font-semibold"
          style={{ background: "#fff", color: "var(--color-dark)", borderRadius: "999px" }}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
