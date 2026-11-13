const express = require('express');
const { occurrencesController } = require('./occurrences.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createOccurrencesRouter() {
  const router = express.Router();

  // Rotas públicas sem login para o Cidadão (RF12, RF13, UC10, UC11, RN22, RN26, CT13, CT14)
  router.get('/types', (req, res, next) =>
    occurrencesController.listAllowedTypes(req, res, next)
  );

  router.get('/public', (req, res, next) =>
    occurrencesController.consultByProtocol(req, res, next)
  );
  router.get('/public/:protocol', (req, res, next) =>
    occurrencesController.consultByProtocol(req, res, next)
  );
  router.get('/protocol/:protocol', (req, res, next) =>
    occurrencesController.consultByProtocol(req, res, next)
  );

  router.post('/', (req, res, next) => occurrencesController.createPublic(req, res, next));
  router.post('/public', (req, res, next) => occurrencesController.createPublic(req, res, next));

  // Rotas autenticadas para Gestor e Técnico (RN15, RNF07: Técnico não recebe dados pessoais do cidadão)
  router.get('/', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    occurrencesController.list(req, res, next)
  );

  router.get('/:id', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    occurrencesController.getById(req, res, next)
  );

  return router;
}

module.exports = {
  createOccurrencesRouter,
};
