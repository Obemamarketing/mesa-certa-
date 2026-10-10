"use client";

// Relógio das telas. Em vez de guardar a hora num useState e atualizar dentro
// de um efeito, lê o relógio como fonte externa (useSyncExternalStore): vale
// null na renderização do servidor — nada de diferença na hidratação — e passa
// a valer a hora real logo depois.

import { useSyncExternalStore } from "react";

export function useAgora(intervaloMs = 30000): Date | null {
  const passo = useSyncExternalStore(
    (avisar) => {
      const id = setInterval(avisar, intervaloMs);
      return () => clearInterval(id);
    },
    // número estável dentro de cada intervalo: só muda quando o relógio avança
    () => Math.floor(Date.now() / intervaloMs),
    () => null,
  );
  return passo === null ? null : new Date(passo * intervaloMs);
}
