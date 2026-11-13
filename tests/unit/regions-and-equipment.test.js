const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDbConnection, closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage4.test.sqlite');

describe('Etapa 4 — Regiões, Equipamentos, Inativação em Cascata e Bloqueio/Desbloqueio (CT02, CT03, CT18, CT19, CT20)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;
  let gestorToken;
  let tecnicoToken;

  beforeEach(async () => {
    prevEnv = process.env.NODE_ENV;
    prevDbTestPath = process.env.DB_TEST_PATH;
    process.env.NODE_ENV = 'test';
    process.env.DB_TEST_PATH = TEST_DB_FILE;

    resetAndSeedDatabase();
    app = createApp();

    const gestorLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });
    gestorToken = gestorLogin.body.token;

    const tecnicoLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico1', password: 'Tecnico1@123' },
    });
    tecnicoToken = tecnicoLogin.body.token;
  });

  after(() => {
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

  it('RF03 / CA03.1: deve permitir ao Gestor cadastrar, consultar e editar região', async () => {
    const createRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/regions',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        code: 'REG-C',
        name: 'Região C — Subúrbio Ferroviário (Simulado)',
        description: 'Área norte simulada.',
        latitude_center: -12.88,
        longitude_center: -38.48,
      },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.item.code, 'REG-C');
    assert.equal(createRes.body.item.status, 'Ativo');

    const regionId = createRes.body.item.id;

    const updateRes = await invokeApp(app, {
      method: 'PUT',
      url: `/api/regions/${regionId}`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        name: 'Região C — Subúrbio Editado (Simulado)',
      },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.item.name, 'Região C — Subúrbio Editado (Simulado)');

    const listRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/regions',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.count, 3);
  });

  it('CT02: deve inativar região em cascata nos equipamentos vinculados e preservar histórico (RF03, RN04, RN20, CA03.2, CA03.3)', async () => {
    const db = getDbConnection();

    // Pré-condição CT02: ao menos uma leitura histórica registrada para um equipamento vinculado à Região 1
    const readingInsert = db.prepare(`
      INSERT INTO readings (
        equipment_id, scenario, measured_consumption_kwh, expected_consumption_kwh,
        deviation_percent, is_anomaly, anomaly_type, severity, unit, origin, recorded_at
      ) VALUES (1, 'normal', 100, 100, 0, 0, NULL, NULL, 'kWh', 'SIMULADO', '2026-11-10T08:00:00Z')
    `).run();
    const readingId = Number(readingInsert.lastInsertRowid);

    // Passo 2: Inativar a região 1 como Gestor
    const inactivateRes = await invokeApp(app, {
      method: 'PATCH',
      url: '/api/regions/1/inactivate',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });

    assert.equal(inactivateRes.status, 200);
    assert.equal(inactivateRes.body.item.status, 'Inativo');
    assert.equal(inactivateRes.body.cascadedEquipmentsCount, 10);

    // Passo 3: Consultar os estados da região e dos equipamentos vinculados
    const equipsReg1 = await invokeApp(app, {
      method: 'GET',
      url: '/api/equipments?region_id=1',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(equipsReg1.status, 200);
    assert.equal(equipsReg1.body.count, 10);
    assert.ok(equipsReg1.body.items.every((eq) => eq.status === 'Inativo'));

    // Passo 5: Confirmar que a leitura histórica permanece íntegra e que a ação foi registrada na auditoria
    const preservedReading = db.prepare('SELECT * FROM readings WHERE id = ?').get(readingId);
    assert.ok(preservedReading);
    assert.equal(preservedReading.origin, 'SIMULADO');

    const auditLogs = await invokeApp(app, {
      method: 'GET',
      url: '/api/audit?action=REGION_INACTIVATED',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(auditLogs.body.count, 1);
    assert.equal(auditLogs.body.items[0].target_id, '1');
  });

  it('CT03: deve validar consumo esperado (-1, 0, 1 kWh), região obrigatória e entrada textual SQL Injection (RF04, RN02, RN03, RNF09, RNF19)', async () => {
    // Passo 1: Tentar salvar equipamento com consumo esperado -1 kWh
    const negRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        type: 'poste',
        region_id: 1,
        location: 'Avenida Teste, 100',
        expected_consumption_kwh: -1,
      },
    });
    assert.equal(negRes.status, 400);
    assert.equal(negRes.body.field, 'expected_consumption_kwh');
    assert.match(negRes.body.message, /consumo esperado/i);

    // Passo 2: Repetir com 0 kWh
    const zeroRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        type: 'poste',
        region_id: 1,
        location: 'Avenida Teste, 100',
        expected_consumption_kwh: 0,
      },
    });
    assert.equal(zeroRes.status, 400);
    assert.equal(zeroRes.body.field, 'expected_consumption_kwh');
    assert.match(zeroRes.body.message, /consumo esperado/i);

    // CA04.3: Tentar salvar equipamento sem região
    const noRegionRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        type: 'poste',
        location: 'Avenida Teste, 100',
        expected_consumption_kwh: 1,
      },
    });
    assert.equal(noRegionRes.status, 400);
    assert.equal(noRegionRes.body.field, 'region_id');

    // Passos 3 e 5: Repetir com 1 kWh e submeter entrada textual de SQL Injection no campo localização
    const sqlInjectionPayload = "Rua Segura ' OR '1'='1' --";
    const validRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        type: 'poste',
        region_id: 1,
        location: sqlInjectionPayload,
        expected_consumption_kwh: 1,
      },
    });
    assert.equal(validRes.status, 201);
    assert.equal(validRes.body.item.expected_consumption_kwh, 1);
    assert.equal(validRes.body.item.location, sqlInjectionPayload);

    // Passo 6: Verificar integridade das tabelas no SQLite
    const db = getDbConnection();
    const totalEquipments = db.prepare('SELECT COUNT(*) AS count FROM equipments').get().count;
    assert.equal(totalEquipments, 21);
  });

  it('CT18: deve validar permissão e motivo mínimo de 10 caracteres (9 vs 10) para bloqueio de equipamento (RF17, RN16, TD-06)', async () => {
    // Passo 1: Como Técnico, tentar bloquear equipamento Ativo usando motivo de 10 caracteres
    const techBlockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      headers: { Authorization: `Bearer ${tecnicoToken}` },
      body: { reason: '1234567890' },
    });
    assert.equal(techBlockRes.status, 403);
    assert.equal(techBlockRes.body.code, 'FORBIDDEN_PROFILE');

    // Passo 2: Como visitante, repetir a tentativa
    const visitorBlockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      body: { reason: '1234567890' },
    });
    assert.equal(visitorBlockRes.status, 401);
    assert.equal(visitorBlockRes.body.code, 'UNAUTHENTICATED');

    // Passo 3: Como Gestor, tentar bloquear equipamento Ativo com motivo de 9 caracteres ("123456789")
    const shortReasonRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '123456789' },
    });
    assert.equal(shortReasonRes.status, 400);
    assert.equal(shortReasonRes.body.field, 'reason');

    const eqAfterShort = await invokeApp(app, {
      method: 'GET',
      url: '/api/equipments/1',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(eqAfterShort.body.item.status, 'Ativo');

    // Passo 4: Como Gestor, repetir com motivo de 10 caracteres ("1234567890") e confirmar
    const validBlockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '1234567890', confirmed: true },
    });
    assert.equal(validBlockRes.status, 200);
    assert.equal(validBlockRes.body.item.status, 'Bloqueado');
    assert.equal(validBlockRes.body.item.block_reason, '1234567890');

    // Passo 5: Tentar bloquear objeto já Bloqueado e objeto Inativo
    const doubleBlockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '1234567890' },
    });
    assert.equal(doubleBlockRes.status, 400);
    assert.equal(doubleBlockRes.body.code, 'ALREADY_BLOCKED');

    // Inativar equipamento 2 e tentar bloqueá-lo
    await invokeApp(app, {
      method: 'PATCH',
      url: '/api/equipments/2/inactivate',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });

    const inactiveBlockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/2/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '1234567890' },
    });
    assert.equal(inactiveBlockRes.status, 400);
    assert.equal(inactiveBlockRes.body.code, 'INVALID_STATE_FOR_BLOCK');
  });

  it('CT19: deve suspender alerta ativo, preservar OS em andamento e restaurar estado no desbloqueio de equipamento (RF17, RN16, RN17, RNF16)', async () => {
    const db = getDbConnection();

    // Pré-condição CT19: equipamento 1 Ativo com alerta Ativo vinculado e OS Em atendimento
    const readingRes = db.prepare(`
      INSERT INTO readings (
        equipment_id, scenario, measured_consumption_kwh, expected_consumption_kwh,
        deviation_percent, is_anomaly, anomaly_type, severity, unit, origin, recorded_at
      ) VALUES (1, 'normal', 150, 100, 50, 1, 'consumo_acima', 'Alta', 'kWh', 'SIMULADO', '2026-11-10T10:00:00Z')
    `).run();

    const alertRes = db.prepare(`
      INSERT INTO alerts (
        equipment_id, region_id, last_reading_id, anomaly_type, severity,
        measured_consumption_kwh, expected_consumption_kwh, deviation_percent,
        status, occurrence_count, message, created_at, updated_at
      ) VALUES (1, 1, ?, 'consumo_acima', 'Alta', 150, 100, 50, 'Ativo', 1, 'Alerta CT19', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')
    `).run(readingRes.lastInsertRowid);
    const alertId = Number(alertRes.lastInsertRowid);

    const osRes = db.prepare(`
      INSERT INTO work_orders (
        code, origin, alert_id, region_id, equipment_id, location, title, description,
        status, assigned_technician_id, created_by_user_id, latitude, longitude, started_at, created_at, updated_at
      ) VALUES (
        'OS-CT19-001', 'alerta', ?, 1, 1, 'Praça Municipal, Ponto 01', 'Verificação CT19', 'Manutenção em andamento',
        'Em atendimento', 2, 1, -12.971, -38.501, '2026-11-10T10:15:00Z', '2026-11-10T10:05:00Z', '2026-11-10T10:15:00Z'
      )
    `).run(alertId);
    const osId = Number(osRes.lastInsertRowid);

    // Passo 2: Bloquear equipamento 1 com motivo válido "1234567890"
    const blockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '1234567890', confirmed: true },
    });
    assert.equal(blockRes.status, 200);
    assert.equal(blockRes.body.item.status, 'Bloqueado');
    assert.equal(blockRes.body.suspendedAlertsCount, 1);

    // Passo 3 e 5: Verificar que o alerta ficou Suspenso e que a OS Em atendimento foi preservada
    const alertAfterBlock = db.prepare('SELECT status FROM alerts WHERE id = ?').get(alertId);
    assert.equal(alertAfterBlock.status, 'Suspenso');

    const osAfterBlock = db.prepare('SELECT status FROM work_orders WHERE id = ?').get(osId);
    assert.equal(osAfterBlock.status, 'Em atendimento');

    // Passo 6: Desbloquear o equipamento mediante confirmação, sem informar motivo
    const unblockRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/equipments/1/unblock',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { confirmed: true },
    });
    assert.equal(unblockRes.status, 200);
    assert.equal(unblockRes.body.item.status, 'Ativo');
    assert.equal(unblockRes.body.reactivatedAlertsCount, 1);

    // Passo 7: Verificar reativação do alerta suspenso e auditoria de bloqueio/desbloqueio
    const alertAfterUnblock = db.prepare('SELECT status FROM alerts WHERE id = ?').get(alertId);
    assert.equal(alertAfterUnblock.status, 'Ativo');

    const auditRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/audit?target_type=equipment&target_id=1',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    const actions = auditRes.body.items.map((a) => a.action);
    assert.ok(actions.includes('EQUIPMENT_BLOCKED'));
    assert.ok(actions.includes('EQUIPMENT_UNBLOCKED'));
  });

  it('CT20: deve bloquear e desbloquear região em cascata para equipamentos vinculados e registrar auditoria (RF17, RN16, RN17, RN27, RNF16)', async () => {
    const db = getDbConnection();

    // Criar leitura e alerta ativo na Região 2 (equipamento 9)
    const readingRes = db.prepare(`
      INSERT INTO readings (
        equipment_id, scenario, measured_consumption_kwh, expected_consumption_kwh,
        deviation_percent, is_anomaly, anomaly_type, severity, unit, origin, recorded_at
      ) VALUES (9, 'normal', 150, 100, 50, 1, 'consumo_acima', 'Alta', 'kWh', 'SIMULADO', '2026-11-10T10:00:00Z')
    `).run();

    const alertRes = db.prepare(`
      INSERT INTO alerts (
        equipment_id, region_id, last_reading_id, anomaly_type, severity,
        measured_consumption_kwh, expected_consumption_kwh, deviation_percent,
        status, occurrence_count, message, created_at, updated_at
      ) VALUES (9, 2, ?, 'consumo_acima', 'Alta', 150, 100, 50, 'Ativo', 1, 'Alerta CT20', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')
    `).run(readingRes.lastInsertRowid);
    const alertId = Number(alertRes.lastInsertRowid);

    // Passo 2: Bloquear a região 2 com motivo válido "1234567890"
    const blockRegionRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/regions/2/block',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { reason: '1234567890', confirmed: true },
    });
    assert.equal(blockRegionRes.status, 200);
    assert.equal(blockRegionRes.body.item.status, 'Bloqueado');
    assert.equal(blockRegionRes.body.cascadedEquipmentsCount, 10);

    // Passo 3: Consultar o estado de todos os equipamentos vinculados à Região 2
    const equipsReg2 = await invokeApp(app, {
      method: 'GET',
      url: '/api/equipments?region_id=2',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(equipsReg2.body.count, 10);
    assert.ok(equipsReg2.body.items.every((eq) => eq.status === 'Bloqueado'));

    const alertWhileBlocked = db.prepare('SELECT status FROM alerts WHERE id = ?').get(alertId);
    assert.equal(alertWhileBlocked.status, 'Suspenso');

    // Passo 5: Desbloquear a região 2 apenas mediante confirmação, sem motivo
    const unblockRegionRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/regions/2/unblock',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { confirmed: true },
    });
    assert.equal(unblockRegionRes.status, 200);
    assert.equal(unblockRegionRes.body.item.status, 'Ativo');
    assert.equal(unblockRegionRes.body.restoredEquipmentsCount, 10);

    // Passo 6: Conferir retorno dos objetos ao estado operacional e auditoria
    const equipsAfterUnblock = await invokeApp(app, {
      method: 'GET',
      url: '/api/equipments?region_id=2',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.ok(equipsAfterUnblock.body.items.every((eq) => eq.status === 'Ativo'));

    const alertAfterUnblock = db.prepare('SELECT status FROM alerts WHERE id = ?').get(alertId);
    assert.equal(alertAfterUnblock.status, 'Ativo');

    const auditRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/audit?target_type=region&target_id=2',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    const actions = auditRes.body.items.map((a) => a.action);
    assert.ok(actions.includes('REGION_BLOCKED'));
    assert.ok(actions.includes('REGION_UNBLOCKED'));
  });
});
