const app = require('./src/app');
const logger = require('./src/utils/logger');
const { runMigrations } = require('./src/config/migrator');

const startServer = async () => {
  try {
    // Executa migrations pendentes antes de iniciar o servidor
    await runMigrations();
    
    app.listen(app.get('port'), () => {
      logger.info(`Server rodando na porta ${app.get('port')}`);
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
