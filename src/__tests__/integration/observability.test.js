// BE-42: request_id em respostas e logs, health/ready, mascaramento de dados sensíveis e 500 com
// request_id (sem vazar a mensagem interna).
jest.setTimeout(60000);

const express = require('express');
const { app, request, resetDatabase, sequelize } = require('../helpers/factories');
const logger = require('../../utils/logger');
const errorMiddleware = require('../../middlewares/errorMiddleware');
const requestIdMiddleware = require('../../middlewares/requestIdMiddleware');

describe('BE-42 — observabilidade e saúde', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());

  it('gera X-Request-Id ou reaproveita um seguro do cliente; id malicioso é trocado', async () => {
    const generated = await request(app).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const reused = await request(app).get('/health').set('X-Request-Id', 'abc-12345678');
    expect(reused.headers['x-request-id']).toBe('abc-12345678');
    const unsafe = await request(app).get('/health').set('X-Request-Id', 'x"<script>alert(1)');
    expect(unsafe.headers['x-request-id']).not.toContain('<');
  });

  it('GET /health → 200; GET /ready → 200 com banco ok', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok');
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', database: 'ok' });
  });

  it('todo log da requisição tem request_id', async () => {
    // O formato do logger injeta o id; conferimos por um transporte com stream em memória.
    const lines = [];
    const { Writable } = require('stream');
    const winston = require('winston');
    const transport = new winston.transports.Stream({
      format: winston.format.combine(logger.enrich(), winston.format.json()),
      stream: new Writable({
        write(chunk, enc, cb) {
          lines.push(String(chunk));
          cb();
        },
      }),
    });
    logger.add(transport);
    await request(app).get('/api/plans').set('X-Request-Id', 'req-observ-0001');
    logger.remove(transport);
    const httpLine = lines.find((line) => line.includes('HTTP request'));
    expect(httpLine).toContain('req-observ-0001');
  });

  it('dados sensíveis são mascarados nos logs', () => {
    const scrubbed = logger.scrub({ headers: { authorization: 'Bearer x' }, body: { password: '123', email: 'a@b.com', nested: { refresh_token: 'r' } } });
    expect(scrubbed.headers.authorization).toBe('[REDACTED]');
    expect(scrubbed.body.password).toBe('[REDACTED]');
    expect(scrubbed.body.nested.refresh_token).toBe('[REDACTED]');
    expect(scrubbed.body.email).toBe('a@b.com');
  });

  it('erro 500 responde genérico com request_id', async () => {
    const mini = express();
    mini.use(requestIdMiddleware);
    mini.get('/boom', () => {
      throw new Error('SELECT * FROM users -- detalhe interno');
    });
    mini.use(errorMiddleware);
    const res = await request(mini).get('/boom').set('X-Request-Id', 'req-boom-0001');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: expect.any(String), code: 'INTERNAL', request_id: 'req-boom-0001' });
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT/);
  });

  it('não expõe X-Powered-By', async () => {
    expect((await request(app).get('/health')).headers['x-powered-by']).toBeUndefined();
  });
});
