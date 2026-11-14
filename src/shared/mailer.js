// Envio de e-mail transacional. Driver por env:
//   MAIL_DRIVER=log  (padrão fora de produção) → só registra no logger e guarda em memória (testes);
//   MAIL_DRIVER=smtp → nodemailer com MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS (Resend/SES/Brevo).
// BE-16 adiciona templates, fila persistida e retry; aqui fica o transporte.
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const sent = [];
let transport = null;

const driver = () => process.env.MAIL_DRIVER || (process.env.NODE_ENV === 'production' ? 'smtp' : 'log');
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
  return smtpTransport().sendMail(mail);
};

module.exports = {
  send,
  /** Só para testes (driver log). */
  outbox: () => sent,
  clearOutbox: () => {
    sent.length = 0;
  },
};
