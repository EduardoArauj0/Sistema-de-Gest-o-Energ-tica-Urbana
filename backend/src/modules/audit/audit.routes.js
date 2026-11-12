const express = require('express');
const { auditController } = require('./audit.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createAuditRouter() {
  const router = express.Router();

  // Trilha de auditoria administrativa restrita ao Gestor (RN01, RNF16)
  router.get('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    auditController.list(req, res, next)
  );

  return router;
}

module.exports = {
  createAuditRouter,
};
