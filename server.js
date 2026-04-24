const app = require('./src/app');
const logger = require('./src/utils/logger');


const startServer = async () => {
  try {
    app.listen(app.get('port'), () => {
      logger.info(`Server rodando na porta ${app.get('port')}`);
    });
  } catch (error) {
    logger.error('Erro na conexão', { error: error.message, stack: error.stack });
  }
};

startServer();