import Image from "next/image";
import Link from "next/link";
import { reservaBrand } from "@/lib/reservaBrand";
import { empresa } from "@/lib/empresa";
import RodapeLegal from "./RodapeLegal";

// Moldura das páginas de política: cabeçalho simples, título, data da última
// mudança, o texto e o rodapé com os dados da empresa.

export default function PaginaLegal({
  titulo,
  resumo,
  children,
  semData = false,
}: {
  titulo: string;
  resumo?: string;
  children: React.ReactNode;
  semData?: boolean;
}) {
  return (
    <main className="flex-1 flex flex-col w-full" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between gap-4 px-5 sm:px-10 py-4 max-w-3xl w-full mx-auto">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <Image src="/logo-zeplin.jpg" alt="" width={42} height={42} className="rounded-full shrink-0" />
          <span className="font-display text-[21px] leading-none truncate" style={{ color: "var(--color-dark)" }}>
            {reservaBrand.restauranteAtual}
          </span>
        </Link>
        <Link href="/" className="text-sm font-medium shrink-0" style={{ color: "var(--color-primary)" }}>
          Fazer uma reserva
        </Link>
      </header>

      <article className="texto-legal max-w-3xl w-full mx-auto px-5 sm:px-10 pt-6 pb-14">
        <h1 className="font-display text-[38px] sm:text-[46px] leading-[1.08]" style={{ color: "var(--color-dark)" }}>
          {titulo}
        </h1>
        {resumo && <p className="resumo">{resumo}</p>}
        {!semData && <p className="atualizado">Última atualização: {empresa.politicasAtualizadasEm}</p>}
        {children}
      </article>

      <RodapeLegal />
    </main>
  );
}
