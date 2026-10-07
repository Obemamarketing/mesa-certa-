"use client";

// Planta do salão do ZéPelin, vista de cima. É REFERÊNCIA VISUAL: mostra onde
// cada mesa fica e como ela está, mas não é por aqui que o cliente escolhe —
// a escolha acontece nos cards do painel ao lado. Por isso nada aqui é
// clicável e o SVG inteiro se apresenta como uma imagem só.

import { mesas, statusMesa, type DiaReserva, type Reserva } from "@/lib/reservas";
import { MesaDesenhada, type EstadoMesa } from "./MesaDesenho";

// Posições fixas das 15 mesas reais do sistema, dentro dos 3 ambientes.
const POSICOES: Record<string, { x: number; y: number }> = {
  // Salão anexo — mesas quadradas, à esquerda
  "12": { x: 95, y: 120 },
  "13": { x: 205, y: 120 },
  "14": { x: 95, y: 265 },
  "15": { x: 205, y: 265 },
  // Salão principal — redondas, no centro
  "05": { x: 370, y: 128 },
  "06": { x: 500, y: 128 },
  "07": { x: 370, y: 262 },
  "08": { x: 500, y: 262 },
  "09": { x: 650, y: 258 },
  "10": { x: 650, y: 392 },
  "11": { x: 420, y: 392 },
  // Palco — mesas de dois, de frente para o tablado
  "01": { x: 585, y: 520 },
  "02": { x: 685, y: 520 },
  "03": { x: 585, y: 620 },
  "04": { x: 685, y: 620 },
};

function Etiqueta({ x, y, texto }: { x: number; y: number; texto: string }) {
  const largura = texto.length * 7.4 + 26;
  return (
    <g>
      <rect x={x - largura / 2} y={y - 13} width={largura} height={26} rx="5" fill="#2A1712" />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11.5"
        fontWeight="700"
        letterSpacing="1.4"
        fill="#F7F2E8"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {texto}
      </text>
    </g>
  );
}

