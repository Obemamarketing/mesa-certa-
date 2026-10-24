"use client";

import { useState } from "react";
import { PRAZOS } from "@/lib/empresa";
import { TIPOS_DE_PEDIDO, pedirSobreMeusDados, type TipoDePedido } from "@/lib/privacidade";
import { LIMITES, telefoneValido } from "@/lib/validacao";
import Campo from "../Campo";

export default function FormularioMeusDados() {
  const [tipo, setTipo] = useState<TipoDePedido>("exclusao");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<string | null>(null);

  const nomeOk = nome.trim().length >= 2;
  const telefoneOk = telefoneValido(telefone);
  const avisoTelefone = telefone.trim() && !telefoneOk ? "Confira o número: DDD + telefone, por exemplo (41) 99999-9999." : null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeOk || !telefoneOk || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await pedirSobreMeusDados({ tipo, nome: nome.trim(), telefone: telefone.trim(), mensagem: mensagem.trim() || undefined });
    setEnviando(false);
    if (r.erro || !r.protocolo) {
      setErro(r.erro ?? "Não foi possível enviar agora. Tente de novo.");
      return;
    }
    setProtocolo(r.protocolo);
  }

  if (protocolo) {
    return (
      <div role="status" className="caixa-ok">
        <p className="font-semibold" style={{ color: "var(--color-dark)" }}>
          Pedido recebido. Protocolo <span className="font-mono">{protocolo}</span>
        </p>
        <p>
          O restaurante vai falar com você pelo WhatsApp {telefone.trim()} para confirmar que o pedido é seu e responde em até {PRAZOS.respostaDias}{" "}
          dias. Guarde o número do protocolo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="formulario-legal" noValidate>
      <fieldset>
        <legend>O que você quer fazer?</legend>
        <div className="flex flex-col gap-2">
          {TIPOS_DE_PEDIDO.map((t) => (
            <label key={t.valor} className="opcao-pedido" data-marcada={tipo === t.valor ? "sim" : undefined}>
              <input type="radio" name="tipo" value={t.valor} checked={tipo === t.valor} onChange={() => setTipo(t.valor)} />
              <span>
                <span className="block font-semibold" style={{ color: "var(--color-dark)" }}>{t.rotulo}</span>
                <span className="block text-[13px]">{t.explicacao}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Campo label="Nome usado na reserva">
        <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={LIMITES.nome} autoComplete="name" className="w-full outline-none text-[15px] bg-transparent" />
      </Campo>
      <Campo label="WhatsApp usado na reserva" aviso={avisoTelefone}>
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} required placeholder="(41) 99999-9999" inputMode="tel" maxLength={LIMITES.telefone} autoComplete="tel" className="w-full outline-none text-[15px] bg-transparent" />
      </Campo>
      <Campo label="Mensagem (opcional)" dica="Por exemplo: o que precisa ser corrigido.">
        <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} maxLength={500} className="w-full outline-none text-[15px] bg-transparent resize-none" />
      </Campo>

      {erro && (
        <p role="alert" className="text-[13px] font-semibold" style={{ color: "var(--color-error)" }}>
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={!nomeOk || !telefoneOk || enviando}
        className="py-3.5 text-[15px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
      >
        {enviando ? "Enviando…" : "Enviar pedido"}
      </button>
      <p className="text-[12.5px]">Usamos estes dados só para atender o seu pedido.</p>
    </form>
  );
}
