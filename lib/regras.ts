// Regras puras do ZéPelin, sem dependência de navegador nem de Supabase.
// Ficam aqui (sem "use client") pra poderem ser usadas também no backend
// — por exemplo na rota que envia os lembretes. lib/reservas.ts reexporta
// tudo, então o resto do app continua importando de lá como sempre.

export type FormatoMesa = "redonda" | "quadrada";

export type ZonaMesa = "Palco" | "Salão principal" | "Salão anexo";

export type Mesa = { numero: string; capacidade: number; formato: FormatoMesa; zona: ZonaMesa };

export const mesas: Mesa[] = [
  { numero: "01", capacidade: 2, formato: "redonda", zona: "Palco" },
  { numero: "02", capacidade: 2, formato: "redonda", zona: "Palco" },
  { numero: "03", capacidade: 2, formato: "redonda", zona: "Palco" },
  { numero: "04", capacidade: 2, formato: "redonda", zona: "Palco" },
  { numero: "05", capacidade: 4, formato: "redonda", zona: "Salão principal" },
  { numero: "06", capacidade: 4, formato: "redonda", zona: "Salão principal" },
  { numero: "07", capacidade: 4, formato: "redonda", zona: "Salão principal" },
  { numero: "08", capacidade: 4, formato: "redonda", zona: "Salão principal" },
  { numero: "09", capacidade: 6, formato: "redonda", zona: "Salão principal" },
  { numero: "10", capacidade: 6, formato: "redonda", zona: "Salão principal" },
  { numero: "11", capacidade: 4, formato: "redonda", zona: "Salão principal" },
  { numero: "12", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "13", capacidade: 2, formato: "quadrada", zona: "Salão anexo" },
  { numero: "14", capacidade: 2, formato: "quadrada", zona: "Salão anexo" },
  { numero: "15", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
];

// O ZéPelin só recebe reservas às 19h30 — não há seletor de horário na interface.
export const HORARIO_FIXO = "19:30";

// Tolerância de chegada após o horário da reserva.
export const TOLERANCIA_MINUTOS = 20;

export function minutosDoHorario(horario: string): number {
  const [hh, mm] = horario.split(":").map(Number);
  return hh * 60 + mm;
}

// "19:30" + tolerância → "19:50"
export function horaLimiteDaTolerancia(horario: string): string {
  const total = minutosDoHorario(horario) + TOLERANCIA_MINUTOS;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Código curto pra cliente guardar/digitar — 6 primeiros caracteres do id.
export function codigoDaReserva(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
