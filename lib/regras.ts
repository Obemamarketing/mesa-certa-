// Regras puras do ZéPelin, sem dependência de navegador nem de Supabase.
// Ficam aqui (sem "use client") pra poderem ser usadas também no backend
// — por exemplo na rota que envia os lembretes. lib/reservas.ts reexporta
// tudo, então o resto do app continua importando de lá como sempre.

export type FormatoMesa = "redonda" | "quadrada";

export type ZonaMesa = "Palco" | "Salão principal" | "Salão anexo" | "Área externa";

export type Mesa = { numero: string; capacidade: number; formato: FormatoMesa; zona: ZonaMesa };

// As quatro áreas da planta oficial, na ordem em que aparecem nos filtros.
export const ZONAS_DA_PLANTA: ZonaMesa[] = ["Salão principal", "Salão anexo", "Palco", "Área externa"];

// As 20 mesas da planta oficial (public/planta-zepelin.webp). A capacidade foi
// inferida contando as cadeiras do desenho e deve ser conferida pela casa.
// Depois de rodar supabase-migration-mesas.sql quem manda é a tabela "mesas".
export const mesas: Mesa[] = [
  { numero: "01", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "02", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "03", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "04", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "05", capacidade: 6, formato: "quadrada", zona: "Salão principal" },
  { numero: "06", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "07", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "08", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "09", capacidade: 4, formato: "quadrada", zona: "Salão principal" },
  { numero: "10", capacidade: 6, formato: "quadrada", zona: "Salão principal" },
  { numero: "11", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "12", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "13", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "14", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "15", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "16", capacidade: 4, formato: "quadrada", zona: "Salão anexo" },
  { numero: "17", capacidade: 2, formato: "quadrada", zona: "Palco" },
  { numero: "18", capacidade: 4, formato: "quadrada", zona: "Área externa" },
  { numero: "19", capacidade: 4, formato: "quadrada", zona: "Área externa" },
  { numero: "20", capacidade: 4, formato: "quadrada", zona: "Área externa" },
];

// Posição do centro de cada mesa SOBRE A IMAGEM, em % da largura (x) e da
// altura (y). Foram medidas em cima dos marcadores da própria planta. É só o
// padrão: depois da migração, o painel Mesas calibra e salva no Supabase.
export const POSICOES_PADRAO: Record<string, { x: number; y: number }> = {
  "01": { x: 42.33, y: 32.89 },
  "02": { x: 53.2, y: 35.12 },
  "03": { x: 63.53, y: 35.16 },
  "04": { x: 74.09, y: 35.33 },
  "05": { x: 44.49, y: 44.35 },
  "06": { x: 60.22, y: 46.46 },
  "07": { x: 73.63, y: 46.25 },
  "08": { x: 42.21, y: 54.16 },
  "09": { x: 51.81, y: 54.12 },
  "10": { x: 69.08, y: 56.43 },
  "11": { x: 12.37, y: 35.28 },
  "12": { x: 22.47, y: 35.28 },
  "13": { x: 12.37, y: 46.21 },
  "14": { x: 22.59, y: 46.25 },
  "15": { x: 12.37, y: 59.77 },
  "16": { x: 22.51, y: 59.77 },
  "17": { x: 38.16, y: 79.18 },
  "18": { x: 15.46, y: 17.11 },
  "19": { x: 34.97, y: 17.23 },
  "20": { x: 51.89, y: 17.35 },
};

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

// ---------------------------------------------------------------------------
// Grupos que precisam de mais de uma mesa
// ---------------------------------------------------------------------------
// O cliente escolhe quantas mesas quiser, mas só avança quando os lugares das
// mesas escolhidas cobrem todas as pessoas. Cada mesa vira uma reserva própria
// (uma linha em "reservas"), com as pessoas divididas entre elas.

export type MesaDoGrupo = { numero: string; capacidade: number };

export function lugaresDasMesas(escolhidas: MesaDoGrupo[]): number {
  return escolhidas.reduce((soma, m) => soma + m.capacidade, 0);
}

// Quantos lugares ainda faltam pra acomodar todo mundo (0 = já cobre).
export function lugaresQueFaltam(escolhidas: MesaDoGrupo[], pessoas: number): number {
  return Math.max(0, pessoas - lugaresDasMesas(escolhidas));
}

// Divide as pessoas entre as mesas, na ordem em que foram escolhidas, enchendo
// cada uma até a capacidade: 7 pessoas em mesas de 4 e 4 viram 4 + 3. Mesa que
// ficaria com 0 pessoas fica de fora — nunca se reserva mesa vazia.
export function distribuirPessoas(escolhidas: MesaDoGrupo[], pessoas: number): { numero: string; pessoas: number }[] {
  let restantes = pessoas;
  const partes: { numero: string; pessoas: number }[] = [];
  for (const mesa of escolhidas) {
    if (restantes <= 0) break;
    const aqui = Math.min(mesa.capacidade, restantes);
    partes.push({ numero: mesa.numero, pessoas: aqui });
    restantes -= aqui;
  }
  return partes;
}

// "05", "05 e 06", "05, 06 e 07"
export function listaDeMesas(numeros: string[]): string {
  if (numeros.length <= 1) return numeros.join("");
  return `${numeros.slice(0, -1).join(", ")} e ${numeros[numeros.length - 1]}`;
}

// Situação do grupo diante das mesas escolhidas: se já cabe todo mundo, quanto
// falta e a mensagem que a tela mostra enquanto o botão Continuar está travado.
export function situacaoDoGrupo(escolhidas: MesaDoGrupo[], pessoas: number) {
  const faltam = lugaresQueFaltam(escolhidas, pessoas);
  const cobre = escolhidas.length > 0 && faltam === 0;
  const partes = distribuirPessoas(escolhidas, pessoas);

  let aviso: string | null = null;
  if (escolhidas.length > 0 && faltam > 0) {
    aviso =
      `Faltam ${faltam} lugar${faltam === 1 ? "" : "es"} para acomodar ${pessoas === 1 ? "a pessoa" : `as ${pessoas} pessoas`}. ` +
      `Escolha mais uma mesa.`;
  }
  return { faltam, cobre, partes, aviso };
}
