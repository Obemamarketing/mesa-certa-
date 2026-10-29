"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reservaBrand } from "@/lib/reservaBrand";
import { baixarIcsDaReserva } from "@/lib/ics";
import {
  DATAS_NA_LISTA,
  DIAS,
  ATENDIMENTO,
  HORARIOS,
  TOLERANCIA_MINUTOS,
  horaBonita,
  dataDoIso,
  datasParaReserva,
  diaDaData,
  formatarDataCurta,
  listaDeMesas,
  lugaresLivres,
  lugaresLivresNoDia,
  relogioSaoPaulo,
  alterarMinhaReserva,
  codigoDaReserva,
  reservar,
  rotuloDaData,
  rotuloDaReserva,
  situacaoDoGrupo,
  statusMesa,
  useMesasOcupadas,
  type DataDisponivel,
  type DiaReserva,
  type Mesa,
  type Reserva,
} from "@/lib/reservas";
import { LIMITES, aniversarioValido, mascaraAniversario, nomeCompleto, telefoneValido } from "@/lib/validacao";
import { baixarComprovante } from "@/lib/comprovante";
import { esquecerAlteracao, lerAlteracao, type Alteracao } from "@/lib/alteracao";
import Captcha from "./Captcha";
import { horaLimiteDaTolerancia } from "@/lib/regras";
import Campo from "./Campo";
import RodapeLegal from "./RodapeLegal";
import { useAgora } from "@/lib/relogio";
import StepIndicator from "./StepIndicator";
import EscolhaMesaDesktop from "./EscolhaMesaDesktop";
import EscolhaMesaMobile from "./EscolhaMesaMobile";
import MenuMobile from "./MenuMobile";
import SeletorDeData from "./SeletorDeData";
import { useDiasFechados, type DiaFechado } from "@/lib/diasFechados";
import { useMesasConfig } from "@/lib/mesas";
import { entrarNaFila } from "@/lib/fila";

type Etapa = "inicio" | "horario" | "mesa" | "dados" | "revisar" | "confirmada" | "fila";

const ZONAS = [
  { chave: "Salão principal" as const, label: "Salão principal" },
  { chave: "Salão anexo" as const, label: "Salão anexo" },
  { chave: "Palco" as const, label: "Palco" },
  { chave: "Área externa" as const, label: "Área externa" },
];

function rotuloZona(zona: Mesa["zona"]): string {
  return ZONAS.find((z) => z.chave === zona)?.label ?? zona;
}

