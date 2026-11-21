// Envio de e-mail transacional. Driver por env:
//   MAIL_DRIVER=log    (padrão fora de produção) → só registra no logger e guarda em memória (testes);
//   MAIL_DRIVER=resend → API HTTP do Resend com RESEND_API_KEY (padrão quando a chave existe). Usa HTTPS,
//                        então funciona em plataformas que bloqueiam SMTP de saída (ex.: Railway);
//   MAIL_DRIVER=smtp   → nodemailer com MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS (SES/Brevo/…).
// BE-16 adiciona templates, fila persistida e retry; aqui fica o transporte.
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const sent = [];
let transport = null;

const driver = () => {
  if (process.env.MAIL_DRIVER) return process.env.MAIL_DRIVER;
  if (process.env.RESEND_API_KEY) return 'resend';
  return process.env.NODE_ENV === 'production' ? 'smtp' : 'log';
};

const RESEND_URL = 'https://api.resend.com/emails';

const toBase64 = (content) => (Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')).toString('base64');

/** Corpo da API do Resend a partir da mensagem no formato do nodemailer. Função pura (testável). */
const resendPayload = (mail) => ({
  from: mail.from,
  to: Array.isArray(mail.to) ? mail.to : [mail.to],
  subject: mail.subject,
  ...(mail.html ? { html: mail.html } : {}),
  ...(mail.text ? { text: mail.text } : {}),
  ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
  ...(mail.attachments && mail.attachments.length
    ? {
        attachments: mail.attachments.map((item) => ({
          filename: item.filename,
          content: toBase64(item.content),
          ...(item.contentType ? { content_type: item.contentType } : {}),
        })),
      }
    : {}),
});

/** Envia pelo Resend. Erro HTTP vira exceção (a fila de jobs reenvia com backoff — BE-16). */
const sendWithResend = async (mail, fetcher = fetch) => {
  const response = await fetcher(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendPayload(mail)),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Resend recusou o e-mail (${response.status}): ${body.message || body.name || 'erro desconhecido'}`);
    error.status = response.status;
    throw error;
  }
  return { messageId: body.id, provider: 'resend' };
};
const from = () => process.env.MAIL_FROM || 'BarberOS <nao-responda@barberos.app>';

const smtpTransport = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: Number(process.env.MAIL_PORT) === 465,
      auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined,
    });
  }
  return transport;
};

/** Envia { to, subject, text, html?, attachments? }. Retorna o objeto enviado (driver log). */
const send = async (message) => {
  const mail = { from: from(), ...message };
  if (driver() === 'log') {
    sent.push(mail);
    // Sem corpo no log: pode conter link com token.
    logger.info('[mailer:log] e-mail', { to: mail.to, subject: mail.subject });
    return mail;
  }
  if (driver() === 'resend') return sendWithResend(mail);
  return smtpTransport().sendMail(mail);
};

module.exports = {
  send,
  resendPayload,
  sendWithResend,
  driver,
  /** Só para testes (driver log). */
  outbox: () => sent,
  clearOutbox: () => {
    sent.length = 0;
  },
};
