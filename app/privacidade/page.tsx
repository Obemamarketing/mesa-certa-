import type { Metadata } from "next";
import Link from "next/link";
import { empresa, fornecedorDoSistema, PRAZOS, razaoECnpj } from "@/lib/empresa";
import PaginaLegal from "../PaginaLegal";
import { Dado } from "../RodapeLegal";

export const metadata: Metadata = {
  title: `Política de privacidade · ${empresa.nomeFantasia}`,
  description: `Quais dados o ${empresa.nomeFantasia} usa nas reservas, para quê, por quanto tempo e como pedir para apagar.`,
};

export default function PrivacidadePage() {
  const n = empresa.nomeFantasia;
  return (
    <PaginaLegal
      titulo="Política de privacidade"
      resumo={`Em poucas palavras: pedimos só o necessário para cuidar da sua reserva, não vendemos seus dados, não usamos para propaganda de terceiros e você pode pedir para apagar quando quiser.`}
    >
      <h2>1. Quem cuida dos seus dados</h2>
      <p>
        O responsável pelos seus dados (o “controlador”, na Lei Geral de Proteção de Dados — Lei nº 13.709/2018) é o {n}:{" "}
        {razaoECnpj() ? `${razaoECnpj()}, ` : ""}
        <Dado valor={empresa.endereco} />,{" "}
        <Dado valor={empresa.cidade} />.
      </p>
      <p>
        Para qualquer assunto sobre seus dados, fale com <Dado valor={empresa.responsavelDados} /> pelo e-mail <Dado valor={empresa.email} />{" "}
        ou pelo telefone <Dado valor={empresa.telefone} />, ou use a página <Link href="/meus-dados">Meus dados</Link>.
      </p>

      <h2>2. Quais dados usamos e para quê</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Dados</th>
              <th scope="col">Para quê</th>
              <th scope="col">Base na lei</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Reserva de mesa</td>
              <td>Nome e WhatsApp (obrigatórios)</td>
              <td>Fazer e confirmar a reserva, achar a reserva quando você chega, avisar sobre ela e permitir que você consulte ou cancele.</td>
              <td>Execução do serviço que você pediu (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Reserva de mesa</td>
              <td>Aniversário — só dia e mês (opcional)</td>
              <td>Lembrar da data e dar uma atenção especial se você vier perto dela.</td>
              <td>Seu consentimento (art. 7º, I). Deixe em branco se não quiser.</td>
            </tr>
            <tr>
              <td>Reserva e fila</td>
              <td>Observação (opcional)</td>
              <td>
                Preparar sua visita. Se você contar algo sobre saúde (uma alergia, por exemplo) ou uma necessidade de acessibilidade, usamos só para
                isso.
              </td>
              <td>Seu consentimento, dado ao escrever (arts. 7º, I e 11, I)</td>
            </tr>
            <tr>
              <td>Fila de espera</td>
              <td>Nome, WhatsApp, quantas pessoas</td>
              <td>Chamar você se uma mesa liberar, na ordem de chegada.</td>
              <td>Execução do serviço que você pediu (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Pedido sobre seus dados</td>
              <td>Nome, WhatsApp, mensagem</td>
              <td>Atender o pedido e guardar a prova de que ele foi atendido.</td>
              <td>Cumprimento de obrigação legal (art. 7º, II)</td>
            </tr>
            <tr>
              <td>Visita ao site</td>
              <td>Endereço IP, data e hora, navegador</td>
              <td>Manter o site funcionando e seguro. Esses registros ficam com a empresa de hospedagem.</td>
              <td>Obrigação legal (Marco Civil da Internet, art. 15) e interesse legítimo de segurança (art. 7º, IX)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Não pedimos CPF, endereço, cartão nem documento. Não vendemos seus dados, não usamos para propaganda de outras empresas e não tomamos
        decisões automáticas sobre você. Pelo WhatsApp, o restaurante só fala sobre a sua reserva ou a sua espera na fila — propaganda, só se você
        pedir.
      </p>

      <h2>3. Com quem os dados são compartilhados</h2>
      <p>Seus dados ficam guardados em serviços contratados pelo restaurante, que só podem usá-los para fazer o site funcionar:</p>
      <ul>
        <li>
          <strong>{fornecedorDoSistema.nome}</strong> ({fornecedorDoSistema.empresa}) — o sistema de reservas. Cuida do site em nome do {n}.
        </li>
        <li>
          <strong>Supabase</strong> — o banco de dados onde as reservas ficam guardadas.
        </li>
        <li>
          <strong>Vercel</strong> — a hospedagem do site.
        </li>
        <li>
          <strong>WhatsApp (Meta)</strong> — quando o restaurante conversa com você pelo WhatsApp e, se estiver ligado, para mandar o lembrete
          automático da reserva.
        </li>
      </ul>
      <p>
        Alguns desses serviços guardam dados em servidores fora do Brasil (por exemplo, nos Estados Unidos). Essa transferência acontece para
        executar o serviço que você pediu (art. 33, IX) e com fornecedores que se comprometem por contrato a proteger os dados. Também
        entregamos dados a autoridades quando a lei ou uma ordem judicial exigir.
      </p>

      <h2>4. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Reservas:</strong> até {PRAZOS.reservasMeses} meses depois da data da reserva. Depois disso, nome, telefone, aniversário e
          observação são apagados automaticamente. Ficam só data, mesa e número de pessoas, que não identificam ninguém.
        </li>
        <li>
          <strong>Fila de espera:</strong> apagada {PRAZOS.filaDias} dias depois da data pedida.
        </li>
        <li>
          <strong>Pedidos sobre dados:</strong> {PRAZOS.pedidosAnos} anos, para provar que o pedido foi atendido.
        </li>
      </ul>

      <h2>5. Seus direitos</h2>
      <p>A qualquer momento, sem custo, você pode pedir (art. 18 da LGPD):</p>
      <ul>
        <li>para saber se temos dados seus e receber uma cópia;</li>
        <li>para corrigir dados errados ou desatualizados;</li>
        <li>para apagar seus dados (inclusive o aniversário e as observações que você deu por consentimento);</li>
        <li>para retirar seu consentimento;</li>
        <li>informação sobre com quem compartilhamos seus dados;</li>
        <li>a revisão de qualquer uso que você considere irregular.</li>
      </ul>
      <p>
        Faça o pedido na página <Link href="/meus-dados">Meus dados</Link> ou pelos contatos acima. Respondemos em até {PRAZOS.respostaDias} dias.
        Para proteger você, confirmamos pelo WhatsApp que o pedido é mesmo seu antes de mostrar ou apagar qualquer dado. Se não ficar satisfeito,
        você pode reclamar na Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.
      </p>

      <h2>6. Segurança</h2>
      <p>
        O site só funciona com conexão segura (https). A lista de reservas só abre para a equipe do restaurante, com login e senha (e código no
        celular, para quem ativou). Quem visita o site nunca vê dados de outros clientes. Se acontecer algum incidente que possa trazer risco a
        você, avisamos você e a ANPD, como manda a lei.
      </p>

      <h2 id="cookies">7. Cookies e armazenamento no navegador</h2>
      <p>
        Este site <strong>não usa cookies de propaganda nem de estatística</strong> e não tem ferramentas de rastreamento (como Google Analytics ou
        pixel do Facebook). As fontes de letra são carregadas do próprio site, sem passar pelo Google.
      </p>
      <p>Usamos só o armazenamento essencial, que o site precisa para funcionar:</p>
      <ul>
        <li>a lembrança de que você já viu o aviso de cookies;</li>
        <li>o login da equipe do restaurante no painel (não se aplica a clientes).</li>
      </ul>
      <p>
        Por serem essenciais, eles não dependem de autorização, mas você pode apagá-los quando quiser nas configurações do seu navegador. Se um
        dia passarmos a usar cookies de estatística ou propaganda, vamos pedir sua permissão antes.
      </p>

      <h2>8. Menores de idade</h2>
      <p>
        A reserva deve ser feita por alguém com 18 anos ou mais, que responde pelo grupo. Não coletamos de propósito dados de crianças e
        adolescentes.
      </p>

      <h2>9. Mudanças nesta política</h2>
      <p>
        Se mudarmos esta política, a data no alto da página muda junto. Mudanças importantes também são avisadas no site. Leia também os{" "}
        <Link href="/termos">Termos de uso</Link> e a <Link href="/cancelamento">Política de cancelamento e reembolso</Link>.
      </p>
    </PaginaLegal>
  );
}
