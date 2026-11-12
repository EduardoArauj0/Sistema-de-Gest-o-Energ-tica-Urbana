const fs = require('node:fs');
const path = require('node:path');
const { getDbConnection, runInTransaction } = require('./connection');
const { logger } = require('../shared/logger/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Executa todas as migrações SQL pendentes em ordem alfabética,
 * registrando o versionamento na tabela schema_migrations.
 *
 * @param {import('node:sqlite').DatabaseSync} [customDb]
 * @returns {{ applied: string[], total: number }}
 */
function runMigrations(customDb = null) {
  const db = customDb || getDbConnection();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const selectAppliedStmt = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
  const insertMigrationStmt = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
  );

  const applied = [];

  for (const file of files) {
    const existing = selectAppliedStmt.get(file);
    if (existing) {
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    runInTransaction(db, () => {
      db.exec(sqlContent);
      insertMigrationStmt.run(file, new Date().toISOString());
    });

    applied.push(file);
    logger.info(`Migração aplicada com sucesso: ${file}`, {
      operation: 'DB_MIGRATION',
    });
  }

  return {
    applied,
    total: files.length,
  };
}

if (require.main === module) {
  const result = runMigrations();
  console.log(
    `[SGE-Urbano][Migrate] Migrações concluídas. Novas aplicadas: ${result.applied.length} / Total: ${result.total}`
  );
}

module.exports = {
  runMigrations,
};
