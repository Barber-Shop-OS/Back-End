// BE-30 / SEC-15: sessões com access token curto (15 min, em memória no front) + refresh token opaco
// (32 bytes, SHA-256 no banco, 30 dias) com ROTAÇÃO a cada uso e DETECÇÃO DE REUSO: apresentar um
// refresh já trocado revoga a família inteira (sessão roubada é derrubada nos dois lados).
//   - Web: refresh em cookie httpOnly; Secure (produção); SameSite=Strict; Path=/api/auth.
//     Rotas que leem o cookie exigem `X-Requested-With` e Origin permitida (CSRF).
//   - Mobile (header X-Client-Type: mobile): refresh no corpo, guardado em secure storage.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { RefreshToken, User } = require('../../models');
const { signAccessToken } = require('../../shared/tokens');
const { hashToken } = require('../../shared/oneTimeToken');
const config = require('../../config/config');
const { UnauthorizedError, ForbiddenError, NotFoundError, CODES } = require('../../utils/errorHandler');

const COOKIE_NAME = 'bo_refresh';
const COOKIE_PATH = '/api/auth';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isMobile = (req) => String(req.get('X-Client-Type') || '').toLowerCase() === 'mobile';

const sameSite = () => {
  const value = String(process.env.REFRESH_COOKIE_SAMESITE || 'strict').toLowerCase();
  return ['strict', 'lax', 'none'].includes(value) ? value : 'strict';
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction || sameSite() === 'none',
  sameSite: sameSite(),
  path: COOKIE_PATH,
  maxAge: TTL_MS,
});

const readCookie = (req) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
};

/** Refresh vindo do corpo (mobile) ou do cookie (web). Cookie exige proteção CSRF. */
const presentedToken = (req) => {
  const fromBody = req.body && typeof req.body.refresh_token === 'string' ? req.body.refresh_token : null;
  if (fromBody) return fromBody;
  const fromCookie = readCookie(req);
  if (!fromCookie) return null;
  const origin = req.get('Origin');
  if (req.get('X-Requested-With') !== 'XMLHttpRequest' || (origin && !config.corsOrigins.includes(origin))) {
    throw new ForbiddenError('Requisição bloqueada (CSRF)', CODES.CSRF_REJECTED);
  }
  return fromCookie;
};

const clientInfo = (req) => ({
  user_agent: String(req.get('User-Agent') || '').slice(0, 255) || null,
  ip: String(req.ip || '').slice(0, 64) || null,
});

const createRefresh = async (user, { familyId, req, transaction } = {}) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const row = await RefreshToken.create(
    {
      user_id: user.id,
      family_id: familyId || crypto.randomUUID(),
      token_hash: hashToken(token),
      token_version: Number(user.token_version || 0),
      expires_at: new Date(Date.now() + TTL_MS),
      last_used_at: new Date(),
      ...(req ? clientInfo(req) : {}),
    },
    { transaction }
  );
  return { token, row };
};

/** Resposta de sessão: cookie (web) ou corpo (mobile). */
const deliver = (req, res, refreshToken) => {
  if (isMobile(req)) return { refresh_token: refreshToken };
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
  return {};
};

/** Abre uma sessão nova (login, cadastro, Google). Devolve campos extras para o corpo da resposta. */
const start = async (req, res, user) => {
  const { token, row } = await createRefresh(user, { req });
  // Access token com o id da sessão (sid): substitui o token emitido antes da sessão existir.
  return { token: signAccessToken(user, { sid: row.family_id }), ...deliver(req, res, token), access_token_expires_in: config.jwt.expiresIn };
};

const revokeFamily = (familyId, now = new Date()) =>
  RefreshToken.update({ revoked_at: now }, { where: { family_id: familyId, revoked_at: null } });

