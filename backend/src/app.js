const path = require('node:path');
const express = require('express');
const { getEnv } = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

function createApp() {
  const app = express();
  const env = getEnv();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Servir arquivos estáticos do frontend
  const frontendDir = path.join(env.rootDir, 'frontend');
  app.use(express.static(frontendDir));

  // Endpoint de diagnóstico e transparência de simulação (RNF17)
  app.get('/api/health', (_req, res) => {
    const currentEnv = getEnv();
    res.status(200).json({
      status: 'ok',
      service: 'SGE-Urbano API',
      environment: currentEnv.nodeEnv,
      dataOrigin: 'SIMULADO',
      simulationNotice:
        'AVISO: Todos os dados de consumo e ocorrências deste sistema são SIMULADOS para fins acadêmicos (RNF17).',
      timestamp: new Date().toISOString(),
    });
  });

  // Tratamento de rotas não encontradas da API e erros centralizados
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = {
  app,
  createApp,
};
