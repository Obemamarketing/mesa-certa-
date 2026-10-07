import type { Metadata } from "next";
import { DM_Serif_Display, Hanken_Grotesk } from "next/font/google";
import { reservaBrand } from "@/lib/reservaBrand";
import "./globals.css";

const serifDisplay = DM_Serif_Display({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: ["400"],
});

// Grotesca de texto: legível e sóbria, sem a cara genérica de painel SaaS.
const fonteTexto = Hanken_Grotesk({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${reservaBrand.nome} — Reservas`,
  description: reservaBrand.tagline,
};

const corBase = `:root{
  --color-bg:${reservaBrand.cores.fundo};
  --color-surface:${reservaBrand.cores.superficie};
  --color-dark:${reservaBrand.cores.dark};
  --color-accent:${reservaBrand.cores.oliva};
  --color-accent-dark:${reservaBrand.cores.olivaEscura};
  --color-secondary:${reservaBrand.cores.mostarda};
  --color-secondary-dark:${reservaBrand.cores.mostardaEscura};
  --color-primary:${reservaBrand.cores.vinho};
  --color-primary-dark:${reservaBrand.cores.vinhoEscuro};
  --color-error:${reservaBrand.cores.vinho};
  --color-text-muted:${reservaBrand.cores.textoSecundario};
  --color-border:${reservaBrand.cores.borda};
}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${serifDisplay.variable} ${fonteTexto.variable} h-full antialiased`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: corBase }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
