"use client";

import { useState } from "react";
import Image from "next/image";
import RodapeLegal from "../RodapeLegal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  cancelarMinhaReserva,
  codigoDaReserva,
  conferirMinhaReserva,
  consultarReservas,
  horaBonita,
  horaLimiteDaTolerancia,
  listaDeMesas,
  relogioSaoPaulo,
  rotuloDaReserva,
  statusChegada,
  type ReservaConsultada,
  type ResultadoDoCancelamento,
} from "@/lib/reservas";
import { nomeCompleto, soDigitos } from "@/lib/validacao";
import { baixarComprovante } from "@/lib/comprovante";
import { guardarAlteracao } from "@/lib/alteracao";
import { useAgora } from "@/lib/relogio";
import { useMesasConfig } from "@/lib/mesas";

type Estado = { rotulo: string; fundo: string; cor: string; nota?: string };

function estadoDaReserva(r: ReservaConsultada, minutosAgora: number | null): Estado {
  if (r.cancelada) return { rotulo: "Cancelada", fundo: "var(--color-error-soft)", cor: "var(--color-error)", nota: "Esta reserva foi cancelada e a mesa foi liberada." };
  if (r.chegou) return { rotulo: "Encerrada", fundo: "var(--color-border)", cor: "var(--color-text-muted)", nota: "Você já foi recebido nesta reserva. Esperamos você de novo!" };
  // a data da reserva entra na conta: reserva de outra data não está "na
  // tolerância" só porque o relógio de hoje passou do horário dela
  const chegada = statusChegada(r, minutosAgora);
  if (chegada === "atrasado") return { rotulo: "Encerrada", fundo: "var(--color-border)", cor: "var(--color-text-muted)", nota: "A data desta reserva já passou. Se quiser voltar, faça uma nova reserva." };
  if (chegada === "tolerancia") return { rotulo: "Em tolerância", fundo: "var(--color-secondary-soft)", cor: "var(--color-secondary-dark)", nota: "Sua mesa está sendo guardada. Chegue até o fim da tolerância." };
  return { rotulo: "Confirmada", fundo: "var(--color-accent-soft)", cor: "var(--color-accent-dark)" };
}

// O que dizer quando o cancelamento não aconteceu.
const MOTIVO: Partial<Record<ResultadoDoCancelamento, string>> = {
  telefone: "Esses números não conferem com o telefone desta reserva. Confira e tente de novo.",
  bloqueada: "Foram muitas tentativas com o número errado. Para cancelar esta reserva, fale com o restaurante.",
  encerrada: "Esta reserva já foi encerrada e não pode mais ser alterada por aqui.",
  nao_encontrada: "Não encontramos mais esta reserva. Faça a consulta de novo.",
  erro: "Não foi possível cancelar agora. Confira a conexão e tente de novo.",
};

