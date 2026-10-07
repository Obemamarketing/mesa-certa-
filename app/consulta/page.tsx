"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import {
  DIAS,
  TOLERANCIA_MINUTOS,
  buscarReservaDoCliente,
  cancelarReserva,
  codigoDaReserva,
  dataDoDia,
  formatarDataCurta,
  minutosDoHorario,
  statusChegada,
  type Reserva,
} from "@/lib/reservas";
import { useMesasConfig } from "@/lib/mesas";

function horaDaTolerancia(horario: string): string {
  const total = minutosDoHorario(horario) + TOLERANCIA_MINUTOS;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Estado = { rotulo: string; fundo: string; cor: string; nota?: string };

function estadoDaReserva(r: Reserva, minutosAgora: number | null, hojeEhODia: boolean): Estado {
  if (r.cancelada) return { rotulo: "Cancelada", fundo: "var(--color-error-soft)", cor: "var(--color-error)", nota: "Esta reserva foi cancelada e a mesa foi liberada." };
  if (r.checkinEm) return { rotulo: "Encerrada", fundo: "var(--color-border)", cor: "var(--color-text-muted)", nota: "Você já foi recebido nesta reserva. Esperamos você de novo!" };
  const chegada = statusChegada(r, hojeEhODia ? minutosAgora : null);
  if (chegada === "atrasado") return { rotulo: "Encerrada", fundo: "var(--color-border)", cor: "var(--color-text-muted)", nota: "O prazo de tolerância desta reserva já passou. Se ainda quiser vir, faça uma nova reserva." };
  if (chegada === "tolerancia") return { rotulo: "Em tolerância", fundo: "var(--color-secondary-soft)", cor: "var(--color-secondary-dark)", nota: "Sua mesa está sendo guardada. Chegue até o fim da tolerância." };
  return { rotulo: "Confirmada", fundo: "var(--color-accent-soft)", cor: "var(--color-accent-dark)" };
}

export default function ConsultaPage() {
  const router = useRouter();
  const { mesas } = useMesasConfig();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Reserva[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [minutosAgora, setMinutosAgora] = useState<number | null>(null);
  const [hojeDia, setHojeDia] = useState<number | null>(null);
  const [acao, setAcao] = useState<{ id: string; tipo: "cancelar" | "alterar" } | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    setMinutosAgora(d.getHours() * 60 + d.getMinutes());
    setHojeDia(d.getDay());
  }, []);

  async function buscar() {
    if (!termo.trim() || buscando) return;
    setBuscando(true);
    setAcao(null);
    setResultados(await buscarReservaDoCliente(termo));
    setBuscando(false);
  }

  async function cancelar(id: string, depois?: () => void) {
    setProcessandoId(id);
    await cancelarReserva(id);
    setResultados(await buscarReservaDoCliente(termo));
    setProcessandoId(null);
    setAcao(null);
    depois?.();
  }

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/"><Image src="/logo-zeplin.jpg" alt={reservaBrand.restauranteAtual} width={44} height={44} className="rounded-full" /></Link>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>← Início</Link>
      </header>

      <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-14 gap-7 pt-4 sm:pt-10">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--color-primary)" }}>
            {reservaBrand.restauranteAtual}
          </span>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Consultar minha reserva</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Consulte os detalhes da sua reserva usando o WhatsApp informado na reserva ou o código recebido na confirmação.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="termo" className="text-[12.5px] font-medium" style={{ color: "var(--color-text-muted)" }}>WhatsApp ou código da reserva</label>
          <input
            id="termo"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="(41) 99999-9999 ou código"
            className="border px-5 py-4 text-[15px] outline-none"
            style={{ borderColor: "var(--color-border)", borderRadius: "14px", background: "var(--color-surface)", color: "var(--color-dark)" }}
          />
          <button
            onClick={buscar}
            disabled={!termo.trim() || buscando}
            className="py-4 text-[15px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--color-primary)", borderRadius: "14px" }}
          >
            {buscando ? "Consultando…" : "Consultar reserva"}
          </button>
        </div>

        {resultados !== null && resultados.length === 0 && (
          <div className="border px-5 py-6 flex flex-col gap-1.5" style={{ borderColor: "var(--color-border)", borderRadius: "16px", background: "var(--color-surface)" }}>
            <p className="font-display text-xl" style={{ color: "var(--color-dark)" }}>Reserva não encontrada</p>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Não encontramos nenhuma reserva com esses dados. Confira o número de WhatsApp usado na reserva ou o código da confirmação e tente de novo.
            </p>
            <Link href="/" className="text-[14px] font-semibold mt-2" style={{ color: "var(--color-primary)" }}>Fazer uma nova reserva →</Link>
          </div>
        )}

        {resultados?.map((r) => {
          const mesa = mesas.find((m) => m.numero === r.mesaNumero);
          const diaLabel = DIAS.find((d) => d.chave === r.dia);
          const hojeEhODia = hojeDia !== null && diaLabel?.diaSemana === hojeDia;
          const estado = estadoDaReserva(r, minutosAgora, hojeEhODia);
          const encerrada = estado.rotulo === "Cancelada" || estado.rotulo === "Encerrada";
          const confirmando = acao?.id === r.id ? acao.tipo : null;

          return (
            <article key={r.id} className="border overflow-hidden" style={{ borderColor: "var(--color-border)", borderRadius: "18px", background: "var(--color-surface)" }}>
              <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--color-text-muted)" }}>Reserva #{codigoDaReserva(r.id)}</p>
                  <p className="font-display text-[26px] leading-tight mt-1" style={{ color: "var(--color-dark)" }}>
                    {diaLabel?.label}, {formatarDataCurta(dataDoDia(r.dia))}
                  </p>
                </div>
                <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full shrink-0" style={{ background: estado.fundo, color: estado.cor }}>
                  {estado.rotulo}
                </span>
              </div>

              <dl className="px-6 py-4 flex flex-col text-[14.5px]">
                <Linha rotulo="Horário" valor={r.horario} />
                <Linha rotulo="Pessoas" valor={`${r.pessoas} pessoa${r.pessoas === 1 ? "" : "s"}`} />
                <Linha rotulo="Mesa" valor={`Mesa ${r.mesaNumero}`} />
                <Linha rotulo="Área" valor={mesa?.zona ?? "—"} />
                <Linha rotulo="Tolerância" valor={`Chegue até ${horaDaTolerancia(r.horario)}`} ultima={!r.observacao} />
                {r.observacao && <Linha rotulo="Observação" valor={r.observacao} ultima />}
              </dl>

              {estado.nota && (
                <p className="px-6 pb-4 text-[13.5px] leading-relaxed" style={{ color: estado.cor === "var(--color-error)" ? "var(--color-error)" : "var(--color-text-muted)" }}>
                  {estado.nota}
                </p>
              )}

              {!encerrada && !confirmando && (
                <div className="px-6 pb-6 pt-1 flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => setAcao({ id: r.id, tipo: "alterar" })}
                    className="flex-1 py-3 text-[14px] font-semibold border"
                    style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "12px" }}
                  >
                    Alterar reserva
                  </button>
                  <button
                    onClick={() => setAcao({ id: r.id, tipo: "cancelar" })}
                    className="flex-1 py-3 text-[14px] font-semibold border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", borderRadius: "12px" }}
                  >
                    Cancelar reserva
                  </button>
                </div>
              )}

              {!encerrada && confirmando && (
                <div className="px-6 pb-6 pt-1 flex flex-col gap-3">
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-dark)" }}>
                    {confirmando === "cancelar"
                      ? "Tem certeza que deseja cancelar? A mesa será liberada para outros clientes."
                      : "Para alterar data, mesa ou número de pessoas, cancelamos esta reserva e você escolhe uma nova em seguida. Deseja continuar?"}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => cancelar(r.id, confirmando === "alterar" ? () => router.push("/") : undefined)}
                      disabled={processandoId === r.id}
                      className="flex-1 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                    >
                      {processandoId === r.id ? "Aguarde…" : confirmando === "cancelar" ? "Sim, cancelar" : "Cancelar e escolher nova reserva"}
                    </button>
                    <button
                      onClick={() => setAcao(null)}
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
