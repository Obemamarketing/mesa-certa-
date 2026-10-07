"use client";

// Planta OFICIAL do ZéPelin: a imagem public/planta-zepelin.webp, intocada, com
// uma camada de marcadores por cima. É a MESMA planta no cliente (desktop e
// celular), no painel Mesas e no modo operação — o que muda é só o
// comportamento, controlado por props:
//
//   sem aoSelecionar  → referência visual (cliente): marcadores não clicáveis
//   com aoSelecionar  → marcadores clicáveis para consultar (painel e operação)
//   com aoMover       → modo calibração: arrasta o marcador até encaixar na
//                       mesa desenhada (só no painel Mesas)
//   zoomavel          → botões, pinça e arrastar (celular)
//
// Os marcadores ficam em porcentagem da imagem (x, y de 0 a 100), então a mesma
// configuração vale em qualquer tamanho de tela. Para trocar a imagem por uma
// de maior resolução basta substituir o arquivo, mantendo a proporção.

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { statusMesa, type DiaReserva, type Reserva } from "@/lib/reservas";
import { MESAS_PADRAO, type MesaConfig } from "@/lib/mesas";

export const IMAGEM_PLANTA = "/planta-zepelin.webp";

// Largura do marcador, em % da largura da imagem. Um pouco maior que os
// quadradinhos desenhados na imagem, para cobri-los por inteiro: o estado real
// do sistema é que vale, não a cor que veio pintada no desenho.
const TAMANHO_MARCADOR = 4.2;

export type EstadoMarcador = "livre" | "reservada" | "ocupada" | "pequena" | "selecionada";

const CORES: Record<EstadoMarcador, { fundo: string; borda: string; texto: string }> = {
  livre: { fundo: "#3F8F3F", borda: "#27662A", texto: "#FFFFFF" },
  reservada: { fundo: "#E3A31B", borda: "#9A6A08", texto: "#2A1712" },
  ocupada: { fundo: "#B8353F", borda: "#7F1721", texto: "#FFFFFF" },
  pequena: { fundo: "#8C8C8C", borda: "#5F5F5F", texto: "#FFFFFF" },
  selecionada: { fundo: "#F4C84F", borda: "#7A5200", texto: "#2A1712" },
};

function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// s = escala. x e y = deslocamento como FRAÇÃO da largura/altura da planta (e
// não em pixels): assim dá pra centralizar numa mesa só com as porcentagens
// dela, sem ler o tamanho da tela durante o desenho.
type Zoom = { s: number; x: number; y: number };
const ZOOM_MAX = 4;

function ajustarZoom(z: Zoom): Zoom {
  const s = limitar(z.s, 1, ZOOM_MAX);
  return { s, x: limitar(z.x, 1 - s, 0), y: limitar(z.y, 1 - s, 0) };
}

// deslocamento que deixa o ponto (px%, py%) da imagem no centro da janela
function centralizarEm(px: number, py: number, s: number): Zoom {
  return ajustarZoom({ s, x: 0.5 - (px / 100) * s, y: 0.5 - (py / 100) * s });
}

