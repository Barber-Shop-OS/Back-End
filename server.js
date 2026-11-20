// Ponto de entrada da API.
// BE-44: migrations no boot só se MIGRATE_ON_BOOT !== 'false' (com lock no MySQL para várias
// instâncias); o recomendado em produção é o passo de release `npm run migrate:release`.
// Encerramento gracioso em SIGTERM/SIGINT (deploys sem derrubar requisições em andamento).
const app = require('./src/app');
const logger = require('./src/utils/logger');
const { runMigrations, verifySchema } = require('./src/config/migrator');
const sequelize = require('./src/config/sequelize');
const { connectDatabase } = sequelize;
const jobsWorker = require('./src/jobs/worker');

let server = null;

const shutdown = (signal) => {
  logger.info(`Recebido ${signal}: encerrando`);
  jobsWorker.stop();
  const force = setTimeout(() => process.exit(1), 15000);
  if (typeof force.unref === 'function') force.unref();
  const closeDb = () =>
    sequelize
      .close()
      .catch(() => {})
      .finally(() => process.exit(0));
  if (server) server.close(closeDb);
  else closeDb();
};

const startServer = async () => {
  try {
    await connectDatabase();
    if (process.env.MIGRATE_ON_BOOT === 'false') {
      await verifySchema();
    } else {
      await runMigrations();
    }

    server = app.listen(app.get('port'), () => {
      logger.info(`Server rodando na porta ${app.get('port')}`);
    });

    // BE-16: worker da fila de e-mails/lembretes (a cada minuto). JOBS_WORKER=false desliga
    // (ex.: quando houver um processo dedicado só para jobs).
    if (process.env.JOBS_WORKER !== 'false') jobsWorker.start();
  } catch (error) {
    logger.error('Erro ao iniciar servidor', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
