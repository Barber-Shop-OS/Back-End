const app = require('./src/app');
const logger = require('./src/utils/logger');
const { runMigrations } = require('./src/config/migrator');
const { connectDatabase } = require('./src/config/sequelize');
const jobsWorker = require('./src/jobs/worker');

const startServer = async () => {
  try {
    await connectDatabase();
    // Executa migrations pendentes antes de iniciar o servidor
    await runMigrations();
    
    app.listen(app.get('port'), () => {
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

startServer();
