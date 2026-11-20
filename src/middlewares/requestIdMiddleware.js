// BE-42: X-Request-Id — reaproveita o do proxy/cliente se for seguro, senão gera um UUID.
// Devolvido no header da resposta e incluído em todos os logs da requisição.
const crypto = require('crypto');
const requestContext = require('../shared/requestContext');

const SAFE_ID = /^[A-Za-z0-9._:-]{8,100}$/;

module.exports = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.id = id;
  res.set('X-Request-Id', id);
  requestContext.run({ requestId: id, ip: req.ip, user: null }, next);
};
