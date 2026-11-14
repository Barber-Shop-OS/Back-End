// SEC-26: tokens de uso único (convite, reset de senha, verificação de e-mail).
// 32 bytes aleatórios em base64url para o link; no banco só o SHA-256 (hex).
const crypto = require('crypto');

const generateToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
};

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

module.exports = { generateToken, hashToken };
