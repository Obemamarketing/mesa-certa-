"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Config = { ativo: boolean; antecedencia_minutos: number };

type Lembrete = {
  id: string;
  status: string;
  agendado_para: string;
  enviado_em: string | null;
  erro: string | null;
  tentativas: number;
  reservas: { nome: string; mesa_numero: string } | null;
};

type StatusEnvio = { configurado: boolean; faltando: string[] };

const ANTECEDENCIAS = [
  { minutos: 60, rotulo: "1 hora antes" },
  { minutos: 120, rotulo: "2 horas antes" },
  { minutos: 180, rotulo: "3 horas antes" },
  { minutos: 240, rotulo: "4 horas antes" },
  { minutos: 360, rotulo: "6 horas antes" },
];

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Agendado", cor: "var(--color-text-muted)" },
  enviando: { texto: "Enviando", cor: "var(--color-text-muted)" },
  enviado: { texto: "Enviado", cor: "#2f7d4f" },
  falhou: { texto: "Falhou", cor: "#b3372f" },
  cancelado: { texto: "Cancelado", cor: "var(--color-text-muted)" },
  expirado: { texto: "Expirado", cor: "var(--color-text-muted)" },
  ignorado: { texto: "Não agendado", cor: "var(--color-text-muted)" },
};

function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function LembretesWhatsapp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [envio, setEnvio] = useState<StatusEnvio | null>(null);
  const [semMigracao, setSemMigracao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [cfg, lista] = await Promise.all([
      supabase.from("config_lembretes").select("ativo, antecedencia_minutos").eq("id", 1).maybeSingle(),
      supabase
        .from("lembretes_whatsapp")
        .select("id, status, agendado_para, enviado_em, erro, tentativas, reservas(nome, mesa_numero)")
        .order("agendado_para", { ascending: false })
        .limit(8),
    ]);
    if (cfg.error || lista.error) {
      setSemMigracao(true);
      return;
    }
    setSemMigracao(false);
    setConfig((cfg.data as Config | null) ?? { ativo: true, antecedencia_minutos: 180 });
    setLembretes((lista.data ?? []) as unknown as Lembrete[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    fetch("/api/lembretes/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setEnvio)
      .catch(() => setEnvio(null));
    const canal = supabase
      .channel("lembretes-painel")
      .on("postgres_changes", { event: "*", schema: "public", table: "lembretes_whatsapp" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function salvar(parcial: Partial<Config>) {
    if (!config) return;
    const anterior = config;
    setConfig({ ...config, ...parcial });
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from("config_lembretes").update(parcial).eq("id", 1);
    setSalvando(false);
    if (error) {
      setConfig(anterior);
      setErro("Não foi possível salvar. Tente de novo.");
    } else {
      carregar();
    }
  }

  const cartao = { borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" };

  return (
    <div className="border p-5" style={cartao}>
      <p className="font-display text-lg">Lembretes por WhatsApp</p>
      <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--color-text-muted)" }}>
        Enviados automaticamente pelo sistema, antes do horário da reserva. Reservas canceladas não recebem.
      </p>

      {semMigracao && (
        <p className="text-sm" style={{ color: "#b3372f" }}>
          Os lembretes ainda não foram ativados no banco de dados. Rode o arquivo <strong>supabase-migration-lembretes.sql</strong> no Supabase.
        </p>
      )}

      {!semMigracao && config && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium block">Enviar lembretes</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{config.ativo ? "Ativado" : "Desativado — nada será enviado"}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.ativo}
              aria-label="Enviar lembretes por WhatsApp"
              disabled={salvando}
              onClick={() => salvar({ ativo: !config.ativo })}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60"
              style={{ background: config.ativo ? "var(--color-primary)" : "var(--color-border)" }}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: config.ativo ? 22 : 2 }} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="antecedencia" className="text-sm font-medium">Quando enviar</label>
            <select
              id="antecedencia"
              value={config.antecedencia_minutos}
              disabled={salvando}
              onChange={(e) => salvar({ antecedencia_minutos: Number(e.target.value) })}
              className="border text-sm px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm, 8px)" }}
            >
              {!ANTECEDENCIAS.some((a) => a.minutos === config.antecedencia_minutos) && (
                <option value={config.antecedencia_minutos}>{config.antecedencia_minutos} min antes</option>
              )}
              {ANTECEDENCIAS.map((a) => (
                <option key={a.minutos} value={a.minutos}>{a.rotulo}</option>
              ))}
            </select>
          </div>

          {erro && <p className="text-xs" style={{ color: "#b3372f" }}>{erro}</p>}

          {envio && !envio.configurado && (
            <div className="text-xs p-3" style={{ background: "var(--color-bg)", borderRadius: "var(--radius-sm, 8px)", color: "var(--color-text-muted)" }}>
              <strong style={{ color: "var(--color-text)" }}>Envio ainda não configurado.</strong> Os lembretes ficam agendados, mas só serão enviados depois que o
              servidor receber as credenciais da API oficial do WhatsApp. Falta definir: {envio.faltando.join(", ")}.
            </div>
          )}
          {envio?.configurado && (
            <p className="text-xs" style={{ color: "#2f7d4f" }}>Conexão com a API do WhatsApp configurada.</p>
          )}

          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Últimos lembretes</p>
            {lembretes.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nenhum lembrete agendado ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
                {lembretes.map((l) => {
                  const rotulo = ROTULO_STATUS[l.status] ?? { texto: l.status, cor: "var(--color-text-muted)" };
                  return (
                    <li key={l.id} className="py-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
                      <div className="flex justify-between gap-3">
                        <span>
                          {l.reservas?.nome ?? "Reserva"}
                          {l.reservas && <span style={{ color: "var(--color-text-muted)" }}> · Mesa {l.reservas.mesa_numero}</span>}
                        </span>
                        <span className="font-medium shrink-0" style={{ color: rotulo.cor }}>{rotulo.texto}</span>
                      </div>
                      <span className="text-xs block" style={{ color: "var(--color-text-muted)" }}>
                        {l.enviado_em ? `Enviado em ${formatarQuando(l.enviado_em)}` : `Agendado para ${formatarQuando(l.agendado_para)}`}
                      </span>
                      {l.erro && l.status !== "enviado" && (
                        <span className="text-xs block mt-0.5" style={{ color: l.status === "falhou" ? "#b3372f" : "var(--color-text-muted)" }}>{l.erro}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
