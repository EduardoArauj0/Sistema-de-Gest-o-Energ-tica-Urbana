const express = require('express');
const { authController } = require('./auth.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');

function createAuthRouter() {
  const router = express.Router();

  router.post('/login', (req, res, next) => authController.login(req, res, next));
  router.post('/logout', requireAuth, (req, res, next) => authController.logout(req, res, next));
  router.get('/me', requireAuth, (req, res, next) => authController.me(req, res, next));

  return router;
}

module.exports = {
  createAuthRouter,
};
