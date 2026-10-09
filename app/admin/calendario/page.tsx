"use client";

// Calendário do restaurante. O administrador vê o ano inteiro ou um mês e
// fecha o restaurante em qualquer dia: nesse dia o cliente não consegue
// reservar mesa (lib/diasFechados.ts + supabase-migration-dias-fechados.sql).
// Fechar e reabrir valem na hora, em todas as telas.

import { useMemo, useState } from "react";
import { DIAS, dataDoDia, dataHoje, isoDaData, useReservas } from "@/lib/reservas";
import { fecharDia, reabrirDia, useDiasFechados } from "@/lib/diasFechados";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANA_EXTENSO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
// o restaurante funciona sexta (5), sábado (6) e domingo (0)
const DIAS_DE_FUNCIONAMENTO = new Set(DIAS.map((d) => d.diaSemana));

type Celula = { iso: string; dia: number; diaSemana: number } | null;

function celulasDoMes(ano: number, mes: number): Celula[] {
  const primeiro = new Date(ano, mes, 1);
  const total = new Date(ano, mes + 1, 0).getDate();
  const celulas: Celula[] = Array.from({ length: primeiro.getDay() }, () => null);
  for (let dia = 1; dia <= total; dia++) {
    const data = new Date(ano, mes, dia);
    celulas.push({ iso: isoDaData(data), dia, diaSemana: data.getDay() });
  }
  return celulas;
}

function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  return `${SEMANA_EXTENSO[data.getDay()]}, ${d} de ${MESES[m - 1].toLowerCase()} de ${a}`;
}

