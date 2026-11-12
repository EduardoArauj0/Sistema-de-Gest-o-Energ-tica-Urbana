const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDbConnection, closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase, ensureDatabaseInitialized } = require('../../backend/src/database/seed');
const { verifyPassword } = require('../../backend/src/shared/security/password');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage2.test.sqlite');

describe('Etapa 2 — Banco de Dados SQLite, Migrações, Seed, Integridade e RNF20 (CT26)', () => {
  after(() => {
    closeDbConnection();
    for (const suffix of ['', '-shm', '-wal']) {
      const f = `${TEST_DB_FILE}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignora se arquivo já foi removido
        }
      }
    }
  });

  it('deve aplicar migrações, ativar foreign_keys e carregar a seed de referência em ambiente de teste', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevDbTestPath = process.env.DB_TEST_PATH;

    try {
      process.env.NODE_ENV = 'test';
      process.env.DB_TEST_PATH = TEST_DB_FILE;

      const summary = resetAndSeedDatabase();
      assert.deepEqual(summary, {
        users: 3,
        regions: 2,
        equipments: 20,
        poles: 15,
        municipalBuildings: 5,
      });

      const db = getDbConnection();
      const fkPragma = db.prepare('PRAGMA foreign_keys;').get();
      assert.equal(fkPragma.foreign_keys, 1);

      const users = db.prepare('SELECT id, username, role, status, password_hash FROM users ORDER BY id').all();
      assert.equal(users.length, 3);
      assert.equal(users[0].role, 'gestor');
      assert.equal(users[1].role, 'tecnico');
      assert.equal(users[2].role, 'tecnico');

      // RNF04 / CT01: Senha nunca está em texto claro; usa hash scrypt verificável
      for (const u of users) {
        assert.match(u.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
        assert.notEqual(u.password_hash, 'Gestor@123');
      }
      assert.equal(verifyPassword('Gestor@123', users[0].password_hash), true);
      assert.equal(verifyPassword('SenhaErrada', users[0].password_hash), false);

      const eqByType = db
        .prepare('SELECT type, COUNT(*) AS total FROM equipments GROUP BY type ORDER BY type')
        .all();
      assert.deepEqual(
        eqByType.map((r) => ({ type: r.type, total: r.total })),
        [
          { type: 'poste', total: 15 },
          { type: 'predio_municipal', total: 5 },
        ]
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevDbTestPath === undefined) {
        delete process.env.DB_TEST_PATH;
      } else {
        process.env.DB_TEST_PATH = prevDbTestPath;
      }
    }
  });

  it('deve impor restrições de domínio (RN03, RN05, RN08, RN14) e integridade referencial no SQLite', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevDbTestPath = process.env.DB_TEST_PATH;

    try {
      process.env.NODE_ENV = 'test';
      process.env.DB_TEST_PATH = TEST_DB_FILE;
      const db = getDbConnection();

      // RN03: consumo esperado <= 0 deve ser rejeitado pelo CHECK constraint
      assert.throws(() => {
        db.prepare(`
          INSERT INTO equipments (
            code, name, type, region_id, location, expected_consumption_kwh,
            latitude, longitude, status, created_at, updated_at
          ) VALUES ('EQ-INV', 'Invalido', 'poste', 1, 'Rua Teste', 0, -12.9, -38.5, 'Ativo', '2026-11-10', '2026-11-10')
        `).run();
      }, /CHECK constraint failed/);

      // FK: equipamento com region_id inexistente deve ser rejeitado
      assert.throws(() => {
        db.prepare(`
          INSERT INTO equipments (
            code, name, type, region_id, location, expected_consumption_kwh,
            latitude, longitude, status, created_at, updated_at
          ) VALUES ('EQ-FK', 'Invalido FK', 'poste', 9999, 'Rua Teste', 50, -12.9, -38.5, 'Ativo', '2026-11-10', '2026-11-10')
        `).run();
      }, /FOREIGN KEY constraint failed/);

      // Inserir uma leitura válida e um alerta ativo para testar RN08 e RN14
      const readingResult = db.prepare(`
        INSERT INTO readings (
          equipment_id, scenario, measured_consumption_kwh, expected_consumption_kwh,
          deviation_percent, is_anomaly, anomaly_type, severity, unit, origin, recorded_at
        ) VALUES (1, 'normal', 150, 100, 50, 1, 'consumo_acima', 'Alta', 'kWh', 'SIMULADO', '2026-11-10T10:00:00Z')
      `).run();

      const readingId = readingResult.lastInsertRowid;

      db.prepare(`
        INSERT INTO alerts (
          equipment_id, region_id, last_reading_id, anomaly_type, severity,
          measured_consumption_kwh, expected_consumption_kwh, deviation_percent,
          status, occurrence_count, message, created_at, updated_at
        ) VALUES (1, 1, ?, 'consumo_acima', 'Alta', 150, 100, 50, 'Ativo', 1, 'Alerta teste', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')
      `).run(readingId);

      // RN08: segundo alerta Ativo para o mesmo equipamento (1) e mesmo tipo ('consumo_acima') deve ser bloqueado
      assert.throws(() => {
        db.prepare(`
          INSERT INTO alerts (
            equipment_id, region_id, last_reading_id, anomaly_type, severity,
            measured_consumption_kwh, expected_consumption_kwh, deviation_percent,
            status, occurrence_count, message, created_at, updated_at
          ) VALUES (1, 1, ?, 'consumo_acima', 'Alta', 160, 100, 60, 'Ativo', 1, 'Alerta duplicado', '2026-11-10T10:05:00Z', '2026-11-10T10:05:00Z')
        `).run(readingId);
      }, /UNIQUE constraint failed/);

      // RN14: exclusão física de alerta em operação normal deve ser abortada pelo trigger
      assert.throws(() => {
        db.prepare('DELETE FROM alerts WHERE equipment_id = 1').run();
      }, /RN14: Alertas não podem ser excluídos fisicamente/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevDbTestPath === undefined) {
        delete process.env.DB_TEST_PATH;
      } else {
        process.env.DB_TEST_PATH = prevDbTestPath;
      }
    }
  });

  it('deve bloquear reset e seed no ambiente normal e preservá-los apenas em ambiente de teste (RNF20 / CT26)', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevDbPath = process.env.DB_PATH;
    const prevDbTestPath = process.env.DB_TEST_PATH;

    try {
      // 1. Modo normal (development): deve recusar resetAndSeedDatabase() e não expor /api/testing/reset
      process.env.NODE_ENV = 'development';
      process.env.DB_PATH = TEST_DB_FILE;
      ensureDatabaseInitialized();

      const db = getDbConnection();
      const alertsBefore = db.prepare('SELECT COUNT(*) AS count FROM alerts').get().count;
      assert.equal(alertsBefore, 1);

      assert.throws(
        () => resetAndSeedDatabase(),
        (err) => err.statusCode === 403 && err.code === 'TEST_ONLY_OPERATION'
      );

      const normalApp = createApp();
      const normalResetRes = await invokeApp(normalApp, {
        method: 'POST',
        url: '/api/testing/reset',
      });
      assert.equal(normalResetRes.status, 404);

      // Confirma que o alerta existente não foi apagado pela tentativa no ambiente normal (CT26 passo 4)
      const alertsAfterAttempt = db.prepare('SELECT COUNT(*) AS count FROM alerts').get().count;
      assert.equal(alertsAfterAttempt, 1);

      // 2. Modo de teste (NODE_ENV=test): /api/testing/reset está disponível e limpa/recria a seed
      process.env.NODE_ENV = 'test';
      process.env.DB_TEST_PATH = TEST_DB_FILE;

      const testApp = createApp();
      const testResetRes = await invokeApp(testApp, {
        method: 'POST',
        url: '/api/testing/reset',
      });

      assert.equal(testResetRes.status, 200);
      assert.equal(testResetRes.body.status, 'ok');
      assert.equal(testResetRes.body.summary.equipments, 20);

      const alertsAfterTestReset = getDbConnection()
        .prepare('SELECT COUNT(*) AS count FROM alerts')
        .get().count;
      assert.equal(alertsAfterTestReset, 0);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevDbPath === undefined) {
        delete process.env.DB_PATH;
      } else {
        process.env.DB_PATH = prevDbPath;
      }
      if (prevDbTestPath === undefined) {
        delete process.env.DB_TEST_PATH;
      } else {
        process.env.DB_TEST_PATH = prevDbTestPath;
      }
    }
  });
});
