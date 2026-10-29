import type { Metadata } from "next";
import Link from "next/link";
import { empresa, fornecedorDoSistema, razaoECnpj } from "@/lib/empresa";
import { reservaBrand } from "@/lib/reservaBrand";
import { ATENDIMENTO, DURACAO_RESERVA_MINUTOS, HORARIOS, TOLERANCIA_MINUTOS, horaBonita } from "@/lib/regras";
import PaginaLegal from "../PaginaLegal";
import { Dado } from "../RodapeLegal";

export const metadata: Metadata = {
  title: `Termos de uso · ${empresa.nomeFantasia}`,
  description: `Regras para reservar mesa no ${empresa.nomeFantasia} pelo site.`,
};


export default function TermosPage() {
  const n = empresa.nomeFantasia;
  return (
    <PaginaLegal
      titulo="Termos de uso"
      resumo="As regras para reservar pelo site. A reserva é gratuita e você pode cancelar quando quiser."
    >
      <h2>1. O que é este site</h2>
      <p>
        Este é o site de reservas do {n}{razaoECnpj() ? ` (${razaoECnpj()})` : ""}. Ele funciona com o sistema{" "}
        {fornecedorDoSistema.nome}. Ao fazer uma reserva ou entrar na fila de espera, você concorda com estes termos, com a{" "}
        <Link href="/privacidade">Política de privacidade</Link> e com a <Link href="/cancelamento">Política de cancelamento e reembolso</Link>.
      </p>

      <h2>2. Quem pode reservar</h2>
      <ul>
        <li>Pessoas com 18 anos ou mais. Quem reserva responde pelo grupo.</li>
        <li>Os dados informados (nome e sobrenome, e WhatsApp) precisam ser verdadeiros e seus.</li>
      </ul>

      <h2>3. Como funciona a reserva</h2>
      <ul>
        <li>
          O restaurante recebe reservas: {reservaBrand.diasFuncionamento.toLowerCase()}, das {horaBonita(ATENDIMENTO.abre)} às{" "}
          {horaBonita(ATENDIMENTO.fecha)}. Você escolhe o horário de chegada ({HORARIOS.map(horaBonita).join(", ")}). A agenda abre até dois meses à
          frente.
        </li>
        <li>
          A reserva fica confirmada na hora, na tela. Há {TOLERANCIA_MINUTOS} minutos de tolerância depois do horário escolhido. Depois disso, a
          mesa pode ser liberada para outras pessoas.
        </li>
        <li>
          A mesa fica reservada para você por até {DURACAO_RESERVA_MINUTOS} minutos a partir do horário
          escolhido.
        </li>
        <li>Grupos maiores que uma mesa reservam mais de uma; o site soma os lugares.</li>
        <li>
          Você pode ver, alterar ou cancelar a reserva em <Link href="/consulta">Consultar reserva</Link>, com o nome e sobrenome usados e os 4
          últimos dígitos do WhatsApp. Na alteração, a reserva antiga só é trocada quando a nova é confirmada; se a nova não der certo, a antiga
          continua valendo.
        </li>
        <li>Depois de reservar, você pode baixar um comprovante (uma imagem) para guardar no celular.</li>
        <li>A reserva garante a mesa. O que você consome é pago no restaurante, com os preços do cardápio da casa.</li>
      </ul>

      <h2>4. Fila de espera</h2>
      <p>
        Quando uma data está lotada, você pode entrar na fila de espera. Entrar na fila <strong>não garante</strong> uma mesa: se alguém cancelar,
        o restaurante chama pelo WhatsApp, na ordem de chegada.
      </p>

      <h2>5. Uso correto do site</h2>
      <p>
        Não é permitido fazer reservas falsas ou em nome de outra pessoa sem autorização, usar robôs ou tentar burlar os limites do site. O
        restaurante pode cancelar reservas claramente falsas ou abusivas, avisando pelo WhatsApp informado.
      </p>

      <h2>6. Bebidas alcoólicas</h2>
      <p>
        A venda de bebidas alcoólicas é proibida para menores de 18 anos (Estatuto da Criança e do Adolescente, art. 243). A equipe pode pedir um
        documento com foto. Beba com moderação e, se beber, não dirija.
      </p>

      <h2>7. Cardápio</h2>
      <p>
        O cardápio do site serve para você conhecer a casa. Itens, preços e disponibilidade podem mudar; o que vale é o cardápio do restaurante no
        dia. Se tiver alergia ou restrição alimentar, avise a equipe antes de pedir.
      </p>

      <h2>8. Se o site sair do ar</h2>
      <p>
        Fazemos o possível para o site funcionar sempre, mas ele pode ficar fora do ar por manutenção ou falha técnica. Nesse caso, fale com o
        restaurante pelo telefone <Dado valor={empresa.telefone} />.
      </p>

      <h2>9. Seus direitos de consumidor</h2>
      <p>Nada nestes termos tira ou diminui os direitos garantidos pelo Código de Defesa do Consumidor (Lei nº 8.078/1990).</p>

      <h2>10. Marca e conteúdo</h2>
      <p>
        O nome, a marca, as fotos e os textos do {n} pertencem ao restaurante. O sistema de reservas pertence ao {fornecedorDoSistema.nome}. Não
        copie nem use sem autorização.
      </p>

      <h2>11. Lei e foro</h2>
      <p>
        Valem as leis brasileiras. Se houver qualquer disputa, você pode escolher o foro da sua cidade, como garante o Código de Defesa do
        Consumidor.
      </p>

      <h2>12. Contato</h2>
      <p>
        E-mail <Dado valor={empresa.email} /> · Telefone <Dado valor={empresa.telefone} /> · <Dado valor={empresa.endereco} />,{" "}
        <Dado valor={empresa.cidade} />.
      </p>
    </PaginaLegal>
  );
}
