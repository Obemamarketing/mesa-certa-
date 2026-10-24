import Link from "next/link";
import { empresa, estaPendente, fornecedorDoSistema, razaoECnpj } from "@/lib/empresa";

// Rodapé das páginas do cliente: quem é a empresa (a lei pede razão social,
// CNPJ, endereço e contato à vista) e os links das políticas.

export const LINKS_LEGAIS = [
  { href: "/privacidade", rotulo: "Privacidade" },
  { href: "/termos", rotulo: "Termos de uso" },
  { href: "/cancelamento", rotulo: "Cancelamento e reembolso" },
  { href: "/privacidade#cookies", rotulo: "Cookies" },
  { href: "/meus-dados", rotulo: "Meus dados" },
] as const;

/** Mostra o dado da empresa; se ainda não foi preenchido, aparece destacado. */
export function Dado({ valor }: { valor: string }) {
  if (!estaPendente(valor)) return <>{valor}</>;
  return (
    <mark className="px-1 rounded" style={{ background: "#FFE08A", color: "#2A1712" }}>
      {valor}
    </mark>
  );
}

export default function RodapeLegal({ escuro = false }: { escuro?: boolean }) {
  const corTexto = escuro ? "rgba(255,255,255,0.82)" : "var(--color-text-muted)";
  const corForte = escuro ? "#fff" : "var(--color-dark)";
  return (
    <footer
      className="w-full px-5 sm:px-10 py-8 text-[13px] leading-relaxed"
      style={{ borderTop: escuro ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--color-border)", color: corTexto }}
    >
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <nav aria-label="Políticas e dados pessoais">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS_LEGAIS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="font-medium underline underline-offset-4" style={{ color: corForte }}>
                  {l.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <address className="not-italic">
          <span className="font-semibold" style={{ color: corForte }}>{empresa.nomeFantasia}</span>
          {razaoECnpj() && <> · {razaoECnpj()}</>}
          <br />
          <Dado valor={empresa.endereco} /> · <Dado valor={empresa.cidade} />
          <br />
          Contato: <Dado valor={empresa.email} /> · Telefone <Dado valor={empresa.telefone} />
        </address>
        <p className="text-[12px]">
          Reservas pelo sistema {fornecedorDoSistema.nome}. Venda de bebidas alcoólicas proibida para menores de 18 anos.
        </p>
      </div>
    </footer>
  );
}
