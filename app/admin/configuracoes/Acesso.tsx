"use client";

// Quem está logado neste aparelho, a saída, e se o banco de dados já está
// fechado para quem não é administrador.

import { useEffect, useState } from "react";
import { reservaBrand } from "@/lib/reservaBrand";
import { bancoProtegido, useAcesso } from "@/lib/auth";
import SairDoPainel from "../SairDoPainel";

export default function Acesso() {
  const acesso = useAcesso();
  const email = acesso.estado === "dentro" ? acesso.email : "";
  // undefined = ainda perguntando; null = não deu pra saber
  const [protegido, setProtegido] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;
    bancoProtegido().then((r) => {
      if (ativo) setProtegido(r);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="border p-5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
      <p className="font-display text-lg mb-3">Acesso</p>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--color-primary)", color: "#fff" }}>
            {(email.charAt(0) || "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium block break-all">{email || "—"}</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Administrador · logado neste aparelho</span>
          </div>
        </div>
        <SairDoPainel />
      </div>

      <div className="mt-4 pt-4 flex flex-col gap-2 text-xs leading-relaxed" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
        {protegido === true && (
          <p className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "var(--color-accent)" }} />
            <span>
              <strong style={{ color: "var(--color-dark)" }}>Banco de dados protegido.</strong> Nome e telefone dos clientes só aparecem para quem entra aqui com login.
            </span>
          </p>
        )}
        {protegido === false && (
          <p className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "var(--color-secondary)" }} />
            <span>
              <strong style={{ color: "var(--color-dark)" }}>Proteção do banco pendente.</strong> O login já funciona, mas o banco de dados ainda não foi fechado. Falta o suporte
              rodar <code>supabase-fechar-acesso.sql</code> no Supabase.
            </span>
          </p>
        )}
        {protegido === null && <p>Não foi possível conferir a proteção do banco agora.</p>}
        <p>Para dar acesso a outra pessoa, trocar a senha ou tirar o acesso de alguém, fale com o suporte da {reservaBrand.nome}.</p>
      </div>
    </div>
  );
}
