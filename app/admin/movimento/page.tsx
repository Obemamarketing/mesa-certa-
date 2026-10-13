"use client";

// Movimento do restaurante: quantas mesas foram reservadas, quantas pessoas
// vieram, noite a noite e semana contra semana. Os cálculos moram em
// lib/movimento.ts; aqui só se desenha.

import { useMemo, useState } from "react";
import { relogioSaoPaulo, useReservas } from "@/lib/reservas";
import { useMesasConfig } from "@/lib/mesas";
import { useAgora } from "@/lib/relogio";
import { ZONAS_DA_PLANTA } from "@/lib/regras";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  contarPor,
  csvDoMovimento,
  dataDoDiaNaSemana,
  montarDias,
  montarSemanas,
  segundaDaSemana,
  somar,
  somarDias,
  totalDaMetrica,
  valorDaMetrica,
  valorNaData,
  variacao,
  type DiaMovimento,
  type Metrica,
} from "@/lib/movimento";
import { baixarCsv, nomeDoArquivo } from "@/lib/exportar";
import GraficoSemanas, { ESTILO_DA_BARRA, type GrupoGrafico, type TipoDeBarra } from "./GraficoSemanas";

const NOME_DIA: Record<number, string> = { 5: "Sexta", 6: "Sábado", 0: "Domingo" };
const ORDEM_DOS_DIAS = [5, 6, 0];

const METRICAS: { chave: Metrica; rotulo: string; unidade: string }[] = [
  { chave: "chegaram", rotulo: "Pessoas que vieram", unidade: "pessoas que vieram" },
  { chave: "pessoas", rotulo: "Pessoas reservadas", unidade: "pessoas reservadas" },
  { chave: "mesas", rotulo: "Mesas reservadas", unidade: "mesas reservadas" },
];

const PERIODOS = [4, 8, 12] as const;

const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const numero = (n: number) => n.toLocaleString("pt-BR");

const cartao = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
} as const;

