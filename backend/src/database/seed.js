const { getEnv } = require('../config/env');
const { getDbConnection, runInTransaction } = require('./connection');
const { runMigrations } = require('./migrate');
const { SEED_USERS, SEED_REGIONS, SEED_EQUIPMENTS } = require('./seeds/referenceSeedData');
const { AppError } = require('../shared/errors/AppError');
const { logger } = require('../shared/logger/logger');

/**
 * Insere os registros da massa sintética de referência usando consultas parametrizadas (RNF19).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
function insertReferenceSeed(db) {
  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, name, username, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of SEED_USERS) {
    insertUserStmt.run(
      user.id,
      user.name,
      user.username,
      user.email,
      user.password_hash,
      user.role,
      user.status,
      user.created_at,
      user.updated_at
    );
  }

  const insertRegionStmt = db.prepare(`
    INSERT INTO regions (
      id, code, name, description, latitude_center, longitude_center, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const region of SEED_REGIONS) {
    insertRegionStmt.run(
      region.id,
      region.code,
      region.name,
      region.description,
      region.latitude_center,
      region.longitude_center,
      region.status,
      region.created_at,
      region.updated_at
    );
  }

  const insertEquipmentStmt = db.prepare(`
    INSERT INTO equipments (
      id, code, name, type, region_id, location, expected_consumption_kwh,
      latitude, longitude, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const eq of SEED_EQUIPMENTS) {
    insertEquipmentStmt.run(
      eq.id,
      eq.code,
      eq.name,
      eq.type,
      eq.region_id,
      eq.location,
      eq.expected_consumption_kwh,
      eq.latitude,
      eq.longitude,
      eq.status,
      eq.created_at,
      eq.updated_at
    );
  }
}

/**
 * Inicializa as migrações e popula a massa inicial apenas se o banco estiver vazio,
 * sem jamais apagar dados existentes (preservação em reinício — RNF02 / CT17).
 *
 * @param {import('node:sqlite').DatabaseSync} [customDb]
 */
function ensureDatabaseInitialized(customDb = null) {
  const db = customDb || getDbConnection();
  runMigrations(db);

  const userCountRow = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCountRow && userCountRow.count === 0) {
    runInTransaction(db, () => {
      insertReferenceSeed(db);
    });
    logger.info('Massa inicial sintética carregada em banco recém-criado.', {
      operation: 'DB_INITIAL_SEED',
    });
  }

  return db;
}

/**
 * Executa o reset completo e recria a seed fixa de referência.
 * RESTRITO EXCLUSIVAMENTE AO AMBIENTE DE TESTE (RNF20 / CT26).
 *
 * @param {import('node:sqlite').DatabaseSync} [customDb]
 * @returns {{ users: number, regions: number, equipments: number, poles: number, municipalBuildings: number }}
 */
function resetAndSeedDatabase(customDb = null) {
  const env = getEnv();
  if (!env.isTest) {
    throw new AppError(
      'Operação de reset e seed do banco permitida exclusivamente em ambiente de teste (RNF20).',
      {
        statusCode: 403,
        code: 'TEST_ONLY_OPERATION',
        field: 'environment',
        reason: `A operação foi bloqueada porque NODE_ENV atual é "${env.nodeEnv}".`,
      }
    );
  }

  const db = customDb || getDbConnection();
  runMigrations(db);

  runInTransaction(db, () => {
    db.prepare("UPDATE _system_flags SET value = '1' WHERE key = 'allow_physical_delete'").run();

    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM work_orders;
      DELETE FROM occurrences;
      DELETE FROM alerts;
      DELETE FROM readings;
      DELETE FROM equipments;
      DELETE FROM regions;
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);

    db.prepare("UPDATE _system_flags SET value = '0' WHERE key = 'allow_physical_delete'").run();

    insertReferenceSeed(db);
  });

  const summary = {
    users: SEED_USERS.length,
    regions: SEED_REGIONS.length,
    equipments: SEED_EQUIPMENTS.length,
    poles: SEED_EQUIPMENTS.filter((e) => e.type === 'poste').length,
    municipalBuildings: SEED_EQUIPMENTS.filter((e) => e.type === 'predio_municipal').length,
  };

  logger.info('Reset e seed de teste executados com sucesso.', {
    operation: 'DB_TEST_RESET_SEED',
    details: summary,
  });

  return summary;
}

if (require.main === module) {
  try {
    const result = resetAndSeedDatabase();
    console.log('[SGE-Urbano][Seed] Reset e seed concluídos:', result);
  } catch (err) {
    console.error(`[SGE-Urbano][Seed] Recusado: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  ensureDatabaseInitialized,
  resetAndSeedDatabase,
};
