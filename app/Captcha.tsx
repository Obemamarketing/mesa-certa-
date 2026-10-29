"use client";

// O quadradinho "não sou um robô" (Cloudflare Turnstile). Só aparece quando o
// captcha está configurado (NEXT_PUBLIC_TURNSTILE_SITE_KEY). Na maioria das
// vezes ele se resolve sozinho, sem a pessoa clicar em nada.
//
// Cada "passe" vale UMA vez: depois de um envio que falhou, a tela chama
// reiniciar() (por chaveDeReinicio) para pegar um passe novo.

import { useEffect, useRef } from "react";
import { CHAVE_DO_CAPTCHA, captchaLigado } from "@/lib/rpcPublica";

type Turnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!carregando) {
    carregando = new Promise((ok, falhou) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        carregando = null;
        falhou(new Error("captcha não carregou"));
      };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

export default function Captcha({ aoMudar, chaveDeReinicio = 0 }: { aoMudar: (passe: string | null) => void; chaveDeReinicio?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const avisar = useRef(aoMudar);

  useEffect(() => {
    avisar.current = aoMudar;
  }, [aoMudar]);

  useEffect(() => {
    if (!captchaLigado) return;
    let ativo = true;
    carregarScript()
      .then(() => {
        if (!ativo || !caixa.current || !window.turnstile) return;
        id.current = window.turnstile.render(caixa.current, {
          sitekey: CHAVE_DO_CAPTCHA,
          language: "pt-br",
          theme: "light",
          callback: (passe: string) => avisar.current(passe),
          "expired-callback": () => avisar.current(null),
          "error-callback": () => avisar.current(null),
        });
      })
      .catch(() => avisar.current(null));
    return () => {
      ativo = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, []);

  // pede um passe novo (o anterior já foi usado)
  useEffect(() => {
    if (chaveDeReinicio > 0 && id.current && window.turnstile) {
      avisar.current(null);
      window.turnstile.reset(id.current);
    }
  }, [chaveDeReinicio]);

  if (!captchaLigado) return null;
  return <div ref={caixa} className="min-h-[65px] flex justify-center" aria-label="Verificação de segurança" />;
}
