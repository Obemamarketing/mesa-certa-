"use client";

// Comprovante da reserva como IMAGEM (PNG), para o cliente guardar no celular.
// No celular abre o "Compartilhar", onde dá para "Salvar imagem" na galeria ou
// em Arquivos. No computador baixa o arquivo. Tudo é desenhado no próprio
// navegador: nada é enviado a lugar nenhum.

import { reservaBrand } from "./reservaBrand";

export type DadosDoComprovante = {
  titulo: string; // "Reserva confirmada" / "Reserva alterada"
  data: string; // "Sábado, 31/10"
  horario: string; // "12h30"
  pessoas: number;
  mesas: string; // "05" ou "05 e 06"
  area?: string;
  nome?: string;
  codigo: string; // "A1B2C3"
  tolerancia: string; // "Chegue até as 12h50"
  site: string; // "zepellinmesacerta.com.br"
};

const LARGURA = 1080;
const ALTURA = 1350;

function cor(nome: string, reserva: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || reserva;
}

function fonte(variavel: string, reserva: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
  return v ? `${v}, ${reserva}` : reserva;
}

async function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

export async function gerarComprovante(d: DadosDoComprovante): Promise<Blob | null> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const c = canvas.getContext("2d");
  if (!c) return null;

  const fundo = cor("--color-bg", "#F7F2E8");
  const cartao = cor("--color-surface", "#FCFAF5");
  const escuro = cor("--color-dark", "#2A1712");
  const principal = cor("--color-primary", "#7F1717");
  const suave = cor("--color-text-muted", "#6F665E");
  const borda = cor("--color-border", "#E7DED2");
  const titulos = fonte("--font-serif-display", "Georgia, serif");
  const texto = fonte("--font-inter", "Arial, sans-serif");

  c.fillStyle = fundo;
  c.fillRect(0, 0, LARGURA, ALTURA);

  // faixa de cima, na cor da casa
  c.fillStyle = principal;
  c.fillRect(0, 0, LARGURA, 300);
  const logo = await carregarImagem("/logo-zeplin.jpg");
  if (logo) {
    c.save();
    c.beginPath();
    c.arc(150, 150, 80, 0, Math.PI * 2);
    c.clip();
    c.drawImage(logo, 70, 70, 160, 160);
    c.restore();
  }
  c.fillStyle = "#fff";
  c.font = `76px ${titulos}`;
  c.fillText(reservaBrand.restauranteAtual, 270, 150);
  c.font = `500 36px ${texto}`;
  c.globalAlpha = 0.9;
  c.fillText(d.titulo, 272, 210);
  c.globalAlpha = 1;

  // cartão com os dados
  const x = 70;
  const y = 360;
  const w = LARGURA - 140;
  const h = 760;
  c.fillStyle = cartao;
  c.strokeStyle = borda;
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(x, y, w, h, 36);
  c.fill();
  c.stroke();

  c.fillStyle = escuro;
  c.font = `68px ${titulos}`;
  c.fillText(d.data, x + 60, y + 120);
  c.fillStyle = principal;
  c.font = `600 54px ${texto}`;
  c.fillText(d.horario, x + 60, y + 195);

  const linhas: [string, string][] = [
    ["Pessoas", `${d.pessoas} pessoa${d.pessoas === 1 ? "" : "s"}`],
    [d.mesas.includes(" e ") || d.mesas.includes(",") ? "Mesas" : "Mesa", d.mesas],
    ...(d.area ? ([["Área", d.area]] as [string, string][]) : []),
    ...(d.nome ? ([["Nome", d.nome]] as [string, string][]) : []),
    ["Código", d.codigo],
  ];
  let ly = y + 290;
  for (const [rotulo, valor] of linhas) {
    c.strokeStyle = borda;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 60, ly - 50);
    c.lineTo(x + w - 60, ly - 50);
    c.stroke();
    c.fillStyle = suave;
    c.font = `400 36px ${texto}`;
    c.fillText(rotulo, x + 60, ly);
    c.fillStyle = escuro;
    c.font = `600 38px ${texto}`;
    const larguraValor = c.measureText(valor).width;
    c.fillText(valor, x + w - 60 - larguraValor, ly);
    ly += 90;
  }

  // rodapé
  c.fillStyle = escuro;
  c.font = `600 38px ${texto}`;
  c.fillText(d.tolerancia, x, 1200);
  c.fillStyle = suave;
  c.font = `400 30px ${texto}`;
  c.fillText(`Para ver, alterar ou cancelar: ${d.site}/consulta`, x, 1255);
  c.fillText(`Reservas pelo sistema ${reservaBrand.nome}`, x, 1300);

  return new Promise((ok) => canvas.toBlob((b) => ok(b), "image/png"));
}

// Gera e entrega a imagem: "Compartilhar" no celular (dá para salvar na
// galeria), download no computador. Devolve false se não deu.
export async function baixarComprovante(d: DadosDoComprovante): Promise<boolean> {
  const blob = await gerarComprovante(d);
  if (!blob) return false;
  const nome = `reserva-${reservaBrand.restauranteAtual.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "")}-${d.codigo}.png`;
  const arquivo = new File([blob], nome, { type: "image/png" });
  const celular = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: `Reserva no ${reservaBrand.restauranteAtual}` });
      return true;
    } catch (e) {
      // a pessoa fechou o "Compartilhar": não é erro
      if (e instanceof DOMException && e.name === "AbortError") return true;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
