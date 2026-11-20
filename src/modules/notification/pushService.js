// BE-45: push notifications para o app mobile (Expo Push API). Tokens por usuário em push_tokens;
// token recusado com DeviceNotRegistered é removido. Falha de push nunca derruba o e-mail.
const { Op } = require('sequelize');
const { PushToken } = require('../../models');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;
const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;

const defaultSender = async (messages) => {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const res = await fetch(process.env.EXPO_PUSH_URL || EXPO_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  return json.data || [];
};

let sender = defaultSender;
const setSender = (fn) => {
  sender = fn || defaultSender;
};

/** POST /api/me/push-tokens — registra (ou move para este usuário) o token do aparelho. */
const register = async (userId, { token, platform }) => {
  if (!TOKEN_RE.test(String(token))) throw new ValidationError('Token de push inválido');
  const existing = await PushToken.findOne({ where: { expo_token: token } });
  if (existing) {
    await existing.update({ user_id: userId, platform, last_seen_at: new Date() });
    return existing;
  }
  return PushToken.create({ user_id: userId, expo_token: token, platform, last_seen_at: new Date() });
};

/** DELETE /api/me/push-tokens — no logout do app. */
const unregister = (userId, token) => PushToken.destroy({ where: { user_id: userId, expo_token: String(token) } });

/** Envia a mesma notificação para todos os aparelhos dos usuários. Retorna { sent, removed }. */
const sendToUsers = async (userIds, { title, body, data = {} }) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return { sent: 0, removed: 0 };
  const tokens = await PushToken.findAll({ where: { user_id: { [Op.in]: ids } } });
  let sent = 0;
  const invalid = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const batch = tokens.slice(i, i + CHUNK);
    try {
      const tickets = await sender(batch.map((row) => ({ to: row.expo_token, title, body, data, sound: 'default' })));
      tickets.forEach((ticket, index) => {
        if (ticket && ticket.status === 'ok') sent += 1;
        else if (ticket && ticket.details && ticket.details.error === 'DeviceNotRegistered') invalid.push(batch[index].id);
      });
    } catch (error) {
      logger.warn('[push] falha no envio', { message: error.message, tokens: batch.length });
    }
  }
  if (invalid.length) await PushToken.destroy({ where: { id: { [Op.in]: invalid } } });
  return { sent, removed: invalid.length };
};

module.exports = { register, unregister, sendToUsers, setSender, TOKEN_RE };
