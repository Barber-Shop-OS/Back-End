// Cifra segredos guardados no banco (ex.: segredo TOTP — SEC-27) com AES-256-GCM.
// Chave: TOTP_ENCRYPTION_KEY (recomendado em produção) ou derivada do JWT_SECRET. Formato: v1.iv.tag.dados (base64url).
const crypto = require('crypto');

const key = () => crypto.createHash('sha256').update(process.env.TOTP_ENCRYPTION_KEY || `${process.env.JWT_SECRET}:barberos-secret-box`).digest();

const seal = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
};

const open = (sealed) => {
  const [version, iv, tag, data] = String(sealed).split('.');
  if (version !== 'v1') throw new Error('Formato de segredo desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

module.exports = { seal, open };
