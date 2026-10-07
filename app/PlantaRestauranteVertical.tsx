"use client";

// Mesma planta do ZéPelin, redesenhada em pé para o celular. A versão de
// desktop (PlantaRestaurante) é deitada e, numa tela estreita, os números das
// mesas ficariam pequenos demais — aqui os ambientes são empilhados e as mesas
// ocupam mais espaço, então dá pra ler mesa por mesa sem apertar nem arrastar.
//
// A geografia é a mesma: anexo à esquerda, salão principal no centro, palco e
// entrada embaixo, cozinha/banheiros/bar na faixa da direita.
//
// Continua sendo só referência visual: a escolha acontece nos cards.

import { mesas, statusMesa, type DiaReserva, type Reserva } from "@/lib/reservas";
import { MesaDesenhada, type EstadoMesa } from "./MesaDesenho";

const POSICOES: Record<string, { x: number; y: number }> = {
  // Salão anexo — quadradas, coluna da esquerda
  "12": { x: 62, y: 80 },
  "13": { x: 150, y: 80 },
  "14": { x: 62, y: 190 },
  "15": { x: 150, y: 190 },
  // Salão principal — redondas, coluna do meio
  "05": { x: 248, y: 65 },
  "06": { x: 342, y: 65 },
  "07": { x: 248, y: 150 },
  "08": { x: 342, y: 150 },
  "09": { x: 248, y: 240 },
  "10": { x: 342, y: 240 },
  "11": { x: 295, y: 325 },
  // Palco — faixa de baixo, de frente para o tablado
  "01": { x: 268, y: 442 },
  "02": { x: 348, y: 442 },
  "03": { x: 268, y: 508 },
  "04": { x: 348, y: 508 },
};

