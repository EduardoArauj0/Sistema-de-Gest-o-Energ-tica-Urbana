const express = require('express');
const readingsController = require('./readings.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createReadingsRouter() {
  const router = express.Router();

  // Consulta de leituras e parâmetros ativa para Gestor e Técnico
  router.get('/', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    readingsController.list(req, res, next)
  );

  router.get('/anomaly-params', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    readingsController.getAnomalyParams(req, res, next)
  );

  // Geração em lote e atualização de parâmetros exclusivas do Gestor (RF05, RN01, RNF13)
  router.post('/generate-batch', requireAuth, requireRole('gestor'), (req, res, next) =>
    readingsController.generateBatch(req, res, next)
  );

  router.put('/anomaly-params', requireAuth, requireRole('gestor'), (req, res, next) =>
    readingsController.updateAnomalyParams(req, res, next)
  );

  return router;
}

module.exports = {
  createReadingsRouter,
};
