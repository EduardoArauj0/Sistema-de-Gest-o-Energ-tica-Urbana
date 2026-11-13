const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  detectAnomaly,
  calculateDeviationPercent,
  resetAnomalyParamsOverride,
  DEFAULT_ANOMALY_PARAMS,
} = require('../../backend/src/modules/anomalies/anomalyEngine');
const { closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { logger } = require('../../backend/src/shared/logger/logger');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage5.test.sqlite');

describe('Etapa 5 — Módulo Isolado de Anomalias e Geração de Leituras Simuladas (CT04, CT05, CT06)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;
  let gestorToken;

  beforeEach(async () => {
    prevEnv = process.env.NODE_ENV;
    prevDbTestPath = process.env.DB_TEST_PATH;
    process.env.NODE_ENV = 'test';
    process.env.DB_TEST_PATH = TEST_DB_FILE;

    resetAnomalyParamsOverride();
    resetAndSeedDatabase();
    app = createApp();

    const gestorLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });
    assert.equal(gestorLogin.status, 200);
    gestorToken = gestorLogin.body.token;
  });

  after(() => {
    resetAnomalyParamsOverride();
    closeDbConnection();
    process.env.NODE_ENV = prevEnv;
    if (prevDbTestPath === undefined) {
      delete process.env.DB_TEST_PATH;
    } else {
      process.env.DB_TEST_PATH = prevDbTestPath;
    }

    for (const suffix of ['', '-shm', '-wal']) {
      const f = `${TEST_DB_FILE}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignora se já removido
        }
      }
    }
  });

  it('CT05: Deve classificar exatamente os 14 valores limites com E = 100 kWh (RN06, RN07, TD-01, TD-02)', () => {
    const E = 100;

    // Matriz de 14 valores limites definidos na Tabela do CT05 (Seção 5 da 2ª Entrega)
    const boundaryMatrix = [
      { measured: 109, expectedDev: 9, isAnomaly: false, type: null, severity: null, pathId: 'P4' },
      { measured: 110, expectedDev: 10, isAnomaly: true, type: 'consumo_acima', severity: 'Baixa', pathId: 'P2' },
      { measured: 119, expectedDev: 19, isAnomaly: true, type: 'consumo_acima', severity: 'Baixa', pathId: 'P2' },
      { measured: 120, expectedDev: 20, isAnomaly: true, type: 'consumo_acima', severity: 'Media', pathId: 'P5' },
      { measured: 149, expectedDev: 49, isAnomaly: true, type: 'consumo_acima', severity: 'Media', pathId: 'P5' },
      { measured: 150, expectedDev: 50, isAnomaly: true, type: 'consumo_acima', severity: 'Alta', pathId: 'P6' },
      { measured: 91, expectedDev: -9, isAnomaly: false, type: null, severity: null, pathId: 'P4' },
      { measured: 90, expectedDev: -10, isAnomaly: true, type: 'consumo_abaixo', severity: 'Baixa', pathId: 'P3' },
      { measured: 81, expectedDev: -19, isAnomaly: true, type: 'consumo_abaixo', severity: 'Baixa', pathId: 'P3' },
      { measured: 80, expectedDev: -20, isAnomaly: true, type: 'consumo_abaixo', severity: 'Media', pathId: 'P5' },
      { measured: 51, expectedDev: -49, isAnomaly: true, type: 'consumo_abaixo', severity: 'Media', pathId: 'P5' },
      { measured: 50, expectedDev: -50, isAnomaly: true, type: 'consumo_abaixo', severity: 'Alta', pathId: 'P6' },
      { measured: 0.5, expectedDev: -99.5, isAnomaly: true, type: 'falha_total', severity: 'Alta', pathId: 'P1' },
      { measured: 0.6, expectedDev: -99.4, isAnomaly: true, type: 'consumo_abaixo', severity: 'Alta', pathId: 'P6' },
    ];

    for (const item of boundaryMatrix) {
      const result = detectAnomaly(item.measured, E);
      assert.equal(
        result.deviationPercent,
        item.expectedDev,
        `Falha no cálculo de desvio para ${item.measured} kWh`
      );
      assert.equal(
        result.isAnomaly,
        item.isAnomaly,
        `Falha em isAnomaly para ${item.measured} kWh`
      );
      assert.equal(
        result.anomalyType,
        item.type,
        `Falha em anomalyType para ${item.measured} kWh`
      );
      assert.equal(
        result.severity,
        item.severity,
        `Falha em severity para ${item.measured} kWh`
      );
      assert.equal(
        result.pathId,
        item.pathId,
        `Falha no caminho caixa-branca (pathId) para ${item.measured} kWh`
      );
    }
  });

  it('CT06: Deve cobrir os caminhos P1 a P6, garantir determinismo em 100 repetições, isolamento sem SQLite/UI e parametrização (RNF01, RNF12, RNF13)', async () => {
    // 1. Verificar isolamento estrutural do arquivo anomalyEngine.js (RNF12)
    const enginePath = path.resolve(
      __dirname,
      '../../backend/src/modules/anomalies/anomalyEngine.js'
    );
    const sourceCode = fs.readFileSync(enginePath, 'utf8');
    const forbiddenTokens = ['node:sqlite', 'DatabaseSync', 'express', 'document.', 'window.'];
    for (const token of forbiddenTokens) {
      assert.equal(
        sourceCode.includes(token),
        false,
        `O módulo isolado não deve referenciar '${token}'`
      );
    }

    // 2. Verificar determinismo em 100 repetições para 110 kWh com E = 100 kWh (RNF01, CT06 passo 2)
    const firstRun = detectAnomaly(110, 100);
    for (let i = 0; i < 100; i += 1) {
      const currentRun = detectAnomaly(110, 100);
      assert.deepEqual(currentRun, firstRun);
    }

    // 3. Alterar LIM_SUP de 10% para 15% sem alterar código-fonte e reexecutar para 114 e 115 kWh (RNF13, CT06 passo 3)
    const updateRes = await invokeApp(app, {
      method: 'PUT',
      url: '/api/readings/anomaly-params',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { LIM_SUP: 15 },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.LIM_SUP, 15);

    const eval114 = detectAnomaly(114, 100);
    assert.equal(eval114.isAnomaly, false);
    assert.equal(eval114.anomalyType, null);
    assert.equal(eval114.pathId, 'P4');

    const eval115 = detectAnomaly(115, 100);
    assert.equal(eval115.isAnomaly, true);
    assert.equal(eval115.anomalyType, 'consumo_acima');
    assert.equal(eval115.severity, 'Baixa');
    assert.equal(eval115.pathId, 'P2');

    // Restaurar parâmetros padrão (10%)
    const resetRes = await invokeApp(app, {
      method: 'PUT',
      url: '/api/readings/anomaly-params',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reset: true },
    });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.data.LIM_SUP, DEFAULT_ANOMALY_PARAMS.LIM_SUP);

    // 4. Validar tratamento de entradas inválidas na função pura calculateDeviationPercent
    assert.throws(() => calculateDeviationPercent(-1, 100), /consumo medido/);
    assert.throws(() => calculateDeviationPercent(50, 0), /consumo esperado/);
  });

  it('CT04: Deve gerar leituras apenas para equipamentos ativos em regiões ativas, marcar origem SIMULADO, simular falha/pico e tratar falha do gerador (RF05, RN04, RN05, RNF03, RNF17)', async () => {
    // Preparar cenário do CT04:
    // - Criar uma região extra REG-C com 1 equipamento e inativar a região REG-C (1 equipamento em região inativa)
    // - Inativar 2 equipamentos da base (id 19 e id 20) para restarem exatamente 18 equipamentos ativos
    const regCRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/regions',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        code: 'REG-C',
        name: 'Região Norte Simulada',
        description: 'Região para teste de exclusão em lote',
        latitude_center: -12.95,
        longitude_center: -38.48,
      },
    });
    assert.equal(regCRes.status, 201);
    const regCId = regCRes.body.item.id;

    const eqInInactiveRegRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        code: 'EQ-REGC-01',
        name: 'Poste Região Inativa',
        type: 'poste',
        region_id: regCId,
        location: 'Rua Simulada Norte, 10',
        expected_consumption_kwh: 100,
        latitude: -12.95,
        longitude: -38.48,
      },
    });
    assert.equal(eqInInactiveRegRes.status, 201);

    // Inativar REG-C
    const inactRegRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/regions/${regCId}/inactivate`,
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(inactRegRes.status, 200);

    // Inativar equipamentos 19 e 20 para deixar exatamente 18 ativos
    await invokeApp(app, {
      method: 'PATCH',
      url: '/api/equipments/19/inactivate',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    await invokeApp(app, {
      method: 'PATCH',
      url: '/api/equipments/20/inactivate',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });

    // Passo 1 e 2 do CT04: Gerar leituras em lote no cenário 'normal'
    const batchNormalRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'normal' },
    });
    assert.equal(batchNormalRes.status, 201);
    assert.equal(batchNormalRes.body.data.generated_count, 18);
    assert.equal(batchNormalRes.body.data.skipped_count, 3);
    assert.equal(batchNormalRes.body.data.anomalies_count, 0);
    assert.equal(batchNormalRes.body.data.origin, 'SIMULADO');

    for (const reading of batchNormalRes.body.data.readings) {
      assert.equal(reading.origin, 'SIMULADO');
      assert.equal(reading.unit, 'kWh');
      assert.ok(reading.equipment_id <= 18);
      assert.ok(reading.recorded_at);
      assert.equal(reading.is_anomaly, false);
    }

    // Passo 3 do CT04: Gerar lote no cenário 'falha' (consumo <= 0,5 kWh, falha_total, Alta)
    const batchFalhaRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    assert.equal(batchFalhaRes.status, 201);
    assert.equal(batchFalhaRes.body.data.generated_count, 1);
    assert.equal(batchFalhaRes.body.data.anomalies_count, 1);
    assert.equal(batchFalhaRes.body.data.created_alerts_count, 1);
    const falhaReading = batchFalhaRes.body.data.readings[0];
    assert.ok(falhaReading.measured_consumption_kwh <= 0.5);
    assert.equal(falhaReading.anomaly_type, 'falha_total');
    assert.equal(falhaReading.severity, 'Alta');

    // Verificar deduplicação de alerta ativo (RN08): repetir leitura de falha no equipamento 1 atualiza alerta sem duplicar
    const batchFalha2Res = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    assert.equal(batchFalha2Res.status, 201);
    assert.equal(batchFalha2Res.body.data.created_alerts_count, 0);
    assert.equal(batchFalha2Res.body.data.updated_alerts_count, 1);
    assert.equal(batchFalha2Res.body.data.updated_alerts[0].occurrence_count, 2);

    // Passo 4 do CT04: Simular falha controlada no gerador (inject_error: true — RNF03 / UC04-E2)
    const beforeErrorListRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/readings',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    const countBeforeError = beforeErrorListRes.body.count;

    const faultRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'normal', inject_error: true },
    });
    assert.equal(faultRes.status, 500);
    assert.equal(faultRes.body.code, 'READING_GENERATOR_ERROR');

    // Verificar que os dados existentes foram integralmente preservados
    const afterErrorListRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/readings',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(afterErrorListRes.body.count, countBeforeError);

    // Verificar que o log de erro foi gravado com data/hora, operação e descrição (RNF03)
    const errorLogs = logger.readErrorLogs(10);
    const generatorLog = errorLogs.find((entry) => entry.operation === 'BATCH_READING_GENERATION');
    assert.ok(generatorLog, 'Log de erro de BATCH_READING_GENERATION deve estar registrado');
    assert.ok(generatorLog.timestamp);
    assert.ok(generatorLog.message.includes('Falha no gerador de leituras simuladas'));
  });
});
