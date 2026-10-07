// Desenho de mesa vista de cima — tampo de madeira com as cadeiras em volta.
// Usado nos dois lugares da etapa "Escolha sua mesa": nas mesas da planta
// (PlantaRestaurante) e na miniatura dentro dos cards do painel.

import type { Mesa, StatusMesa } from "@/lib/reservas";

export type EstadoMesa = StatusMesa | "selecionada";

// Tampo colorido pelo estado; cadeiras sempre em madeira, pra planta inteira
// ficar com a mesma base terrosa.
// Verde = livre · amarelo = reservada (ainda não chegou) · vinho = ocupada
// (check-in feito) · cinza = indisponível. A tela do cliente junta reservada e
// ocupada numa cor só, porque pra quem reserva as duas significam o mesmo.
export const CORES_ESTADO: Record<EstadoMesa, { tampo: string; aro: string; cadeira: string; texto: string }> = {
  livre: { tampo: "#60733A", aro: "#465428", cadeira: "#9A6F49", texto: "#FCFAF5" },
  reservada: { tampo: "#D99A18", aro: "#96690F", cadeira: "#8A6240", texto: "#2A1712" },
  ocupada: { tampo: "#7F1717", aro: "#5C1010", cadeira: "#8A6240", texto: "#FCFAF5" },
  pequena: { tampo: "#CFC6B6", aro: "#B8AE9B", cadeira: "#C2B49F", texto: "#6E675C" },
  selecionada: { tampo: "#2A1712", aro: "#000000", cadeira: "#8A6240", texto: "#F7F2E8" },
};

// "compacta" é a versão usada na planta de celular: a mesa ocupa quase todo o
// espaço e as cadeiras ficam coladas, pra sobrar área pro número ser legível
// numa tela estreita.
export function raioDaMesa(capacidade: number, compacta = false): number {
  if (compacta) return capacidade <= 2 ? 21 : capacidade <= 4 ? 25 : 29;
  if (capacidade <= 2) return 24;
  if (capacidade <= 4) return 30;
  return 37;
}

type Assento = { dx: number; dy: number; giro: number };

// Cadeiras distribuídas em volta do tampo, viradas para a mesa.
function assentos(mesa: Mesa, raio: number, compacta: boolean): Assento[] {
  const dist = raio + (compacta ? 6 : 11);
  if (mesa.formato === "redonda") {
    return Array.from({ length: mesa.capacidade }, (_, i) => {
      const ang = (Math.PI * 2 * i) / mesa.capacidade - Math.PI / 2;
      return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, giro: (ang * 180) / Math.PI + 90 };
    });
  }
  // Quadrada: uma cadeira por lado ocupado (2 lugares = lados opostos).
  const lados: Assento[] = [
    { dx: 0, dy: -dist, giro: 0 },
    { dx: dist, dy: 0, giro: 90 },
    { dx: 0, dy: dist, giro: 180 },
    { dx: -dist, dy: 0, giro: 270 },
  ];
  return mesa.capacidade <= 2 ? [lados[1], lados[3]] : lados;
}

export function MesaDesenhada({
  mesa,
  cx,
  cy,
  estado,
  mostrarNumero = true,
  compacta = false,
}: {
  mesa: Mesa;
  cx: number;
  cy: number;
  estado: EstadoMesa;
  mostrarNumero?: boolean;
  compacta?: boolean;
}) {
  const raio = raioDaMesa(mesa.capacidade, compacta);
  const cor = CORES_ESTADO[estado];
  const destacada = estado === "selecionada";
  const cadeiraL = compacta ? 11 : 16;
  const cadeiraA = compacta ? 8 : 12;

  return (
    <g>
      {/* halo da mesa escolhida, pra achar de imediato no desenho */}
      {destacada && (
        <circle cx={cx} cy={cy} r={raio + (compacta ? 15 : 26)} fill="#2A1712" opacity="0.14" />
      )}

      {assentos(mesa, raio, compacta).map((a, i) => (
        <rect
          key={i}
          x={cx + a.dx - cadeiraL / 2}
          y={cy + a.dy - cadeiraA / 2}
          width={cadeiraL}
          height={cadeiraA}
          rx={compacta ? 2.5 : 3.5}
          fill={cor.cadeira}
          opacity={estado === "pequena" ? 0.75 : 1}
          transform={`rotate(${a.giro} ${cx + a.dx} ${cy + a.dy})`}
        />
      ))}

      {mesa.formato === "redonda" ? (
        <>
          <circle cx={cx} cy={cy} r={raio} fill={cor.tampo} stroke={cor.aro} strokeWidth="2.5" />
          <circle cx={cx} cy={cy} r={raio - 7} fill="none" stroke={cor.aro} strokeWidth="1" opacity="0.5" />
        </>
      ) : (
        <>
          <rect x={cx - raio} y={cy - raio} width={raio * 2} height={raio * 2} rx="6" fill={cor.tampo} stroke={cor.aro} strokeWidth="2.5" />
          <rect x={cx - raio + 7} y={cy - raio + 7} width={(raio - 7) * 2} height={(raio - 7) * 2} rx="3" fill="none" stroke={cor.aro} strokeWidth="1" opacity="0.5" />
        </>
      )}

      {destacada && (
        <circle cx={cx} cy={cy} r={raio + (compacta ? 5 : 7)} fill="none" stroke="#2A1712" strokeWidth={compacta ? 2 : 2.5} />
      )}

      {mostrarNumero && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={compacta ? (mesa.capacidade >= 6 ? 19 : mesa.capacidade >= 4 ? 17 : 15) : raio >= 37 ? 21 : raio >= 30 ? 18 : 15}
          fontWeight="700"
          fill={cor.texto}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {mesa.numero}
        </text>
      )}
    </g>
  );
}

// Miniatura para os cards do painel: a mesma mesa, sem número, enquadrada.
export function MesaMiniatura({
  mesa,
  estado,
  tamanho = 56,
  compacta = false,
}: {
  mesa: Mesa;
  estado: EstadoMesa;
  tamanho?: number;
  compacta?: boolean;
}) {
  const raio = raioDaMesa(mesa.capacidade, compacta);
  const caixa = (raio + (compacta ? 13 : 24)) * 2;
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${caixa} ${caixa}`} aria-hidden="true" className="shrink-0">
      <MesaDesenhada mesa={mesa} cx={caixa / 2} cy={caixa / 2} estado={estado} mostrarNumero={false} compacta={compacta} />
    </svg>
  );
}
