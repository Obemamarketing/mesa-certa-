"use client";

// Mesas — a planta oficial do ZéPelin como configuração central.
//
// Em modo normal: a imagem da planta com os estados reais; clicar numa mesa
// mostra os dados. Em "Editar planta": CALIBRA o marcador de cada mesa
// (arrasta até encaixar na mesa desenhada) e troca o número. A imagem em si
// não muda — o que for salvo vale para o modo operação e para o cliente
// (lib/mesas.ts).
//
// Só desktop por enquanto — no celular a tela avisa e mostra a lista.

import { useMemo, useState } from "react";
import { HORARIO_FIXO, DIAS, useReservas, type DiaReserva } from "@/lib/reservas";
import { renomearMesa, salvarPosicoes, useMesasConfig, type MesaConfig } from "@/lib/mesas";
import PlantaRestaurante, { LegendaPlanta } from "../../PlantaRestaurante";
import { MesaMiniatura } from "../../MesaDesenho";

export default function MesasPage() {
  const { reservas } = useReservas();
  const { mesas, carregando, semTabela, recarregar } = useMesasConfig();

  const [editando, setEditando] = useState(false);
  // guarda o número com que a mesa entrou na edição: é por ele que as
  // alterações são comparadas, já que o próprio número pode mudar
  const [rascunho, setRascunho] = useState<(MesaConfig & { numeroOriginal: string })[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [numeroEditado, setNumeroEditado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dia, setDia] = useState<DiaReserva>("sexta");

  const lista = editando ? rascunho : mesas;
  // Se a mesa selecionada deixou de existir (renomeada em outra tela), o
  // painel simplesmente volta ao estado vazio — não precisa de efeito.
  const mesaObj = lista.find((m) => m.numero === selecionada) ?? null;

  const mudancas = useMemo(() => {
    if (!editando) return { posicoes: [] as MesaConfig[], renomeadas: [] as { mesa: MesaConfig; antes: string }[] };
    const original = new Map(mesas.map((m) => [m.numero, m]));
    const posicoes: MesaConfig[] = [];
    const renomeadas: { mesa: MesaConfig; antes: string }[] = [];
    for (const m of rascunho) {
      const antes = original.get(m.numeroOriginal);
      if (!antes) continue;
      // x e y são % da imagem, com duas casas
      if (Math.round(antes.x * 100) !== Math.round(m.x * 100) || Math.round(antes.y * 100) !== Math.round(m.y * 100)) posicoes.push(m);
      if (antes.numero !== m.numero) renomeadas.push({ mesa: m, antes: antes.numero });
    }
    return { posicoes, renomeadas };
  }, [editando, rascunho, mesas]);

  const temMudanca = mudancas.posicoes.length > 0 || mudancas.renomeadas.length > 0;

  function entrarNaEdicao() {
    setRascunho(mesas.map((m) => ({ ...m, numeroOriginal: m.numero })));
    setEditando(true);
    setErro(null);
    setAviso(null);
  }

  function cancelar() {
    setEditando(false);
    setRascunho([]);
    setErro(null);
    setAviso(null);
    setNumeroEditado("");
  }

  function mover(numero: string, x: number, y: number) {
    setRascunho((atual) => atual.map((m) => (m.numero === numero ? { ...m, x, y } : m)));
  }

  function selecionar(numero: string) {
    setSelecionada(numero);
    setNumeroEditado(numero);
    setErro(null);
  }

  function aplicarNumero() {
    const novo = numeroEditado.trim();
    if (!mesaObj || !novo || novo === mesaObj.numero) return;
    if (rascunho.some((m) => m.numero === novo)) {
      setErro(`Já existe uma mesa com o número ${novo}.`);
      return;
    }
    setRascunho((atual) => atual.map((m) => (m.numero === mesaObj.numero ? { ...m, numero: novo } : m)));
    setSelecionada(novo);
    setErro(null);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);

    const semId = [...mudancas.posicoes, ...mudancas.renomeadas.map((r) => r.mesa)].some((m) => !m.id);
    if (semId) {
      setSalvando(false);
      setErro("A planta ainda não foi ativada no banco. Rode supabase-migration-mesas.sql no Supabase.");
      return;
    }

    const r1 = await salvarPosicoes(mudancas.posicoes.map((m) => ({ id: m.id as string, x: m.x, y: m.y })));
    if (r1.erro) {
      setSalvando(false);
      setErro(`Não foi possível salvar as posições: ${r1.erro}`);
      await recarregar();
      return;
    }

    for (const { mesa, antes } of mudancas.renomeadas) {
      const r2 = await renomearMesa(mesa.id as string, mesa.numero);
      if (r2.erro) {
        setSalvando(false);
        setErro(`Mesa ${antes}: ${r2.erro}`);
        await recarregar();
        setEditando(false);
        setRascunho([]);
        return;
      }
    }

    await recarregar();
    setSalvando(false);
    setEditando(false);
    setRascunho([]);
    setAviso(
      mudancas.renomeadas.length > 0
        ? "Planta salva. As reservas das mesas renomeadas foram atualizadas junto."
        : "Planta salva.",
    );
  }

  const cartao = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "18px",
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7">
      {/* ---------- cabeçalho ---------- */}
      <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-[40px] leading-tight">Mesas</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {editando
              ? "Arraste o marcador de cada mesa até encaixar na mesa desenhada e ajuste o número. Nada muda até você salvar."
              : "A planta do salão. É esta configuração que o modo operação e o cliente enxergam."}
          </p>
        </div>

        <div className="hidden lg:flex items-center gap-2.5">
          {!editando ? (
            <>
              <select
                aria-label="Dia"
                value={dia}
                onChange={(e) => setDia(e.target.value as DiaReserva)}
                className="border text-sm px-3 py-2.5 bg-transparent"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
              >
                {DIAS.map((d) => (
                  <option key={d.chave} value={d.chave}>
                    {d.label.split("-")[0]}
                  </option>
                ))}
              </select>
              <button
                onClick={entrarNaEdicao}
                disabled={carregando}
                className="px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                Editar planta
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cancelar}
                disabled={salvando}
                className="px-5 py-2.5 text-sm font-semibold border disabled:opacity-40"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", borderRadius: "var(--radius-sm)" }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !temMudanca || semTabela}
                title={semTabela ? "Rode supabase-migration-mesas.sql no Supabase para poder salvar." : undefined}
                className="px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
              >
                {salvando ? "Salvando…" : semTabela ? "Salvar (indisponível)" : temMudanca ? "Salvar planta" : "Sem alterações"}
              </button>
            </>
          )}
        </div>
      </div>

      {semTabela && (
        <div
          className="mb-6 p-4 text-sm"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-secondary)", borderRadius: "var(--radius-md)" }}
        >
          <strong>A planta ainda não está no banco.</strong> Você está vendo a configuração padrão do sistema. Rode{" "}
          <code>supabase-migration-mesas.sql</code> no Supabase para poder editar e salvar.
        </div>
      )}

      {aviso && (
        <div
          className="mb-6 p-4 text-sm"
          style={{ background: "var(--color-accent-soft)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
        >
          {aviso}
        </div>
      )}

      {/* ---------- celular: só aviso + lista ---------- */}
      <div className="lg:hidden flex flex-col gap-4">
        <div className="p-4 text-sm" style={{ ...cartao, borderRadius: "var(--radius-md)" }}>
          A edição da planta é feita no computador. Aqui vai a configuração atual.
        </div>
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
          {lista.map((m) => (
            <div key={m.numero} className="flex items-center gap-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
              <MesaMiniatura mesa={m} estado="livre" tamanho={34} compacta />
              <span className="font-semibold text-sm">Mesa {m.numero}</span>
              <span className="text-xs ml-auto" style={{ color: "var(--color-text-muted)" }}>
                {m.capacidade} lugares · {m.zona}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- desktop: planta + painel ---------- */}
      <div className="hidden lg:grid gap-7 items-start" style={{ gridTemplateColumns: "minmax(0, 1.9fr) minmax(320px, 1fr)" }}>
        <div className="p-5" style={cartao}>
          <PlantaRestaurante
            reservas={reservas}
            dia={dia}
            horario={HORARIO_FIXO}
            mesaSelecionada={selecionada}
            mesas={lista}
            aoSelecionar={selecionar}
            aoMover={editando ? mover : undefined}
            statusNeutro={editando}
            destaque={editando ? "cor" : "anel"}
          />
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            {editando ? (
              <p className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
                Calibração: cada marcador (quadradinho numerado) cobre uma mesa da imagem. Arraste-o até ficar exatamente em
                cima dela. A imagem da planta não muda — só a posição do marcador, que vale para o modo operação e para o cliente.
              </p>
            ) : (
              <LegendaPlanta completa />
            )}
          </div>
        </div>

        {/* painel da mesa */}
        <aside className="p-6 sticky top-6 flex flex-col gap-5" style={cartao}>
          <div>
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--color-text-muted)" }}>
              {editando ? "Editando a mesa" : "Mesa"}
            </span>
            {mesaObj ? (
              <div className="flex items-center gap-4 mt-3">
                <MesaMiniatura mesa={mesaObj} estado={editando ? "selecionada" : "livre"} tamanho={74} />
                <div>
                  <p className="font-display text-[32px] leading-none">Mesa {mesaObj.numero}</p>
                  <p className="text-[13.5px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                    {mesaObj.capacidade} lugares · {mesaObj.zona}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm mt-2.5" style={{ color: "var(--color-text-muted)" }}>
                Clique numa mesa da planta para ver os dados dela.
              </p>
            )}
          </div>

          {mesaObj && (
            <>
              <div className="flex flex-col gap-2.5 text-sm pt-1" style={{ borderTop: "1px solid var(--color-border)" }}>
                <Linha rotulo="Capacidade" valor={`${mesaObj.capacidade} lugares`} />
                <Linha rotulo="Área" valor={mesaObj.zona} />
                <Linha rotulo="Posição na planta" valor={`${mesaObj.x.toFixed(1)}% · ${mesaObj.y.toFixed(1)}%`} />
              </div>

              {editando && (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="numero-mesa" className="text-[12.5px] font-medium">
                      Número da mesa
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="numero-mesa"
                        value={numeroEditado}
                        onChange={(e) => setNumeroEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") aplicarNumero();
                        }}
                        className="flex-1 min-w-0 border px-3 py-2 text-sm bg-transparent outline-none"
                        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
                      />
                      <button
                        onClick={aplicarNumero}
                        disabled={!numeroEditado.trim() || numeroEditado.trim() === mesaObj.numero}
                        className="px-3.5 py-2 text-[13px] font-semibold border disabled:opacity-40"
                        style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
                      >
                        Aplicar
                      </button>
                    </div>
                    <p className="text-[11.5px]" style={{ color: "var(--color-text-muted)" }}>
                      Ao salvar, as reservas dessa mesa passam para o número novo.
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          {erro && (
            <p className="text-[13px] font-medium" style={{ color: "var(--color-error)" }}>
              {erro}
            </p>
          )}

          {editando && (
            <div className="text-[12.5px] pt-1" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
              {temMudanca ? (
                <>
                  {mudancas.posicoes.length > 0 && <span className="block">{mudancas.posicoes.length} mesa(s) movida(s)</span>}
                  {mudancas.renomeadas.length > 0 && <span className="block">{mudancas.renomeadas.length} mesa(s) renomeada(s)</span>}
                </>
              ) : (
                "Nada alterado ainda."
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: "var(--color-text-muted)" }}>{rotulo}</span>
      <span className="font-medium text-right">{valor}</span>
    </div>
  );
}
