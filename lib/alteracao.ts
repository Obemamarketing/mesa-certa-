"use client";

// Alteração de reserva em andamento: a consulta confere os 4 dígitos e guarda
// aqui o que a tela de reserva precisa saber (qual reserva trocar e como ela
// é hoje). Fica só nesta aba do navegador (sessionStorage) e some quando a
// alteração termina ou a pessoa desiste. Nunca vai no endereço da página.

export type Alteracao = {
  /** Uma das reservas do grupo (o banco acha as outras). */
  id: string;
  /** 4 últimos dígitos do telefone, já conferidos. */
  digitos: string;
  dataReserva: string;
  horario: string;
  /** Mesas que a reserva ocupa hoje (para aparecerem livres para quem altera). */
  mesas: string[];
  pessoas: number;
  /** "Sábado, 31/10 às 12h30 · mesa 05" */
  rotulo: string;
};

const CHAVE = "mesa-certa:alteracao";

export function guardarAlteracao(a: Alteracao): boolean {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function lerAlteracao(): Alteracao | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const a = JSON.parse(bruto) as Alteracao;
    return a && a.id && a.digitos && a.dataReserva ? a : null;
  } catch {
    return null;
  }
}

export function esquecerAlteracao(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // sem armazenamento: nada a apagar
  }
}