/** POST /api/auth/refresh: rotação; reuso → revoga a família (401 REFRESH_REUSED). */
const refresh = async (req, res) => {
  const presented = presentedToken(req);
  if (!presented) throw new UnauthorizedError('Sessão expirada', CODES.REFRESH_INVALID);
  const now = new Date();
  const row = await RefreshToken.findOne({ where: { token_hash: hashToken(presented) } });
  if (!row) throw new UnauthorizedError('Sessão expirada', CODES.REFRESH_INVALID);

  if (row.revoked_at) {
    // Reuso de um refresh já trocado: alguém tem uma cópia. Derruba a sessão inteira.
    await revokeFamily(row.family_id, now);
    throw new UnauthorizedError('Sessão encerrada por segurança. Entre novamente.', CODES.REFRESH_REUSED);
  }
  const user = await User.findByPk(row.user_id);
  if (!user || new Date(row.expires_at) <= now || Number(user.token_version || 0) !== Number(row.token_version)) {
    await revokeFamily(row.family_id, now);
    throw new UnauthorizedError('Sessão expirada', CODES.REFRESH_INVALID);
  }

  const { token: nextToken, row: next } = await createRefresh(user, { familyId: row.family_id, req });
  // Troca atômica: só um pedido concorrente consegue revogar o atual; o outro vira reuso.
  const [updated] = await RefreshToken.update(
    { revoked_at: now, replaced_by: next.id, last_used_at: now },
    { where: { id: row.id, revoked_at: null } }
  );
  if (!updated) {
    await revokeFamily(row.family_id, now);
    throw new UnauthorizedError('Sessão encerrada por segurança. Entre novamente.', CODES.REFRESH_REUSED);
  }
  return { token: signAccessToken(user, { sid: row.family_id }), access_token_expires_in: config.jwt.expiresIn, ...deliver(req, res, nextToken) };
};

const clearCookie = (res) => res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

/** POST /api/auth/logout: encerra esta sessão (família do refresh apresentado). Idempotente. */
const logout = async (req, res) => {
  const presented = presentedToken(req);
  if (presented) {
    const row = await RefreshToken.findOne({ where: { token_hash: hashToken(presented) } });
    if (row) await revokeFamily(row.family_id);
  }
  clearCookie(res);
};

/** POST /api/auth/logout-all: derruba todas as sessões e access tokens do usuário. */
const logoutAll = async (userId, res) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuário não encontrado');
  await user.update({ token_version: Number(user.token_version || 0) + 1 });
  await RefreshToken.update({ revoked_at: new Date() }, { where: { user_id: user.id, revoked_at: null } });
  if (res) clearCookie(res);
};

/** GET /api/me/sessions: sessões ativas (uma por família, a ponta mais recente). */
const listSessions = async (userId, req) => {
  const rows = await RefreshToken.findAll({
    where: { user_id: userId, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
    order: [['last_used_at', 'DESC']],
  });
  let currentFamily = null;
  try {
    const presented = (req.body && req.body.refresh_token) || readCookie(req);
    if (presented) {
      const current = await RefreshToken.findOne({ where: { token_hash: hashToken(presented) }, attributes: ['family_id'] });
      currentFamily = current && current.family_id;
    }
    // Web: o cookie só vai para /api/auth; a sessão atual vem do `sid` do access token.
    if (!currentFamily && req.user && req.user.session_id) currentFamily = req.user.session_id;
  } catch {
    currentFamily = null;
  }
  return rows.map((row) => ({
    id: row.family_id,
    user_agent: row.user_agent,
    ip: row.ip,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    current: row.family_id === currentFamily,
  }));
};

/** DELETE /api/me/sessions/:id (id = família). */
const revokeSession = async (userId, familyId) => {
  const [count] = await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { user_id: userId, family_id: String(familyId), revoked_at: null } }
  );
  if (!count) throw new NotFoundError('Sessão não encontrada');
};

module.exports = { start, refresh, logout, logoutAll, listSessions, revokeSession, readCookie, COOKIE_NAME, TTL_MS };
