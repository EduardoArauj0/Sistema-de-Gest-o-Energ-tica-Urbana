const express = require('express');
const { alertsController } = require('./alerts.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createAlertsRouter() {
  const router = express.Router();

  // Listagem e consulta de alertas acessíveis a Gestor e Técnico (RF08, UC06)
  router.get('/', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    alertsController.list(req, res, next)
  );

  router.get('/:id', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    alertsController.getById(req, res, next)
  );

  return router;
}

module.exports = {
  createAlertsRouter,
};