function Etiqueta({ x, y, texto }: { x: number; y: number; texto: string }) {
  const largura = texto.length * 5.9 + 20;
  return (
    <g>
      <rect x={x - largura / 2} y={y - 10} width={largura} height="20" rx="4" fill="#2A1712" />
      <text
        x={x}
        y={y + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9.5"
        fontWeight="700"
        letterSpacing="0.9"
        fill="#F7F2E8"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {texto}
      </text>
    </g>
  );
}

export default function PlantaRestauranteVertical({
  reservas,
  dia,
  horario,
  mesaSelecionada,
  pessoasMin,
}: {
  reservas: Reserva[];
  dia: DiaReserva;
  horario: string;
  mesaSelecionada: string | null;
  pessoasMin?: number;
}) {
  const selecionada = mesas.find((m) => m.numero === mesaSelecionada);

  return (
    <svg
      viewBox="0 0 520 560"
      className="w-full h-auto select-none"
      role="img"
      aria-label={
        selecionada
          ? `Planta do salão do ZéPelin. A mesa ${selecionada.numero}, no ${selecionada.zona}, está destacada.`
          : "Planta do salão do ZéPelin, com as mesas por ambiente."
      }
    >
      {/* ids com sufixo -v: a planta deitada também fica no DOM nesta página */}
      <defs>
        <pattern id="piso-madeira-v" width="46" height="11" patternUnits="userSpaceOnUse">
          <rect width="46" height="11" fill="#EFE5D3" />
          <line x1="0" y1="10.5" x2="46" y2="10.5" stroke="#E2D5BC" strokeWidth="1" />
          <line x1="23" y1="0" x2="23" y2="11" stroke="#E2D5BC" strokeWidth="1" />
        </pattern>
        <pattern id="piso-anexo-v" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill="#ECE1CC" />
          <rect width="26" height="26" fill="none" stroke="#DFD2B8" strokeWidth="1" />
        </pattern>
        <pattern id="area-servico-v" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#E6DCCA" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#D5C8B0" strokeWidth="3" />
        </pattern>
        <pattern id="tapete-palco-v" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#6E2A22" />
          <circle cx="7" cy="7" r="1.2" fill="#8A3A30" />
        </pattern>
      </defs>

      {/* pisos */}
      <rect x="10" y="10" width="500" height="540" fill="url(#piso-madeira-v)" />
      <rect x="10" y="10" width="190" height="390" fill="url(#piso-anexo-v)" />
      <rect x="390" y="10" width="120" height="205" fill="url(#area-servico-v)" />
      <rect x="10" y="400" width="380" height="150" fill="#F3EADA" />

      {/* ---------- BANHEIROS ---------- */}
      <g>
        <line x1="450" y1="10" x2="450" y2="66" stroke="#2A1712" strokeWidth="3" />
        <circle cx="424" cy="40" r="9" fill="none" stroke="#9A9083" strokeWidth="2" />
        <circle cx="476" cy="40" r="9" fill="none" stroke="#9A9083" strokeWidth="2" />
        <Etiqueta x={450} y={84} texto="BANHEIROS" />
      </g>

      {/* ---------- COZINHA ---------- */}
      <g>
        <rect x="400" y="118" width="100" height="16" rx="3" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.2" />
        <rect x="400" y="144" width="46" height="14" rx="3" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.2" />
        <rect x="454" y="144" width="46" height="14" rx="3" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.2" />
        <Etiqueta x={450} y={178} texto="COZINHA" />
      </g>

      {/* ---------- BAR / CAIXA ---------- */}
      <g>
        <rect x="398" y="258" width="34" height="266" rx="4" fill="#8A5A32" stroke="#5F3D20" strokeWidth="2" />
        <line x1="406" y1="268" x2="406" y2="514" stroke="#A9733F" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={458} cy={288 + i * 52} r="9" fill="#9A6F49" stroke="#6E4A2C" strokeWidth="1.2" />
        ))}
        <Etiqueta x={450} y={236} texto="BAR / CAIXA" />
      </g>

      {/* ---------- PALCO ---------- */}
      <g>
        <path d="M105 542 V425 L215 542 Z" fill="url(#tapete-palco-v)" stroke="#4A1A14" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="140" cy="500" r="13" fill="none" stroke="#C98A3C" strokeWidth="2" opacity="0.85" />
        <circle cx="140" cy="500" r="5" fill="#C98A3C" opacity="0.6" />
        <rect x="118" y="452" width="9" height="28" rx="2.5" fill="#C98A3C" opacity="0.55" />
        <Etiqueta x={165} y={412} texto="PALCO" />
      </g>

      {/* ---------- ENTRADA ---------- */}
      <g>
        <path d="M48 512 V466" stroke="#2A1712" strokeWidth="3" strokeLinecap="round" />
        <path d="M36 478 L48 466 L60 478" fill="none" stroke="#2A1712" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Etiqueta x={48} y={530} texto="ENTRADA" />
      </g>

      {/* ---------- rótulos de ambiente ---------- */}
      <Etiqueta x={100} y={300} texto="SALÃO ANEXO" />
      <Etiqueta x={295} y={385} texto="SALÃO PRINCIPAL" />

      {/* ---------- paredes ---------- */}
      <g stroke="#2A1712" fill="none" strokeLinejoin="round">
        <rect x="10" y="10" width="500" height="540" strokeWidth="7" />
        <path d="M200 10 V400" strokeWidth="4.5" />
        <path d="M390 10 V550" strokeWidth="4.5" />
        <path d="M10 400 H390" strokeWidth="4.5" />
        <path d="M390 100 H510" strokeWidth="4.5" />
        <path d="M390 215 H510" strokeWidth="4.5" />
        {/* vãos de passagem */}
        <path d="M200 230 V280" strokeWidth="6" stroke="#EFE5D3" />
        <path d="M250 400 H310" strokeWidth="6" stroke="#F3EADA" />
        <path d="M390 300 V345" strokeWidth="6" stroke="#E6DCCA" />
        <path d="M10 478 V524" strokeWidth="9" stroke="#F3EADA" />
      </g>

      {/* ---------- mesas ---------- */}
      {mesas.map((m) => {
        const pos = POSICOES[m.numero];
        if (!pos) return null;
        const status = statusMesa(reservas, dia, horario, m, pessoasMin);
        const estado: EstadoMesa = mesaSelecionada === m.numero ? "selecionada" : status;
        return <MesaDesenhada key={m.numero} mesa={m} cx={pos.x} cy={pos.y} estado={estado} compacta />;
      })}
    </svg>
  );
}
