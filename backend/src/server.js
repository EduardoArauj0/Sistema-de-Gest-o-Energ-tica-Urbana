const { app } = require('./app');
const { getEnv } = require('./config/env');
const { logger } = require('./shared/logger/logger');

const env = getEnv();

const server = app.listen(env.port, () => {
  logger.info(`Servidor SGE-Urbano iniciado na porta ${env.port} (${env.nodeEnv})`, {
    operation: 'SERVER_STARTUP',
  });
  console.log(
    `[SGE-Urbano] Servidor ativo em http://localhost:${env.port} | Ambiente: ${env.nodeEnv} | Origem dos dados: SIMULADO`
  );
});

process.on('SIGINT', () => {
  server.close(() => {
    logger.info('Servidor SGE-Urbano encerrado via SIGINT.', {
      operation: 'SERVER_SHUTDOWN',
    });
    process.exit(0);
  });
});

module.exports = {
  server,
};
