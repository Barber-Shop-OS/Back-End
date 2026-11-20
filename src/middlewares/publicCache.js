// BE-48: Cache-Control para respostas públicas (sem dados do usuário). O Express já gera ETag e
// responde 304 quando o cliente manda If-None-Match igual.
module.exports = (seconds) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${seconds}`);
  next();
};