export default function PlantaRestaurante({
  reservas,
  dia,
  horario,
  mesaSelecionada,
  pessoasMin,
  mesas = MESAS_PADRAO,
  aoSelecionar,
  aoMover,
  statusNeutro = false,
  statusSimplificado = false,
  destaque = "cor",
  zoomavel = false,
}: {
  reservas: Reserva[];
  dia: DiaReserva;
  horario: string;
  mesaSelecionada: string | null;
  pessoasMin?: number;
  mesas?: MesaConfig[];
  /** Torna os marcadores clicáveis (painel e modo operação). */
  aoSelecionar?: (numero: string) => void;
  /** Liga a calibração: arrastar o marcador até encaixar na mesa desenhada. */
  aoMover?: (numero: string, x: number, y: number) => void;
  /** Na calibração as cores de reserva atrapalham: tudo em estado neutro. */
  statusNeutro?: boolean;
  /** Na tela do cliente, reservada e ocupada são a mesma coisa: indisponível. */
  statusSimplificado?: boolean;
  /** "cor": a mesa escolhida muda de cor (cliente). "anel": mantém a cor do
   *  estado e ganha um anel — admin e operação precisam ver o estado real. */
  destaque?: "cor" | "anel";
  /** Habilita botões, pinça e arrastar para ampliar (celular). */
  zoomavel?: boolean;
}) {
  const editavel = Boolean(aoMover);
  const selecionada = mesas.find((m) => m.numero === mesaSelecionada);

  // ---------- calibração (arrastar o marcador) ----------
  const conteudoRef = useRef<HTMLDivElement | null>(null);
  const arrastando = useRef<{ numero: string; dx: number; dy: number } | null>(null);

  function paraPercentual(e: ReactPointerEvent) {
    const el = conteudoRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  function pegar(e: ReactPointerEvent, m: MesaConfig) {
    if (!editavel) return;
    const p = paraPercentual(e);
    if (!p) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    arrastando.current = { numero: m.numero, dx: p.x - m.x, dy: p.y - m.y };
    aoSelecionar?.(m.numero);
  }

  function arrastar(e: ReactPointerEvent) {
    const alvo = arrastando.current;
    if (!alvo || !aoMover) return;
    const p = paraPercentual(e);
    if (!p) return;
    e.preventDefault();
    aoMover(alvo.numero, limitar(p.x - alvo.dx, 1, 99), limitar(p.y - alvo.dy, 1, 99));
  }

  function soltar() {
    arrastando.current = null;
  }

  // ---------- zoom e arrastar (celular) ----------
  const janelaRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ s: 1, x: 0, y: 0 });
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<
    | { tipo: "pinca"; d0: number; z0: Zoom; mx: number; my: number }
    | { tipo: "arrasto"; px: number; py: number; z0: Zoom; moveu: boolean }
    | null
  >(null);

  // Se a mesa escolhida muda enquanto a planta está ampliada, a planta anda
  // até ela — senão o destaque podia ficar fora da tela. (Ajuste feito durante
  // o desenho, o padrão do React para reagir a mudança de prop.)
  const [selecaoAnterior, setSelecaoAnterior] = useState(mesaSelecionada);
  if (selecaoAnterior !== mesaSelecionada) {
    setSelecaoAnterior(mesaSelecionada);
    if (zoomavel && zoom.s > 1 && selecionada) setZoom(centralizarEm(selecionada.x, selecionada.y, zoom.s));
  }

  function ampliar(fator: number) {
    // amplia em torno do centro da janela
    setZoom((z) => {
      const s = limitar(z.s * fator, 1, ZOOM_MAX);
      const r = s / z.s;
      return ajustarZoom({ s, x: 0.5 - (0.5 - z.x) * r, y: 0.5 - (0.5 - z.y) * r });
    });
  }

  function aoPressionar(e: ReactPointerEvent) {
    if (!zoomavel) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = janelaRef.current;
    if (!el) return;
    if (ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      const r = el.getBoundingClientRect();
      gesto.current = {
        tipo: "pinca",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        z0: zoom,
        // ponto médio dos dedos, como fração da janela
        mx: ((a.x + b.x) / 2 - r.left) / (r.width || 1),
        my: ((a.y + b.y) / 2 - r.top) / (r.height || 1),
      };
      el.setPointerCapture?.(e.pointerId);
    } else if (ponteiros.current.size === 1 && zoom.s > 1) {
      gesto.current = { tipo: "arrasto", px: e.clientX, py: e.clientY, z0: zoom, moveu: false };
    }
  }

  function aoMexer(e: ReactPointerEvent) {
    if (!zoomavel || !ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;

    if (g.tipo === "pinca" && ponteiros.current.size >= 2) {
      const [a, b] = [...ponteiros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const s = limitar(g.z0.s * (d / g.d0), 1, ZOOM_MAX);
      const r = s / g.z0.s;
      setZoom(ajustarZoom({ s, x: g.mx - (g.mx - g.z0.x) * r, y: g.my - (g.my - g.z0.y) * r }));
    } else if (g.tipo === "arrasto") {
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      if (!g.moveu && Math.hypot(dx, dy) < 4) return;
      if (!g.moveu) {
        g.moveu = true;
        janelaRef.current?.setPointerCapture?.(e.pointerId);
      }
      const el = janelaRef.current;
      if (!el) return;
      setZoom(ajustarZoom({ s: g.z0.s, x: g.z0.x + dx / (el.clientWidth || 1), y: g.z0.y + dy / (el.clientHeight || 1) }));
    }
  }

  function aoLevantar(e: ReactPointerEvent) {
    ponteiros.current.delete(e.pointerId);
    if (ponteiros.current.size < 2 && gesto.current?.tipo === "pinca") gesto.current = null;
    if (ponteiros.current.size === 0) gesto.current = null;
  }

  // ---------- desenho ----------
  const estiloJanela: CSSProperties = zoomavel
    ? {
        position: "relative",
        overflow: "hidden",
        // com a planta inteira na tela, o gesto vertical rola a página; já
        // ampliada, o dedo passa a arrastar a planta
        touchAction: zoom.s > 1 ? "none" : "pan-y",
      }
    : { position: "relative" };

  const estiloConteudo: CSSProperties = {
    position: "relative",
    width: "100%",
    // permite dimensionar o texto dos marcadores pela largura da imagem
    containerType: "inline-size",
    ...(zoomavel
      ? { transform: `translate(${zoom.x * 100}%, ${zoom.y * 100}%) scale(${zoom.s})`, transformOrigin: "0 0" }
      : null),
  };

  return (
    <div
      ref={janelaRef}
      style={estiloJanela}
      onPointerDown={zoomavel ? aoPressionar : undefined}
      onPointerMove={zoomavel ? aoMexer : undefined}
      onPointerUp={zoomavel ? aoLevantar : undefined}
      onPointerCancel={zoomavel ? aoLevantar : undefined}
      role="group"
      aria-label={
        selecionada
          ? `Planta do ZéPelin. A mesa ${selecionada.numero}, no ${selecionada.zona}, está destacada.`
          : "Planta do ZéPelin, com as mesas por ambiente."
      }
    >
      <div
        ref={conteudoRef}
        style={estiloConteudo}
        onPointerMove={editavel ? arrastar : undefined}
        onPointerUp={editavel ? soltar : undefined}
        onPointerCancel={editavel ? soltar : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={IMAGEM_PLANTA}
          alt=""
          draggable={false}
          className="block w-full h-auto select-none"
          style={{ pointerEvents: "none" }}
        />

        {mesas.map((m) => {
          let status: EstadoMarcador = statusNeutro ? "livre" : statusMesa(reservas, dia, horario, m, pessoasMin);
          if (statusSimplificado && status === "reservada") status = "ocupada";
          const escolhida = mesaSelecionada === m.numero;
          const estado: EstadoMarcador = escolhida && destaque === "cor" ? "selecionada" : status;
          const cor = CORES[estado];
          const interativo = Boolean(aoSelecionar) || editavel;

          const caixa: CSSProperties = {
            position: "absolute",
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: `${TAMANHO_MARCADOR}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            padding: 0,
          };

          const rotulo = (
            <>
              {escolhida && (
                // halo que pulsa: leva o olho direto à mesa escolhida
                <span
                  aria-hidden="true"
                  className="halo-mesa"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "230%",
                    aspectRatio: "1",
                    borderRadius: "9999px",
                    background: "radial-gradient(circle, rgba(255,226,140,0.55) 0%, rgba(255,226,140,0) 70%)",
                    pointerEvents: "none",
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  borderRadius: "14%",
                  background: cor.fundo,
                  color: cor.texto,
                  border: `max(1px, 0.25cqw) solid ${cor.borda}`,
                  boxShadow: escolhida
                    ? "0 0 0 max(2px, 0.5cqw) #FFFFFF, 0 0 0 max(3px, 0.8cqw) #2A1712, 0 0.4cqw 1.2cqw rgba(0,0,0,0.55)"
                    : "0 0.2cqw 0.6cqw rgba(0,0,0,0.45)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                  // proporcional à imagem, mas nunca menor que 8,5px: no celular
                  // 2,1cqw daria um número minúsculo (o zoom resolve o resto)
                  fontSize: "max(2.1cqw, 8.5px)",
                  lineHeight: 1,
                  outline: editavel ? "max(1px, 0.2cqw) dashed rgba(255,255,255,0.9)" : undefined,
                  outlineOffset: editavel ? "max(2px, 0.5cqw)" : undefined,
                }}
              >
                {m.numero}
              </span>
            </>
          );

          if (!interativo) {
            return (
              <div key={m.numero} style={{ ...caixa, pointerEvents: "none", zIndex: escolhida ? 3 : 2 }}>
                {rotulo}
              </div>
            );
          }

          return (
            <button
              key={m.numero}
              type="button"
              aria-label={`Mesa ${m.numero}, ${m.capacidade} lugares, ${m.zona}`}
              aria-pressed={escolhida}
              onPointerDown={editavel ? (e) => pegar(e, m) : undefined}
              onClick={!editavel && aoSelecionar ? () => aoSelecionar(m.numero) : undefined}
              style={{
                ...caixa,
                background: "transparent",
                border: 0,
                cursor: editavel ? "grab" : "pointer",
                touchAction: editavel ? "none" : undefined,
                zIndex: escolhida ? 3 : 2,
              }}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      {zoomavel && (
        <div className="absolute right-2 top-2 flex flex-col gap-1.5" style={{ zIndex: 5 }}>
          <BotaoZoom rotulo="Ampliar a planta" desabilitado={zoom.s >= ZOOM_MAX} aoClicar={() => ampliar(1.6)}>
            +
          </BotaoZoom>
          <BotaoZoom rotulo="Reduzir a planta" desabilitado={zoom.s <= 1} aoClicar={() => ampliar(1 / 1.6)}>
            −
          </BotaoZoom>
          {zoom.s > 1 && (
            <BotaoZoom rotulo="Ver a planta inteira" aoClicar={() => setZoom({ s: 1, x: 0, y: 0 })}>
              ⤢
            </BotaoZoom>
          )}
        </div>
      )}
    </div>
  );
}

function BotaoZoom({
  children,
  rotulo,
  aoClicar,
  desabilitado,
}: {
  children: React.ReactNode;
  rotulo: string;
  aoClicar: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      onClick={aoClicar}
      // pointer events do botão não podem virar gesto de arrastar a planta
      onPointerDown={(e) => e.stopPropagation()}
      className="w-9 h-9 flex items-center justify-center text-[19px] font-semibold disabled:opacity-35"
      style={{
        background: "rgba(252,250,245,0.94)",
        color: "var(--color-dark)",
        border: "1px solid rgba(42,23,18,0.35)",
        borderRadius: "8px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
      }}
    >
      {children}
    </button>
  );
}

// compacta: no celular os itens têm que caber numa linha só.
// completa: no painel e na operação, separa "reservada" de "ocupada" — quem
// está na casa precisa saber quem já fez check-in. Pro cliente isso é detalhe
// de operação e as duas aparecem como indisponíveis.
export function LegendaPlanta({ compacta = false, completa = false }: { compacta?: boolean; completa?: boolean }) {
  const itens = completa
    ? [
        { cor: CORES.livre.fundo, label: "Disponível" },
        { cor: CORES.reservada.fundo, label: "Reservada" },
        { cor: CORES.ocupada.fundo, label: "Ocupada" },
        { cor: CORES.pequena.fundo, label: "Indisponível" },
      ]
    : [
        { cor: CORES.livre.fundo, label: "Disponível" },
        { cor: CORES.ocupada.fundo, label: "Ocupada" },
        { cor: CORES.pequena.fundo, label: "Indisponível" },
        { cor: CORES.selecionada.fundo, label: "Selecionada" },
      ];
  return (
    <div className={`flex items-center ${compacta ? "justify-between" : "gap-7 flex-wrap"}`}>
      {itens.map((i) => (
        <span
          key={i.label}
          className={`flex items-center shrink-0 ${compacta ? "gap-1.5 text-[11px]" : "gap-2 text-[12.5px]"}`}
          style={{ color: "var(--color-text-muted)" }}
        >
          <span
            className={`shrink-0 ${compacta ? "w-2.5 h-2.5" : "w-3 h-3"}`}
            style={{ background: i.cor, borderRadius: "3px", border: "1px solid rgba(42,23,18,0.35)" }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
