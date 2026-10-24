import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { cardapio, type ItemDoCardapio, type SecaoDoCardapio } from "@/lib/cardapio";
import RodapeLegal from "../RodapeLegal";

export const metadata: Metadata = {
  title: `Cardápio · ${reservaBrand.restauranteAtual}`,
  description: `Petiscos, sobremesas, drinks, doses e cervejas do ${reservaBrand.restauranteAtual}.`,
};

// As faixas de título seguem o cardápio impresso: comida em vinho, bebida em verde.
const COR_DO_TIPO: Record<SecaoDoCardapio["tipo"], string> = {
  comida: "var(--color-primary)",
  bebida: "var(--color-accent-dark)",
};

export default function CardapioPage() {
  const comidas = cardapio.filter((s) => s.tipo === "comida");
  const bebidas = cardapio.filter((s) => s.tipo === "bebida");

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between gap-4 px-5 sm:px-10 py-4 max-w-6xl w-full mx-auto">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <Image src="/logo-zeplin.jpg" alt="" width={42} height={42} className="rounded-full shrink-0" />
          <span className="font-display text-[21px] leading-none truncate" style={{ color: "var(--color-dark)" }}>
            {reservaBrand.restauranteAtual}
          </span>
        </Link>
        <Link href="/consulta" className="text-sm font-medium shrink-0" style={{ color: "var(--color-primary)" }}>
          Consultar reserva
        </Link>
      </header>

      <div className="max-w-6xl w-full mx-auto px-5 sm:px-10 pt-4 sm:pt-8 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: "var(--color-text-muted)" }}>
            Restaurante &amp; Bar
          </span>
          <h1 className="font-display text-[44px] sm:text-[56px] leading-[1.05]" style={{ color: "var(--color-dark)" }}>
            Cardápio
          </h1>
          <p className="text-[15px] max-w-md" style={{ color: "var(--color-text-muted)" }}>
            Petiscos para dividir, drinks autorais e cerveja gelada. Reserve sua mesa e venha provar.
          </p>
        </div>
        <BotaoReservar />
      </div>

      {/* atalhos para cada parte; fica preso no topo enquanto a pessoa rola */}
      <nav
        aria-label="Partes do cardápio"
        className="sticky top-0 z-10"
        style={{ background: "var(--color-bg)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}
      >
        <ul className="max-w-6xl mx-auto px-5 sm:px-10 py-2.5 flex gap-2 overflow-x-auto">
          {cardapio.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                className="block px-3.5 py-1.5 text-[13.5px] font-semibold border whitespace-nowrap"
                style={{ borderRadius: "999px", borderColor: "var(--color-border)", background: "var(--color-surface)", color: COR_DO_TIPO[s.tipo] }}
              >
                {s.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-6xl w-full mx-auto px-5 sm:px-10 py-8 grid gap-10 lg:grid-cols-2 lg:gap-14 items-start">
        <div className="flex flex-col gap-10 min-w-0">
          {comidas.map((s) => (
            <Secao key={s.id} secao={s} />
          ))}
        </div>
        <div className="flex flex-col gap-10 min-w-0">
          {bebidas.map((s) => (
            <Secao key={s.id} secao={s} />
          ))}
        </div>
      </div>

      <footer className="max-w-6xl w-full mx-auto px-5 sm:px-10 pb-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5" >
        <p className="text-[13px] leading-relaxed max-w-md" style={{ color: "var(--color-text-muted)" }}>
          Cardápio sujeito a alterações. Valores e disponibilidade do dia direto com a equipe do {reservaBrand.restauranteAtual}. Tem alergia ou
          restrição alimentar? Avise a equipe antes de pedir.
          <br />
          <strong style={{ color: "var(--color-dark)" }}>Venda de bebidas alcoólicas proibida para menores de 18 anos. Beba com moderação. Se beber, não dirija.</strong>
        </p>
        <BotaoReservar />
      </footer>
      <RodapeLegal />
    </main>
  );
}

function BotaoReservar() {
  return (
    <Link
      href="/"
      className="self-start sm:self-auto inline-flex items-center gap-2 px-6 py-3.5 text-[14.5px] font-semibold text-white shrink-0"
      style={{ background: "var(--color-primary)", borderRadius: "999px" }}
    >
      Reservar uma mesa
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function Secao({ secao }: { secao: SecaoDoCardapio }) {
  const cor = COR_DO_TIPO[secao.tipo];
  return (
    <section id={secao.id} className="scroll-mt-20 flex flex-col gap-5" aria-labelledby={`titulo-${secao.id}`}>
      <h2
        id={`titulo-${secao.id}`}
        className="font-display text-[30px] leading-none pb-3"
        style={{ color: cor, borderBottom: `2px solid ${cor}` }}
      >
        {secao.titulo}
      </h2>

      {secao.grupos.map((g, i) => (
        <div key={g.titulo ?? i} className="flex flex-col gap-4">
          {g.titulo && (
            <p className="text-[12px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>
              {g.titulo}
            </p>
          )}
          {secao.compacta ? (
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
              {g.itens.map((item, j) => (
                <li key={`${item.nome}-${j}`} className="text-[15px] leading-snug" style={{ color: "var(--color-dark)" }}>
                  <span className="font-semibold">{item.nome}</span>
                  {item.detalhe && <span style={{ color: "var(--color-text-muted)" }}> · {item.detalhe}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-5">
              {g.itens.map((item, j) => (
                <Item key={`${item.nome}-${j}`} item={item} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function Item({ item }: { item: ItemDoCardapio }) {
  return (
    <li className="flex flex-col gap-1">
      <p className="text-[16.5px] leading-snug" style={{ color: "var(--color-dark)" }}>
        <span className="font-bold">{item.nome}</span>
        {item.detalhe && <span className="font-medium" style={{ color: "var(--color-text-muted)" }}> {item.detalhe.startsWith("que") ? item.detalhe : `(${item.detalhe})`}</span>}
      </p>
      {item.autor && (
        <p className="text-[12.5px] italic" style={{ color: "var(--color-text-muted)" }}>
          por {item.autor}
        </p>
      )}
      {item.descricao && (
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          {item.descricao}
        </p>
      )}
      {item.opcoes && (
        <dl className="flex flex-col gap-1 mt-0.5 text-[14px] leading-relaxed">
          {item.opcoes.map((o) => (
            <div key={o.nome}>
              <dt className="inline font-semibold" style={{ color: "var(--color-dark)" }}>{o.nome}</dt>
              <dd className="inline" style={{ color: "var(--color-text-muted)" }}> — {o.descricao}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
