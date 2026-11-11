const fs = require('node:fs');
const path = require('node:path');
const defaultAnomalyParams = require('./anomaly-params.json');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const ENV_FILE_PATH = path.join(ROOT_DIR, '.env');

/**
 * Carrega variáveis de um arquivo .env local caso exista,
 * sem sobrescrever variáveis já definidas no process.env.
 */
function loadDotEnvFile(filePath = ENV_FILE_PATH) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isTest = nodeEnv === 'test';

  const defaultDbRelative = isTest
    ? './backend/data/sge-urbano.test.sqlite'
    : './backend/data/sge-urbano.sqlite';

  const configuredDbPath = isTest
    ? process.env.DB_TEST_PATH || defaultDbRelative
    : process.env.DB_PATH || defaultDbRelative;

  return {
    nodeEnv,
    isTest,
    port: toNumber(process.env.PORT, 3000),
    rootDir: ROOT_DIR,
    dbPath: path.resolve(ROOT_DIR, configuredDbPath),
    logDir: path.resolve(ROOT_DIR, process.env.LOG_DIR || './logs'),
    sessionSecret: process.env.SESSION_SECRET || 'sge-urbano-dev-secret-change-me',
    sessionTimeoutMinutes: toNumber(process.env.SESSION_TIMEOUT_MINUTES, 30),
    simulationPeakFactor: toNumber(process.env.SIMULATION_PEAK_FACTOR, 1.5),
    anomalyParams: {
      LIM_SUP: toNumber(process.env.ANOMALY_LIM_SUP, defaultAnomalyParams.LIM_SUP),
      LIM_INF: toNumber(process.env.ANOMALY_LIM_INF, defaultAnomalyParams.LIM_INF),
      TOL_ZERO: toNumber(process.env.ANOMALY_TOL_ZERO, defaultAnomalyParams.TOL_ZERO),
      FAIXA_BAIXA: toNumber(process.env.ANOMALY_FAIXA_BAIXA, defaultAnomalyParams.FAIXA_BAIXA),
      FAIXA_MEDIA: toNumber(process.env.ANOMALY_FAIXA_MEDIA, defaultAnomalyParams.FAIXA_MEDIA),
      FAIXA_ALTA: toNumber(process.env.ANOMALY_FAIXA_ALTA, defaultAnomalyParams.FAIXA_ALTA),
    },
  };
}

module.exports = {
  getEnv,
  loadDotEnvFile,
};
