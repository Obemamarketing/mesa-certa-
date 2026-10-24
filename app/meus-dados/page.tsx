import type { Metadata } from "next";
import Link from "next/link";
import { empresa, PRAZOS } from "@/lib/empresa";
import PaginaLegal from "../PaginaLegal";
import { Dado } from "../RodapeLegal";
import FormularioMeusDados from "./FormularioMeusDados";

export const metadata: Metadata = {
  title: `Meus dados · ${empresa.nomeFantasia}`,
  description: `Peça para ver, corrigir ou apagar os seus dados no ${empresa.nomeFantasia}.`,
};

export default function MeusDadosPage() {
  return (
    <PaginaLegal
      semData
      titulo="Meus dados"
      resumo={`Peça para ver, corrigir ou apagar os dados que o ${empresa.nomeFantasia} tem sobre você. É gratuito e respondemos em até ${PRAZOS.respostaDias} dias.`}
    >
      <FormularioMeusDados />

      <h2>Como funciona</h2>
      <ul>
        <li>Para proteger você, confirmamos pelo WhatsApp informado que o pedido é mesmo seu antes de mostrar ou apagar qualquer dado.</li>
        <li>
          Só quer cancelar uma reserva? Não precisa pedir aqui: use <Link href="/consulta">Consultar reserva</Link>.
        </li>
        <li>
          Prefere falar direto? E-mail <Dado valor={empresa.email} /> ou telefone <Dado valor={empresa.telefone} />.
        </li>
        <li>
          Saiba quais dados usamos e por quanto tempo na <Link href="/privacidade">Política de privacidade</Link>.
        </li>
      </ul>
    </PaginaLegal>
  );
}
