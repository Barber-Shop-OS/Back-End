// BE-02: emissão e verificação do access token (JWT HS256 com iss/aud e token_version).
const jwt = require('jsonwebtoken');
const config = require('../config/config');

const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      tv: user.token_version || 0,
    },
    config.jwt.secret,
    {
      algorithm: config.jwt.algorithm,
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );

/** Lança erro do jsonwebtoken se o token for inválido, expirado ou de outro emissor/algoritmo. */
const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwt.secret, {
    algorithms: [config.jwt.algorithm],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });

module.exports = { signAccessToken, verifyAccessToken };
