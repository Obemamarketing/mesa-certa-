// Validação e normalização de dados do cliente. Funções puras, sem navegador:
// servem tanto às telas quanto ao envio de WhatsApp no servidor.

export const LIMITES = {
  nome: 80,
  telefone: 20,
  email: 120,
  observacao: 200,
  aniversario: 5,
} as const;

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// Quantas palavras de pelo menos 2 letras tem um nome ("Ana Lima" = 2;
// "Ana L." = 1). Mesma conta do banco (função palavras_do_nome).
export function palavrasDoNome(texto: string): number {
  return texto
    .trim()
    .split(/\s+/)
    .filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2).length;
}

// Nome e sobrenome: é o que a reserva pelo site exige, e é por eles que o
// cliente acha a reserva na consulta.
export function nomeCompleto(texto: string): boolean {
  return palavrasDoNome(texto) >= 2;
}

// "+1 415 555 0123": número que o cliente escreveu já com o código do país
// (qualquer um que não seja o +55) é tratado como internacional.
function ehInternacional(texto: string): boolean {
  const t = texto.trim();
  return t.startsWith("+") && !t.startsWith("+55");
}

// WhatsApp do cliente. Aceita DDD + número (10 ou 11 dígitos), com ou sem o
// 55 na frente, e número internacional escrito com "+". Recusa o que não é
// telefone: letras, número curto, 00000000000, celular sem o 9.
export function telefoneValido(texto: string): boolean {
  const digitos = soDigitos(texto);
  if (ehInternacional(texto)) return digitos.length >= 8 && digitos.length <= 15;

  const local = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (local.length !== 10 && local.length !== 11) return false;
  if (Number(local.slice(0, 2)) < 11) return false; // não existe DDD abaixo de 11
  if (local.length === 11 && local[2] !== "9") return false; // celular começa com 9
  return !/^(\d)\1+$/.test(local); // 11111111111 não é telefone
}

// O mesmo telefone escrito de jeitos diferentes — "(41) 99999-9999",
// "41999999999", "+55 41 99999-9999" — é a mesma pessoa. Esta é a chave que
// junta as reservas de um cliente.
export function chaveDoTelefone(telefone: string): string {
  const digitos = soDigitos(telefone);
  const local = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  return local || telefone.trim();
}

// Número como a API do WhatsApp espera: só dígitos, com o código do país.
// Brasil (55) quando vier só DDD + número.
export function telefoneInternacional(texto: string): string {
  const digitos = soDigitos(texto);
  if (ehInternacional(texto)) return digitos;
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

// Aniversário do cliente: só dia e mês ("12/03"). O ano não é pedido — pra
// lembrar do aniversário ele não faz falta, e é um dado pessoal a menos guardado.

// Enquanto a pessoa digita: mantém só números e põe a barra sozinho.
export function mascaraAniversario(texto: string): string {
  const d = soDigitos(texto).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

// Opcional: vazio vale. Preenchido, precisa ser um dia que existe (29/02 vale).
export function aniversarioValido(texto: string): boolean {
  const t = texto.trim();
  if (t === "") return true;
  const m = /^(\d{2})\/(\d{2})$/.exec(t);
  if (!m) return false;
  const dia = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasNoMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= diasNoMes;
}

// E-mail é opcional: vazio vale. Preenchido, precisa ter cara de e-mail.
export function emailValido(texto: string): boolean {
  const t = texto.trim();
  return t === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}
