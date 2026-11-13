const express = require('express');
const { dashboardController } = require('./dashboard.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createDashboardRouter() {
  const router = express.Router();

  // Dashboard gerencial exclusivo do Gestor (RF14, UC12, RN01, CA02.1, CT15)
  router.get('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    dashboardController.getDashboard(req, res, next)
  );

  // Mapa interativo disponível para Gestor e Técnico (RF15, UC13, RN01, CT21)
  router.get('/map', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    dashboardController.getMapOverview(req, res, next)
  );

  return router;
}

module.exports = {
  createDashboardRouter,
};