export default function CalendarioPage() {
  const { fechados, carregando, semTabela } = useDiasFechados();
  const { reservas } = useReservas();

  const hoje = useMemo(() => dataHoje(), []);
  const hojeIso = isoDaData(hoje);

  const [visao, setVisao] = useState<"ano" | "mes">("ano");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechadoSelecionado = selecionado ? fechados.get(selecionado) : undefined;

  // Reservas já feitas para o dia selecionado: só sabemos a data da PRÓXIMA
  // ocorrência de cada dia da semana (é a única data aberta para reserva).
  const reservasDoDia = useMemo(() => {
    if (!selecionado) return 0;
    const dia = DIAS.find((d) => isoDaData(dataDoDia(d.chave)) === selecionado);
    if (!dia) return 0;
    return reservas.filter((r) => r.dia === dia.chave && !r.cancelada).length;
  }, [selecionado, reservas]);

  const proximosFechados = useMemo(
    () =>
      [...fechados.values()]
        .filter((f) => f.data >= hojeIso)
        .sort((a, b) => a.data.localeCompare(b.data)),
    [fechados, hojeIso],
  );

  function escolher(iso: string) {
    setSelecionado(iso);
    setMotivo(fechados.get(iso)?.motivo ?? "");
    setErro(null);
  }

  async function aoFechar() {
    if (!selecionado || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await fecharDia(selecionado, motivo);
    setSalvando(false);
    if (r.erro) setErro(r.erro);
  }

  async function aoReabrir() {
    if (!selecionado || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await reabrirDia(selecionado);
    setSalvando(false);
    if (r.erro) setErro(r.erro);
    else setMotivo("");
  }

  function mesAnterior() {
    if (mes === 0) {
      setMes(11);
      setAno((a) => a - 1);
    } else setMes((m) => m - 1);
  }
  function mesSeguinte() {
    if (mes === 11) {
      setMes(0);
      setAno((a) => a + 1);
    } else setMes((m) => m + 1);
  }

  const cartao = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" } as const;

  // ---------- um dia do calendário ----------
  // (funções que devolvem JSX, e não componentes: definir componente dentro do
  // render recria a árvore a cada desenho)
  function renderDia(c: NonNullable<Celula>, grande: boolean) {
    const fechado = fechados.has(c.iso);
    const passado = c.iso < hojeIso;
    const funciona = DIAS_DE_FUNCIONAMENTO.has(c.diaSemana);
    const ehHoje = c.iso === hojeIso;
    const escolhido = c.iso === selecionado;

    let fundo = "transparent";
    let cor = funciona ? "var(--color-dark)" : "var(--color-text-muted)";
    if (fechado) {
      fundo = "var(--color-primary)";
      cor = "#fff";
    } else if (escolhido) {
      fundo = "var(--color-primary-soft)";
    }

    return (
      <button
        key={c.iso}
        type="button"
        onClick={() => escolher(c.iso)}
        disabled={passado}
        aria-label={`${dataPorExtenso(c.iso)}${fechado ? ", fechado" : ""}`}
        aria-pressed={escolhido}
        className={`relative flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed ${grande ? "h-14 text-[16px]" : "h-8 text-[12.5px]"}`}
        style={{
          background: fundo,
          color: cor,
          borderRadius: grande ? "12px" : "8px",
          opacity: passado ? 0.35 : 1,
          fontWeight: funciona || fechado ? 700 : 500,
          outline: escolhido ? "2px solid var(--color-primary)" : ehHoje ? "1.5px solid var(--color-dark)" : undefined,
          outlineOffset: "-1px",
        }}
      >
        {c.dia}
        {/* dia em que o restaurante abre e está aberto: pontinho verde */}
        {funciona && !fechado && !passado && (
          <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{ bottom: grande ? 7 : 3, width: grande ? 6 : 4, height: grande ? 6 : 4, background: "var(--color-accent)" }}
          />
        )}
      </button>
    );
  }

  function renderMes(indice: number, grande: boolean) {
    const celulas = celulasDoMes(ano, indice);
    const fechadosNoMes = celulas.filter((c) => c && fechados.has(c.iso)).length;
    return (
      <div key={indice} className={grande ? "" : "p-3.5"} style={grande ? undefined : cartao}>
        {!grande && (
          <button
            type="button"
            onClick={() => {
              setMes(indice);
              setVisao("mes");
            }}
            className="w-full flex items-center justify-between mb-2 text-left"
            aria-label={`Abrir ${MESES[indice]} de ${ano}`}
          >
            <span className="font-display text-[17px]">{MESES[indice]}</span>
            {fechadosNoMes > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5" style={{ background: "var(--color-primary)", color: "#fff", borderRadius: "999px" }}>
                {fechadosNoMes} fechado{fechadosNoMes === 1 ? "" : "s"}
              </span>
            )}
          </button>
        )}
        <div className={`grid grid-cols-7 ${grande ? "gap-1.5 mb-1.5" : "gap-0.5 mb-1"}`}>
          {SEMANA.map((s, i) => (
            <span
              key={i}
              className={`text-center font-semibold ${grande ? "text-[12px] py-1" : "text-[10px]"}`}
              style={{ color: "var(--color-text-muted)" }}
            >
              {s}
            </span>
          ))}
        </div>
        <div className={`grid grid-cols-7 ${grande ? "gap-1.5" : "gap-0.5"}`}>
          {celulas.map((c, i) => (c ? renderDia(c, grande) : <span key={`v${i}`} />))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[40px] leading-tight">Calendário</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Feche o restaurante num dia e o cliente não consegue reservar mesa nessa data.
        </p>
      </div>

      {semTabela && !carregando && (
        <div className="p-4 text-sm" style={{ ...cartao, borderColor: "var(--color-secondary)" }}>
          <strong>O calendário ainda não está no banco.</strong> Você pode olhar o ano, mas para fechar dias é preciso rodar{" "}
          <code>supabase-migration-dias-fechados.sql</code> no Supabase.
        </div>
      )}

      {/* ---------- controles ---------- */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-1" style={{ ...cartao, borderRadius: "999px" }}>
          {(["ano", "mes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              className="px-5 py-1.5 text-[13.5px] font-semibold"
              style={{
                borderRadius: "999px",
                background: visao === v ? "var(--color-primary)" : "transparent",
                color: visao === v ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {v === "ano" ? "Ano" : "Mês"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={visao === "ano" ? () => setAno((a) => a - 1) : mesAnterior}
            aria-label={visao === "ano" ? "Ano anterior" : "Mês anterior"}
            className="w-9 h-9 flex items-center justify-center text-[18px]"
            style={{ ...cartao, borderRadius: "10px" }}
          >
            ‹
          </button>
          <span className="font-display text-[24px] min-w-[170px] text-center">
            {visao === "ano" ? ano : `${MESES[mes]} ${ano}`}
          </span>
          <button
            type="button"
            onClick={visao === "ano" ? () => setAno((a) => a + 1) : mesSeguinte}
            aria-label={visao === "ano" ? "Próximo ano" : "Próximo mês"}
            className="w-9 h-9 flex items-center justify-center text-[18px]"
            style={{ ...cartao, borderRadius: "10px" }}
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid gap-6 items-start xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------- calendário ---------- */}
        <div className="flex flex-col gap-4">
          {visao === "ano" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MESES.map((_, i) => renderMes(i, false))}
            </div>
          ) : (
            <div className="p-5" style={cartao}>
              {renderMes(mes, true)}
            </div>
          )}

          <div className="flex items-center gap-5 flex-wrap text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3" style={{ background: "var(--color-primary)", borderRadius: "4px" }} /> Fechado
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-accent)" }} /> Dia de funcionamento (sex, sáb, dom)
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3" style={{ border: "1.5px solid var(--color-dark)", borderRadius: "4px" }} /> Hoje
            </span>
          </div>
        </div>

        {/* ---------- painel do dia ---------- */}
        <aside className="p-5 flex flex-col gap-4 xl:sticky xl:top-6" style={cartao}>
          {selecionado ? (
            <>
              <div>
                <span className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
                  Dia selecionado
                </span>
                <p className="font-display text-[26px] leading-tight mt-1 first-letter:uppercase">{dataPorExtenso(selecionado)}</p>
                <span
                  className="inline-block text-[12px] font-semibold px-3 py-1 mt-2.5"
                  style={{
                    borderRadius: "999px",
                    background: fechadoSelecionado ? "var(--color-primary)" : "var(--color-accent-soft)",
                    color: fechadoSelecionado ? "#fff" : "var(--color-accent-dark)",
                  }}
                >
                  {fechadoSelecionado ? "Restaurante fechado" : "Restaurante aberto"}
                </span>
              </div>

              {reservasDoDia > 0 && (
                <p
                  className="text-[13px] leading-snug px-3.5 py-3"
                  style={{ background: "var(--color-secondary-soft)", color: "var(--color-secondary-dark)", borderRadius: "10px" }}
                >
                  Já existem <strong>{reservasDoDia} reserva{reservasDoDia === 1 ? "" : "s"}</strong> para esse dia. Fechar o dia impede{" "}
                  reservas novas, mas <strong>não cancela as que já existem</strong>: cancele-as em Reservas se for o caso.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="motivo" className="text-[12.5px] font-medium">
                  Motivo (opcional)
                </label>
                <input
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: feriado, evento fechado"
                  maxLength={80}
                  className="border px-3 py-2.5 text-sm bg-transparent outline-none"
                  style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
                />
                <p className="text-[11.5px]" style={{ color: "var(--color-text-muted)" }}>
                  O cliente vê esse texto ao tentar reservar nesse dia.
                </p>
              </div>

              {erro && (
                <p className="text-[13px] font-medium" style={{ color: "var(--color-error)" }}>
                  {erro}
                </p>
              )}

              {fechadoSelecionado ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={aoFechar}
                    disabled={salvando || (motivo.trim() || null) === fechadoSelecionado.motivo}
                    className="py-3 text-sm font-semibold border disabled:opacity-40"
                    style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
                  >
                    Salvar motivo
                  </button>
                  <button
                    type="button"
                    onClick={aoReabrir}
                    disabled={salvando}
                    className="py-3 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: "var(--color-accent-dark)", borderRadius: "var(--radius-sm)" }}
                  >
                    {salvando ? "Salvando…" : "Reabrir o restaurante neste dia"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={aoFechar}
                  disabled={salvando || semTabela}
                  className="py-3 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
                >
                  {salvando ? "Salvando…" : "Fechar o restaurante neste dia"}
                </button>
              )}
            </>
          ) : (
            <div>
              <span className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
                Dia selecionado
              </span>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                Clique num dia do calendário para fechar ou reabrir o restaurante nele.
              </p>
            </div>
          )}

          {/* próximos dias fechados */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
              Próximos dias fechados
            </span>
            {proximosFechados.length === 0 ? (
              <p className="text-[13px] mt-2" style={{ color: "var(--color-text-muted)" }}>
                Nenhum dia fechado.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 mt-2.5">
                {proximosFechados.slice(0, 8).map((f) => (
                  <li key={f.data}>
                    <button
                      type="button"
                      onClick={() => {
                        const [a, m] = f.data.split("-").map(Number);
                        setAno(a);
                        setMes(m - 1);
                        escolher(f.data);
                      }}
                      className="w-full text-left flex items-baseline justify-between gap-3 text-[13px] py-1"
                    >
                      <span className="font-semibold first-letter:uppercase">{dataPorExtenso(f.data).replace(/ de \d{4}$/, "")}</span>
                      {f.motivo && (
                        <span className="truncate" style={{ color: "var(--color-text-muted)" }}>
                          {f.motivo}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
