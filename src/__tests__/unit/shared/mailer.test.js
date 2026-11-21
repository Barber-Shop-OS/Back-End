// Driver Resend do mailer: payload no formato da API, anexos em base64 e erro HTTP vira exceção.
const mailer = require('../../../shared/mailer');

describe('mailer — Resend', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('usa o Resend quando há RESEND_API_KEY e MAIL_DRIVER não foi definido', () => {
    delete process.env.MAIL_DRIVER;
    process.env.RESEND_API_KEY = 're_teste';
    expect(mailer.driver()).toBe('resend');
    process.env.MAIL_DRIVER = 'log';
    expect(mailer.driver()).toBe('log');
  });

  it('monta o corpo da API com destinatário em lista e anexo .ics em base64', () => {
    const payload = mailer.resendPayload({
      from: 'BarberOS <a@b.com>',
      to: 'cliente@x.com',
      subject: 'Confirmado',
      html: '<p>oi</p>',
      text: 'oi',
      attachments: [{ filename: 'convite.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' }],
    });
    expect(payload).toEqual({
      from: 'BarberOS <a@b.com>',
      to: ['cliente@x.com'],
      subject: 'Confirmado',
      html: '<p>oi</p>',
      text: 'oi',
      attachments: [{ filename: 'convite.ics', content: Buffer.from('BEGIN:VCALENDAR').toString('base64'), content_type: 'text/calendar' }],
    });
  });

  it('envia com Bearer e devolve o id; erro da API vira exceção (para a fila reenviar)', async () => {
    process.env.RESEND_API_KEY = 're_teste';
    const ok = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'msg_1' }) });
    await expect(mailer.sendWithResend({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't' }, ok)).resolves.toEqual({ messageId: 'msg_1', provider: 'resend' });
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_teste');

    const fail = jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'domínio não verificado' }) });
    await expect(mailer.sendWithResend({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't' }, fail)).rejects.toThrow(/422.*domínio não verificado/);
  });
});
