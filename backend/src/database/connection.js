const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getEnv } = require('../config/env');

let activeDb = null;
let activeDbPath = null;

/**
 * Obtém ou inicializa a conexão SQLite para o ambiente atual,
 * garantindo ativação obrigatória de chaves estrangeiras (PRAGMA foreign_keys = ON).
 *
 * @param {string} [customDbPath] Caminho opcional para conexão isolada
 * @returns {DatabaseSync}
 */
function getDbConnection(customDbPath = null) {
  const targetPath = customDbPath || getEnv().dbPath;

  if (activeDb && activeDbPath === targetPath) {
    return activeDb;
  }

  if (activeDb) {
    closeDbConnection();
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  activeDb = new DatabaseSync(targetPath);
  activeDbPath = targetPath;

  // Garante integridade referencial estrita no SQLite
  activeDb.exec('PRAGMA foreign_keys = ON;');
  activeDb.exec('PRAGMA busy_timeout = 5000;');

  return activeDb;
}

/**
 * Encerra a conexão ativa com o SQLite (útil em encerramento do servidor e testes de reinício CT17).
 */
function closeDbConnection() {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignora erro caso já esteja fechada
    }
    activeDb = null;
    activeDbPath = null;
  }
}

/**
 * Executa uma função de forma atômica dentro de uma transação SQLite.
 *
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
function runInTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro se transação já tiver sofrido rollback
    }
    throw error;
  }
}

module.exports = {
  getDbConnection,
  closeDbConnection,
  runInTransaction,
};
