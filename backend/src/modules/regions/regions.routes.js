const express = require('express');
const { regionsController } = require('./regions.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createRegionsRouter() {
  const router = express.Router();

  // Lista pública de regiões ativas para o formulário de ocorrência cidadã sem login (RF12, UC10)
  router.get('/public', (req, res, next) => regionsController.listPublicActive(req, res, next));

  // Operações administrativas restritas ao Gestor (RF03, RF17, RN01, RNF05)
  router.get('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.list(req, res, next)
  );
  router.get('/:id', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.getById(req, res, next)
  );
  router.post('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.create(req, res, next)
  );
  router.put('/:id', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.update(req, res, next)
  );
  router.patch('/:id/inactivate', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.inactivate(req, res, next)
  );
  router.post('/:id/block', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.block(req, res, next)
  );
  router.post('/:id/unblock', requireAuth, requireRole('gestor'), (req, res, next) =>
    regionsController.unblock(req, res, next)
  );

  return router;
}

module.exports = {
  createRegionsRouter,
};