export default function PlantaRestaurante({
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
      viewBox="0 0 1020 700"
      className="w-full h-auto select-none"
      role="img"
      aria-label={
        selecionada
          ? `Planta do salão do ZéPelin. A mesa ${selecionada.numero}, no ${selecionada.zona}, está destacada.`
          : "Planta do salão do ZéPelin, com as mesas por ambiente."
      }
    >
      <defs>
        <pattern id="piso-madeira" width="64" height="15" patternUnits="userSpaceOnUse">
          <rect width="64" height="15" fill="#EFE5D3" />
          <line x1="0" y1="14.5" x2="64" y2="14.5" stroke="#E2D5BC" strokeWidth="1" />
          <line x1="32" y1="0" x2="32" y2="15" stroke="#E2D5BC" strokeWidth="1" />
        </pattern>
        <pattern id="piso-anexo" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#ECE1CC" />
          <rect width="34" height="34" fill="none" stroke="#DFD2B8" strokeWidth="1" />
        </pattern>
        <pattern id="area-servico" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill="#E6DCCA" />
          <line x1="0" y1="0" x2="0" y2="12" stroke="#D5C8B0" strokeWidth="3.5" />
        </pattern>
        <pattern id="tapete-palco" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#6E2A22" />
          <circle cx="9" cy="9" r="1.4" fill="#8A3A30" />
        </pattern>
      </defs>

      {/* piso por ambiente */}
      <rect x="18" y="18" width="984" height="664" fill="url(#piso-madeira)" />
      <rect x="18" y="18" width="267" height="382" fill="url(#piso-anexo)" />
      <rect x="745" y="18" width="257" height="242" fill="url(#area-servico)" />
      <rect x="600" y="18" width="145" height="132" fill="url(#area-servico)" />
      <rect x="285" y="455" width="460" height="227" fill="#F3EADA" />

      {/* ---------- COZINHA ---------- */}
      <g>
        <rect x="762" y="60" width="224" height="34" rx="4" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.5" />
        <rect x="762" y="112" width="104" height="30" rx="4" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.5" />
        <rect x="882" y="112" width="104" height="30" rx="4" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.5" />
        <rect x="762" y="160" width="224" height="26" rx="4" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.5" />
        <Etiqueta x={874} y={228} texto="COZINHA" />
      </g>

      {/* ---------- BANHEIROS ---------- */}
      <g>
        <line x1="672" y1="18" x2="672" y2="112" stroke="#2A1712" strokeWidth="4" />
        <circle cx="636" cy="56" r="11" fill="none" stroke="#9A9083" strokeWidth="2.5" />
        <circle cx="709" cy="56" r="11" fill="none" stroke="#9A9083" strokeWidth="2.5" />
        <Etiqueta x={672} y={131} texto="BANHEIROS" />
      </g>

      {/* ---------- BAR / CAIXA ---------- */}
      <g>
        <path d="M770 452 h216 v34 h-182 v170 h-34 Z" fill="#8A5A32" stroke="#5F3D20" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M782 464 h192" stroke="#A9733F" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => (
          <circle key={`b${i}`} cx={866 + i * 42} cy={512} r="11" fill="#9A6F49" stroke="#6E4A2C" strokeWidth="1.5" />
        ))}
        {[0, 1, 2].map((i) => (
          <circle key={`c${i}`} cx={830} cy={522 + i * 46} r="11" fill="#9A6F49" stroke="#6E4A2C" strokeWidth="1.5" />
        ))}
        <rect x="892" y="588" width="60" height="42" rx="5" fill="#CFC6B6" stroke="#B8AE9B" strokeWidth="1.5" />
        <Etiqueta x={874} y={424} texto="BAR / CAIXA" />
      </g>

      {/* ---------- PALCO ---------- */}
      <g>
        <path d="M298 668 V490 L505 668 Z" fill="url(#tapete-palco)" stroke="#4A1A14" strokeWidth="3" strokeLinejoin="round" />
        {/* instrumentos, só como marcação do tablado */}
        <circle cx="352" cy="608" r="18" fill="none" stroke="#C98A3C" strokeWidth="2.5" opacity="0.85" />
        <circle cx="352" cy="608" r="7" fill="#C98A3C" opacity="0.6" />
        <rect x="392" y="628" width="44" height="12" rx="3" fill="#C98A3C" opacity="0.7" />
        <rect x="318" y="520" width="12" height="40" rx="3" fill="#C98A3C" opacity="0.55" />
        <Etiqueta x={372} y={476} texto="PALCO" />
      </g>

      {/* ---------- ENTRADA ---------- */}
      <g>
        <path d="M150 650 V596" stroke="#2A1712" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M136 612 L150 596 L164 612" fill="none" stroke="#2A1712" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <Etiqueta x={150} y={672} texto="ENTRADA" />
      </g>

      {/* ---------- rótulos de ambiente ---------- */}
      <Etiqueta x={150} y={370} texto="SALÃO ANEXO" />
      <Etiqueta x={378} y={48} texto="SALÃO PRINCIPAL" />

      {/* ---------- paredes ---------- */}
      <g stroke="#2A1712" fill="none" strokeLinejoin="round">
        <rect x="18" y="18" width="984" height="664" strokeWidth="9" />
        <path d="M285 18 V682" strokeWidth="6" />
        <path d="M745 18 V682" strokeWidth="6" />
        <path d="M18 400 H285" strokeWidth="6" />
        <path d="M285 455 H745" strokeWidth="6" />
        <path d="M600 18 V150 H745" strokeWidth="6" />
        <path d="M745 260 H1002" strokeWidth="6" />
        <path d="M745 400 H1002" strokeWidth="6" />
        {/* vãos de passagem: trechos claros por cima da parede */}
        <path d="M285 300 V360" strokeWidth="8" stroke="#EFE5D3" />
        <path d="M285 520 V580" strokeWidth="8" stroke="#F3EADA" />
        <path d="M745 300 V350" strokeWidth="8" stroke="#E6DCCA" />
        <path d="M18 596 V650" strokeWidth="11" stroke="#EFE5D3" />
      </g>

      {/* ---------- mesas ---------- */}
      {mesas.map((m) => {
        const pos = POSICOES[m.numero];
        if (!pos) return null;
        const status = statusMesa(reservas, dia, horario, m, pessoasMin);
        const estado: EstadoMesa = mesaSelecionada === m.numero ? "selecionada" : status;
        return <MesaDesenhada key={m.numero} mesa={m} cx={pos.x} cy={pos.y} estado={estado} />;
      })}
    </svg>
  );
}

// compacta: no celular os quatro itens têm que caber numa linha só.
export function LegendaPlanta({ compacta = false }: { compacta?: boolean }) {
  const itens = [
    { cor: "#60733A", label: "Disponível" },
    { cor: "#7F1717", label: "Ocupada" },
    { cor: "#CFC6B6", label: "Indisponível" },
    { cor: "#D99A18", label: "Selecionada" },
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
            className={`rounded-full shrink-0 ${compacta ? "w-2.5 h-2.5" : "w-3 h-3"}`}
            style={{ background: i.cor }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
