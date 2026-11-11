const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getEnv } = require('../../config/env');

function ensureLogDir() {
  const { logDir } = getEnv();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function writeLogEntry(level, payload = {}) {
  const logDir = ensureLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    operation: payload.operation || 'GENERAL',
    correlation_id: payload.correlationId || crypto.randomUUID(),
    user_id: payload.userId ?? null,
    message: payload.message || '',
    details: payload.details || null,
  };

  const line = `${JSON.stringify(entry)}\n`;
  const appLogFile = path.join(logDir, 'app.log');
  fs.appendFileSync(appLogFile, line, 'utf8');

  if (level === 'ERROR') {
    const errorLogFile = path.join(logDir, 'app-error.log');
    fs.appendFileSync(errorLogFile, line, 'utf8');
  }

  return entry;
}

const logger = {
  info(message, meta = {}) {
    return writeLogEntry('INFO', { ...meta, message });
  },
  warn(message, meta = {}) {
    return writeLogEntry('WARN', { ...meta, message });
  },
  error(message, meta = {}) {
    return writeLogEntry('ERROR', { ...meta, message });
  },
  readErrorLogs(limit = 50) {
    const logDir = ensureLogDir();
    const errorLogFile = path.join(logDir, 'app-error.log');
    if (!fs.existsSync(errorLogFile)) {
      return [];
    }
    const lines = fs
      .readFileSync(errorLogFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },
};

module.exports = {
  logger,
};
