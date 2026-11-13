const express = require('express');
const { reportsController } = require('./reports.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createReportsRouter() {
  const router = express.Router();

  // Relatórios de consumo e exportação CSV exclusivos do Gestor (RF16, UC14, RN01, CT16)
  router.get('/consumption', requireAuth, requireRole('gestor'), (req, res, next) =>
    reportsController.getConsumption(req, res, next)
  );

  router.get('/consumption/csv', requireAuth, requireRole('gestor'), (req, res, next) =>
    reportsController.exportConsumptionCsv(req, res, next)
  );

  return router;
}

module.exports = {
  createReportsRouter,
};