export default function MovimentoPage() {
  const { reservas, carregando } = useReservas();
  const { mesas } = useMesasConfig();
  const agora = useAgora(60000);
  const hojeIso = (agora ? relogioSaoPaulo(agora) : relogioSaoPaulo()).iso;

  const [numSemanas, setNumSemanas] = useState<(typeof PERIODOS)[number]>(4);
  const [metricaEscolhida, setMetricaEscolhida] = useState<Metrica | null>(null);

  const d = useMemo(() => {
    const dias = montarDias(reservas, hojeIso);
    const segundaAtual = segundaDaSemana(hojeIso);
    const inicio = somarDias(segundaAtual, -7 * (numSemanas - 1));

    // até onde mostrar: o fim de semana que vem (previsto), no máximo
    const limite = somarDias(segundaAtual, 14);
    const maisAFrente = dias.reduce((m, x) => (x.semana > m ? x.semana : m), segundaAtual);
    const fim = maisAFrente > limite ? limite : maisAFrente;
    const semanas = montarSemanas(dias, inicio, fim);

    // totais de todas as semanas (pra comparar também a primeira da lista com a anterior)
    const porSemana = new Map<string, DiaMovimento[]>();
    for (const x of dias) porSemana.set(x.semana, [...(porSemana.get(x.semana) ?? []), x]);
    const totalDaSemana = (segunda: string) => somar(porSemana.get(segunda) ?? []);

    // período atual: do começo da primeira semana até hoje. O anterior tem o
    // mesmo tamanho, 7×N dias antes — assim a comparação é justa mesmo no meio
    // da semana.
    const deslocamento = 7 * numSemanas;
    const doPeriodo = dias.filter((x) => x.data >= inicio && x.data <= hojeIso);
    const doAnterior = dias.filter((x) => x.data >= somarDias(inicio, -deslocamento) && x.data <= somarDias(hojeIso, -deslocamento));

    return {
      dias,
      segundaAtual,
      inicio,
      semanas,
      totalDaSemana,
      atual: somar(doPeriodo),
      anterior: somar(doAnterior),
      passadas: somar(doPeriodo.filter((x) => x.situacao === "passada")),
    };
  }, [reservas, hojeIso, numSemanas]);

  const metrica: Metrica = metricaEscolhida ?? (d.atual.chegaram > 0 ? "chegaram" : "pessoas");
  const info = METRICAS.find((m) => m.chave === metrica)!;
  const totalDeMesas = mesas.length;

  const semData = reservas.filter((r) => !r.dataReserva).length;
  const semCheckin = d.atual.pessoas > 0 && d.atual.chegaram === 0;

  // ---------- gráfico: dia da semana × semana ----------
  const semanaPassada = somarDias(d.segundaAtual, -7);
  const tipoDaSemana = (segunda: string): TipoDeBarra =>
    segunda === d.segundaAtual ? "atual" : segunda === semanaPassada ? "anterior" : segunda > d.segundaAtual ? "futura" : "antiga";

  const grupos: GrupoGrafico[] = ORDEM_DOS_DIAS.map((dow) => ({
    rotulo: NOME_DIA[dow],
    barras: d.semanas.map((s) => {
      const valor = valorNaData(s, dow, metrica, hojeIso);
      const data = dataDoDiaNaSemana(s.segunda, dow);
      return {
        valor,
        rotulo: curta(data),
        tipo: tipoDaSemana(s.segunda),
        dica: `${NOME_DIA[dow]} ${curta(data)} — ${valor === null ? "a noite ainda não aconteceu" : `${numero(valor)} ${info.unidade}`}`,
      };
    }),
  }));

  const legenda: { tipo: TipoDeBarra; texto: string }[] = [];
  for (const s of d.semanas) {
    const t = tipoDaSemana(s.segunda);
    const texto =
      t === "atual" ? `Esta semana (${curta(s.sexta)})` : t === "anterior" ? `Semana passada (${curta(s.sexta)})` : t === "futura" ? `Próxima, prevista (${curta(s.sexta)})` : "Semanas anteriores";
    if (!legenda.some((l) => l.tipo === t)) legenda.push({ tipo: t, texto });
  }

  // ---------- por semana ----------
  const linhasSemana = [...d.semanas].reverse().map((s) => {
    const futura = s.segunda > d.segundaAtual;
    const completa = somarDias(s.segunda, 6) < hojeIso;
    const valor = metrica === "chegaram" && futura ? null : totalDaMetrica(s.totais, metrica);
    const anterior = totalDaMetrica(d.totalDaSemana(somarDias(s.segunda, -7)), metrica);
    return { semana: s, valor, futura, completa, variacao: completa && valor !== null ? variacao(valor, anterior) : null };
  });
  const maiorSemana = Math.max(1, ...linhasSemana.map((l) => l.valor ?? 0));

  // ---------- dia a dia ----------
  const linhasDia = d.semanas
    .flatMap((s) => [...s.dias.values()])
    .filter((x) => x.mesas > 0 || x.canceladas > 0)
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((x) => {
      const anterior = valorDaMetrica(
        d.dias.find((y) => y.data === somarDias(x.data, -7)),
        metrica,
      );
      const valor = valorDaMetrica(x, metrica);
      const semBase = x.situacao === "futura" && metrica === "chegaram";
      return { dia: x, valor, variacao: semBase ? null : variacao(valor, anterior) };
    });

  // ---------- áreas e mesas ----------
  const zonaDaMesa = new Map(mesas.map((m) => [m.numero, m.zona as string]));
  const porArea = contarPor(reservas, d.inicio, hojeIso, (r) => zonaDaMesa.get(r.mesaNumero));
  const areas = ZONAS_DA_PLANTA.map((z) => ({ chave: z as string, total: porArea.find((a) => a.chave === z)?.total ?? 0 }));
  const totalAreas = areas.reduce((s, a) => s + a.total, 0);
  const maisReservadas = contarPor(reservas, d.inicio, hojeIso, (r) => r.mesaNumero).slice(0, 5);
  const maiorMesa = Math.max(1, ...maisReservadas.map((m) => m.total));

  // Baixa as noites do período em planilha (mais antigas primeiro, como numa
  // planilha de verdade).
  function baixarPlanilha() {
    const csv = csvDoMovimento(
      [...linhasDia].reverse().map((l) => l.dia),
      totalDeMesas,
    );
    baixarCsv(nomeDoArquivo("movimento", reservaBrand.restauranteAtual, hojeIso), csv);
  }

  const comparecimento = d.passadas.pessoas > 0 ? d.passadas.chegaram / d.passadas.pessoas : null;
  const mediaDeMesasPorNoite = d.atual.noites > 0 ? d.atual.mesas / d.atual.noites : 0;

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[40px] leading-tight">Movimento</h1>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--color-text-muted)" }}>
            Quantas mesas foram reservadas e quantas pessoas vieram, noite a noite e semana contra semana.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1" style={{ ...cartao, borderRadius: "999px" }} role="group" aria-label="Período">
          {PERIODOS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNumSemanas(n)}
              aria-pressed={numSemanas === n}
              className="px-4 py-1.5 text-[13.5px] font-semibold"
              style={{
                borderRadius: "999px",
                background: numSemanas === n ? "var(--color-primary)" : "transparent",
                color: numSemanas === n ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {n} semanas
            </button>
          ))}
        </div>
      </div>

      {semData > 0 && (
        <p className="text-[13px] px-4 py-3" style={{ ...cartao, borderColor: "var(--color-secondary)" }}>
          <strong>{semData} reserva{semData === 1 ? "" : "s"} antiga{semData === 1 ? "" : "s"} sem data gravada</strong> ficam fora destes números. Rode{" "}
          <code>supabase-migration-datas.sql</code> no Supabase para incluí-las.
        </p>
      )}

      {!carregando && d.dias.length === 0 ? (
        <div className="px-6 py-10 text-center" style={cartao}>
          <p className="font-display text-xl">Ainda não há movimento para mostrar</p>
          <p className="text-sm mt-1.5" style={{ color: "var(--color-text-muted)" }}>
            Assim que houver reservas, os números aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          {semCheckin && (
            <p className="text-[13px] px-4 py-3" style={{ ...cartao, borderColor: "var(--color-secondary)" }}>
              <strong>Nenhuma chegada registrada neste período.</strong> O número de pessoas que vieram só aparece quando a equipe marca{" "}
              <em>Cliente chegou</em> no Modo operação. Quem chega sem reserva não entra nessa conta.
            </p>
          )}

          {/* ---------- indicadores ---------- */}
          <section aria-label="Resumo do período" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Pessoas que vieram"
              valor={numero(d.atual.chegaram)}
              variacao={variacao(d.atual.chegaram, d.anterior.chegaram)}
              rodape={d.atual.noites > 0 ? `${numero(Math.round(d.atual.chegaram / d.atual.noites))} por noite, em média` : "Sem noites ainda"}
            />
            <Indicador
              rotulo="Pessoas reservadas"
              valor={numero(d.atual.pessoas)}
              variacao={variacao(d.atual.pessoas, d.anterior.pessoas)}
              rodape={`${numero(d.atual.reservas)} reserva${d.atual.reservas === 1 ? "" : "s"} de clientes`}
            />
            <Indicador
              rotulo="Mesas reservadas"
              valor={numero(d.atual.mesas)}
              variacao={variacao(d.atual.mesas, d.anterior.mesas)}
              rodape={
                totalDeMesas > 0 && d.atual.noites > 0
                  ? `Ocupação média de ${pct(mediaDeMesasPorNoite / totalDeMesas)} das ${totalDeMesas} mesas`
                  : "Sem noites ainda"
              }
            />
            <Indicador
              rotulo="Comparecimento"
              valor={comparecimento === null ? "—" : pct(comparecimento)}
              rodape={`${numero(d.passadas.naoVieram)} não ${d.passadas.naoVieram === 1 ? "veio" : "vieram"} · ${numero(d.atual.canceladas)} mesa${d.atual.canceladas === 1 ? "" : "s"} cancelada${d.atual.canceladas === 1 ? "" : "s"}`}
            />
          </section>
          <p className="text-[12px] -mt-3" style={{ color: "var(--color-text-muted)" }}>
            De {curta(d.inicio)} até hoje ({curta(hojeIso)}). A variação compara com os mesmos dias das {numSemanas} semanas anteriores.
          </p>

          {/* ---------- escolha da medida ---------- */}
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="O que comparar">
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
              Comparar:
            </span>
            {METRICAS.map((m) => (
              <button
                key={m.chave}
                type="button"
                onClick={() => setMetricaEscolhida(m.chave)}
                aria-pressed={metrica === m.chave}
                className="px-3.5 py-2 text-[13.5px] font-semibold border"
                style={{
                  borderRadius: "999px",
                  borderColor: metrica === m.chave ? "var(--color-primary)" : "var(--color-border)",
                  background: metrica === m.chave ? "var(--color-primary-soft)" : "var(--color-surface)",
                  color: metrica === m.chave ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                {m.rotulo}
              </button>
            ))}
          </div>

          {/* ---------- semana contra semana, dia a dia ---------- */}
          <section className="p-5 flex flex-col gap-4" style={cartao}>
            <div>
              <h2 className="font-display text-[22px] leading-tight">Cada dia, semana contra semana</h2>
              <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                {info.rotulo} em cada sexta, sábado e domingo. Dentro de cada dia, as semanas vão da mais antiga à mais recente.
              </p>
            </div>

            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
              {legenda.map((l) => (
                <span key={l.tipo} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
                  <span
                    className="w-3.5 h-3.5 shrink-0"
                    style={{
                      background: ESTILO_DA_BARRA[l.tipo].fill,
                      border: ESTILO_DA_BARRA[l.tipo].stroke ? `1.5px dashed ${ESTILO_DA_BARRA[l.tipo].stroke}` : undefined,
                      borderRadius: "4px",
                    }}
                  />
                  {l.texto}
                </span>
              ))}
            </div>

            <GraficoSemanas
              grupos={grupos}
              descricao={`${info.rotulo} por dia da semana, comparando as últimas ${numSemanas} semanas`}
            />
          </section>

          {/* ---------- total de cada semana ---------- */}
          <section className="p-5 flex flex-col gap-4" style={cartao}>
            <div>
              <h2 className="font-display text-[22px] leading-tight">Total de cada semana</h2>
              <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                {info.rotulo} no fim de semana inteiro (sexta a domingo). A variação aparece quando a semana já terminou.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {linhasSemana.map((l) => {
                const atual = l.semana.segunda === d.segundaAtual;
                return (
                  <li key={l.semana.segunda} className="grid items-center gap-x-4 gap-y-1.5 grid-cols-[1fr_auto] sm:grid-cols-[170px_1fr_auto_74px]">
                    <span className="text-[14px] font-semibold flex items-center gap-2 flex-wrap">
                      Fim de semana de {curta(l.semana.sexta)}
                      {atual && <Etiqueta cor="var(--color-primary)" fundo="var(--color-primary-soft)">em andamento</Etiqueta>}
                      {l.futura && <Etiqueta cor="var(--color-secondary-dark)" fundo="var(--color-secondary-soft)">previsto</Etiqueta>}
                    </span>
                    <span className="order-last sm:order-none col-span-2 sm:col-span-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${l.valor === null ? 0 : (l.valor / maiorSemana) * 100}%`,
                          background: atual ? "var(--color-primary)" : l.futura ? "var(--color-primary-soft)" : "var(--color-accent)",
                        }}
                      />
                    </span>
                    <span className="text-[16px] font-bold tabular-nums text-right">{l.valor === null ? "—" : numero(l.valor)}</span>
                    <span className="hidden sm:block text-right">
                      <Variacao valor={l.variacao} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---------- noite a noite ---------- */}
          <section style={cartao}>
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-display text-[22px] leading-tight">Noite a noite</h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  A última coluna compara {info.rotulo.toLowerCase()} com o mesmo dia da semana anterior.
                </p>
              </div>
              <button
                type="button"
                onClick={baixarPlanilha}
                disabled={linhasDia.length === 0}
                title="Baixa as noites deste período em um arquivo que abre no Excel e no Google Planilhas"
                className="flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold border disabled:opacity-40"
                style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
                </svg>
                Baixar planilha
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px] tabular-nums" style={{ minWidth: 760 }}>
                <thead>
                  <tr style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
                    <Th esquerda>Noite</Th>
                    <Th>Mesas</Th>
                    <Th>Pessoas reservadas</Th>
                    <Th>Vieram</Th>
                    <Th>Não vieram</Th>
                    <Th>Canceladas</Th>
                    <Th>Ocupação</Th>
                    <Th>Contra a semana anterior</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhasDia.map(({ dia, variacao: v }) => {
                    const futura = dia.situacao === "futura";
                    return (
                      <tr key={dia.data} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="px-5 py-2.5 whitespace-nowrap font-semibold">
                          {NOME_DIA[dia.diaSemana]} {curta(dia.data)}
                          {dia.situacao === "hoje" && <span className="ml-2"><Etiqueta cor="var(--color-primary)" fundo="var(--color-primary-soft)">hoje</Etiqueta></span>}
                          {futura && <span className="ml-2"><Etiqueta cor="var(--color-secondary-dark)" fundo="var(--color-secondary-soft)">previsto</Etiqueta></span>}
                        </td>
                        <Td>{dia.mesas}</Td>
                        <Td>{dia.pessoas}</Td>
                        <Td forte>{futura ? "—" : dia.chegaram}</Td>
                        <Td>{dia.situacao === "passada" ? dia.naoVieram : "—"}</Td>
                        <Td>{dia.canceladas}</Td>
                        <Td>{totalDeMesas > 0 ? pct(dia.mesas / totalDeMesas) : "—"}</Td>
                        <Td>
                          <Variacao valor={v} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- áreas e mesas ---------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="p-5 flex flex-col gap-4" style={cartao}>
              <div>
                <h2 className="font-display text-[22px] leading-tight">Por área</h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Mesas reservadas em cada área, de {curta(d.inicio)} até hoje.
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {areas.map((a) => (
                  <li key={a.chave} className="grid grid-cols-[130px_1fr_88px] items-center gap-3 text-[13.5px]">
                    <span className="font-semibold truncate">{a.chave}</span>
                    <span className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                      <span className="block h-full rounded-full" style={{ width: totalAreas ? `${(a.total / totalAreas) * 100}%` : "0%", background: "var(--color-accent)" }} />
                    </span>
                    <span className="text-right tabular-nums">
                      <strong>{a.total}</strong>
                      <span style={{ color: "var(--color-text-muted)" }}> · {totalAreas ? pct(a.total / totalAreas) : "0%"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-5 flex flex-col gap-4" style={cartao}>
              <div>
                <h2 className="font-display text-[22px] leading-tight">Mesas mais reservadas</h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  As 5 mesas com mais reservas no período.
                </p>
              </div>
              {maisReservadas.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nenhuma reserva no período.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {maisReservadas.map((m) => (
                    <li key={m.chave} className="grid grid-cols-[1fr_44px] sm:grid-cols-[190px_1fr_44px] items-center gap-x-3 gap-y-1.5 text-[13.5px]">
                      <span className="font-semibold">
                        Mesa {m.chave}
                        <span className="font-normal" style={{ color: "var(--color-text-muted)" }}> · {zonaDaMesa.get(m.chave) ?? "—"}</span>
                      </span>
                      <span className="text-right tabular-nums font-bold sm:order-last">{m.total}</span>
                      <span className="col-span-2 sm:col-span-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${(m.total / maiorMesa) * 100}%`, background: "var(--color-primary)" }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, variacao: v, rodape }: { rotulo: string; valor: string; variacao?: number | null; rodape: string }) {
  return (
    <div className="p-4 flex flex-col gap-2" style={cartao}>
      <span className="text-[11.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--color-text-muted)" }}>
        {rotulo}
      </span>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[34px] font-bold leading-none tabular-nums" style={{ color: "var(--color-dark)" }}>
          {valor}
        </span>
        {v !== undefined && <Variacao valor={v} />}
      </div>
      <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
        {rodape}
      </span>
    </div>
  );
}

// "+12%" em verde, "−8%" em vermelho, "—" quando não há base de comparação.
function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const sobe = valor >= 0.005;
  const desce = valor <= -0.005;
  return (
    <span
      className="inline-block text-[12.5px] font-semibold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap"
      style={{
        background: sobe ? "var(--color-accent-soft)" : desce ? "var(--color-error-soft)" : "var(--color-border)",
        color: sobe ? "var(--color-accent-dark)" : desce ? "var(--color-error)" : "var(--color-text-muted)",
      }}
    >
      {sobe ? "+" : desce ? "−" : ""}
      {pct(Math.abs(valor))}
    </span>
  );
}

function Etiqueta({ children, cor, fundo }: { children: React.ReactNode; cor: string; fundo: string }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: cor, background: fundo }}>
      {children}
    </span>
  );
}

function Th({ children, esquerda = false }: { children: React.ReactNode; esquerda?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-wide ${esquerda ? "text-left px-5" : "text-right"}`}>{children}</th>
  );
}

function Td({ children, forte = false }: { children: React.ReactNode; forte?: boolean }) {
  return <td className={`px-3 py-2.5 text-right ${forte ? "font-bold" : ""}`}>{children}</td>;
}
