"use client";

// Criar uma senha nova para o painel. A pessoa chega aqui pelo link do e-mail
// "Esqueci minha senha": o Supabase coloca no endereço uma permissão temporária
// (vale 1 hora, uma vez só), que vira um login só para trocar a senha.

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { supabase } from "@/lib/supabaseClient";
import { confirmarCodigo, trocarSenha } from "@/lib/auth";

// O endereço como chegou, antes de o Supabase limpar a parte depois do "#".
const enderecoInicial = typeof window !== "undefined" ? window.location.hash : "";

type Etapa = "conferindo" | "invalido" | "senha" | "codigo" | "pronto";

const MINIMO = 8;

export default function NovaSenhaPage() {
  const [etapa, setEtapa] = useState<Etapa>("conferindo");
  const [vencido, setVencido] = useState(false);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [fatorId, setFatorId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // getSession espera o Supabase ler a permissão do endereço
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setEtapa("senha");
        return;
      }
      setVencido(/otp_expired|expired/i.test(enderecoInicial));
      setEtapa("invalido");
    });
  }, []);

  const curta = senha.length > 0 && senha.length < MINIMO;
  const diferentes = repetir.length > 0 && senha !== repetir;
  const ok = senha.length >= MINIMO && senha === repetir;

  async function gravar(e: FormEvent) {
    e.preventDefault();
    if (!ok || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await trocarSenha(senha);
    setEnviando(false);
    if (r.precisaDoCodigo) {
      setFatorId(r.precisaDoCodigo);
      setEtapa("codigo");
      return;
    }
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    setEtapa("pronto");
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!fatorId || codigo.length !== 6 || enviando) return;
    setEnviando(true);
    setErro(null);
    const c = await confirmarCodigo(fatorId, codigo);
    if (c.erro) {
      setEnviando(false);
      setErro(c.erro);
      setCodigo("");
      return;
    }
    const r = await trocarSenha(senha);
    setEnviando(false);
    if (r.erro || r.precisaDoCodigo) {
      setErro(r.erro ?? "Não foi possível trocar a senha agora. Tente de novo.");
      return;
    }
    setEtapa("pronto");
  }

  const campo = { borderColor: "var(--color-border-field)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", color: "var(--color-dark)" };
  const botao = "py-3.5 text-[15px] font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed";

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-5 py-10" style={{ background: "var(--color-bg)" }}>
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo-zeplin.jpg" alt="" width={64} height={64} className="rounded-full" />
          <h1 className="font-display text-[30px] leading-tight" style={{ color: "var(--color-dark)" }}>
            Painel do {reservaBrand.restauranteAtual}
          </h1>
        </div>

        <div className="border p-6" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
          {etapa === "conferindo" && (
            <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }} aria-live="polite">Conferindo o link…</p>
          )}

          {etapa === "invalido" && (
            <div className="flex flex-col gap-4" role="alert">
              <div>
                <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>
                  {vencido ? "Este link venceu" : "Link inválido"}
                </p>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  O link para trocar a senha vale por 1 hora e só pode ser usado uma vez. Volte ao painel, clique em &quot;Esqueci minha senha&quot; e peça
                  outro.
                </p>
              </div>
              <Link href="/admin" className={`${botao} text-center`} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
                Ir para o painel
              </Link>
            </div>
          )}

          {etapa === "senha" && (
            <form onSubmit={gravar} className="flex flex-col gap-4" noValidate>
              <div>
                <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>Crie uma senha nova</p>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  Pelo menos {MINIMO} caracteres. Misture letras e números e não use a mesma senha de outros sites.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nova-senha" className="text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>Senha nova</label>
                <div className="flex items-stretch border" style={campo}>
                  <input
                    id="nova-senha"
                    type={mostrar ? "text" : "password"}
                    value={senha}
                    onChange={(e) => { setSenha(e.target.value); setErro(null); }}
                    autoComplete="new-password"
                    required
                    aria-invalid={curta || undefined}
                    aria-describedby={curta ? "aviso-curta" : undefined}
                    className="flex-1 min-w-0 px-3.5 py-3 text-[15px] outline-none bg-transparent"
                  />
                  <button type="button" onClick={() => setMostrar((v) => !v)} aria-pressed={mostrar} className="px-3.5 text-[13px] font-semibold shrink-0" style={{ color: "var(--color-primary)" }}>
                    {mostrar ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {curta && <p id="aviso-curta" className="text-[12.5px] font-medium" style={{ color: "var(--color-error)" }}>Faltam {MINIMO - senha.length} caracteres.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="repetir-senha" className="text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>Repita a senha nova</label>
                <input
                  id="repetir-senha"
                  type={mostrar ? "text" : "password"}
                  value={repetir}
                  onChange={(e) => { setRepetir(e.target.value); setErro(null); }}
                  autoComplete="new-password"
                  required
                  aria-invalid={diferentes || undefined}
                  aria-describedby={diferentes ? "aviso-diferentes" : undefined}
                  className="border px-3.5 py-3 text-[15px] outline-none"
                  style={campo}
                />
                {diferentes && <p id="aviso-diferentes" className="text-[12.5px] font-medium" style={{ color: "var(--color-error)" }}>As duas senhas não estão iguais.</p>}
              </div>
              {erro && <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}
              <button type="submit" disabled={!ok || enviando} className={botao} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
                {enviando ? "Salvando…" : "Salvar senha nova"}
              </button>
            </form>
          )}

          {etapa === "codigo" && (
            <form onSubmit={confirmar} className="flex flex-col gap-4" noValidate>
              <div>
                <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>Digite o código do app</p>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  Esta conta tem o login em duas etapas. Para trocar a senha, digite o código de 6 números do app autenticador.
                </p>
              </div>
              <input
                id="nova-senha-codigo"
                value={codigo}
                onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErro(null); }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-label="Código de 6 números"
                className="border px-4 py-3.5 text-[24px] tracking-[0.35em] text-center font-semibold outline-none tabular-nums"
                style={campo}
              />
              {erro && <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}
              <button type="submit" disabled={codigo.length !== 6 || enviando} className={botao} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
                {enviando ? "Conferindo…" : "Confirmar e salvar"}
              </button>
            </form>
          )}

          {etapa === "pronto" && (
            <div className="flex flex-col gap-4" role="status">
              <div>
                <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>Senha trocada</p>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  A partir de agora, entre com a senha nova. Por segurança, os outros aparelhos que estavam logados vão pedir para entrar de novo (em até 1 hora).
                </p>
              </div>
              <Link href="/admin" className={`${botao} text-center`} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
                Abrir o painel
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
