const express = require('express');
const { workOrdersController } = require('./workOrders.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createWorkOrdersRouter() {
  const router = express.Router();

  // Listagem e consulta de OS para Gestor e Técnico (RF09, RF10, RF11, RN15, RNF07)
  router.get('/', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.list(req, res, next)
  );

  router.get('/:id', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.getById(req, res, next)
  );

  // Abertura de OS exclusiva do Gestor (RF09, UC07, RN01)
  router.post('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    workOrdersController.create(req, res, next)
  );

  // Atribuição e reatribuição de técnico exclusivas do Gestor (RF10, UC08, RN11, RN21, CT10)
  router.patch('/:id/assign', requireAuth, requireRole('gestor'), (req, res, next) =>
    workOrdersController.assign(req, res, next)
  );
  router.post('/:id/assign', requireAuth, requireRole('gestor'), (req, res, next) =>
    workOrdersController.assign(req, res, next)
  );

  // Atualização de andamento e encerramento permitidos ao Técnico atribuído ou ao Gestor (RF11, UC09, RN12, OD-12, CT11)
  router.patch('/:id/progress', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.progress(req, res, next)
  );
  router.post('/:id/progress', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.progress(req, res, next)
  );

  router.patch('/:id/close', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.close(req, res, next)
  );
  router.post('/:id/close', requireAuth, requireRole('gestor', 'tecnico'), (req, res, next) =>
    workOrdersController.close(req, res, next)
  );

  // Cancelamento de OS exclusivo do Gestor (RF18, UC16, RN21, RN25, CT12)
  router.patch('/:id/cancel', requireAuth, requireRole('gestor'), (req, res, next) =>
    workOrdersController.cancel(req, res, next)
  );
  router.post('/:id/cancel', requireAuth, requireRole('gestor'), (req, res, next) =>
    workOrdersController.cancel(req, res, next)
  );

  return router;
}

module.exports = {
  createWorkOrdersRouter,
};
