"use client";

// Pedidos sobre dados pessoais (LGPD): o que os clientes pediram pela página
// "Meus dados" e a ferramenta para apagar os dados de um telefone.
// A lei dá 15 dias para responder.

import { useState } from "react";
import { reservaBrand } from "@/lib/reservaBrand";
import { PRAZOS } from "@/lib/empresa";
import {
  apagarDadosDoCliente,
  concluirPedido,
  protocoloDoPedido,
  rotuloDoTipo,
  usePedidosSobreDados,
  type PedidoSobreDados,
} from "@/lib/privacidade";
import { linkWhatsapp } from "@/lib/whatsapp";
import { telefoneValido } from "@/lib/validacao";

const caixa = { borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" } as const;

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function PedidosDeDados() {
  const { pedidos, carregando, erro, recarregar } = usePedidosSobreDados();
  const abertos = pedidos.filter((p) => p.status === "aberto");
  const fechados = pedidos.filter((p) => p.status !== "aberto");
  const [verFechados, setVerFechados] = useState(false);

  return (
    <div className="border p-5" style={caixa}>
      <p className="font-display text-lg">Pedidos sobre dados</p>
      <p className="text-xs mt-0.5 mb-4 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Clientes podem pedir para ver, corrigir ou apagar os próprios dados (Lei Geral de Proteção de Dados). Responda em até {PRAZOS.respostaDias} dias.
        Antes de apagar ou mostrar dados, confirme pelo WhatsApp que o pedido é mesmo do dono do número.
      </p>

      {erro === "sem-tabela" && (
        <p className="text-sm" role="alert" style={{ color: "var(--color-error)" }}>
          Falta rodar a parte 12 do SQL (dados do cliente) no Supabase.
        </p>
      )}
      {erro === "falha" && (
        <p className="text-sm" role="alert" style={{ color: "var(--color-error)" }}>
          Não foi possível carregar os pedidos. <button className="underline font-semibold" onClick={recarregar}>Tentar de novo</button>
        </p>
      )}
      {!erro && carregando && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Carregando…</p>}
      {!erro && !carregando && abertos.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nenhum pedido em aberto.</p>
      )}

      {abertos.length > 0 && (
        <ul className="flex flex-col">
          {abertos.map((p, i) => (
            <li key={p.id} style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}>
              <PedidoAberto pedido={p} aoMudar={recarregar} />
            </li>
          ))}
        </ul>
      )}

      {fechados.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-xs font-semibold underline" style={{ color: "var(--color-text-muted)" }} aria-expanded={verFechados} onClick={() => setVerFechados((v) => !v)}>
            {verFechados ? "Esconder" : "Ver"} pedidos respondidos ({fechados.length})
          </button>
          {verFechados && (
            <ul className="mt-2 flex flex-col gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {fechados.map((p) => (
                <li key={p.id}>
                  {dataCurta(p.criadoEm)} · {rotuloDoTipo(p.tipo)} · {p.nome} · {p.status === "concluido" ? "respondido" : "recusado"}
                  {p.concluidoEm ? ` em ${dataCurta(p.concluidoEm)}` : ""}
                  {p.nota ? ` — ${p.nota}` : ""} · protocolo {protocoloDoPedido(p.id)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ApagarPorTelefone aoApagar={recarregar} />
    </div>
  );
}

function PedidoAberto({ pedido: p, aoMudar }: { pedido: PedidoSobreDados; aoMudar: () => void }) {
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagado, setApagado] = useState<string | null>(null);
  const atraso = diasDesde(p.criadoEm);
  const mensagemWhats = `Olá, ${p.nome.split(" ")[0]}! Aqui é do ${reservaBrand.restauranteAtual}. Recebemos seu pedido sobre seus dados (protocolo ${protocoloDoPedido(p.id)}). Pode confirmar que foi você quem pediu?`;

  async function fechar(status: "concluido" | "recusado") {
    setSalvando(true);
    const ok = await concluirPedido(p.id, status, nota || apagado || "");
    setSalvando(false);
    if (ok) aoMudar();
  }

  return (
    <div className="py-3.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {rotuloDoTipo(p.tipo)} · {p.nome}
        </span>
        <span className="text-xs" style={{ color: atraso >= PRAZOS.respostaDias - 3 ? "var(--color-error)" : "var(--color-text-muted)", fontWeight: atraso >= PRAZOS.respostaDias - 3 ? 600 : 400 }}>
          {dataCurta(p.criadoEm)} · há {atraso} dia{atraso === 1 ? "" : "s"} · protocolo {protocoloDoPedido(p.id)}
        </span>
      </div>
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>WhatsApp {p.telefone}</span>
      {p.mensagem && <p className="text-sm leading-relaxed" style={{ background: "var(--color-bg)", borderRadius: 10, padding: "8px 12px" }}>{p.mensagem}</p>}

      <div className="flex flex-wrap gap-2">
        <a
          href={linkWhatsapp(p.telefone, mensagemWhats)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-2 text-xs font-semibold border"
          style={{ borderColor: "var(--color-border-field)", borderRadius: "var(--radius-sm)" }}
        >
          1. Confirmar pelo WhatsApp
        </a>
        {p.tipo === "exclusao" && !apagado && <BotaoApagar telefone={p.telefone} aoApagar={(r) => setApagado(r)} rotulo="2. Apagar os dados" />}
      </div>
      {apagado && (
        <p role="status" className="text-xs font-semibold" style={{ color: "var(--color-accent-dark)" }}>
          {apagado}
        </p>
      )}
      {p.tipo === "acesso" && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Para mostrar os dados: em Clientes, busque o telefone e mande pelo WhatsApp o que aparece lá (nome, aniversário e as reservas).
        </p>
      )}
      {p.tipo === "correcao" && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Para corrigir: abra a reserva dessa pessoa no painel e ajuste o dado, ou peça para ela fazer uma nova reserva com os dados certos.
        </p>
      )}

      <label className="text-xs flex flex-col gap-1" style={{ color: "var(--color-text-muted)" }}>
        O que foi feito (fica registrado)
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={300}
          placeholder="Ex.: confirmado pelo WhatsApp e dados apagados"
          className="border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border-field)", borderRadius: "var(--radius-sm)", background: "#fff", color: "var(--color-dark)" }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={salvando}
          onClick={() => fechar("concluido")}
          className="px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--color-accent-dark)", borderRadius: "var(--radius-sm)" }}
        >
          Marcar como respondido
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => fechar("recusado")}
          className="px-3.5 py-2 text-xs font-semibold border disabled:opacity-40"
          style={{ borderColor: "var(--color-border-field)", borderRadius: "var(--radius-sm)" }}
        >
          Recusar (não confirmou que é dono do número)
        </button>
      </div>
    </div>
  );
}

