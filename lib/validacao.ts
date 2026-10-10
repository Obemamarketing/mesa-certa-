// Validação e normalização de dados do cliente. Funções puras, sem navegador:
// servem tanto às telas quanto ao envio de WhatsApp no servidor.

export const LIMITES = {
  nome: 80,
  telefone: 20,
  email: 120,
  observacao: 200,
} as const;

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
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

// Número como a API do WhatsApp espera: só dígitos, com o código do país.
// Brasil (55) quando vier só DDD + número.
export function telefoneInternacional(texto: string): string {
  const digitos = soDigitos(texto);
  if (ehInternacional(texto)) return digitos;
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

// E-mail é opcional: vazio vale. Preenchido, precisa ter cara de e-mail.
export function emailValido(texto: string): boolean {
  const t = texto.trim();
  return t === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}
