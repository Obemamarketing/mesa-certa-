"use client";

// A porta do painel: só mostra as telas de administração para administrador
// logado. Enquanto não entra, nenhuma tela do painel é montada — então nenhuma
// delas chega a pedir reservas ao banco.

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { confirmarCodigo, conferirDeNovo, entrar, sair, useAcesso } from "@/lib/auth";

export default function PortaoAdmin({ children }: { children: React.ReactNode }) {
  const acesso = useAcesso();

  if (acesso.estado === "dentro") return <>{children}</>;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-10" style={{ background: "var(--color-bg)" }}>
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={64} height={64} className="rounded-full" />
          <div>
            <h1 className="font-display text-[30px] leading-tight" style={{ color: "var(--color-dark)" }}>
              Painel do {reservaBrand.restauranteAtual}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Área restrita à equipe do restaurante.</p>
          </div>
        </div>

        <div
          className="border p-6"
          style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-soft)" }}
        >
          {acesso.estado === "carregando" && (
            <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }} aria-live="polite">Conferindo o acesso…</p>
          )}

          {acesso.estado === "fora" && <FormularioDeEntrada />}

          {acesso.estado === "codigo" && <FormularioDoCodigo email={acesso.email} fatorId={acesso.fatorId} />}

          {acesso.estado === "sem-permissao" && (
            <Recado
              titulo="Esta conta não tem acesso ao painel"
              texto={`Você entrou como ${acesso.email}, mas essa conta não está na lista de administradores do restaurante. Peça a liberação ao suporte ou entre com outra conta.`}
            >
              <BotaoSair rotulo="Sair e entrar com outra conta" principal />
            </Recado>
          )}

          {acesso.estado === "erro" && (
            <Recado titulo="Não deu para abrir o painel" texto={acesso.mensagem}>
              <BotaoTentarDeNovo />
              <BotaoSair rotulo="Sair" />
            </Recado>
          )}
        </div>

        <Link href="/" className="text-sm font-medium text-center" style={{ color: "var(--color-text-muted)" }}>
          ← Voltar para o site de reservas
        </Link>
      </div>
    </div>
  );
}

function FormularioDeEntrada() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !email.trim() || !senha) return;
    setEnviando(true);
    setErro(null);
    const r = await entrar(email, senha);
    // deu certo: o painel abre sozinho (este formulário some); o botão fica em
    // "Entrando…" até lá
    if (r.erro) {
      setErro(r.erro);
      setEnviando(false);
    }
  }

  const campo = { borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", color: "var(--color-dark)" };

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>E-mail</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="border px-3.5 py-3 text-[15px] outline-none"
          style={campo}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-senha" className="text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>Senha</label>
        <div className="flex items-stretch border" style={campo}>
          <input
            id="login-senha"
            type={mostrarSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
            className="flex-1 min-w-0 px-3.5 py-3 text-[15px] outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-pressed={mostrarSenha}
            className="px-3.5 text-[13px] font-semibold shrink-0"
            style={{ color: "var(--color-primary)" }}
          >
            {mostrarSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {erro && (
        <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>
      )}

      <button
        type="submit"
        disabled={enviando || !email.trim() || !senha}
        className="py-3.5 text-[15px] font-semibold text-white disabled:opacity-45"
        style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-[12.5px] text-center leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Esqueceu a senha? Fale com o suporte da {reservaBrand.nome}.
      </p>
    </form>
  );
}

// Segunda etapa: o código de 6 números do app autenticador.
function FormularioDoCodigo({ email, fatorId }: { email: string; fatorId: string }) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || codigo.length !== 6) return;
    setEnviando(true);
    setErro(null);
    const r = await confirmarCodigo(fatorId, codigo);
    if (r.erro) {
      setErro(r.erro);
      setCodigo("");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
      <div>
        <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>Digite o código do app</p>
        <p className="text-sm mt-1.5 leading-relaxed break-words" style={{ color: "var(--color-text-muted)" }}>
          Abra o app autenticador no seu celular e digite o código de 6 números do {email}.
        </p>
      </div>
      <input
        id="login-codigo"
        value={codigo}
        onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErro(null); }}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="000000"
        aria-label="Código de 6 números"
        className="border px-4 py-3.5 text-[24px] tracking-[0.35em] text-center font-semibold outline-none tabular-nums"
        style={{ borderColor: erro ? "var(--color-error)" : "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", color: "var(--color-dark)" }}
      />
      {erro && <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}
      <button
        type="submit"
        disabled={enviando || codigo.length !== 6}
        className="py-3.5 text-[15px] font-semibold text-white disabled:opacity-45"
        style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
      >
        {enviando ? "Conferindo…" : "Entrar"}
      </button>
      <BotaoSair rotulo="Usar outra conta" />
      <p className="text-[12.5px] text-center leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Perdeu o celular? Fale com o suporte da {reservaBrand.nome} para liberar o acesso.
      </p>
    </form>
  );
}

function Recado({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4" role="alert">
      <div>
        <p className="font-display text-xl leading-snug" style={{ color: "var(--color-dark)" }}>{titulo}</p>
        <p className="text-sm mt-2 leading-relaxed break-words" style={{ color: "var(--color-text-muted)" }}>{texto}</p>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function BotaoSair({ rotulo, principal = false }: { rotulo: string; principal?: boolean }) {
  const [saindo, setSaindo] = useState(false);
  return (
    <button
      type="button"
      disabled={saindo}
      onClick={async () => { setSaindo(true); await sair(); setSaindo(false); }}
      className="py-3 text-sm font-semibold border disabled:opacity-50"
      style={
        principal
          ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-sm)" }
          : { borderColor: "var(--color-border)", color: "var(--color-text-muted)", borderRadius: "var(--radius-sm)" }
      }
    >
      {saindo ? "Saindo…" : rotulo}
    </button>
  );
}

function BotaoTentarDeNovo() {
  const [tentando, setTentando] = useState(false);
  return (
    <button
      type="button"
      disabled={tentando}
      onClick={async () => { setTentando(true); await conferirDeNovo(); setTentando(false); }}
      className="py-3 text-sm font-semibold text-white disabled:opacity-50"
      style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
    >
      {tentando ? "Conferindo…" : "Tentar de novo"}
    </button>
  );
}
