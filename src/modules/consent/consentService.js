// BE-58: registro das escolhas do banner de cookies (LGPD art. 8º §2º — cabe ao controlador provar o
// consentimento; art. 8º §5º — revogação a qualquer momento, também registrada).
// Minimização: o IP vira HMAC-SHA256 com segredo do servidor; o user agent é truncado.
const crypto = require('crypto');
const { CookieConsent } = require('../../models');

const ACTIONS = ['accept_all', 'reject_all', 'custom', 'withdraw'];

const hashIp = (ip) => {
  if (!ip) return null;
  const secret = process.env.CONSENT_IP_SECRET || process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(ip)).digest('hex');
};

/** Grava uma escolha. `userId` vem do token quando o visitante está logado. */
const record = async ({ consent_id, policy_version, analytics, marketing = false, action }, { userId = null, ip, userAgent } = {}) => {
  const row = await CookieConsent.create({
    consent_id,
    user_id: userId,
    policy_version,
    analytics: action === 'withdraw' || action === 'reject_all' ? false : Boolean(analytics),
    marketing: action === 'withdraw' || action === 'reject_all' ? false : Boolean(marketing),
    action,
    ip_hash: hashIp(ip),
    user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
  });
  return { id: row.id, consent_id: row.consent_id, analytics: row.analytics, marketing: row.marketing, recorded_at: row.created_at };
};

/** Histórico do usuário para a exportação de dados (GET /me/export). */
const listForUser = async (userId) =>
  (await CookieConsent.findAll({
    where: { user_id: userId },
    attributes: ['consent_id', 'policy_version', 'analytics', 'marketing', 'action', 'created_at'],
    order: [['created_at', 'DESC']],
  })).map((row) => row.toJSON());

module.exports = { record, listForUser, hashIp, ACTIONS };