export default function ConsultaPage() {
  const router = useRouter();
  const { mesas } = useMesasConfig();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ReservaConsultada[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const agora = useAgora(60000);
  // hora do restaurante (São Paulo), não a do aparelho de quem consulta
  const minutosAgora = agora ? relogioSaoPaulo(agora).minutos : null;
  const [acao, setAcao] = useState<{ id: string; tipo: "cancelar" | "alterar" } | null>(null);
  // Os 4 últimos dígitos do telefone da reserva: é o que prova que a reserva é
  // de quem está pedindo o cancelamento. Fica guardado entre uma reserva e
  // outra — quem reservou duas mesas não precisa digitar duas vezes.
  const [finalTelefone, setFinalTelefone] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const termoOk = nomeCompleto(termo);
  async function buscar() {
    if (!termoOk || buscando) return;
    setBuscando(true);
    setAcao(null);
    setErroAcao(null);
    const r = await consultarReservas(termo);
    // erro de conexão não é "reserva não encontrada"
    setErroBusca(r.erro ?? null);
    setResultados(r.erro ? null : r.reservas);
    setBuscando(false);
  }

  const doGrupo = (r: ReservaConsultada) =>
    (resultados ?? []).filter((x) => !x.cancelada && x.dataReserva === r.dataReserva && x.horario === r.horario && x.criadaEm === r.criadaEm);

  // Alterar: confere os 4 dígitos AGORA e leva para a tela de reserva. A
  // reserva antiga só é trocada quando a nova for confirmada.
  async function irParaAlteracao(r: ReservaConsultada) {
    if (finalTelefone.length !== 4) return;
    setProcessandoId(r.id);
    setErroAcao(null);
    const resultado = await conferirMinhaReserva(r.id, finalTelefone);
    if (resultado !== "ok") {
      setProcessandoId(null);
      setErroAcao(MOTIVO[resultado as ResultadoDoCancelamento] ?? MOTIVO.erro!);
      return;
    }
    const grupo = doGrupo(r);
    const mesasDoGrupo = (grupo.length ? grupo : [r]).map((x) => x.mesaNumero);
    const pessoas = (grupo.length ? grupo : [r]).reduce((soma, x) => soma + x.pessoas, 0);
    const ok = guardarAlteracao({
      id: r.id,
      digitos: finalTelefone,
      dataReserva: r.dataReserva!,
      horario: r.horario,
      mesas: mesasDoGrupo,
      pessoas,
      rotulo: `${rotuloDaReserva(r)} às ${horaBonita(r.horario)} · mesa${mesasDoGrupo.length > 1 ? "s" : ""} ${listaDeMesas(mesasDoGrupo)}`,
    });
    if (!ok) {
      setProcessandoId(null);
      setErroAcao("Este navegador não deixou guardar a alteração. Tente em outro navegador ou fale com o restaurante.");
      return;
    }
    router.push("/");
  }

  async function cancelar(id: string, depois?: () => void) {
    if (finalTelefone.length !== 4) return;
    setProcessandoId(id);
    setErroAcao(null);
    const resultado = await cancelarMinhaReserva(id, finalTelefone);
    if (resultado !== "ok" && resultado !== "ja_cancelada") {
      // não cancelou: não segue pra "escolher nova reserva" deixando a antiga de pé
      setProcessandoId(null);
      setErroAcao(MOTIVO[resultado] ?? MOTIVO.erro!);
      return;
    }
    const r = await consultarReservas(termo);
    if (!r.erro) setResultados(r.reservas);
    setProcessandoId(null);
    setAcao(null);
    depois?.();
  }

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/" aria-label={`${reservaBrand.restauranteAtual} — início`}><Image src="/logo-zeplin.jpg" alt="" width={44} height={44} className="rounded-full" /></Link>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>← Início</Link>
      </header>

      <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-14 gap-7 pt-4 sm:pt-10">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--color-primary)" }}>
            {reservaBrand.restauranteAtual}
          </span>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Consultar minha reserva</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Digite o nome e o sobrenome que você usou ao reservar para ver, alterar ou cancelar a sua reserva.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="termo" className="text-[12.5px] font-medium" style={{ color: "var(--color-text-muted)" }}>Nome e sobrenome da reserva</label>
          <input
            id="termo"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Ex.: Maria Souza" autoComplete="name"
            className="border px-5 py-4 text-[15px] outline-none"
            style={{ borderColor: "var(--color-border)", borderRadius: "14px", background: "var(--color-surface)", color: "var(--color-dark)" }}
          />
          <button
            onClick={buscar}
            disabled={!termoOk || buscando}
            className="py-4 text-[15px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--color-primary)", borderRadius: "14px" }}
          >
            {buscando ? "Consultando…" : "Consultar reserva"}
          </button>
          {termo.trim() && !termoOk && (
            <p className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>Digite também o sobrenome, do mesmo jeito que na reserva.</p>
          )}
        </div>

        {erroBusca && (
          <p role="alert" className="border px-5 py-4 text-[14px] font-semibold" style={{ borderColor: "var(--color-error)", borderRadius: "16px", background: "var(--color-error-soft)", color: "var(--color-error)" }}>
            {erroBusca}
          </p>
        )}

        {resultados !== null && resultados.length === 0 && (
          <div className="border px-5 py-6 flex flex-col gap-1.5" style={{ borderColor: "var(--color-border)", borderRadius: "16px", background: "var(--color-surface)" }}>
            <p className="font-display text-xl" style={{ color: "var(--color-dark)" }}>Reserva não encontrada</p>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Não encontramos nenhuma reserva com esse nome e sobrenome. Confira se digitou do mesmo jeito que na reserva e tente de novo.
            </p>
            <Link href="/" className="text-[14px] font-semibold mt-2" style={{ color: "var(--color-primary)" }}>Fazer uma nova reserva →</Link>
          </div>
        )}

        {resultados?.map((r) => {
          const mesa = mesas.find((m) => m.numero === r.mesaNumero);
          const estado = estadoDaReserva(r, minutosAgora);
          const encerrada = estado.rotulo === "Cancelada" || estado.rotulo === "Encerrada";
          const confirmando = acao?.id === r.id ? acao.tipo : null;

          return (
            <article key={r.id} className="border overflow-hidden" style={{ borderColor: "var(--color-border)", borderRadius: "18px", background: "var(--color-surface)" }}>
              <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>Reserva #{codigoDaReserva(r.id)}</p>
                  <p className="font-display text-[26px] leading-tight mt-1" style={{ color: "var(--color-dark)" }}>
                    {rotuloDaReserva(r)}
                  </p>
                </div>
                <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full shrink-0" style={{ background: estado.fundo, color: estado.cor }}>
                  {estado.rotulo}
                </span>
              </div>

              <dl className="px-6 py-4 flex flex-col text-[14.5px]">
                <Linha rotulo="Horário" valor={horaBonita(r.horario)} />
                <Linha rotulo="Pessoas" valor={`${r.pessoas} pessoa${r.pessoas === 1 ? "" : "s"}`} />
                <Linha rotulo="Mesa" valor={`Mesa ${r.mesaNumero}`} />
                <Linha rotulo="Área" valor={mesa?.zona ?? "—"} />
                <Linha rotulo="Tolerância" valor={`Chegue até ${horaBonita(horaLimiteDaTolerancia(r.horario))}`} ultima />
              </dl>

              {estado.nota && (
                <p className="px-6 pb-4 text-[13.5px] leading-relaxed" style={{ color: estado.cor === "var(--color-error)" ? "var(--color-error)" : "var(--color-text-muted)" }}>
                  {estado.nota}
                </p>
              )}

              {!encerrada && !confirmando && (
                <div className="px-6 pb-6 pt-1 flex flex-col gap-2.5">
                <button
                  onClick={() =>
                    baixarComprovante({
                      titulo: "Reserva confirmada",
                      data: rotuloDaReserva(r),
                      horario: horaBonita(r.horario),
                      pessoas: r.pessoas,
                      mesas: r.mesaNumero,
                      area: mesa?.zona,
                      codigo: codigoDaReserva(r.id),
                      tolerancia: `Chegue até as ${horaBonita(horaLimiteDaTolerancia(r.horario))}`,
                      site: window.location.host,
                    })
                  }
                  className="py-3 text-[14px] font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: "var(--color-accent-dark)", borderRadius: "12px" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                  Baixar comprovante
                </button>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => { setErroAcao(null); setAcao({ id: r.id, tipo: "alterar" }); }}
                    className="flex-1 py-3 text-[14px] font-semibold border"
                    style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "12px" }}
                  >
                    Alterar reserva
                  </button>
                  <button
                    onClick={() => { setErroAcao(null); setAcao({ id: r.id, tipo: "cancelar" }); }}
                    className="flex-1 py-3 text-[14px] font-semibold border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", borderRadius: "12px" }}
                  >
                    Cancelar reserva
                  </button>
                </div>
                </div>
              )}

              {!encerrada && confirmando && (
                <div className="px-6 pb-6 pt-1 flex flex-col gap-3">
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-dark)" }}>
                    {confirmando === "cancelar"
                      ? "Tem certeza que deseja cancelar? A mesa será liberada para outros clientes."
                      : "Você vai escolher a nova data, horário, mesa ou número de pessoas. Esta reserva continua valendo até você confirmar a nova."}
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`final-${r.id}`} className="text-[13px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                      Para confirmar que a reserva é sua, digite os 4 últimos números do telefone usado na reserva.
                    </label>
                    <input
                      id={`final-${r.id}`}
                      value={finalTelefone}
                      onChange={(e) => { setFinalTelefone(soDigitos(e.target.value).slice(0, 4)); setErroAcao(null); }}
                      onKeyDown={(e) => e.key === "Enter" && (confirmando === "alterar" ? irParaAlteracao(r) : cancelar(r.id))}
                      placeholder="0000"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      className="border px-4 py-3 text-[18px] tracking-[0.3em] font-semibold outline-none w-[130px]"
                      style={{ borderColor: erroAcao && acao?.id === r.id ? "var(--color-error)" : "var(--color-border)", borderRadius: "12px", background: "var(--color-bg)", color: "var(--color-dark)" }}
                    />
                  </div>

                  {erroAcao && acao?.id === r.id && (
                    <p role="alert" className="text-[13.5px] font-semibold" style={{ color: "var(--color-error)" }}>{erroAcao}</p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => (confirmando === "alterar" ? irParaAlteracao(r) : cancelar(r.id))}
                      disabled={processandoId === r.id || finalTelefone.length !== 4}
                      className="flex-1 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                    >
                      {processandoId === r.id ? "Aguarde…" : confirmando === "cancelar" ? "Sim, cancelar" : "Continuar para escolher"}
                    </button>
                    <button
                      onClick={() => { setAcao(null); setErroAcao(null); }}
                      className="flex-1 py-3 text-[14px] font-semibold border"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", borderRadius: "12px" }}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-auto pt-10">
        <RodapeLegal />
      </div>
    </main>
  );
}

function Linha({ rotulo, valor, ultima = false }: { rotulo: string; valor: string; ultima?: boolean }) {
  return (
    <div className="flex justify-between gap-6 py-2.5" style={ultima ? undefined : { borderBottom: "1px solid var(--color-border)" }}>
      <dt style={{ color: "var(--color-text-muted)" }}>{rotulo}</dt>
      <dd className="font-medium text-right" style={{ color: "var(--color-dark)" }}>{valor}</dd>
    </div>
  );
}
