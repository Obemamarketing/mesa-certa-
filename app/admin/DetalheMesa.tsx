"use client";

import { useState } from "react";
import { ROTULO_STATUS_CHEGADA, statusChegada, type Mesa, type Reserva } from "@/lib/reservas";
import { linkWhatsapp, mensagemConfirmacao } from "@/lib/whatsapp";
import StatusBadge from "./StatusBadge";

const ICONE_MESA = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v6M19 13v6" /></svg>
);
const ICONE_RELOGIO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICONE_TELEFONE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 5c0 8.284 6.716 15 15 15l1-4-5-2-2 2c-2.5-1-4.5-3-5.5-5.5l2-2-2-5-4 1Z" /></svg>
);
const ICONE_CHECK = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const ICONE_ALERTA = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 9v4M12 16.5h.01" /><path d="M10.3 3.9 1.8 18.5a1.8 1.8 0 0 0 1.55 2.7h17.3a1.8 1.8 0 0 0 1.55-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" /></svg>
);
const ICONE_NOTA = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 16.5h5" /></svg>
);
const ICONE_WHATSAPP = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5C11 9 10.5 7.8 10.3 7.3c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.5-.3Z" /><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" /></svg>
);

export default function DetalheMesaConteudo({
  mesaFocoObj,
  reservaFoco,
  horarioPlanta,
  minutosAgora,
  onCancelar,
  onNovaReserva,
  onCheckin,
  onDesfazerCheckin,
}: {
  mesaFocoObj: Mesa;
  reservaFoco: Reserva | undefined;
  horarioPlanta: string;
  minutosAgora: number | null;
  onCancelar: () => void;
  onNovaReserva: () => void;
  onCheckin: () => void;
  onDesfazerCheckin: () => void;
}) {
  const [alertaDispensado, setAlertaDispensado] = useState(false);
  const chegada = reservaFoco ? statusChegada(reservaFoco, minutosAgora) : null;
  const corTexto = chegada === "chegou" ? "var(--color-accent-dark)" : chegada === "tolerancia" ? "var(--color-secondary-dark)" : "var(--color-error)";
  const corFundo = chegada === "chegou" ? "var(--color-accent-soft)" : chegada === "tolerancia" ? "var(--color-secondary-soft)" : "var(--color-error-soft)";

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-bold" style={{ color: "var(--color-dark)" }}>Mesa {mesaFocoObj.numero}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" }}>
          {mesaFocoObj.zona}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        {ICONE_MESA}
        {mesaFocoObj.capacidade} lugares
      </div>

      {reservaFoco ? (
        <>
          <div style={{ borderTop: "1px solid var(--color-border)" }} />
          <span className="text-[10.5px] font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--color-text-muted)" }}>Reserva atual</span>
          <div className="flex flex-col gap-1.5 text-[13px]" style={{ color: "var(--color-dark)" }}>
            <span className="font-semibold">{reservaFoco.nome}</span>
            <span className="flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>{ICONE_TELEFONE}{reservaFoco.telefone}</span>
            <span className="flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>{ICONE_RELOGIO}{reservaFoco.horario} · {reservaFoco.pessoas} pessoa{reservaFoco.pessoas === 1 ? "" : "s"}</span>
            {reservaFoco.observacao && (
              <span className="flex items-start gap-1.5" style={{ color: "var(--color-dark)" }}>
                <span className="shrink-0 mt-0.5">{ICONE_NOTA}</span>
                <span className="italic">{reservaFoco.observacao}</span>
              </span>
            )}
          </div>
          <StatusBadge cancelada={reservaFoco.cancelada} chegada={chegada ?? undefined} />

          {!reservaFoco.cancelada && chegada && chegada !== "aguardando" && (
            <div className="flex flex-col gap-2 p-3" style={{ borderRadius: "var(--radius-sm)", background: corFundo }}>
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5" style={{ color: corTexto }}>{chegada === "chegou" ? ICONE_CHECK : ICONE_ALERTA}</span>
                <span className="text-[12.5px] font-semibold" style={{ color: corTexto }}>
                  {chegada === "chegou" && reservaFoco.checkinEm
                    ? `Cliente chegou às ${new Date(reservaFoco.checkinEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                    : ROTULO_STATUS_CHEGADA[chegada]}
                </span>
              </div>

              {chegada === "atrasado" && !alertaDispensado && (
                <div className="flex gap-2">
                  <button
                    onClick={onCancelar}
                    className="flex-1 text-[12px] font-semibold py-2 text-white"
                    style={{ background: "var(--color-error)", borderRadius: "var(--radius-sm)" }}
                  >
                    Liberar mesa
                  </button>
                  <button
                    onClick={() => setAlertaDispensado(true)}
                    className="flex-1 text-[12px] font-semibold py-2 border"
                    style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}
                  >
                    Manter reserva
                  </button>
                </div>
              )}
            </div>
          )}

          {!reservaFoco.cancelada && (
            <div className="flex flex-col gap-2">
              {reservaFoco.checkinEm ? (
                <button
                  onClick={onDesfazerCheckin}
                  className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2.5 border"
                  style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}
                >
                  Desfazer check-in
                </button>
              ) : (
                <button
                  onClick={onCheckin}
                  className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2.5 text-white"
                  style={{ background: "var(--color-accent)", borderRadius: "var(--radius-sm)" }}
                >
                  {ICONE_CHECK} Cliente chegou
                </button>
              )}
              <a
                href={linkWhatsapp(reservaFoco.telefone, mensagemConfirmacao(reservaFoco))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2.5 border"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-dark)" }}
              >
                {ICONE_WHATSAPP} Enviar confirmação pelo WhatsApp
              </a>
              <button
                onClick={onCancelar}
                className="text-[12.5px] font-semibold py-2.5 border"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)" }}
              >
                Cancelar reserva
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>Mesa disponível às {horarioPlanta}.</p>
          <button
            onClick={onNovaReserva}
            className="text-[12.5px] font-semibold py-2.5 text-white"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
          >
            + Nova reserva
          </button>
        </>
      )}
    </>
  );
}
