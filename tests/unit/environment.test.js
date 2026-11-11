const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getEnv } = require('../../backend/src/config/env');
const { AppError } = require('../../backend/src/shared/errors/AppError');
const { logger } = require('../../backend/src/shared/logger/logger');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

describe('Etapa 1 — Ambiente, Configuração, Logger e Servidor Express Inicial', () => {
  it('deve carregar os parâmetros padrão de anomalia (RN06/RN07/RNF13)', () => {
    const env = getEnv();
    assert.equal(env.anomalyParams.LIM_SUP, 10);
    assert.equal(env.anomalyParams.LIM_INF, 10);
    assert.equal(env.anomalyParams.TOL_ZERO, 0.5);
    assert.equal(env.anomalyParams.FAIXA_BAIXA, 10);
    assert.equal(env.anomalyParams.FAIXA_MEDIA, 20);
    assert.equal(env.anomalyParams.FAIXA_ALTA, 50);
    assert.equal(env.sessionTimeoutMinutes, 30);
  });

  it('deve instanciar AppError com indicação de campo e motivo em pt-BR (RNF09/RNF10)', () => {
    const error = new AppError('O consumo esperado deve ser maior que zero.', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      field: 'consumo_esperado_kwh',
      reason: 'Valor menor ou igual a zero não é permitido (RN03).',
    });

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'consumo_esperado_kwh');
    assert.match(error.reason, /RN03/);
  });

  it('deve registrar e ler logs de erro estruturados em JSON Lines (RNF03)', () => {
    const entry = logger.error('Falha simulada para verificação de log técnico', {
      operation: 'TEST_LOGGER',
      details: { test: true },
    });

    assert.equal(entry.level, 'ERROR');
    assert.equal(entry.operation, 'TEST_LOGGER');
    assert.ok(entry.correlation_id);

    const recentErrors = logger.readErrorLogs(5);
    assert.ok(recentErrors.some((item) => item.correlation_id === entry.correlation_id));
  });

  it('deve responder em /api/health com origem SIMULADO e tratar rota 404 na API', async () => {
    const app = createApp();

    const healthRes = await invokeApp(app, { method: 'GET', url: '/api/health' });
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.body.status, 'ok');
    assert.equal(healthRes.body.dataOrigin, 'SIMULADO');

    const notFoundRes = await invokeApp(app, { method: 'GET', url: '/api/rota-inexistente' });
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.error, true);
    assert.equal(notFoundRes.body.code, 'NOT_FOUND');
  });
});
