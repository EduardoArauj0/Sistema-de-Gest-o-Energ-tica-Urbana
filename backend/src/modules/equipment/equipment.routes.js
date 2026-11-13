const express = require('express');
const { equipmentController } = require('./equipment.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createEquipmentRouter() {
  const router = express.Router();

  // Todas as operações de equipamentos são restritas ao Gestor (RF02, RF04, RF17, RN01, CA02.1, CA17.4)
  router.get('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.list(req, res, next)
  );
  router.get('/:id', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.getById(req, res, next)
  );
  router.post('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.create(req, res, next)
  );
  router.put('/:id', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.update(req, res, next)
  );
  router.patch('/:id/inactivate', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.inactivate(req, res, next)
  );
  router.post('/:id/block', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.block(req, res, next)
  );
  router.post('/:id/unblock', requireAuth, requireRole('gestor'), (req, res, next) =>
    equipmentController.unblock(req, res, next)
  );

  return router;
}

module.exports = {
  createEquipmentRouter,
};
