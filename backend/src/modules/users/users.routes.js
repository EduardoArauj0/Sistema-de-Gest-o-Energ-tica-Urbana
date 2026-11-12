const express = require('express');
const { usersController } = require('./users.controller');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');

function createUsersRouter() {
  const router = express.Router();

  // Somente o Gestor pode listar técnicos para atribuição/reatribuição e consultar usuários (RN01, RF02, RF10)
  router.get('/technicians', requireAuth, requireRole('gestor'), (req, res, next) =>
    usersController.listTechnicians(req, res, next)
  );
  router.get('/', requireAuth, requireRole('gestor'), (req, res, next) =>
    usersController.listAll(req, res, next)
  );

  return router;
}

module.exports = {
  createUsersRouter,
};
