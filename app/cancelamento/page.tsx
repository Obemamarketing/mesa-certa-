import type { Metadata } from "next";
import Link from "next/link";
import { empresa } from "@/lib/empresa";
import { HORARIO_FIXO, TOLERANCIA_MINUTOS, horaLimiteDaTolerancia } from "@/lib/regras";
import PaginaLegal from "../PaginaLegal";
import { Dado } from "../RodapeLegal";

export const metadata: Metadata = {
  title: `Cancelamento e reembolso · ${empresa.nomeFantasia}`,
  description: `Como cancelar uma reserva no ${empresa.nomeFantasia} e o que acontece com pagamentos.`,
};

const hora = (h: string) => h.replace(":", "h");

export default function CancelamentoPage() {
  return (
    <PaginaLegal
      titulo="Cancelamento e reembolso"
      resumo="A reserva é gratuita: o site não cobra sinal, taxa nem pede cartão. Por isso, não há valor de reserva a devolver."
    >
      <h2>1. A reserva não custa nada</h2>
      <p>
        Reservar pelo site é gratuito. Não cobramos sinal, taxa de reserva nem multa por cancelamento, e o site não pede dados de cartão. Se um
        dia passarmos a cobrar algo na reserva, esta política será atualizada antes, com as regras de devolução.
      </p>

      <h2>2. Como cancelar</h2>
      <ul>
        <li>
          Pelo site, a qualquer momento antes do horário: em <Link href="/consulta">Consultar reserva</Link>, com o nome usado e os 4 últimos
          dígitos do WhatsApp.
        </li>
        <li>
          Ou pelo telefone do restaurante: <Dado valor={empresa.telefone} />.
        </li>
      </ul>
      <p>Pedimos que cancele assim que souber que não vem: a mesa volta a ficar livre para outra pessoa.</p>

      <h2>3. Atraso e falta</h2>
      <p>
        Há {TOLERANCIA_MINUTOS} minutos de tolerância depois das {hora(HORARIO_FIXO)}. Quem não chega até as{" "}
        {hora(horaLimiteDaTolerancia(HORARIO_FIXO))} pode ter a mesa liberada. Não há cobrança por falta.
      </p>

      <h2>4. Se o restaurante precisar cancelar</h2>
      <p>
        Se o restaurante tiver que fechar ou cancelar sua reserva (por exemplo, por um evento fechado ou um imprevisto), avisamos pelo WhatsApp
        informado, o quanto antes, e ajudamos a remarcar.
      </p>

      <h2>5. Pagamentos no restaurante</h2>
      <p>
        O que você consome é pago no próprio restaurante. Se houver erro na conta ou problema com um pedido, fale com a equipe na hora ou pelos
        contatos abaixo. Valor cobrado indevidamente é devolvido, como manda o Código de Defesa do Consumidor (art. 42).
      </p>

      <h2>6. Contato</h2>
      <p>
        E-mail <Dado valor={empresa.email} /> · Telefone <Dado valor={empresa.telefone} />.
      </p>
    </PaginaLegal>
  );
}
