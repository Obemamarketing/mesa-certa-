// Dados legais do restaurante e prazos de guarda. Aparecem no rodapé de todas
// as páginas do cliente e nas políticas (privacidade, termos, cancelamento).
// Para outro restaurante, troque tudo aqui.
//
// Tudo que estiver como PENDENTE aparece destacado no site: NÃO publique com
// algum campo pendente.

import { reservaBrand } from "./reservaBrand";

export const PENDENTE = "[preencher]";

export const empresa = {
  nomeFantasia: reservaBrand.restauranteAtual,
  /** Nome que está no cartão CNPJ. */
  razaoSocial: "Mulambo Bar e Restaurante Ltda.",
  /** 00.000.000/0000-00 */
  cnpj: "31.239.476/0001-03",
  /** Rua, número, bairro. */
  endereco: "Rua Amintas de Barros, 1050, Alto da Rua XV",
  /** Cidade/UF e CEP. */
  cidade: "Curitiba/PR, CEP 80045-155",
  /** E-mail que alguém do restaurante lê (também recebe assuntos de dados pessoais). */
  email: "zepelinmesacerta@gmail.com",
  /** Telefone do restaurante, com DDD. */
  telefone: "(41) 3082-6969",
  /** Quem responde pelos dados pessoais no restaurante (pode ser o dono). */
  responsavelDados: "Maninho",
  /** Data da última mudança nas políticas. Atualize sempre que mexer no texto. */
  politicasAtualizadasEm: "24 de outubro de 2026",
} as const;

// Quem faz o sistema (operador dos dados, em nome do restaurante).
export const fornecedorDoSistema = {
  nome: "Mesa Certa",
  empresa: "Obema Marketing",
} as const;

// Prazos de guarda. Os mesmos números estão em supabase-migration-lgpd.sql
// (função anonimizar_dados_antigos): se mudar aqui, mude lá.
export const PRAZOS = {
  reservasMeses: 24,
  filaDias: 30,
  pedidosAnos: 5,
  /** Prazo para responder um pedido sobre dados (LGPD, art. 19). */
  respostaDias: 15,
} as const;

export function estaPendente(valor: string): boolean {
  return valor === PENDENTE;
}

/** "Razão social, CNPJ 00..." só com o que já foi preenchido; null se nada. */
export function razaoECnpj(): string | null {
  const partes = [
    estaPendente(empresa.razaoSocial) ? null : empresa.razaoSocial,
    estaPendente(empresa.cnpj) ? null : `CNPJ ${empresa.cnpj}`,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

/** Campos que ainda faltam preencher (para conferir antes de publicar). */
export function camposPendentes(): string[] {
  return Object.entries(empresa)
    .filter(([, v]) => v === PENDENTE)
    .map(([k]) => k);
}
