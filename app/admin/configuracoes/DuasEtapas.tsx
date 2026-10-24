"use client";

// Ativar o login em duas etapas: senha + código de 6 números de um app
// autenticador no celular. Com isso, quem descobrir a senha não entra.

import { useEffect, useState, type FormEvent } from "react";
import { comecarDuasEtapas, desativarDuasEtapas, situacaoDuasEtapas, terminarDuasEtapas, type NovaAtivacao } from "@/lib/auth";

type Tela =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "desligadas" }
  | { tipo: "ativando"; ativacao: NovaAtivacao }
  | { tipo: "ligadas"; fatorId: string };

const botao = "px-4 py-2.5 text-[13.5px] font-semibold";

export default function DuasEtapas() {
  const [tela, setTela] = useState<Tela>({ tipo: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoDesligar, setConfirmandoDesligar] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const s = await situacaoDuasEtapas();
      if (!ativo) return;
      setTela(!s ? { tipo: "erro" } : s.ativadas && s.fatorId ? { tipo: "ligadas", fatorId: s.fatorId } : { tipo: "desligadas" });
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  async function comecar() {
    setOcupado(true);
    setErro(null);
    const r = await comecarDuasEtapas();
    setOcupado(false);
    if (r.erro || !r.ativacao) setErro(r.erro ?? "Não foi possível começar agora.");
    else {
      setCodigo("");
      setTela({ tipo: "ativando", ativacao: r.ativacao });
    }
  }

  async function terminar(e: FormEvent) {
    e.preventDefault();
    if (tela.tipo !== "ativando" || codigo.length !== 6 || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await terminarDuasEtapas(tela.ativacao.fatorId, codigo);
    setOcupado(false);
    if (r.erro) {
      setErro(r.erro);
      setCodigo("");
    } else setTela({ tipo: "ligadas", fatorId: tela.ativacao.fatorId });
  }

  async function desligar() {
    if (tela.tipo !== "ligadas") return;
    setOcupado(true);
    setErro(null);
    const r = await desativarDuasEtapas(tela.fatorId);
    setOcupado(false);
    setConfirmandoDesligar(false);
    if (r.erro) setErro(r.erro);
    else setTela({ tipo: "desligadas" });
  }

  return (
    <div className="mt-4 pt-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-sm font-semibold block">Login em duas etapas</span>
          <span className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {tela.tipo === "ligadas"
              ? "Ativado. Para entrar, além da senha, é preciso o código do app no celular."
              : "Além da senha, pede um código de 6 números do celular. Quem descobrir a senha não entra."}
          </span>
        </div>
        {tela.tipo === "ligadas" && (
          <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" }}>
            Ativado
          </span>
        )}
      </div>

      {tela.tipo === "carregando" && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Conferindo…</p>}
      {tela.tipo === "erro" && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Não foi possível conferir agora.</p>}

      {tela.tipo === "desligadas" && (
        <button type="button" onClick={comecar} disabled={ocupado} className={`${botao} self-start text-white disabled:opacity-50`} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
          {ocupado ? "Preparando…" : "Ativar login em duas etapas"}
        </button>
      )}

      {tela.tipo === "ativando" && (
        <form onSubmit={terminar} className="flex flex-col gap-3 p-4" style={{ background: "var(--color-bg)", borderRadius: "var(--radius-sm)" }}>
          <ol className="text-[13px] leading-relaxed list-decimal pl-5 flex flex-col gap-1" style={{ color: "var(--color-dark)" }}>
            <li>Instale no celular um app autenticador: Google Authenticator, Microsoft Authenticator ou Authy.</li>
            <li>No app, toque em adicionar e escaneie este código:</li>
          </ol>
          {/* o próprio Supabase gera o QR Code (imagem SVG) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tela.ativacao.qrCode} alt="QR Code para o app autenticador" width={180} height={180} className="self-center bg-white p-2" style={{ borderRadius: "8px" }} />
          <p className="text-[12px] text-center break-all" style={{ color: "var(--color-text-muted)" }}>
            Não consegue escanear? Digite no app esta chave: <span className="font-mono font-semibold select-all" style={{ color: "var(--color-dark)" }}>{tela.ativacao.segredo}</span>
          </p>
          <label htmlFor="codigo-ativacao" className="text-[13px] leading-relaxed" style={{ color: "var(--color-dark)" }}>
            3. Digite o código de 6 números que o app mostrar:
          </label>
          <input
            id="codigo-ativacao"
            value={codigo}
            onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErro(null); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="border px-4 py-3 text-[22px] tracking-[0.35em] text-center font-semibold outline-none tabular-nums w-[200px] self-center"
            style={{ borderColor: erro ? "var(--color-error)" : "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", color: "var(--color-dark)" }}
          />
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="submit" disabled={ocupado || codigo.length !== 6} className={`${botao} text-white disabled:opacity-50`} style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}>
              {ocupado ? "Conferindo…" : "Confirmar e ativar"}
            </button>
            <button type="button" onClick={() => { setTela({ tipo: "desligadas" }); setErro(null); }} className={`${botao} border`} style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {tela.tipo === "ligadas" &&
        (confirmandoDesligar ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px]">Desativar? O login volta a pedir só a senha.</span>
            <button type="button" onClick={desligar} disabled={ocupado} className={`${botao} text-white disabled:opacity-50`} style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}>
              {ocupado ? "Desativando…" : "Sim, desativar"}
            </button>
            <button type="button" onClick={() => setConfirmandoDesligar(false)} className={botao} style={{ color: "var(--color-text-muted)" }}>
              Não
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmandoDesligar(true)} className="self-start text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
            Desativar
          </button>
        ))}

      {erro && <p role="alert" className="text-[13px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}
    </div>
  );
}
