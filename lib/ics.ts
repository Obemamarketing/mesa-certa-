import type { Reserva } from "./reservas";
import { dataDoDia, listaDeMesas } from "./reservas";
import { reservaBrand } from "./reservaBrand";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// "grupo" vale quando a reserva ocupa mais de uma mesa: o evento lista todas e
// soma as pessoas, em vez de mostrar só a primeira mesa.
export function baixarIcsDaReserva(reserva: Reserva, grupo?: { mesas: string[]; pessoas: number }) {
  const mesas = grupo?.mesas ?? [reserva.mesaNumero];
  const pessoas = grupo?.pessoas ?? reserva.pessoas;
  const rotuloMesas = `${mesas.length > 1 ? "Mesas" : "Mesa"} ${listaDeMesas(mesas)}`;
  const data = dataDoDia(reserva.dia);
  const [h, m] = reserva.horario.split(":").map(Number);
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate(), h, m);
  const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${reserva.id}@mesacerta`,
    `SUMMARY:Reserva ${reservaBrand.restauranteAtual} — ${rotuloMesas}`,
    `DTSTART:${fmt(inicio)}`,
    `DTEND:${fmt(fim)}`,
    `DESCRIPTION:Reserva para ${pessoas} pessoa(s) em nome de ${reserva.nome}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reserva-${reservaBrand.restauranteAtual.toLowerCase()}-mesa${mesas.join("-")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