function BotaoApagar({ telefone, aoApagar, rotulo }: { telefone: string; aoApagar: (resumo: string) => void; rotulo: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function apagar() {
    setApagando(true);
    setErro(null);
    const r = await apagarDadosDoCliente(telefone);
    setApagando(false);
    setConfirmando(false);
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    aoApagar(
      `Dados apagados: ${r.reservas} reserva${r.reservas === 1 ? "" : "s"} sem nome e telefone` +
        (r.canceladas ? `, ${r.canceladas} futura${r.canceladas === 1 ? "" : "s"} cancelada${r.canceladas === 1 ? "" : "s"}` : "") +
        (r.fila ? `, saiu da fila de espera` : "") +
        ".",
    );
  }

  if (!confirmando) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="px-3.5 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}
        >
          {rotulo}
        </button>
        {erro && <p role="alert" className="w-full text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}
      </>
    );
  }
  return (
    <div role="alertdialog" aria-label="Confirmar exclusão" className="w-full flex flex-col gap-2 p-3" style={{ background: "var(--color-error-soft)", borderRadius: "var(--radius-sm)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-dark)" }}>
        Apagar nome, telefone, aniversário e observações de <strong>todas</strong> as reservas do número {telefone}, cancelar as reservas futuras e
        tirar da fila? <strong>Não dá para desfazer.</strong>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={apagando}
          onClick={apagar}
          className="px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}
        >
          {apagando ? "Apagando…" : "Sim, apagar"}
        </button>
        <button type="button" onClick={() => setConfirmando(false)} className="px-3.5 py-2 text-xs font-semibold">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Para pedidos que chegam por fora do site (WhatsApp, e-mail, balcão).
function ApagarPorTelefone({ aoApagar }: { aoApagar: () => void }) {
  const [telefone, setTelefone] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const ok = telefoneValido(telefone);

  return (
    <div className="mt-5 pt-4 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
      <label htmlFor="apagar-telefone" className="text-sm font-semibold">
        Apagar os dados de um telefone
      </label>
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Para pedidos que chegaram pelo WhatsApp, e-mail ou no balcão.
      </p>
      <div className="flex flex-wrap gap-2 items-start">
        <input
          id="apagar-telefone"
          value={telefone}
          onChange={(e) => {
            setTelefone(e.target.value);
            setResultado(null);
          }}
          placeholder="(41) 99999-9999"
          inputMode="tel"
          className="border px-3 py-2 text-sm flex-1 min-w-[180px]"
          style={{ borderColor: "var(--color-border-field)", borderRadius: "var(--radius-sm)", background: "#fff", color: "var(--color-dark)" }}
        />
        {ok && !resultado && (
          <BotaoApagar
            telefone={telefone.trim()}
            rotulo="Apagar dados"
            aoApagar={(r) => {
              setResultado(r);
              aoApagar();
            }}
          />
        )}
      </div>
      {resultado && (
        <p role="status" className="text-xs font-semibold" style={{ color: "var(--color-accent-dark)" }}>
          {resultado}
        </p>
      )}
    </div>
  );
}
