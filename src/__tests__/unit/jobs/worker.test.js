// BE-16: agendador do worker (a cada 60 s, idempotente, sem ciclos sobrepostos) e roteamento por tipo.
jest.mock('../../../jobs/queue', () => ({
  releaseStuck: jest.fn().mockResolvedValue(),
  claimDue: jest.fn().mockResolvedValue([]),
  markDone: jest.fn().mockResolvedValue(),
  markFailed: jest.fn().mockResolvedValue(),
  parsePayload: (job) => job.payload,
}));

const queue = require('../../../jobs/queue');
const worker = require('../../../jobs/worker');

// Alguns ciclos do event loop para a cadeia de awaits do tick terminar.
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe('BE-16 — worker', () => {
  afterEach(() => {
    worker.stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('start agenda um ciclo por minuto e é idempotente; stop para', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const first = worker.start();
    expect(worker.start()).toBe(first);
    expect(queue.claimDue).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60 * 1000);
    await flush();
    expect(queue.claimDue).toHaveBeenCalledTimes(1);

    worker.stop();
    jest.advanceTimersByTime(5 * 60 * 1000);
    await flush();
    expect(queue.claimDue).toHaveBeenCalledTimes(1);
  });

  it('runOnce chama o handler do tipo e marca done; erro marca failed; manutenção com falha não para o ciclo', async () => {
    const ok = jest.fn().mockResolvedValue();
    const boom = jest.fn().mockRejectedValue(new Error('falhou'));
    worker.register('test.ok', ok);
    worker.register('test.boom', boom);
    worker.addMaintenance(() => {
      throw new Error('manutenção quebrou');
    });
    queue.claimDue.mockResolvedValueOnce([
      { id: 1, type: 'test.ok', payload: { a: 1 }, attempts: 0 },
      { id: 2, type: 'test.boom', payload: {}, attempts: 0 },
    ]);

    const stats = await worker.runOnce({ now: new Date('2026-12-01T00:00:00Z') });
    expect(stats).toEqual({ processed: 2, done: 1, failed: 1 });
    expect(ok).toHaveBeenCalledWith({ a: 1 }, expect.objectContaining({ id: 1 }));
    expect(queue.markDone).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.any(Date));
    expect(queue.markFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.any(Error), expect.any(Date));
  });

  it('ciclo que falha inteiro é registrado e o próximo roda normalmente', async () => {
    queue.claimDue.mockRejectedValueOnce(new Error('banco fora'));
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    worker.start();
    jest.advanceTimersByTime(60 * 1000);
    await flush();
    jest.advanceTimersByTime(60 * 1000);
    await flush();
    expect(queue.claimDue).toHaveBeenCalledTimes(2);
  });
});
