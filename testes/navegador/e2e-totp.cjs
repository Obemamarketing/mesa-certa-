// Código TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) — o mesmo que o Google Authenticator mostra.
const crypto = require("crypto");
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes) {
  let bits = 0, valor = 0, saida = "";
  for (const b of bytes) { valor = (valor << 8) | b; bits += 8; while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}
function deBase32(texto) {
  let bits = 0, valor = 0; const out = [];
  for (const ch of texto.replace(/=+$/, "")) { valor = (valor << 5) | ALFABETO.indexOf(ch); bits += 5; if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(segredo, quando = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 1000 / 30)));
  const h = crypto.createHmac("sha1", deBase32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, "0");
}
module.exports = { totp, base32 };
