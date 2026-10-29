"use client";

import { useMemo, useState } from "react";
import {
  HORARIOS,
  horaBonita,
  datasParaReserva,
  diaDaData,
  relogioSaoPaulo,
  reservar,
  rotuloDaData,
  type Reserva,
} from "@/lib/reservas";
import { useMesasConfig } from "@/lib/mesas";
import { useDiasFechados } from "@/lib/diasFechados";
import { LIMITES, aniversarioValido, mascaraAniversario, telefoneValido } from "@/lib/validacao";
import MesaMapa from "../MesaMapa";
import SeletorDeData from "../SeletorDeData";

// quantas datas viram botão direto; as outras ficam no calendário
const DATAS_RAPIDAS = 3;

export default function NewReservationModal({
  reservas,
  dataInicial,
  inicial,
  onCriada,
  onFechar,
}: {
  reservas: Reserva[];
  /** Dados já conhecidos do cliente (quem vem da fila de espera). */
  inicial?: { nome: string; telefone: string; pessoas: number; observacao?: string };
  /** Chamada com as reservas criadas, antes de fechar. */
  onCriada?: (criadas: Reserva[]) => void;
  /** Data sugerida (a que o painel está mostrando). Se não der pra reservar
   *  nela — hoje, por exemplo —, vale a primeira data aberta da agenda. */
  dataInicial?: string;
  onFechar: () => void;
}) {
  // a agenda é a mesma do cliente: de amanhã até dois meses à frente
  const hojeIso = useMemo(() => relogioSaoPaulo().iso, []);
  const datas = useMemo(() => datasParaReserva(hojeIso), [hojeIso]);
  const { fechados } = useDiasFechados();
  const primeiraAberta = datas.find((d) => !fechados.has(d.iso))?.iso ?? datas[0]?.iso ?? "";

  const [dataEscolhida, setDataEscolhida] = useState<string | null>(dataInicial && datas.some((d) => d.iso === dataInicial) ? dataInicial : null);
  const data = dataEscolhida ?? primeiraAberta;
  const dia = diaDaData(data) ?? "sabado";
  const [horario, setHorario] = useState<string>(HORARIOS[0]);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [pessoas, setPessoas] = useState(inicial?.pessoas ?? 2);
  const [mesaNumero, setMesaNumero] = useState<string | null>(null);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [aniversario, setAniversario] = useState("");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // este formulário reserva uma mesa por vez: acima da maior mesa do salão não
  // existe mesa possível (grupo maior se reserva pela tela do cliente)
  const { mesas } = useMesasConfig();
  const maximoPessoas = Math.max(1, ...mesas.map((m) => m.capacidade));

  const nomeOk = nome.trim().length >= 2;
  const telefoneOk = telefoneValido(telefone);
  const aniversarioOk = aniversarioValido(aniversario);
  const avisoTelefone = telefone.trim() && !telefoneOk ? "Confira o telefone: DDD + número, por exemplo (41) 99999-9999." : null;
  const avisoAniversario = aniversario && !aniversarioOk ? "Aniversário: use dia e mês, por exemplo 12/03." : null;
  const fechado = fechados.get(data);
  const podeConfirmar = Boolean(mesaNumero) && Boolean(data) && nomeOk && telefoneOk && aniversarioOk && !fechado && !enviando;

  const rapidas = datas.slice(0, DATAS_RAPIDAS);
  const foraDasRapidas = Boolean(data) && !rapidas.some((d) => d.iso === data);

  function escolherData(iso: string) {
    setDataEscolhida(iso);
    setMesaNumero(null);
    setErro(null);
  }

  async function confirmar() {
    if (!podeConfirmar || !mesaNumero) return;
    setEnviando(true);
    setErro(null);
    // mesma função do site do cliente: as regras do banco valem igual aqui
    const { reservas: criadas, erro: mensagemErro } = await reservar({
      dataReserva: data,
      horario,
      mesas: [{ numero: mesaNumero, pessoas }],
      nome: nome.trim(),
      telefone: telefone.trim(),
      aniversario: aniversario.trim() || undefined,
      observacao: observacao.trim() || undefined,
    }, { viaPainel: true });
    setEnviando(false);
    if (mensagemErro || criadas.length === 0) {
      setErro(mensagemErro ?? "Não foi possível criar a reserva.");
      return;
    }
    onCriada?.(criadas);
    onFechar();
  }

  const estiloCampo = { borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" };

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: "rgba(42,23,18,0.45)" }} onClick={onFechar}>
      {calendarioAberto && (
        // o calendário abre por cima do formulário; clicar nele não fecha o formulário
        <div onClick={(e) => e.stopPropagation()}>
          <SeletorDeData
            datas={datas}
            fechados={fechados}
            selecionada={data}
            aoEscolher={(iso) => { escolherData(iso); setCalendarioAberto(false); }}
            aoFechar={() => setCalendarioAberto(false)}
            titulo="Data da reserva"
          />
        </div>
      )}

      <div
        className="w-full sm:max-w-lg sm:mx-4 max-h-[92vh] overflow-y-auto flex flex-col gap-5 p-5 sm:p-6"
        style={{ background: "var(--color-surface)", borderRadius: "var(--radius-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Nova reserva</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-lg" style={{ color: "var(--color-text-muted)" }}>×</button>
        </div>

        {/* data: as próximas viram botão; o resto da agenda fica no calendário */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Data</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {rapidas.map((d) => {
              const ativo = data === d.iso;
              const diaFechado = fechados.has(d.iso);
              return (
                <button
                  key={d.iso}
                  type="button"
                  disabled={diaFechado}
                  onClick={() => escolherData(d.iso)}
                  aria-pressed={ativo}
                  className="border py-2 px-1 flex flex-col items-center gap-0.5 disabled:opacity-45 disabled:cursor-not-allowed"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    borderColor: ativo ? "var(--color-primary)" : "var(--color-border)",
                    background: ativo ? "var(--color-primary-soft)" : "transparent",
                  }}
                >
                  <span className="text-sm font-semibold">{rotuloDaData(d.iso, true).split(",")[0]}</span>
                  <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    {rotuloDaData(d.iso, true).split(", ")[1]}{diaFechado ? " · fechado" : ""}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCalendarioAberto(true)}
              aria-pressed={foraDasRapidas}
              className="border py-2 px-1 flex flex-col items-center gap-0.5"
              style={{
                borderRadius: "var(--radius-sm)",
                borderColor: foraDasRapidas ? "var(--color-primary)" : "var(--color-border)",
                background: foraDasRapidas ? "var(--color-primary-soft)" : "transparent",
              }}
            >
              <span className="text-sm font-semibold">{foraDasRapidas ? rotuloDaData(data, true).split(",")[0] : "Outra data"}</span>
              <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                {foraDasRapidas ? `${rotuloDaData(data, true).split(", ")[1]} · trocar` : "calendário"}
              </span>
            </button>
          </div>
          {fechado && (
            <p className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>
              O restaurante está fechado em {rotuloDaData(data, true)}{fechado.motivo ? ` (${fechado.motivo})` : ""}. Escolha outra data.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-reserva-horario" className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Horário</label>
            <select
              id="nova-reserva-horario"
              value={horario}
              onChange={(e) => { setHorario(e.target.value); setMesaNumero(null); }}
              className="border px-3 py-2 text-sm bg-transparent"
              style={estiloCampo}
            >
              {HORARIOS.map((h) => (
                <option key={h} value={h}>{horaBonita(h)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Pessoas</label>
            <div className="flex items-center justify-between border px-3 py-2" style={estiloCampo}>
              <button onClick={() => { setPessoas((p) => Math.max(1, p - 1)); setMesaNumero(null); }} className="text-lg font-semibold w-5">−</button>
              <span className="text-sm font-semibold">{pessoas}</span>
              <button onClick={() => { setPessoas((p) => Math.min(maximoPessoas, p + 1)); setMesaNumero(null); }} className="text-lg font-semibold w-5">+</button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Mesa</label>
          <MesaMapa reservas={reservas} dia={dia} data={data} horario={horario} pessoasMin={pessoas} mesaSelecionada={mesaNumero} onSelecionar={setMesaNumero} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" maxLength={LIMITES.nome} className="border px-3 py-2.5 text-sm outline-none" style={estiloCampo} />
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone" inputMode="tel" maxLength={LIMITES.telefone} className="border px-3 py-2.5 text-sm outline-none" style={{ ...estiloCampo, borderColor: avisoTelefone ? "var(--color-error)" : "var(--color-border)" }} />
        </div>
        {avisoTelefone && (
          <p role="alert" className="text-xs font-semibold -mt-3" style={{ color: "var(--color-error)" }}>{avisoTelefone}</p>
        )}

        <div className="grid grid-cols-[130px_1fr] gap-3">
          <input value={aniversario} onChange={(e) => setAniversario(mascaraAniversario(e.target.value))} placeholder="Aniversário dd/mm" aria-label="Aniversário do cliente, dia e mês (opcional)" inputMode="numeric" maxLength={LIMITES.aniversario} className="border px-3 py-2.5 text-sm outline-none" style={{ ...estiloCampo, borderColor: avisoAniversario ? "var(--color-error)" : "var(--color-border)" }} />
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional) — ex: aniversário" maxLength={LIMITES.observacao} className="border px-3 py-2.5 text-sm outline-none" style={estiloCampo} />
        </div>
        {avisoAniversario && (
          <p role="alert" className="text-xs font-semibold -mt-3" style={{ color: "var(--color-error)" }}>{avisoAniversario}</p>
        )}

        {erro && <p className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onFechar} className="flex-1 py-2.5 text-sm font-semibold border" style={estiloCampo}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!podeConfirmar}
            className="flex-1 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
          >
            {enviando ? "Confirmando…" : "Confirmar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}