export default function ReservasPage() {
  // só quais mesas estão tomadas em cada data — o site do cliente não recebe
  // nome nem telefone de ninguém
  const router = useRouter();
  const { ocupadas: todasOcupadas, recarregar: recarregarTodas } = useMesasOcupadas();

  // ALTERAÇÃO: o cliente veio da consulta para trocar a própria reserva. A
  // reserva antiga continua valendo até a nova ser confirmada; enquanto isso,
  // as mesas dela aparecem livres para ELE (pode manter a mesma mesa e trocar
  // só o horário, por exemplo).
  const [alteracao, setAlteracao] = useState<Alteracao | null>(null);
  const [alterada, setAlterada] = useState(false);
  const semAMinha = (lista: typeof todasOcupadas) =>
    alteracao ? lista.filter((o) => !(o.dataReserva === alteracao.dataReserva && o.horario === alteracao.horario && alteracao.mesas.includes(o.mesaNumero))) : lista;
  const ocupadas = semAMinha(todasOcupadas);
  const recarregarMesas = async () => {
    const lista = await recarregarTodas();
    return lista ? semAMinha(lista) : null;
  };
  const { mesas } = useMesasConfig();
  const { fechados } = useDiasFechados();
  const [etapaEscolhida, setEtapa] = useState<Etapa>("inicio");

  // Agenda: o cliente reserva por DATA, de amanhã até dois meses à frente.
  // "Hoje" é o do restaurante (São Paulo) e só existe depois que a tela monta
  // no navegador — a página é gerada antes, e a data de quando ela foi gerada
  // não serve pra ninguém.
  const agora = useAgora(60000);
  const hojeIso = agora ? relogioSaoPaulo(agora).iso : null;
  const datas = useMemo(() => (hojeIso ? datasParaReserva(hojeIso) : []), [hojeIso]);
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null);
  // sem escolha (ou com a escolha fora da agenda): a primeira data aberta
  const data: string | null =
    (dataEscolhida && datas.some((d) => d.iso === dataEscolhida) ? dataEscolhida : null) ??
    datas.find((d) => !fechados.has(d.iso))?.iso ??
    datas[0]?.iso ??
    null;
  const dia: DiaReserva = (data && diaDaData(data)) || "sabado";
  // sem data não existe etapa seguinte: volta pro começo
  const etapa: Etapa = !data && etapaEscolhida !== "confirmada" ? "inicio" : etapaEscolhida;
  const rotuloData = data ? rotuloDaData(data) : "";
  const rotuloDataExtenso = data
    ? `${DIAS.find((d) => d.chave === dia)?.label}, ${dataDoIso(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`
    : "";

  const [pessoas, setPessoas] = useState(2);
  const [pessoasCustom, setPessoasCustom] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      const a = lerAlteracao();
      if (!a) return;
      setAlteracao(a);
      setPessoas(a.pessoas);
      setPessoasCustom(a.pessoas > 10);
      setDataEscolhida(a.dataReserva);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  function desistirDaAlteracao() {
    esquecerAlteracao();
    setAlteracao(null);
    setEtapa("inicio");
    router.push("/consulta");
  }
  // "passe" do captcha (quando ligado) e um contador para pedir um passe novo
  const [passe, setPasse] = useState<string | null>(null);
  const [reinicioDoCaptcha, setReinicioDoCaptcha] = useState(0);
  // Horário escolhido pelo cliente (almoço: 12h, 12h30 … 14h30). Começa vazio:
  // a etapa "horário" só libera o Continuar depois da escolha.
  const [horarioEscolhido, setHorarioEscolhido] = useState<string | null>(null);
  const horario = horarioEscolhido ?? HORARIOS[0];
  // Mesas escolhidas, na ordem da escolha. Grupo que não cabe numa mesa só
  // escolhe várias — o botão Continuar só libera quando a soma cobre todos.
  const [mesasNumeros, setMesasNumeros] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aniversario, setAniversario] = useState("");
  const [observacao, setObservacao] = useState("");
  // uma reserva por mesa: um grupo de 7 em duas mesas gera duas reservas
  const [reservasFeitas, setReservasFeitas] = useState<Reserva[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // recado na planta quando a mesa escolhida foi levada por outra pessoa
  const [alertaMesa, setAlertaMesa] = useState<string | null>(null);

  const escolhidas = mesasNumeros
    .map((n) => mesas.find((m) => m.numero === n))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const situacao = situacaoDoGrupo(escolhidas, pessoas);
  const zonasEscolhidas = [...new Set(escolhidas.map((m) => rotuloZona(m.zona)))].join(" · ");
  const tituloMesas = escolhidas.length > 1 ? `Mesas ${listaDeMesas(escolhidas.map((m) => m.numero))}` : `Mesa ${escolhidas[0]?.numero ?? ""}`;
  const lugaresEscolhidos = escolhidas.reduce((soma, m) => soma + m.capacidade, 0);

  // Dados de contato: o WhatsApp é por onde o lembrete chega, então um número
  // que não é telefone não pode passar. O aviso só aparece depois que a pessoa
  // começou a digitar — campo vazio não ganha bronca.
  const nomeOk = nomeCompleto(nome);
  const avisoNome = nome.trim() && !nomeOk ? "Digite nome e sobrenome (é por eles que você acha a reserva depois)." : null;
  const telefoneOk = telefoneValido(telefone);
  // aniversário é opcional (só dia e mês); se a pessoa começou a preencher, tem que terminar certo
  const aniversarioOk = aniversarioValido(aniversario);
  const dadosOk = nomeOk && telefoneOk && aniversarioOk;
  const avisoTelefone = telefone.trim() && !telefoneOk ? "Confira o número: DDD + telefone, por exemplo (41) 99999-9999." : null;
  const avisoAniversario = !aniversario || aniversarioOk ? null : aniversario.length < 5 ? "Complete com dia e mês: dd/mm." : "Essa data não existe. Use dia e mês, por exemplo 12/03.";

  const dicaAniversario = "Opcional. Só para lembrarmos da data se você vier perto dela.";
  const dicaObservacao = "Opcional. Se contar uma alergia ou necessidade de acessibilidade, usamos só para preparar sua visita.";

  // Escolhe ou desmarca. Com o grupo já acomodado não entra mesa nova: ninguém
  // reserva mesa a mais do que precisa. E só entra mesa livre NESSA data — o
  // clique pode vir da planta, onde nenhum desenho fica "desabilitado".
  function alternarMesa(numero: string) {
    const mesa = mesas.find((m) => m.numero === numero);
    setAlertaMesa(null);
    setMesasNumeros((atual) => {
      if (atual.includes(numero)) return atual.filter((n) => n !== numero);
      if (!mesa || !data || statusMesa(ocupadas, dia, horario, mesa, undefined, data) !== "livre") return atual;
      const atuais = atual
        .map((n) => mesas.find((m) => m.numero === n))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      if (situacaoDoGrupo(atuais, pessoas).cobre) return atual;
      return [...atual, numero];
    });
  }

  async function confirmar() {
    if (!situacao.cobre || (!alteracao && !dadosOk) || enviando || !data) return;
    setEnviando(true);
    setErro(null);

    // Uma reserva por mesa, todas gravadas de uma vez pelo banco: ou entra o
    // grupo inteiro, ou não entra nada — o cliente nunca fica com só parte das
    // mesas. Na alteração, a antiga só sai se a nova entrar.
    const resultado = alteracao
      ? await alterarMinhaReserva(alteracao.id, alteracao.digitos, { dataReserva: data, horario, mesas: situacao.partes })
      : await reservar(
          {
            dataReserva: data,
            horario,
            mesas: situacao.partes,
            nome: nome.trim(),
            telefone: telefone.trim(),
            aniversario: aniversario.trim() || undefined,
            observacao: observacao.trim() || undefined,
          },
          { captcha: passe },
        );
    // o passe do captcha vale uma vez só: pega outro para uma nova tentativa
    if (!alteracao) setReinicioDoCaptcha((n) => n + 1);

    if (resultado.erro || resultado.reservas.length === 0) {
      const mensagem = resultado.erro ?? "Não foi possível confirmar a reserva agora. Tente de novo.";
      // Alguém levou uma das mesas no meio-tempo: confere a planta de novo, tira
      // da escolha o que não está mais livre e leva a pessoa de volta pra planta
      // — senão ela não teria como saber QUAL mesa trocar.
      const atuais = resultado.mesaTomada ? await recarregarMesas() : null;
      setEnviando(false);
      if (atuais) {
        setMesasNumeros((escolha) =>
          escolha.filter((n) => {
            const mesa = mesas.find((m) => m.numero === n);
            return mesa ? statusMesa(atuais, dia, horario, mesa, undefined, data) === "livre" : false;
          }),
        );
        setAlertaMesa(
          situacao.partes.length > 1
            ? "Uma das mesas acabou de ser reservada por outra pessoa. Nada foi reservado — escolha outra mesa para completar."
            : "Essa mesa acabou de ser reservada por outra pessoa. Escolha outra.",
        );
        setEtapa("mesa");
      } else {
        setErro(mensagem);
      }
      return;
    }

    setEnviando(false);
    setReservasFeitas(resultado.reservas);
    if (alteracao) {
      esquecerAlteracao();
      setAlteracao(null);
      setAlterada(true);
    }
    setEtapa("confirmada");
    recarregarTodas();
  }

  function reiniciar() {
    setEtapa("inicio");
    setPessoasCustom(false);
    setHorarioEscolhido(null);
    setMesasNumeros([]);
    setNome("");
    setTelefone("");
    setAniversario("");
    setObservacao("");
    setReservasFeitas([]);
    setErro(null);
    setAlertaMesa(null);
    setAlterada(false);
  }

  // Data lotada para este grupo: as mesas livres não somam lugares para todos.
  // Aí, em vez de "Buscar mesas", o site oferece a fila de espera.
  const lotado = Boolean(data) && !fechados.has(data ?? "") && lugaresLivresNoDia(mesas, ocupadas, dia, data ?? "") < pessoas;
  // lugares livres em cada horário, para a etapa de escolher a hora
  const livresPorHorario = HORARIOS.map((h) => ({ horario: h, livres: data ? lugaresLivres(mesas, ocupadas, dia, h, data) : 0 }));
  const [enviandoFila, setEnviandoFila] = useState(false);
  const [erroFila, setErroFila] = useState<string | null>(null);

  async function entrarFila() {
    if (!data || !nomeOk || !telefoneOk || enviandoFila) return;
    setEnviandoFila(true);
    setErroFila(null);
    const r = await entrarNaFila(
      {
        dataReserva: data,
        horario,
        pessoas,
        nome: nome.trim(),
        telefone: telefone.trim(),
        observacao: observacao.trim() || undefined,
      },
      passe,
    );
    setReinicioDoCaptcha((n) => n + 1);
    if (r.erro || !r.codigo) {
      setEnviandoFila(false);
      setErroFila(r.erro ?? "Não foi possível entrar na fila agora. Tente de novo.");
      return;
    }
    // a página de acompanhamento é o "comprovante" da espera
    router.push(`/fila/${r.codigo}`);
  }

  const faixaAlteracao =
    alteracao && etapa !== "confirmada" ? (
      <div role="status" className="w-full px-5 py-3 text-[13.5px] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center" style={{ background: "var(--color-secondary-soft)", color: "var(--color-dark)", borderBottom: "1px solid var(--color-secondary)" }}>
        <span>
          <strong>Alterando sua reserva</strong> de {alteracao.rotulo}. Ela continua valendo até você confirmar a nova.
        </span>
        <button type="button" onClick={desistirDaAlteracao} className="font-semibold underline underline-offset-4" style={{ color: "var(--color-primary)" }}>
          Desistir
        </button>
      </div>
    ) : null;

  if (etapa === "inicio") {
    return (
      <>
      {faixaAlteracao}
      <TelaInicio
        datas={datas}
        data={data}
        setData={(iso) => { setDataEscolhida(iso); setMesasNumeros([]); setHorarioEscolhido(null); }}
        fechados={fechados}
        pessoas={pessoas}
        setPessoas={(n) => { setPessoas(n); setMesasNumeros([]); setHorarioEscolhido(null); }}
        pessoasCustom={pessoasCustom}
        setPessoasCustom={setPessoasCustom}
        onBuscar={() => setEtapa("horario")}
        lotado={lotado && !alteracao}
        onFila={() => { setErroFila(null); setEtapa("fila"); }}
      />
      </>
    );
  }

  if (etapa === "horario") {
    const diaLabelCompleto = rotuloDataExtenso;
    const textoTolerancia = `O almoço vai das ${horaBonita(ATENDIMENTO.abre)} às ${horaBonita(ATENDIMENTO.fecha)}. Há ${TOLERANCIA_MINUTOS} minutos de tolerância depois do horário escolhido.`;
    const horarioOk = Boolean(horarioEscolhido) && (livresPorHorario.find((l) => l.horario === horarioEscolhido)?.livres ?? 0) >= pessoas;
    const grade = (
      <EscolhaHorario
        opcoes={livresPorHorario}
        pessoas={pessoas}
        escolhido={horarioEscolhido}
        aoEscolher={(h) => { setHorarioEscolhido(h); setMesasNumeros([]); }}
      />
    );

    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {faixaAlteracao}
        {/* ===== MOBILE — inalterado ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
            <Link href="/" aria-label={`${reservaBrand.restauranteAtual} — início`}><Image src="/logo-zeplin.jpg" alt="" width={44} height={44} className="rounded-full" /></Link>
            <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
            </Link>
          </header>

          <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
            <div className="flex flex-col gap-6 pt-4 sm:pt-6">
              <TopoEtapa onVoltar={() => setEtapa("inicio")} etapaNumero={1} />
              <div>
                <h1 className="font-display text-2xl">Sua reserva</h1>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {rotuloData} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="font-display text-xl" style={{ color: "var(--color-dark)" }}>Que horas vocês chegam?</p>
                {grade}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{textoTolerancia}</p>

              <button
                onClick={() => setEtapa("mesa")}
                disabled={!horarioOk}
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
              <Image src="/logo-zeplin.jpg" alt="" width={46} height={46} className="rounded-full" />
              <span className="font-display text-[21px] leading-none" style={{ color: "var(--color-dark)" }}>{reservaBrand.restauranteAtual}</span>
            </Link>
            <Link href="/consulta" className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Consultar reserva
              {ICONE_CALENDARIO}
            </Link>
          </header>

          <div className="flex-1 flex flex-col items-center px-10 py-14">
            <div className="w-full max-w-[720px] flex flex-col gap-9">
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
                <h1 className="font-display text-[48px] leading-[1.1]" style={{ color: "var(--color-dark)" }}>Sua reserva</h1>
                <p className="text-[16px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {diaLabelCompleto} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}
                </p>
              </div>

              <div style={{ borderTop: "1px solid var(--color-border)" }} />

              <div className="border p-7 flex flex-col gap-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", borderRadius: "18px" }}>
                <div className="flex items-center gap-5">
                  <span className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                    {ICONE_RELOGIO_GRANDE}
                  </span>
                  <div>
                    <p className="font-display text-[28px] leading-tight" style={{ color: "var(--color-dark)" }}>Que horas vocês chegam?</p>
                    <p className="text-[14px] mt-2 leading-relaxed max-w-md" style={{ color: "var(--color-text-muted)" }}>{textoTolerancia}</p>
                  </div>
                </div>
                {grade}
              </div>

              <button
                onClick={() => setEtapa("mesa")}
                disabled={!horarioOk}
                className="w-full py-4 text-[15px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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

  if (etapa === "mesa") {
    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {faixaAlteracao}
        {/* ===== MOBILE — planta em pe + lista ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <EscolhaMesaMobile
            reservas={ocupadas}
            dia={dia}
            data={data ?? ""}
            horario={horario}
            pessoas={pessoas}
            mesasNumeros={mesasNumeros}
            alerta={alertaMesa}
            onAlternar={alternarMesa}
            onVoltar={() => setEtapa("horario")}
            onContinuar={() => setEtapa(alteracao ? "revisar" : "dados")}
          />
        </div>

        {/* ===== DESKTOP — planta do salao + painel de selecao ===== */}
        <div className="hidden lg:flex flex-col flex-1">
          <EscolhaMesaDesktop
            reservas={ocupadas}
            dia={dia}
            data={data ?? ""}
            horario={horario}
            pessoas={pessoas}
            mesasNumeros={mesasNumeros}
            alerta={alertaMesa}
            onAlternar={alternarMesa}
            onVoltar={() => setEtapa("horario")}
            onContinuar={() => setEtapa(alteracao ? "revisar" : "dados")}
          />
        </div>
      </main>
    );
  }

  if (etapa === "dados") {
    const diaLabelCompleto = rotuloDataExtenso;

    return (
      <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
        {faixaAlteracao}
        {/* ===== MOBILE — inalterado ===== */}
        <div className="lg:hidden flex-1 flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
            <Link href="/" aria-label={`${reservaBrand.restauranteAtual} — início`}><Image src="/logo-zeplin.jpg" alt="" width={44} height={44} className="rounded-full" /></Link>
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
                <Campo label="Nome e sobrenome" aviso={avisoNome}>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" required maxLength={LIMITES.nome} autoComplete="name" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="WhatsApp" aviso={avisoTelefone}>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" required inputMode="tel" maxLength={LIMITES.telefone} autoComplete="tel" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="Aniversário — dia e mês (opcional)" aviso={avisoAniversario} dica={dicaAniversario}>
                  <input value={aniversario} onChange={(e) => setAniversario(mascaraAniversario(e.target.value))} placeholder="dd/mm" inputMode="numeric" maxLength={LIMITES.aniversario} autoComplete="off" className="w-full outline-none text-sm bg-transparent" />
                </Campo>
                <Campo label="Observação (opcional)" dica={dicaObservacao}>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex: gostaria de uma mesa mais tranquila"
                    rows={2}
                    maxLength={LIMITES.observacao}
                    className="w-full outline-none text-sm bg-transparent resize-none"
                  />
                </Campo>
              </div>

              <button
                onClick={() => setEtapa("revisar")}
                disabled={!dadosOk}
                className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Revisar reserva
              </button>
              <AvisoDados />
            </div>
          </div>
        </div>

        {/* ===== DESKTOP — redesign ===== */}
        <div className="hidden lg:flex flex-col flex-1">
          <header className="flex items-center justify-between px-10 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo-zeplin.jpg" alt="" width={46} height={46} className="rounded-full" />
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
                    <Campo grande label="Nome e sobrenome" aviso={avisoNome}>
                      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" required maxLength={LIMITES.nome} autoComplete="name" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                    </Campo>
                    <div className="grid grid-cols-2 gap-4 items-start">
                      <Campo grande label="WhatsApp" aviso={avisoTelefone}>
                        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" required inputMode="tel" maxLength={LIMITES.telefone} autoComplete="tel" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                      </Campo>
                      <Campo grande label="Aniversário — dia e mês (opcional)" aviso={avisoAniversario} dica={dicaAniversario}>
                        <input value={aniversario} onChange={(e) => setAniversario(mascaraAniversario(e.target.value))} placeholder="dd/mm" inputMode="numeric" maxLength={LIMITES.aniversario} autoComplete="off" className="w-full outline-none text-[15px] bg-transparent" style={{ color: "var(--color-dark)" }} />
                      </Campo>
                    </div>
                    <Campo grande label="Observação (opcional)" dica={dicaObservacao}>
                      <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: gostaria de uma mesa mais tranquila"
                        rows={2}
                        maxLength={LIMITES.observacao}
                        className="w-full outline-none text-[15px] bg-transparent resize-none"
                        style={{ color: "var(--color-dark)" }}
                      />
                    </Campo>
                  </div>

                  <button
                    onClick={() => setEtapa("revisar")}
                    disabled={!dadosOk}
                    className="w-full py-4 text-[15px] font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: "var(--color-primary)", borderRadius: "14px" }}
                  >
                    Revisar reserva
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                  <AvisoDados />
                </div>

                {/* DIREITA — resumo da reserva */}
                <div className="border p-6 flex flex-col gap-1 sticky top-8" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", borderRadius: "18px" }}>
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase pb-4" style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>
                    Sua reserva
                  </span>

                  <LinhaResumoDesktop icon={ICONE_CALENDARIO}>{diaLabelCompleto}</LinhaResumoDesktop>
                  <LinhaResumoDesktop icon={ICONE_RELOGIO}>{horario}</LinhaResumoDesktop>
                  <LinhaResumoDesktop icon={ICONE_GRUPO}>{pessoas} pessoa{pessoas === 1 ? "" : "s"}</LinhaResumoDesktop>
                  {escolhidas.length > 0 && (
                    <LinhaResumoDesktop icon={ICONE_MESA} ultima>
                      <span>{tituloMesas}</span>
                      <span className="block text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {lugaresEscolhidos} lugares · {zonasEscolhidas}
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
        {faixaAlteracao}
      {/* HEADER */}
      <header className="flex items-center justify-between px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/" aria-label={`${reservaBrand.restauranteAtual} — início`}><Image src="/logo-zeplin.jpg" alt="" width={44} height={44} className="rounded-full" /></Link>
        <Link href="/consulta" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          Consultar reserva
        </Link>
      </header>

      <div className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 sm:px-8 pb-12">
        {/* FILA DE ESPERA — data lotada para o grupo */}
        {etapa === "fila" && (
          <div className="flex flex-col gap-5 pt-4 sm:pt-6">
            <button onClick={() => setEtapa("inicio")} className="text-sm font-medium self-start" style={{ color: "var(--color-text-muted)" }}>
              ← Voltar
            </button>
            <div>
              <h1 className="font-display text-2xl">Fila de espera</h1>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                {rotuloData} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}. Não há mesas livres para o seu grupo nesta data.
                Se alguém cancelar, o restaurante chama você no WhatsApp, por ordem de chegada na fila.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Campo label="Nome e sobrenome" aviso={avisoNome}>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" required maxLength={LIMITES.nome} autoComplete="name" className="w-full outline-none text-sm bg-transparent" />
              </Campo>
              <Campo label="WhatsApp" aviso={avisoTelefone}>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" required inputMode="tel" maxLength={LIMITES.telefone} autoComplete="tel" className="w-full outline-none text-sm bg-transparent" />
              </Campo>
              <Campo label="Horário que você prefere">
                <select value={horario} onChange={(e) => setHorarioEscolhido(e.target.value)} className="w-full outline-none text-sm bg-transparent">
                  {HORARIOS.map((h) => (
                    <option key={h} value={h}>{horaBonita(h)}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Observação (opcional)" dica={dicaObservacao}>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: pode ser na área externa" rows={2} maxLength={LIMITES.observacao} className="w-full outline-none text-sm bg-transparent resize-none" />
              </Campo>
            </div>

            <Captcha aoMudar={setPasse} chaveDeReinicio={reinicioDoCaptcha} />
            {erroFila && <p role="alert" className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erroFila}</p>}

            <button
              onClick={entrarFila}
              disabled={!nomeOk || !telefoneOk || enviandoFila}
              className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
            >
              {enviandoFila ? "Entrando na fila…" : "Entrar na fila de espera"}
            </button>
            <p className="text-xs text-center leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Entrar na fila não garante a mesa. Você recebe um link para acompanhar sua posição.
            </p>
            <Consentimento acao="entrar na fila" />
          </div>
        )}

        {/* TELA 5 — REVISAR */}
        {etapa === "revisar" && horario && escolhidas.length > 0 && (
          <div className="flex flex-col gap-5 pt-4 sm:pt-6">
            <TopoEtapa onVoltar={() => setEtapa(alteracao ? "mesa" : "dados")} etapaNumero={4} />
            <h1 className="font-display text-2xl">{alteracao ? "Revise a alteração" : "Revise sua reserva"}</h1>

            <div className="border overflow-hidden" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}>
              <div className="relative h-28">
                <Image src="/hero-zeplin.webp" alt="" fill className="object-cover" />
                <div className="absolute inset-0 flex items-end p-4" style={{ background: "linear-gradient(to top, rgba(42,23,18,0.75), rgba(42,23,18,0.1))" }}>
                  <span className="font-display text-lg text-white tracking-wide">{reservaBrand.restauranteAtual.toUpperCase()}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 p-5" style={{ background: "var(--color-surface)" }}>
                <Linha label="Data" valor={rotuloData} />
                <Linha label="Horário" valor={horaBonita(horario)} />
                <Linha label="Pessoas" valor={`${pessoas} pessoa${pessoas === 1 ? "" : "s"}`} />
                <Linha label={escolhidas.length > 1 ? "Mesas" : "Mesa"} valor={tituloMesas.replace(/^Mesas? /, "")} />
                {escolhidas.length > 1 && (
                  <Linha label="Divisão" valor={situacao.partes.map((p) => `${p.numero}: ${p.pessoas}`).join(" · ")} />
                )}
                <Linha label="Área" valor={zonasEscolhidas} />
                {alteracao ? (
                  <div style={{ borderTop: "1px solid var(--color-border)" }} className="pt-2.5 mt-1 flex flex-col gap-2.5">
                    <Linha label="Antes" valor={alteracao.rotulo} />
                  </div>
                ) : (
                  <div style={{ borderTop: "1px solid var(--color-border)" }} className="pt-2.5 mt-1 flex flex-col gap-2.5">
                    <Linha label="Nome" valor={nome} />
                    <Linha label="WhatsApp" valor={telefone} />
                    {aniversario && <Linha label="Aniversário" valor={aniversario} />}
                    {observacao && <Linha label="Observação" valor={observacao} />}
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => setEtapa(alteracao ? "mesa" : "dados")} className="text-sm font-medium self-start" style={{ color: "var(--color-primary)" }}>
              {alteracao ? "Trocar a mesa" : "Editar reserva"}
            </button>

            {alteracao && (
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                Ao confirmar, a reserva anterior é cancelada e esta entra no lugar. Se a mesa nova for tomada antes, nada muda: sua reserva anterior
                continua valendo.
              </p>
            )}
            {!alteracao && <Captcha aoMudar={setPasse} chaveDeReinicio={reinicioDoCaptcha} />}
            {erro && <p role="alert" className="text-xs font-semibold" style={{ color: "var(--color-error)" }}>{erro}</p>}


            <button
              onClick={confirmar}
              disabled={enviando}
              className="py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
            >
              {enviando ? "Confirmando…" : alteracao ? "Confirmar alteração" : "Confirmar reserva"}
            </button>
            <Consentimento acao="confirmar" />
          </div>
        )}

        {/* TELA 6 — CONFIRMADA */}
        {etapa === "confirmada" && reservasFeitas.length > 0 && (
          <div className="flex-1 flex flex-col items-center text-center gap-4 pt-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-accent)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h1 className="font-display text-2xl">{alterada ? "Reserva alterada!" : "Reserva confirmada!"}</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {reservasFeitas.length > 1 ? "Suas mesas estão reservadas" : "Sua mesa está reservada"} no {reservaBrand.restauranteAtual}. Chegue até as {horaLimiteDaTolerancia(reservasFeitas[0].horario).replace(":", "h")}: depois
              da tolerância, a mesa pode ser liberada.
            </p>

            <div className="w-full border p-5 flex flex-col gap-2.5 text-left" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
              <Linha label="Data" valor={rotuloDaReserva(reservasFeitas[0])} />
              <Linha label="Horário" valor={horaBonita(reservasFeitas[0].horario)} />
              <Linha label="Pessoas" valor={`${reservasFeitas.reduce((s, r) => s + r.pessoas, 0)} pessoa${reservasFeitas.reduce((s, r) => s + r.pessoas, 0) === 1 ? "" : "s"}`} />
              <Linha label={reservasFeitas.length > 1 ? "Mesas" : "Mesa"} valor={listaDeMesas(reservasFeitas.map((r) => r.mesaNumero))} />
              {reservasFeitas.length > 1 && (
                <Linha label="Divisão" valor={reservasFeitas.map((r) => `${r.mesaNumero}: ${r.pessoas}`).join(" · ")} />
              )}
              <Linha label="Área" valor={[...new Set(reservasFeitas.map((r) => { const m = mesas.find((x) => x.numero === r.mesaNumero); return m ? rotuloZona(m.zona) : ""; }).filter(Boolean))].join(" · ")} />
            </div>

            <div className="w-full flex flex-col gap-2.5 mt-2">
              <button
                onClick={() =>
                  baixarComprovante({
                    titulo: alterada ? "Reserva alterada" : "Reserva confirmada",
                    data: rotuloDaReserva(reservasFeitas[0]),
                    horario: horaBonita(reservasFeitas[0].horario),
                    pessoas: reservasFeitas.reduce((soma, r) => soma + r.pessoas, 0),
                    mesas: listaDeMesas(reservasFeitas.map((r) => r.mesaNumero)),
                    area: [...new Set(reservasFeitas.map((r) => { const m = mesas.find((x) => x.numero === r.mesaNumero); return m ? rotuloZona(m.zona) : ""; }).filter(Boolean))].join(" · "),
                    nome: reservasFeitas[0].nome,
                    codigo: codigoDaReserva(reservasFeitas[0].id),
                    tolerancia: `Chegue até as ${horaLimiteDaTolerancia(reservasFeitas[0].horario).replace(":", "h")}`,
                    site: window.location.host,
                  })
                }
                className="py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: "var(--color-accent-dark)", borderRadius: "var(--radius-sm)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                Baixar comprovante
              </button>
              <button
                onClick={() => baixarIcsDaReserva(reservasFeitas[0], { mesas: reservasFeitas.map((r) => r.mesaNumero), pessoas: reservasFeitas.reduce((s, r) => s + r.pessoas, 0) })}
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

const ICONE_CALENDARIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
);
const ICONE_PESSOA = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" /></svg>
);
const ICONE_RELOGIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICONE_RELOGIO_GRANDE = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICONE_MESA = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
);
const ICONE_GRUPO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="8.5" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M2.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M14.5 15c2.3.2 4 2 4 4.3" /></svg>
);

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
      className={`campo-foco relative flex items-center flex-1 min-w-0 ${compacto ? "gap-2 px-3.5 py-4" : "gap-3 px-4 py-3 sm:px-5 sm:py-2.5"}`}
      style={divisor ? { borderLeft: "1px solid var(--color-border)" } : undefined}
    >
      <span className={`shrink-0 ${compacto ? "scale-[0.94]" : ""}`} style={{ color: "var(--color-primary)" }}>{icon}</span>
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className={compacto ? "text-[12px]" : "text-[12.5px]"} style={{ color: "var(--color-text-muted)" }}>{label}</span>
        <span className={`font-semibold truncate ${compacto ? "text-[15px]" : "text-[15.5px]"}`} style={{ color: "var(--color-dark)" }}>{displayValue}</span>
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

// Grupo maior que isso não cabe no restaurante inteiro.
const MAXIMO_PESSOAS = 60;

// "Mais de 10 pessoas": campo de número digitado. Com o valor preso direto ao
// número, escrever "1" já virava "11" e "15" saía "115". Aqui o campo guarda o
// texto que a pessoa digita; o número só é confirmado quando está dentro do
// limite, e ao sair do campo o que sobrar é ajustado.
function CampoQuantidade({ pessoas, setPessoas, compacto }: { pessoas: number; setPessoas: (n: number) => void; compacto: boolean }) {
  const [rascunho, setRascunho] = useState(String(pessoas));

  function aoDigitar(texto: string) {
    const limpo = texto.replace(/\D/g, "").slice(0, 3);
    setRascunho(limpo);
    const n = Number(limpo);
    if (limpo && n >= 11 && n <= MAXIMO_PESSOAS) setPessoas(n);
  }

  function aoSair() {
    const n = Math.min(MAXIMO_PESSOAS, Math.max(11, Number(rascunho) || 11));
    setRascunho(String(n));
    setPessoas(n);
  }

  return (
    <input
      inputMode="numeric"
      aria-label={`Quantidade de pessoas (de 11 a ${MAXIMO_PESSOAS})`}
      value={rascunho}
      onChange={(e) => aoDigitar(e.target.value)}
      onBlur={aoSair}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`font-semibold bg-transparent outline-none w-full ${compacto ? "text-[15px]" : "text-[15.5px]"}`}
      style={{ color: "var(--color-dark)" }}
    />
  );
}

function CampoPessoas({
  pessoas,
  setPessoas,
  custom,
  setCustom,
  mostrarSeta = false,
  divisor = false,
  compacto = false,
}: {
  pessoas: number;
  setPessoas: (n: number) => void;
  custom: boolean;
  setCustom: (b: boolean) => void;
  mostrarSeta?: boolean;
  divisor?: boolean;
  compacto?: boolean;
}) {
  const opcoesPessoas = [
    ...Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
      <option key={n} value={n}>{n} pessoa{n === 1 ? "" : "s"}</option>
    )),
    <option key="mais" value="mais">Mais de 10 pessoas</option>,
  ];

  if (custom) {
    return (
      <div
        className={`relative flex items-center flex-1 min-w-0 ${compacto ? "gap-2 px-3.5 py-4" : "gap-3 px-4 py-3 sm:px-5 sm:py-2.5"}`}
        style={divisor ? { borderLeft: "1px solid var(--color-border)" } : undefined}
      >
        <span className={`shrink-0 ${compacto ? "scale-[0.94]" : ""}`} style={{ color: "var(--color-primary)" }}>{ICONE_PESSOA}</span>
        <div className="flex-1 min-w-0 flex flex-col leading-tight">
          <span className={compacto ? "text-[12px]" : "text-[12.5px]"} style={{ color: "var(--color-text-muted)" }}>Pessoas</span>
          <CampoQuantidade pessoas={pessoas} setPessoas={setPessoas} compacto={compacto} />
        </div>
        <button
          type="button"
          onClick={() => { setCustom(false); setPessoas(10); }}
          aria-label="Escolher outra quantidade"
          className="shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    );
  }

  return (
    <CampoReserva
      label="Pessoas"
      icon={ICONE_PESSOA}
      displayValue={`${pessoas} pessoa${pessoas === 1 ? "" : "s"}`}
      value={String(pessoas)}
      onChange={(v) => {
        if (v === "mais") { setCustom(true); setPessoas(11); }
        else setPessoas(Number(v));
      }}
      mostrarSeta={mostrarSeta}
      divisor={divisor}
      compacto={compacto}
    >
      {opcoesPessoas}
    </CampoReserva>
  );
}

function TelaInicio({
  datas,
  data,
  setData,
  fechados,
  pessoas,
  setPessoas,
  pessoasCustom,
  setPessoasCustom,
  onBuscar,
  lotado,
  onFila,
}: {
  /** Todas as datas que dá pra reservar (de amanhã até dois meses à frente). */
  datas: DataDisponivel[];
  /** Data escolhida; null só no instante antes de a tela montar no navegador. */
  data: string | null;
  setData: (iso: string) => void;
  /** Dias em que o restaurante está fechado (marcados pelo administrador). */
  fechados: Map<string, DiaFechado>;
  pessoas: number;
  setPessoas: (n: number) => void;
  pessoasCustom: boolean;
  setPessoasCustom: (b: boolean) => void;
  onBuscar: () => void;
  /** Não sobram lugares para o grupo na data escolhida. */
  lotado: boolean;
  /** Abre a fila de espera da data escolhida. */
  onFila: () => void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  // "Reservar uma mesa" no menu: rola até o cartão de reserva e o destaca por
  // um instante — a página é curta e o cartão muitas vezes já está na tela, aí
  // só rolar não mostraria nada.
  function irParaReserva() {
    const area = document.getElementById("reservar-mobile");
    if (!area) return;
    area.scrollIntoView({ behavior: "smooth", block: "center" });
    const cartao = area.firstElementChild as HTMLElement | null;
    if (!cartao) return;
    const sombraOriginal = cartao.style.boxShadow;
    cartao.style.transition = "box-shadow 250ms";
    cartao.style.boxShadow = "0 0 0 3px var(--color-primary), " + sombraOriginal;
    setTimeout(() => {
      cartao.style.boxShadow = sombraOriginal;
    }, 1400);
  }
  const diaLabel = data ? rotuloDaData(data, true) : "Carregando…";
  const ultimaData = datas[datas.length - 1];

  // A lista mostra só as próximas datas; o resto da agenda (até dois meses)
  // fica no calendário, pra lista não virar um painel enorme. Se a pessoa
  // escolheu no calendário uma data que não está entre as próximas, ela entra
  // na lista também — senão o campo não teria como mostrá-la.
  // Dia fechado continua na lista (pra pessoa entender por que não dá), mas
  // não pode ser escolhido.
  const proximas = datas.slice(0, DATAS_NA_LISTA);
  const listadas = data && !proximas.some((d) => d.iso === data) ? [...proximas, ...datas.filter((d) => d.iso === data)] : proximas;
  const escolherNaLista = (valor: string) => (valor === "outra" ? setCalendarioAberto(true) : setData(valor));
  const opcoesDia = [
    ...listadas.map((d) => (
      <option key={d.iso} value={d.iso} disabled={fechados.has(d.iso)}>
        {rotuloDaData(d.iso, true)}
        {fechados.has(d.iso) ? " — fechado" : ""}
      </option>
    )),
    <option key="outra" value="outra">Escolher outra data…</option>,
  ];
  // atalho visível pro calendário: nem todo mundo abre a lista até o fim
  const atalhoCalendario = ultimaData ? (
    <button
      type="button"
      onClick={() => setCalendarioAberto(true)}
      className="self-start flex items-center gap-1.5 text-[13px] font-semibold"
      style={{ color: "var(--color-primary)" }}
    >
      {ICONE_CALENDARIO}
      Ver calendário · datas até {formatarDataCurta(ultimaData.data)}
    </button>
  ) : null;

  const fechadoNoDiaEscolhido = data ? fechados.get(data) : undefined;
  const avisoFechado = fechadoNoDiaEscolhido ? (
    <p
      role="alert"
      className="text-[13.5px] font-semibold leading-snug px-3.5 py-3"
      style={{ background: "#FBE3E0", border: "1.5px solid var(--color-error)", color: "var(--color-error)", borderRadius: "12px" }}
    >
      Fechado em {diaLabel}
      {fechadoNoDiaEscolhido.motivo ? ` — ${fechadoNoDiaEscolhido.motivo}` : ""}. Escolha outro dia para reservar.
    </p>
  ) : null;

  const avisoLotado =
    lotado && !fechadoNoDiaEscolhido ? (
      <p
        role="status"
        className="text-[13.5px] leading-snug px-3.5 py-3"
        style={{ background: "var(--color-secondary-soft)", border: "1.5px solid var(--color-secondary)", color: "var(--color-dark)", borderRadius: "12px" }}
      >
        <strong>Lotado em {diaLabel} para {pessoas} pessoa{pessoas === 1 ? "" : "s"}.</strong> Entre na fila de espera: se uma mesa liberar, o restaurante chama
        você no WhatsApp. Ou escolha outra data.
      </p>
    ) : null;

  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      {calendarioAberto && (
        <SeletorDeData
          datas={datas}
          fechados={fechados}
          selecionada={data}
          aoEscolher={(iso) => { setData(iso); setCalendarioAberto(false); }}
          aoFechar={() => setCalendarioAberto(false)}
        />
      )}

      {/* ===================== MOBILE (< lg) ===================== */}
      <div className="lg:hidden flex flex-col">
        <MenuMobile
          aberto={menuAberto}
          aoFechar={() => setMenuAberto(false)}
          aoReservar={irParaReserva}
        />
        <section className="relative w-full h-[640px] overflow-hidden">
          <Image src="/hero-zeplin.webp" alt={`Salão do ${reservaBrand.restauranteAtual}`} fill priority className="object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(20,11,8,0.55) 0%, rgba(20,11,8,0.05) 22%, rgba(20,11,8,0.12) 50%, rgba(20,11,8,0.88) 100%)",
            }}
          />

          <div className="foco-claro relative z-10 flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2.5">
              <Image src="/logo-zeplin.jpg" alt="" width={38} height={38} className="rounded-full" />
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
                type="button"
                aria-label="Abrir menu"
                aria-haspopup="dialog"
                aria-expanded={menuAberto}
                onClick={() => setMenuAberto(true)}
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

        <div id="reservar-mobile" className="relative z-20 -mt-9 px-4 scroll-mt-6">
          <div
            className="flex flex-col divide-y overflow-hidden"
            style={{ background: "var(--color-surface)", borderRadius: "28px", boxShadow: "0 18px 40px -12px rgba(42,23,18,0.35)" }}
          >
            <CampoReserva label="Data" icon={ICONE_CALENDARIO} displayValue={diaLabel} value={data ?? ""} onChange={escolherNaLista} mostrarSeta>
              {opcoesDia}
            </CampoReserva>
            <CampoPessoas pessoas={pessoas} setPessoas={setPessoas} custom={pessoasCustom} setCustom={setPessoasCustom} mostrarSeta />
            <div className="p-3 flex flex-col gap-2.5">
              <div className="px-1.5 pt-0.5">{atalhoCalendario}</div>
              {avisoFechado}
              {avisoLotado}
              <button
                onClick={lotado ? onFila : onBuscar}
                disabled={!data || Boolean(fechadoNoDiaEscolhido)}
                className="w-full py-3.5 text-[14.5px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--color-primary)", borderRadius: "999px" }}
              >
                {lotado ? "Entrar na fila de espera" : "Buscar mesas"}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-10">
          <RodapeLegal />
        </div>
      </div>

      {/* ===================== DESKTOP (lg+) — composição dividida ===================== */}
      <div className="hidden lg:flex" style={{ minHeight: "100vh" }}>
        {/* ESQUERDA — creme, logo, navegação, título, formulário */}
        <div className="w-1/2 flex flex-col px-9 xl:px-12 py-9" style={{ background: "var(--color-bg)" }}>
          {/* HEADER: logo com presença + navegação + consultar reserva (discreto) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 shrink-0">
              <Image src="/logo-zeplin.jpg" alt="" width={52} height={52} className="rounded-full shrink-0" />
              <span className="font-display text-[22px] leading-none" style={{ color: "var(--color-dark)" }}>
                {reservaBrand.restauranteAtual}
              </span>
            </div>
            <nav aria-label="Principal" className="flex items-center gap-4 text-[13px] shrink-0" style={{ color: "var(--color-text-muted)" }}>
              <span aria-current="page" className="font-medium pb-1" style={{ color: "var(--color-primary)", borderBottom: "1px solid var(--color-primary)" }}>Início</span>
              <Link href="/cardapio" className="pb-1 hover:underline underline-offset-4">Cardápio</Link>
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
              Boa comida,<br />boas<br /><span style={{ color: "var(--color-secondary-dark)" }}>companhias.</span>
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
                    Escolha a data, o horário e venha almoçar no {reservaBrand.restauranteAtual}.
                  </p>
                </div>

                <div className="flex items-stretch" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <CampoReserva compacto mostrarSeta label="Data" icon={ICONE_CALENDARIO} displayValue={diaLabel} value={data ?? ""} onChange={escolherNaLista}>
                    {opcoesDia}
                  </CampoReserva>
                  <CampoPessoas compacto divisor pessoas={pessoas} setPessoas={setPessoas} custom={pessoasCustom} setCustom={setPessoasCustom} />
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <div className="px-1">{atalhoCalendario}</div>
                  {avisoFechado}
                  {avisoLotado}
                  <button
                    onClick={lotado ? onFila : onBuscar}
                    disabled={!data || Boolean(fechadoNoDiaEscolhido)}
                    className="w-full py-4 text-[15px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--color-primary)", borderRadius: "12px" }}
                  >
                    {lotado ? "Entrar na fila de espera" : "Buscar mesas"}
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
          <Image src="/hero-zeplin.webp" alt={`Salão do ${reservaBrand.restauranteAtual}`} fill priority className="object-cover object-[center_40%]" />
        </div>
      </div>
      <div className="hidden lg:block">
        <RodapeLegal />
      </div>
    </main>
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

// Aviso na hora de pedir os dados: para que servem (LGPD, art. 9º).
function AvisoDados() {
  return (
    <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
      Usamos seu nome e WhatsApp só para cuidar da sua reserva. Nada de propaganda.{" "}
      <Link href="/privacidade" className="font-semibold underline underline-offset-4" style={{ color: "var(--color-primary)" }}>
        Política de privacidade
      </Link>
    </p>
  );
}

// Texto embaixo do botão final: ao confirmar, a pessoa aceita os termos.
function Consentimento({ acao }: { acao: string }) {
  const link = "font-semibold underline underline-offset-4";
  return (
    <p className="text-xs text-center leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
      Ao {acao}, você aceita os{" "}
      <Link href="/termos" className={link} style={{ color: "var(--color-primary)" }}>Termos de uso</Link> e a{" "}
      <Link href="/cancelamento" className={link} style={{ color: "var(--color-primary)" }}>Política de cancelamento</Link>. Seus dados seguem a{" "}
      <Link href="/privacidade" className={link} style={{ color: "var(--color-primary)" }}>Política de privacidade</Link>.
    </p>
  );
}

// Os horários do almoço, com quantos lugares sobram em cada um para o grupo.
// Horário sem lugar para o grupo fica desabilitado ("lotado").
function EscolhaHorario({
  opcoes,
  pessoas,
  escolhido,
  aoEscolher,
}: {
  opcoes: { horario: string; livres: number }[];
  pessoas: number;
  escolhido: string | null;
  aoEscolher: (h: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Horário de chegada" className="grid grid-cols-3 gap-2.5">
      {opcoes.map(({ horario, livres }) => {
        const cabe = livres >= pessoas;
        const marcado = escolhido === horario;
        return (
          <button
            key={horario}
            type="button"
            role="radio"
            aria-checked={marcado}
            disabled={!cabe}
            onClick={() => aoEscolher(horario)}
            className="flex flex-col items-center justify-center py-3 border disabled:cursor-not-allowed"
            style={{
              borderRadius: "12px",
              borderColor: marcado ? "var(--color-primary)" : "var(--color-border-field)",
              background: marcado ? "var(--color-primary)" : cabe ? "var(--color-surface)" : "var(--color-bg)",
              color: marcado ? "#fff" : cabe ? "var(--color-dark)" : "var(--color-text-muted)",
            }}
          >
            <span className="text-[17px] font-semibold tabular-nums" style={!cabe ? { textDecoration: "line-through" } : undefined}>{horaBonita(horario)}</span>
            <span className="text-[11.5px] mt-0.5">{cabe ? (marcado ? "escolhido" : "disponível") : "lotado"}</span>
          </button>
        );
      })}
    </div>
  );
}
