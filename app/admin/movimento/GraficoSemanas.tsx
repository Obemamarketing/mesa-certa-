// Barras agrupadas: um grupo por dia da semana (sexta, sábado, domingo) e,
// dentro de cada grupo, uma barra por semana — a mais recente à direita. Dá
// pra ver de relance "a sexta desta semana contra as sextas anteriores".
// Desenhado em SVG puro: sem biblioteca de gráficos.

export type TipoDeBarra = "atual" | "anterior" | "antiga" | "futura";

export type BarraGrafico = {
  /** null = ainda não dá pra saber (noite que não aconteceu) */
  valor: number | null;
  /** data curta embaixo da barra, "16/10" */
  rotulo: string;
  /** texto da dica ao passar o mouse */
  dica: string;
  tipo: TipoDeBarra;
};

export type GrupoGrafico = { rotulo: string; barras: BarraGrafico[] };

export const ESTILO_DA_BARRA: Record<TipoDeBarra, { fill: string; stroke?: string; tracejado?: boolean }> = {
  atual: { fill: "var(--color-primary)" },
  anterior: { fill: "var(--color-secondary)" },
  antiga: { fill: "color-mix(in srgb, var(--color-dark) 26%, var(--color-surface))" },
  futura: { fill: "var(--color-primary-soft)", stroke: "var(--color-primary)", tracejado: true },
};

// Teto da escala: sempre múltiplo de 4, pra as 4 linhas de grade caírem em
// números redondos.
const PASSOS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 160, 200, 240, 320, 400, 480, 600, 800, 1000];
function tetoDaEscala(maior: number): number {
  for (const p of PASSOS) if (maior <= p) return p;
  return Math.ceil(maior / 100) * 100;
}

const ALTURA = 250;
const MARGEM_ESQ = 38;
const MARGEM_DIR = 10;
const MARGEM_TOPO = 24;
const MARGEM_BASE = 50;
const ESPACO_ENTRE_BARRAS = 5;
const ESPACO_ENTRE_GRUPOS = 40;

export default function GraficoSemanas({ grupos, descricao }: { grupos: GrupoGrafico[]; descricao: string }) {
  const barrasPorGrupo = grupos[0]?.barras.length ?? 0;
  if (grupos.length === 0 || barrasPorGrupo === 0) return null;

  // Poucas semanas: barras largas, pra o gráfico ocupar o cartão. Muitas:
  // barras estreitas, e o gráfico rola de lado no celular.
  const LARGURA_BARRA = Math.min(46, Math.max(28, Math.round(660 / (grupos.length * barrasPorGrupo))));
  const larguraGrupo = barrasPorGrupo * LARGURA_BARRA + (barrasPorGrupo - 1) * ESPACO_ENTRE_BARRAS;
  const largura = MARGEM_ESQ + MARGEM_DIR + grupos.length * larguraGrupo + (grupos.length - 1) * ESPACO_ENTRE_GRUPOS;
  const alturaUtil = ALTURA - MARGEM_TOPO - MARGEM_BASE;
  const base = MARGEM_TOPO + alturaUtil;

  const maior = Math.max(0, ...grupos.flatMap((g) => g.barras.map((b) => b.valor ?? 0)));
  const teto = tetoDaEscala(maior);
  const y = (v: number) => base - (v / teto) * alturaUtil;

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label={descricao}
        viewBox={`0 0 ${largura} ${ALTURA}`}
        style={{ width: "100%", minWidth: largura, maxWidth: largura * 1.3, height: "auto", display: "block", margin: "0 auto", fontFamily: "inherit" }}
      >
        {/* linhas de grade e valores do eixo */}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (teto / 4) * i;
          return (
            <g key={i}>
              <line
                x1={MARGEM_ESQ}
                x2={largura - MARGEM_DIR}
                y1={y(v)}
                y2={y(v)}
                style={{ stroke: i === 0 ? "var(--color-text-muted)" : "var(--color-border)", strokeWidth: i === 0 ? 1.2 : 1 }}
              />
              <text x={MARGEM_ESQ - 8} y={y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {v}
              </text>
            </g>
          );
        })}

        {grupos.map((grupo, gi) => {
          const x0 = MARGEM_ESQ + gi * (larguraGrupo + ESPACO_ENTRE_GRUPOS);
          return (
            <g key={grupo.rotulo}>
              {grupo.barras.map((barra, bi) => {
                const x = x0 + bi * (LARGURA_BARRA + ESPACO_ENTRE_BARRAS);
                const estilo = ESTILO_DA_BARRA[barra.tipo];
                const altura = barra.valor === null ? 0 : (barra.valor / teto) * alturaUtil;
                return (
                  <g key={bi}>
                    <title>{barra.dica}</title>
                    {barra.valor === null ? (
                      <text x={x + LARGURA_BARRA / 2} y={base - 6} textAnchor="middle" fontSize="11" style={{ fill: "var(--color-text-muted)" }}>
                        –
                      </text>
                    ) : (
                      <>
                        <rect
                          x={x}
                          y={base - altura}
                          width={LARGURA_BARRA}
                          height={Math.max(altura, barra.valor > 0 ? 1.5 : 0)}
                          rx={4}
                          style={{
                            fill: estilo.fill,
                            stroke: estilo.stroke,
                            strokeWidth: estilo.stroke ? 1.4 : 0,
                            strokeDasharray: estilo.tracejado ? "3 3" : undefined,
                          }}
                        />
                        <text
                          x={x + LARGURA_BARRA / 2}
                          y={base - altura - 6}
                          textAnchor="middle"
                          fontSize="11.5"
                          fontWeight={barra.tipo === "atual" ? 700 : 500}
                          style={{ fill: "var(--color-dark)", fontVariantNumeric: "tabular-nums" }}
                        >
                          {barra.valor}
                        </text>
                      </>
                    )}
                    <text x={x + LARGURA_BARRA / 2} y={base + 15} textAnchor="middle" fontSize="10" style={{ fill: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {barra.rotulo}
                    </text>
                  </g>
                );
              })}
              <text
                x={x0 + larguraGrupo / 2}
                y={base + 36}
                textAnchor="middle"
                fontSize="13"
                fontWeight={600}
                style={{ fill: "var(--color-dark)" }}
              >
                {grupo.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
