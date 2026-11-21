// SEC-27: TOTP (RFC 6238 — HMAC-SHA1, 30 s, 6 dígitos), compatível com Google Authenticator, Authy etc.
// Sem dependências: base32 (RFC 4648) e HOTP (RFC 4226) com o crypto do Node.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

const base32Decode = (text) => {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Segredo base32 inválido');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/** Segredo novo (160 bits, recomendado pela RFC 4226) em base32. */
const generateSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secret, counter) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
};

const stepAt = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/** Código do passo atual (usado em testes e na verificação). */
const generate = (secret, now = Date.now()) => hotp(secret, stepAt(now));

/**
 * Confere o código aceitando ±`window` passos (relógio do celular adiantado/atrasado). Devolve o passo
 * casado (para impedir reuso do mesmo código) ou null.
 */
const verify = (secret, code, { now = Date.now(), window = 1, lastStep = null } = {}) => {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(now);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
};

/** URL otpauth:// para o QR code do app autenticador. */
const otpauthUrl = (secret, account, issuer = 'BarberOS') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

module.exports = { generateSecret, generate, verify, otpauthUrl, base32Encode, base32Decode, hotp, stepAt };
