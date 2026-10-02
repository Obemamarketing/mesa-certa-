"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { baixarIcsDaReserva } from "@/lib/ics";
import {
  DIAS,
  criarReserva,
  dataDoDia,
  formatarDataCurta,
  horarios,
  mesas,
  mesasDisponiveisPara,
  statusMesa,
  useReservas,
  type DiaReserva,
  type Mesa,
  type Reserva,
} from "@/lib/reservas";
import StepIndicator from "./StepIndicator";

type Etapa = "inicio" | "horario" | "mesa" | "dados" | "revisar" | "confirmada";

const ZONAS = [
  { chave: "Bar" as const, label: "Bar" },
  { chave: "Salão" as const, label: "Área interna" },
  { chave: "Jardim" as const, label: "Jardim" },
];

function rotuloZona(zona: Mesa["zona"]): string {
  return ZONAS.find((z) => z.chave === zona)?.label ?? zona;
}

export default function ReservasPage() {
  const { reservas } = useReservas();
  const [etapa, setEtapa] = useState<Etapa>("inicio");
  const [dia, setDia] = useState<DiaReserva>("sexta");
  const [pessoas, setPessoas] = useState(2);
  const [horario, setHorario] = useState<string | null>(horarios[2]);
  const [zonaAtiva, setZonaAtiva] = useState<Mesa["zona"] | "todas">("todas");
  const [mesaNumero, setMesaNumero] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [observacao, setObservacao] = useState("");
  const [reservaFeita, setReservaFeita] = useState<Reserva | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mesaObj = mesas.find((m) => m.numero === mesaNumero);

  async function confirmar() {
    if (!horario || !mesaNumero || !nome.trim() || !telefone.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    const { reserva, erro: mensagemErro } = await criarReserva({
      dia,
      horario,
      mesaNumero,
      pessoas,
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim() || undefined,
      observacao: observacao.trim() || undefined,
    });
    setEnviando(false);
    if (!reserva) {
      setErro(mensagemErro ?? "Não foi possível confirmar a reserva.");
      return;
    }
    setReservaFeita(reserva);
    setEtapa("confirmada");
  }

  function reiniciar() {
    setEtapa("inicio");
    setHorario(null);
    setMesaNumero(null);
    setNome("");
    setTelefone("");
    setEmail("");
    setObservacao("");
    setReservaFeita(null);
    setErro(null);
  }

  if (etapa === "inicio") {
    return (
      <TelaInicio
        dia={dia}
        setDia={setDia}
        pessoas={pessoas}
        setPessoas={setPessoas}
        horario={horario}
        setHorario={setHorario}
        onBuscar={() => setEtapa("horario")}
      />
    );
  }

  if (etapa === "horario") {
    const opcoesTempo = horarios.map((h) => ({
      h,
      disponivel: mesasDisponiveisPara(reservas, dia, h, pessoas).length > 0,
    }));
    const disponiveisCount = opcoesTempo.filter((o) => o.disponivel).length;
    const diaLabelCompleto = `${DIAS.find((d) => d.chave === dia)?.label}, ${dataDoDia(dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;

    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {/* ===== MOBILE — inalterado ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
            <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
            <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
            </Link>
          </header>

          <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
            <div className="flex flex-col gap-6 pt-4 sm:pt-6">
              <TopoEtapa onVoltar={() => setEtapa("inicio")} etapaNumero={1} />
              <div>
                <h1 className="font-display text-2xl">Escolha o horário</h1>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {DIAS.find((d) => d.chave === dia)?.label}, {formatarDataCurta(dataDoDia(dia))} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {horarios.map((h) => {
                  const disponivel = mesasDisponiveisPara(reservas, dia, h, pessoas).length > 0;
                  const selecionado = horario === h;
                  return (
                    <button
                      key={h}
                      disabled={!disponivel}
                      onClick={() => setHorario(h)}
                      className="py-3 border text-sm font-medium"
                      style={{
                        borderRadius: "var(--radius-sm)",
                        borderColor: selecionado ? "var(--color-primary)" : "var(--color-border)",
                        background: selecionado ? "var(--color-primary)" : disponivel ? "var(--color-surface)" : "var(--color-border)",
                        color: selecionado ? "#fff" : disponivel ? "var(--color-dark)" : "var(--color-text-muted)",
                        opacity: disponivel ? 1 : 0.6,
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setEtapa("mesa")}
                disabled={!horario}
                className="mt-auto py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>

        {/* ===== DESKTOP — redesign ===== */}
        <div className="hidden lg:flex flex-col flex-1">
          <header className="flex items-center justify-between px-10 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={46} height={46} className="rounded-full" />
              <span className="font-display text-[21px] leading-none" style={{ color: "var(--color-dark)" }}>{reservaBrand.restauranteAtual}</span>
            </Link>
            <Link href="/consulta" className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
              {ICONE_CALENDARIO}
            </Link>
          </header>

          <div className="flex-1 flex flex-col items-center px-10 py-14">
            <div className="w-full max-w-[920px] flex flex-col gap-9">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <button onClick={() => setEtapa("inicio")} className="flex items-center gap-2 text-[14px] font-medium justify-self-start" style={{ color: "var(--color-text-muted)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Voltar
                </button>
                <StepIndicatorDesktop atual={1} />
                <span />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--color-text-muted)" }}>Reserva de mesa</span>
                <h1 className="font-display text-[48px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Escolha o horário</h1>
                <p className="text-[16px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {diaLabelCompleto} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
                </p>
              </div>

              <div style={{ borderTop: "1px solid var(--color-border)" }} />

              <div className="flex items-end justify-between gap-10">
                <div>
                  <p className="text-[19px] font-semibold" style={{ color: "var(--color-dark)" }}>Horários disponíveis</p>
                  <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {disponiveisCount} opç{disponiveisCount === 1 ? "ão" : "ões"} disponí{disponiveisCount === 1 ? "vel" : "veis"}
                  </p>
                </div>
                <p className="text-[13px] text-right max-w-[280px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  Os horários podem variar conforme a disponibilidade da casa. Escolha o que melhor te atende.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {opcoesTempo.map(({ h, disponivel }) => {
                  const selecionado = horario === h;
                  return (
                    <button
                      key={h}
                      disabled={!disponivel}
                      onClick={() => setHorario(h)}
                      className="relative flex flex-col gap-1.5 px-6 py-5 border text-left"
                      style={{
                        borderRadius: "14px",
                        borderColor: selecionado ? "var(--color-primary)" : "var(--color-border)",
                        background: selecionado ? "var(--color-primary)" : disponivel ? "var(--color-surface)" : "var(--color-bg)",
                        opacity: disponivel ? 1 : 0.55,
                      }}
                    >
                      <span className="font-display text-[27px] leading-none" style={{ color: selecionado ? "#fff" : "var(--color-dark)" }}>{h}</span>
                      <span
                        className="text-[11px] font-semibold tracking-[0.1em] uppercase"
                        style={{ color: selecionado ? "rgba(255,255,255,0.85)" : "var(--color-text-muted)" }}
                      >
                        {disponivel ? (selecionado ? "Selecionado" : "Disponível") : "Indisponível"}
                      </span>
                      {selecionado && (
                        <span className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.22)" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setEtapa("mesa")}
                disabled={!horario}
                className="w-full py-4 text-[15px] font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "var(--color-primary)", borderRadius: "14px" }}
              >
                Continuar
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (etapa === "mesa" && horario) {
    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {/* ===== MOBILE — inalterado ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
            <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
            <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
            </Link>
          </header>

          <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
            <div className="flex flex-col gap-5 pt-4 sm:pt-6">
              <TopoEtapa onVoltar={() => setEtapa("horario")} etapaNumero={2} />
              <div>
                <h1 className="font-display text-2xl">Escolha sua mesa</h1>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Selecione onde você gostaria de sentar.</p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ chave: "todas" as const, label: "Todas" }, ...ZONAS].map((z) => {
                  const ativo = zonaAtiva === z.chave;
                  return (
                    <button
                      key={z.chave}
                      onClick={() => setZonaAtiva(z.chave)}
                      className="px-4 py-2 text-sm font-medium border shrink-0"
                      style={{ borderRadius: "999px", borderColor: ativo ? "var(--color-primary)" : "var(--color-border)", background: ativo ? "var(--color-primary-soft)" : "transparent", color: ativo ? "var(--color-primary)" : "var(--color-text-muted)" }}
                    >
                      {z.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-5">
                {ZONAS.filter((z) => zonaAtiva === "todas" || zonaAtiva === z.chave).map((z) => (
                  <div key={z.chave} className="flex flex-col gap-2.5">
                    <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--color-text-muted)" }}>{z.chave === "Salão" ? "Salão" : z.chave}</span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                      {mesas.filter((m) => m.zona === z.chave).map((m) => {
                        const status = statusMesa(reservas, dia, horario, m, pessoas);
                        const selecionada = mesaNumero === m.numero;
                        const indisponivel = status !== "livre" && !selecionada;
                        const bg = selecionada ? "var(--color-primary)" : status === "ocupada" ? "var(--color-secondary)" : indisponivel ? "var(--color-border)" : "var(--color-accent-soft)";
                        const txt = selecionada || status === "ocupada" ? "#fff" : indisponivel ? "var(--color-text-muted)" : "var(--color-accent-dark)";
                        return (
                          <button
                            key={m.numero}
                            disabled={indisponivel}
                            onClick={() => setMesaNumero(m.numero)}
                            className={`flex flex-col items-center justify-center gap-0.5 aspect-square border-2 ${m.formato === "redonda" ? "rounded-full" : ""}`}
                            style={{ borderRadius: m.formato === "redonda" ? "9999px" : "var(--radius-sm)", background: bg, borderColor: bg, opacity: indisponivel && status !== "ocupada" ? 0.7 : 1 }}
                          >
                            <span className="text-sm font-semibold" style={{ color: txt }}>{m.numero}</span>
                            <span className="text-[10px]" style={{ color: txt, opacity: 0.85 }}>{m.capacidade}p</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <LegendaDot cor="var(--color-accent-soft)" borda="var(--color-accent)" label="Livre" />
                <LegendaDot cor="var(--color-primary)" borda="var(--color-primary)" label="Selecionada" />
                <LegendaDot cor="var(--color-secondary)" borda="var(--color-secondary)" label="Reservada" />
                <LegendaDot cor="var(--color-border)" borda="var(--color-border)" label="Indisponível" />
              </div>

              {mesaObj && (
                <div className="border p-3 flex items-center gap-3" style={{ borderColor: "var(--color-primary)", background: "var(--color-primary-soft)", borderRadius: "var(--radius-sm)" }}>
                  <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0">
                    <Image src="/hero-zeplin.webp" alt="" fill className="object-cover" />
                  </div>
                  <span className="text-sm font-semibold">Mesa {mesaObj.numero} · {rotuloZona(mesaObj.zona)} · {mesaObj.capacidade} lugares</span>
                </div>
              )}

              <button
                onClick={() => setEtapa("dados")}
                disabled={!mesaNumero}
                className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>

        {/* ===== DESKTOP — redesign ===== */}
        <div className="hidden lg:flex flex-col flex-1">
          <header className="flex items-center justify-between px-10 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={46} height={46} className="rounded-full" />
              <span className="font-display text-[21px] leading-none" style={{ color: "var(--color-dark)" }}>{reservaBrand.restauranteAtual}</span>
            </Link>
            <Link href="/consulta" className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
              {ICONE_CALENDARIO}
            </Link>
          </header>

          <div className="flex-1 flex flex-col items-center px-10 py-14">
            <div className="w-full max-w-[1180px] flex flex-col gap-9">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <button onClick={() => setEtapa("horario")} className="flex items-center gap-2 text-[14px] font-medium justify-self-start" style={{ color: "var(--color-text-muted)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Voltar
                </button>
                <StepIndicatorDesktop atual={2} />
                <span />
              </div>

              <div className="flex flex-col gap-2">
                <h1 className="font-display text-[44px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Escolha sua mesa</h1>
                <p className="text-[16px]" style={{ color: "var(--color-text-muted)" }}>Selecione onde você gostaria de sentar.</p>
              </div>

              <div className="grid grid-cols-[1fr_320px] gap-10 items-start">
                {/* ESQUERDA — filtros + mesas por ambiente */}
                <div className="flex flex-col gap-7">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2.5">
                      {[{ chave: "todas" as const, label: "Todas" }, ...ZONAS].map((z) => {
                        const ativo = zonaAtiva === z.chave;
                        return (
                          <button
                            key={z.chave}
                            onClick={() => setZonaAtiva(z.chave)}
                            className="px-4 py-2 text-[13.5px] font-medium border"
                            style={{
                              borderRadius: "999px",
                              borderColor: ativo ? "var(--color-primary)" : "var(--color-border)",
                              background: ativo ? "var(--color-primary)" : "var(--color-surface)",
                              color: ativo ? "#fff" : "var(--color-text-muted)",
                            }}
                          >
                            {z.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4">
                      <LegendaDotDesktop cor="var(--color-accent)" label="Disponível" />
                      <LegendaDotDesktop cor="var(--color-primary)" label="Selecionada" />
                      <LegendaDotDesktop cor="var(--color-text-muted)" label="Indisponível" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-7">
                    {ZONAS.filter((z) => zonaAtiva === "todas" || zonaAtiva === z.chave).map((z) => (
                      <div key={z.chave} className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                          <span className="text-[12px] font-bold tracking-[0.14em] uppercase shrink-0" style={{ color: "var(--color-dark)" }}>
                            {z.chave === "Salão" ? "Salão" : z.chave}
                          </span>
                          <span className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
                        </div>
                        <div className="grid grid-cols-4 gap-6">
                          {mesas.filter((m) => m.zona === z.chave).map((m) => {
                            const status = statusMesa(reservas, dia, horario, m, pessoas);
                            const selecionada = mesaNumero === m.numero;
                            const indisponivel = status !== "livre" && !selecionada;
                            const bg = selecionada ? "var(--color-primary)" : indisponivel ? "var(--color-border)" : "var(--color-accent-soft)";
                            const txt = selecionada ? "#fff" : indisponivel ? "var(--color-text-muted)" : "var(--color-dark)";
                            return (
                              <button
                                key={m.numero}
                                disabled={indisponivel}
                                onClick={() => setMesaNumero(m.numero)}
                                className={`w-full aspect-square flex flex-col items-center justify-center gap-1 ${m.formato === "redonda" ? "rounded-full" : ""}`}
                                style={{
                                  borderRadius: m.formato === "redonda" ? "9999px" : "16px",
                                  background: bg,
                                  opacity: indisponivel ? 0.6 : 1,
                                  cursor: indisponivel ? "not-allowed" : "pointer",
                                }}
                              >
                                <span className="font-display text-[22px] leading-none" style={{ color: txt }}>{m.numero}</span>
                                <span className="text-[11.5px]" style={{ color: txt, opacity: selecionada ? 0.9 : 0.8 }}>{m.capacidade} lugares</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DIREITA — resumo da mesa selecionada */}
                <div className="border p-6 flex flex-col gap-5 sticky top-8" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", borderRadius: "18px" }}>
                  {mesaObj ? (
                    <>
                      <div>
                        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>Mesa selecionada</span>
                        <h2 className="font-display text-[34px] leading-tight mt-1" style={{ color: "var(--color-dark)" }}>Mesa {mesaObj.numero}</h2>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5 text-[14px]" style={{ color: "var(--color-dark)" }}>
                          <span style={{ color: "var(--color-primary)" }}>{ICONE_MESA}</span>
                          {mesaObj.capacidade} lugares
                        </div>
                        <div className="flex items-center gap-2.5 text-[14px]" style={{ color: "var(--color-dark)" }}>
                          <span style={{ color: "var(--color-primary)" }}>{ICONE_PIN}</span>
                          {rotuloZona(mesaObj.zona)}
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid var(--color-border)" }} />

                      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                        Uma ótima escolha para até {mesaObj.capacidade} pessoas, com {DESCRICAO_AMBIENTE[mesaObj.zona]}.
                      </p>

                      <button
                        onClick={() => setEtapa("dados")}
                        className="w-full py-3.5 text-[14.5px] font-semibold text-white flex items-center justify-center gap-2"
                        style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                      >
                        Continuar
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>Mesa selecionada</span>
                        <p className="text-[15px] mt-2" style={{ color: "var(--color-text-muted)" }}>
                          Escolha uma mesa disponível para ver os detalhes aqui.
                        </p>
                      </div>
                      <button
                        disabled
                        className="w-full py-3.5 text-[14.5px] font-semibold text-white disabled:opacity-40"
                        style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                      >
                        Continuar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (etapa === "dados") {
    const diaLabelCompleto = horario && `${DIAS.find((d) => d.chave === dia)?.label}, ${dataDoDia(dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;

    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {/* ===== MOBILE — inalterado ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
            <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
            <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
            </Link>
          </header>

          <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
            <div className="flex flex-col gap-5 pt-4 sm:pt-6">
              <TopoEtapa onVoltar={() => setEtapa("mesa")} etapaNumero={3} />
              <div>
                <h1 className="font-display text-2xl">Quase tudo pronto.</h1>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Precisamos de alguns dados para confirmar sua reserva.</p>
              </div>

              <div className="flex flex-col gap-3">
                <Campo label="Nome completo">
                  <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite seu nome" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="WhatsApp">
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" inputMode="tel" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="E-mail">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" inputMode="email" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="Observação (opcional)">
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex: gostaria de uma mesa mais tranquila"
                    rows={2}
                    className="w-full outline-none text-sm bg-transparent resize-none"
                  />
                </Campo>
              </div>

              <button
                onClick={() => setEtapa("revisar")}
                disabled={!nome.trim() || !telefone.trim()}
                className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Revisar reserva
              </button>
            </div>
          </div>
        </div>

        {/* ===== DESKTOP — redesign ===== */}
        <div className="hidden lg:flex flex-col flex-1">
          <header className="flex items-center justify-between px-10 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={46} height={46} className="rounded-full" />
              <span className="font-display text-[21px] leading-none" style={{ color: "var(--color-dark)" }}>{reservaBrand.restauranteAtual}</span>
            </Link>
            <Link href="/consulta" className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
              {ICONE_CALENDARIO}
            </Link>
          </header>

          <div className="flex-1 flex flex-col items-center px-10 py-14">
            <div className="w-full max-w-[1280px] flex flex-col gap-9">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <button onClick={() => setEtapa("mesa")} className="flex items-center gap-2 text-[14px] font-medium justify-self-start" style={{ color: "var(--color-text-muted)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Voltar
                </button>
                <StepIndicatorDesktop atual={3} />
                <span />
              </div>

              <div className="grid grid-cols-[1fr_360px] gap-16 items-start">
                {/* ESQUERDA — formulário */}
                <div className="flex flex-col gap-7">
                  <div className="flex flex-col gap-2">
                    <h1 className="font-display text-[44px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Quase tudo pronto.</h1>
                    <p className="text-[16px]" style={{ color: "var(--color-text-muted)" }}>Precisamos de alguns dados para confirmar sua reserva.</p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <CampoDesktop label="Nome completo">
                      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite seu nome completo" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                    </CampoDesktop>
                    <div className="grid grid-cols-2 gap-4">
                      <CampoDesktop label="WhatsApp">
                        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" inputMode="tel" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                      </CampoDesktop>
                      <CampoDesktop label="E-mail">
                        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" inputMode="email" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                      </CampoDesktop>
                    </div>
                    <CampoDesktop label="Observação (opcional)">
                      <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: gostaria de uma mesa mais tranquila"
                        rows={2}
                        className="w-full outline-none text-[15px] bg-transparent resize-none"
                        style={{ color: "var(--color-dark)" }}
                      />
                    </CampoDesktop>
                  </div>

                  <button
                    onClick={() => setEtapa("revisar")}
                    disabled={!nome.trim() || !telefone.trim()}
                    className="w-full py-4 text-[15px] font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: "var(--color-primary)", borderRadius: "14px" }}
                  >
                    Revisar reserva
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>

                {/* DIREITA — resumo da reserva */}
                <div className="border p-6 flex flex-col gap-1 sticky top-8" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", borderRadius: "18px" }}>
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase pb-4" style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>
                    Sua reserva
                  </span>

                  <LinhaResumoDesktop icon={ICONE_CALENDARIO}>{diaLabelCompleto}</LinhaResumoDesktop>
                  <LinhaResumoDesktop icon={ICONE_RELOGIO}>{horario}</LinhaResumoDesktop>
                  <LinhaResumoDesktop icon={ICONE_GRUPO}>{pessoas} pessoa{pessoas === 1 ? "" : "s"}</LinhaResumoDesktop>
                  {mesaObj && (
                    <LinhaResumoDesktop icon={ICONE_MESA} ultima>
                      <span>Mesa {mesaObj.numero}</span>
                      <span className="block text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {mesaObj.capacidade} lugares · {rotuloZona(mesaObj.zona)}
                      </span>
                    </LinhaResumoDesktop>
                  )}

                  <div className="flex items-start gap-3 p-4 mt-4" style={{ background: "var(--color-accent-soft)", borderRadius: "14px" }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--color-accent-dark)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: "var(--color-dark)" }}>Quase lá!</p>
                      <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                        Revise seus dados para confirmar sua reserva.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      {/* HEADER */}
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
        <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          Consultar reserva
        </Link>
      </header>

      <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
        {/* TELA 5 — REVISAR */}
        {etapa === "revisar" && horario && mesaObj && (
          <div className="flex flex-col gap-5 pt-4 sm:pt-6">
            <TopoEtapa onVoltar={() => setEtapa("dados")} etapaNumero={4} />
            <h1 className="font-display text-2xl">Revise sua reserva</h1>

            <div className="border overflow-hidden" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}>
              <div className="relative h-28">
                <Image src="/hero-zeplin.webp" alt="" fill className="object-cover" />
                <div className="absolute inset-0 flex items-end p-4" style={{ background: "linear-gradient(to top, rgba(42,23,18,0.75), rgba(42,23,18,0.1))" }}>
                  <span className="font-display text-lg text-white tracking-wide">{reservaBrand.restauranteAtual.toUpperCase()}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 p-5" style={{ background: "var(--color-surface)" }}>
                <Linha label="Data" valor={`${DIAS.find((d) => d.chave === dia)?.label}, ${formatarDataCurta(dataDoDia(dia))}`} />
                <Linha label="Horário" valor={horario} />
                <Linha label="Pessoas" valor={`${pessoas} pessoa${pessoas === 1 ? "" : "s"}`} />
                <Linha label="Mesa" valor={`Mesa ${mesaObj.numero}`} />
                <Linha label="Área" valor={rotuloZona(mesaObj.zona)} />
                <div style={{ borderTop: "1px solid var(--color-border)" }} className="pt-2.5 mt-1 flex flex-col gap-2.5">
                  <Linha label="Nome" valor={nome} />
                  <Linha label="WhatsApp" valor={telefone} />
                  {observacao && <Linha label="Observação" valor={observacao} />}
                </div>
              </div>
            </div>

            <button onClick={() => setEtapa("dados")} className="text-sm font-medium self-start" style={{ color: "var(--color-primary)" }}>
              Editar reserva
            </button>

            {erro && <p className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}

            <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Estou de acordo com as informações da reserva.</p>

            <button
              onClick={confirmar}
              disabled={enviando}
              className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
            >
              {enviando ? "Confirmando…" : "Confirmar reserva"}
            </button>
          </div>
        )}

        {/* TELA 6 — CONFIRMADA */}
        {etapa === "confirmada" && reservaFeita && mesaObj && (
          <div className="flex-1 flex flex-col items-center text-center gap-4 pt-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-accent)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h1 className="font-display text-2xl">Reserva confirmada!</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Sua mesa está garantida no {reservaBrand.restauranteAtual}.</p>

            <div className="w-full border p-5 flex flex-col gap-2.5 text-left" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
              <Linha label="Data" valor={`${DIAS.find((d) => d.chave === reservaFeita.dia)?.label}, ${formatarDataCurta(dataDoDia(reservaFeita.dia))}`} />
              <Linha label="Horário" valor={reservaFeita.horario} />
              <Linha label="Pessoas" valor={`${reservaFeita.pessoas} pessoa${reservaFeita.pessoas === 1 ? "" : "s"}`} />
              <Linha label="Mesa" valor={`Mesa ${reservaFeita.mesaNumero}`} />
              <Linha label="Área" valor={rotuloZona(mesaObj.zona)} />
            </div>

            <div className="w-full flex flex-col gap-2.5 mt-2">
              <button
                onClick={() => baixarIcsDaReserva(reservaFeita)}
                className="py-3 text-sm font-semibold border"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-dark)" }}
              >
                Adicionar ao calendário
              </button>
              <Link
                href="/consulta"
                className="py-3 text-sm font-semibold text-white text-center"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Consultar minha reserva
              </Link>
              <button onClick={reiniciar} className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                Fazer nova reserva
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function TopoEtapa({ onVoltar, etapaNumero }: { onVoltar: () => void; etapaNumero: number }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onVoltar} className="text-sm font-medium flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
        ← Voltar
      </button>
      <StepIndicator atual={etapaNumero} />
    </div>
  );
}

const ETAPAS_DESKTOP = ["Horário", "Mesa", "Dados", "Confirmação"];

function StepIndicatorDesktop({ atual }: { atual: number }) {
  return (
    <div className="flex items-center justify-self-center">
      {ETAPAS_DESKTOP.map((rotulo, i) => {
        const numero = i + 1;
        const ativo = numero === atual;
        const concluido = numero < atual;
        return (
          <div key={rotulo} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold"
                style={
                  ativo
                    ? { background: "var(--color-primary)", color: "#fff" }
                    : concluido
                    ? { background: "var(--color-surface)", color: "var(--color-primary)", border: "1.5px solid var(--color-primary)" }
                    : { background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
                }
              >
                {concluido ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  numero
                )}
              </span>
              <span
                className="text-[12.5px] font-medium whitespace-nowrap"
                style={{ color: ativo ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {rotulo}
              </span>
            </div>
            {numero < ETAPAS_DESKTOP.length && (
              <span className="w-16 h-px mb-5 mx-3" style={{ background: concluido ? "var(--color-primary)" : "var(--color-border)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LegendaDot({ cor, borda, label }: { cor: string; borda: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
      <span className="w-2.5 h-2.5 rounded-full border" style={{ background: cor, borderColor: borda }} />
      {label}
    </span>
  );
}

function LegendaDotDesktop({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor }} />
      {label}
    </span>
  );
}

const DESCRICAO_AMBIENTE: Record<Mesa["zona"], string> = {
  Bar: "o clima descontraído do bar",
  Salão: "o ambiente aconchegante do salão",
  Jardim: "o charme a céu aberto do jardim",
};

const ICONE_CALENDARIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
);
const ICONE_PESSOA = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" /></svg>
);
const ICONE_RELOGIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICONE_MESA = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
);
const ICONE_PIN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 21s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
const ICONE_GRUPO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="8.5" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M2.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M14.5 15c2.3.2 4 2 4 4.3" /></svg>
);

function CampoDesktop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border px-5 py-3.5 flex flex-col gap-1" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", borderRadius: "14px" }}>
      <label className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function LinhaResumoDesktop({ icon, children, ultima = false }: { icon: React.ReactNode; children: React.ReactNode; ultima?: boolean }) {
  return (
    <div
      className="flex items-start gap-3 py-4"
      style={!ultima ? { borderBottom: "1px solid var(--color-border)" } : undefined}
    >
      <span className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }}>{icon}</span>
      <span className="text-[14.5px] font-medium" style={{ color: "var(--color-dark)" }}>{children}</span>
    </div>
  );
}

function CampoReserva({
  label,
  icon,
  displayValue,
  value,
  onChange,
  children,
  mostrarSeta = false,
  divisor = false,
  compacto = false,
}: {
  label: string;
  icon: React.ReactNode;
  displayValue: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  mostrarSeta?: boolean;
  divisor?: boolean;
  compacto?: boolean;
}) {
  return (
    <div
      className={`relative flex items-center flex-1 min-w-0 ${compacto ? "gap-2 px-3.5 py-4" : "gap-3 px-4 py-3 sm:px-5 sm:py-2.5"}`}
      style={divisor ? { borderLeft: "1px solid var(--color-border)" } : undefined}
    >
      <span className={`shrink-0 ${compacto ? "scale-[0.82]" : ""}`} style={{ color: "var(--color-primary)" }}>{icon}</span>
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className={compacto ? "text-[10.5px]" : "text-[11px]"} style={{ color: "var(--color-text-muted)" }}>{label}</span>
        <span className={`font-semibold truncate ${compacto ? "text-[13px]" : "text-[13.5px]"}`} style={{ color: "var(--color-dark)" }}>{displayValue}</span>
      </div>
      {mostrarSeta && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.25" className="shrink-0">
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {children}
      </select>
    </div>
  );
}

function TelaInicio({
  dia,
  setDia,
  pessoas,
  setPessoas,
  horario,
  setHorario,
  onBuscar,
}: {
  dia: DiaReserva;
  setDia: (d: DiaReserva) => void;
  pessoas: number;
  setPessoas: (n: number) => void;
  horario: string | null;
  setHorario: (h: string) => void;
  onBuscar: () => void;
}) {
  const diaLabel = `${DIAS.find((d) => d.chave === dia)?.label.split("-")[0]}, ${formatarDataCurta(dataDoDia(dia))}`;
  const pessoasLabel = `${pessoas} pessoa${pessoas === 1 ? "" : "s"}`;
  const diaLabelCompacto = formatarDataCurta(dataDoDia(dia));
  const horarioLabel = horario ?? "Escolher";

  const opcoesDia = DIAS.map((d) => (
    <option key={d.chave} value={d.chave}>{d.label.split("-")[0]}, {formatarDataCurta(dataDoDia(d.chave))}</option>
  ));
  const opcoesPessoas = Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
    <option key={n} value={n}>{n} pessoa{n === 1 ? "" : "s"}</option>
  ));
  const opcoesHorario = horarios.map((h) => <option key={h} value={h}>{h}</option>);

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      {/* ===================== MOBILE (< lg) ===================== */}
      <div className="lg:hidden flex flex-col">
        <section className="relative w-full h-[640px] overflow-hidden">
          <Image src="/hero-zeplin.webp" alt={`Interior do ${reservaBrand.restauranteAtual}`} fill priority className="object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(20,11,8,0.55) 0%, rgba(20,11,8,0.05) 22%, rgba(20,11,8,0.12) 50%, rgba(20,11,8,0.88) 100%)",
            }}
          />

          <div className="relative z-10 flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2.5">
              <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={38} height={38} className="rounded-full" />
              <span className="font-display text-[22px] text-white leading-none">{reservaBrand.restauranteAtual}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/consulta"
                className="flex items-center gap-1.5 text-[12px] font-medium text-white/90"
              >
                Consultar reserva
                <span className="scale-[0.85]">{ICONE_CALENDARIO}</span>
              </Link>
              <button
                aria-label="Menu"
                className="w-9 h-9 flex items-center justify-center text-white shrink-0"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </button>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-9 flex flex-col gap-3.5">
            <span className="text-[11px] tracking-[0.22em] uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>
              Restaurante &amp; Bar
            </span>
            <h1 className="font-display text-[42px] leading-[1.06] text-white">
              Boa comida,<br />boas<br /><span style={{ color: "var(--color-secondary)" }}>companhias.</span>
            </h1>
            <p className="text-[14.5px] max-w-[260px]" style={{ color: "rgba(255,255,255,0.85)" }}>
              Reserve sua mesa e viva a experiência {reservaBrand.restauranteAtual}.
            </p>
            <span className="w-8 h-px mt-1" style={{ background: "rgba(255,255,255,0.5)" }} />
          </div>
        </section>

        <div className="relative z-20 -mt-9 px-4">
          <div
            className="flex flex-col divide-y overflow-hidden"
            style={{ background: "var(--color-surface)", borderRadius: "28px", boxShadow: "0 18px 40px -12px rgba(42,23,18,0.35)" }}
          >
            <CampoReserva label="Data" icon={ICONE_CALENDARIO} displayValue={diaLabel} value={dia} onChange={(v) => setDia(v as DiaReserva)} mostrarSeta>
              {opcoesDia}
            </CampoReserva>
            <CampoReserva label="Pessoas" icon={ICONE_PESSOA} displayValue={pessoasLabel} value={String(pessoas)} onChange={(v) => setPessoas(Number(v))} mostrarSeta>
              {opcoesPessoas}
            </CampoReserva>
            <CampoReserva label="Horário" icon={ICONE_RELOGIO} displayValue={horarioLabel} value={horario ?? ""} onChange={setHorario} mostrarSeta>
              <option value="" disabled>Escolher horário</option>
              {opcoesHorario}
            </CampoReserva>
            <div className="p-3">
              <button
                onClick={onBuscar}
                className="w-full py-3.5 text-[14.5px] font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: "var(--color-primary)", borderRadius: "999px" }}
              >
                Buscar mesas
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== DESKTOP (lg+) — composição dividida ===================== */}
      <div className="hidden lg:flex" style={{ minHeight: "100vh" }}>
        {/* ESQUERDA — creme, logo, navegação, título, formulário */}
        <div className="w-1/2 flex flex-col px-9 xl:px-12 py-9" style={{ background: "var(--color-bg)" }}>
          {/* HEADER: logo com presença + navegação + consultar reserva (discreto) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 shrink-0">
              <Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={52} height={52} className="rounded-full shrink-0" />
              <span className="font-display text-[22px] leading-none" style={{ color: "var(--color-dark)" }}>
                {reservaBrand.restauranteAtual}
              </span>
            </div>
            <nav className="flex items-center gap-3 text-[12.5px] shrink-0" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-medium pb-1" style={{ color: "var(--color-primary)", borderBottom: "1px solid var(--color-primary)" }}>Início</span>
              <span>Cardápio</span>
              <span>Reservas</span>
              <span>O {reservaBrand.restauranteAtual}</span>
            </nav>
            <Link
              href="/consulta"
              className="flex items-center gap-2 text-[13px] font-semibold px-5 py-2.5 rounded-full border shrink-0 whitespace-nowrap"
              style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
            >
              Consultar reserva
              {ICONE_CALENDARIO}
            </Link>
          </div>

          {/* CONTEÚDO — centralizado verticalmente, ocupando melhor a área esquerda */}
          <div className="flex-1 flex flex-col justify-center gap-7 max-w-[580px]">
            <span className="text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--color-text-muted)" }}>
              Restaurante &amp; Bar
            </span>
            <h1 className="font-display text-[62px] xl:text-[68px] leading-[1.05]" style={{ color: "var(--color-dark)" }}>
              Boa comida,<br />boas<br /><span style={{ color: "var(--color-secondary)" }}>companhias.</span>
            </h1>
            <p className="text-[17.5px]" style={{ color: "var(--color-text-muted)" }}>
              Reserve sua mesa e viva a experiência {reservaBrand.restauranteAtual}.
            </p>

            {/* BLOCO DE RESERVA — elemento central, de ação, da composição */}
            <div>
              <div
                className="border overflow-hidden"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "20px" }}
              >
                <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <p className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--color-primary)" }}>
                    Reserve sua mesa
                  </p>
                  <p className="text-[13.5px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                    Escolha a data, o horário e venha viver uma noite especial no {reservaBrand.restauranteAtual}.
                  </p>
                </div>

                <div className="flex items-stretch" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <CampoReserva compacto mostrarSeta label="Data" icon={ICONE_CALENDARIO} displayValue={diaLabelCompacto} value={dia} onChange={(v) => setDia(v as DiaReserva)}>
                    {opcoesDia}
                  </CampoReserva>
                  <CampoReserva compacto mostrarSeta divisor label="Pessoas" icon={ICONE_PESSOA} displayValue={pessoasLabel} value={String(pessoas)} onChange={(v) => setPessoas(Number(v))}>
                    {opcoesPessoas}
                  </CampoReserva>
                  <CampoReserva compacto mostrarSeta divisor label="Horário" icon={ICONE_RELOGIO} displayValue={horarioLabel} value={horario ?? ""} onChange={setHorario}>
                    <option value="" disabled>Escolher horário</option>
                    {opcoesHorario}
                  </CampoReserva>
                </div>

                <div className="p-4">
                  <button
                    onClick={onBuscar}
                    className="w-full py-4 text-[15px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                  >
                    Buscar mesas
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <span className="w-7 h-px" style={{ background: "var(--color-border)" }} />
                <span className="text-[10.5px] font-medium tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
                  Reservas online · Confirmação imediata
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DIREITA — fotografia, nítida, sem filtro, com grande presença */}
        <div className="relative w-1/2">
          <Image src="/hero-zeplin.webp" alt={reservaBrand.restauranteAtual} fill priority className="object-cover object-[center_40%]" />
        </div>
      </div>
    </main>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border px-4 py-3 flex flex-col gap-1" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}>
      <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span className="font-semibold text-right">{valor}</span>
    </div>
  );
}
