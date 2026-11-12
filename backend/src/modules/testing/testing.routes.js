const express = require('express');
const { getEnv } = require('../../config/env');
const { resetAndSeedDatabase } = require('../../database/seed');
const { AppError } = require('../../shared/errors/AppError');

/**
 * Rotas utilitárias de preparação de massa exclusivas para o ambiente de teste (RNF20 / CT26).
 * Este roteador só é montado em app.js quando NODE_ENV === 'test'.
 */
function createTestingRouter() {
  const router = express.Router();

  router.post('/reset', (_req, res, next) => {
    try {
      const env = getEnv();
      if (!env.isTest) {
        throw new AppError(
          'Endpoint de reset e seed indisponível fora do ambiente de teste (RNF20).',
          {
            statusCode: 403,
            code: 'TEST_ONLY_OPERATION',
          }
        );
      }

      const summary = resetAndSeedDatabase();
      res.status(200).json({
        status: 'ok',
        message: 'Banco de dados de teste reinicializado com a seed fixa de referência.',
        summary,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = {
  createTestingRouter,
};
