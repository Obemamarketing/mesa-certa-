"use client";

// Página de acompanhamento da fila de espera. O código no endereço é o
// "comprovante" da pessoa: só quem tem o link vê esta espera.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import { rotuloDaData } from "@/lib/reservas";
import { sairDaFila, verMinhaEspera, type MinhaEspera } from "@/lib/fila";

const INTERVALO_MS = 20_000;

export default function AcompanharFilaPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [espera, setEspera] = useState<MinhaEspera | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const r = await verMinhaEspera(codigo);
      if (!ativo) return;
      // falha de conexão não apaga o que já estava na tela
      if (r.erro) setErro(r.erro);
      else {
        setErro(null);
        setEspera(r.espera);
      }
      setCarregando(false);
    }
    carregar();
    const seVisivel = () => { if (document.visibilityState === "visible") carregar(); };
    const relogio = setInterval(seVisivel, INTERVALO_MS);
    document.addEventListener("visibilitychange", seVisivel);
    window.addEventListener("focus", seVisivel);
    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", seVisivel);
      window.removeEventListener("focus", seVisivel);
    };
  }, [codigo]);

  async function sair() {
    setSaindo(true);
    const r = await sairDaFila(codigo);
    if (r.erro) setErro(r.erro);
    const novo = await verMinhaEspera(codigo);
    if (!novo.erro) setEspera(novo.espera);
    setSaindo(false);
    setConfirmandoSaida(false);
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  const naFila = espera && (espera.status === "aguardando" || espera.status === "chamado");

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>← Início</Link>
      </header>

      <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-14 gap-6 pt-4 sm:pt-10">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--color-primary)" }}>
            {reservaBrand.restauranteAtual}
          </span>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Fila de espera</h1>
        </div>

        {carregando && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>}

        {!carregando && !espera && !erro && (
          <div className="border px-5 py-6 flex flex-col gap-2" style={{ borderColor: "var(--color-border)", borderRadius: "16px", background: "var(--color-surface)" }}>
            <p className="font-display text-xl">Espera não encontrada</p>
            <p className="text-[14px]" style={{ color: "var(--color-text-muted)" }}>Confira se o link está completo.</p>
            <Link href="/" className="text-[14px] font-semibold mt-1" style={{ color: "var(--color-primary)" }}>Fazer uma reserva →</Link>
          </div>
        )}

        {espera && (
          <article className="border overflow-hidden" style={{ borderColor: "var(--color-border)", borderRadius: "18px", background: "var(--color-surface)" }}>
            <div className="px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>Olá, {espera.primeiroNome}!</p>
              <p className="font-display text-[24px] leading-tight mt-1" style={{ color: "var(--color-dark)" }}>
                {rotuloDaData(espera.dataReserva)} · {espera.horario.replace(":", "h")}
              </p>
              <p className="text-[14px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                {espera.pessoas} pessoa{espera.pessoas === 1 ? "" : "s"}
              </p>
            </div>

            <div className="px-6 py-6 flex flex-col items-center text-center gap-2" aria-live="polite">
              {espera.status === "aguardando" && espera.posicao !== null && (
                <>
                  <span className="text-[12px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>Sua posição</span>
                  <span className="font-display text-[64px] leading-none tabular-nums" style={{ color: "var(--color-primary)" }}>{espera.posicao}º</span>
                  <p className="text-[14px] leading-relaxed max-w-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {espera.posicao === 1 ? "Você é o próximo da fila." : `Há ${espera.posicao - 1} na sua frente.`} Se uma mesa liberar, o restaurante chama você
                    no WhatsApp. Esta página se atualiza sozinha.
                  </p>
                </>
              )}
              {espera.status === "chamado" && (
                <>
                  <span className="text-[13px] font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" }}>Mesa liberada!</span>
                  <p className="font-display text-[24px] leading-tight mt-2" style={{ color: "var(--color-dark)" }}>Chegou a sua vez</p>
                  <p className="text-[14px] leading-relaxed max-w-sm" style={{ color: "var(--color-text-muted)" }}>
                    O restaurante vai falar com você pelo WhatsApp para confirmar a reserva. Fique de olho nas mensagens.
                  </p>
                </>
              )}
              {espera.status === "atendido" && (
                <>
                  <p className="font-display text-[24px] leading-tight" style={{ color: "var(--color-dark)" }}>Sua mesa está reservada</p>
                  <p className="text-[14px]" style={{ color: "var(--color-text-muted)" }}>Você saiu da fila e virou reserva. Até breve!</p>
                  <Link href="/consulta" className="text-[14px] font-semibold mt-1" style={{ color: "var(--color-primary)" }}>Consultar minha reserva →</Link>
                </>
              )}
              {(espera.status === "saiu" || espera.status === "removido") && (
                <>
                  <p className="font-display text-[22px] leading-tight" style={{ color: "var(--color-dark)" }}>Você não está mais na fila</p>
                  <Link href="/" className="text-[14px] font-semibold mt-1" style={{ color: "var(--color-primary)" }}>Escolher outra data →</Link>
                </>
              )}
              {espera.status === "expirado" && (
                <>
                  <p className="font-display text-[22px] leading-tight" style={{ color: "var(--color-dark)" }}>Essa data já passou</p>
                  <Link href="/" className="text-[14px] font-semibold mt-1" style={{ color: "var(--color-primary)" }}>Fazer uma nova reserva →</Link>
                </>
              )}
            </div>

            {naFila && (
              <div className="px-6 pb-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={copiarLink}
                  className="py-3 text-[14px] font-semibold border"
                  style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "12px" }}
                >
                  {copiado ? "Link copiado!" : "Copiar o link desta página"}
                </button>
                {!confirmandoSaida ? (
                  <button type="button" onClick={() => setConfirmandoSaida(true)} className="py-3 text-[14px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Sair da fila
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 p-3" style={{ background: "var(--color-bg)", borderRadius: "12px" }}>
                    <p className="text-[14px]">Tem certeza? Você perde o seu lugar na fila.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={sair} disabled={saindo} className="flex-1 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--color-primary)", borderRadius: "10px" }}>
                        {saindo ? "Saindo…" : "Sim, sair"}
                      </button>
                      <button type="button" onClick={() => setConfirmandoSaida(false)} className="flex-1 py-2.5 text-[14px] font-semibold border" style={{ borderColor: "var(--color-border)", borderRadius: "10px" }}>
                        Continuar na fila
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        )}

        {erro && <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}

        {naFila && (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Guarde este link: é por ele que você acompanha a sua espera. Entrar na fila não garante a mesa.
          </p>
        )}
      </div>
    </main>
  );
}
