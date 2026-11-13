const fs = require('node:fs');
const path = require('node:path');

/**
 * Módulo Isolado de Detecção de Anomalias e Classificação de Severidade.
 *
 * Rastreabilidade:
 * - RF06, RF07
 * - RN06 (Detecção — TD-01), RN07 (Severidade — TD-02), RN28
 * - RNF01 (Determinismo), RNF12 (Isolamento sem banco/interface), RNF13 (Parametrização sem alterar código)
 * - Caminhos Caixa-Branca P1 a P6 (Seção 4.5 da 2ª Entrega — CT05 e CT06)
 *
 * IMPORTANTE (RNF12 / RNF18): Este arquivo NÃO possui nenhuma dependência de SQLite,
 * Express, repositórios ou interface gráfica.
 */

const DEFAULT_ANOMALY_PARAMS = Object.freeze({
  LIM_SUP: 10,
  LIM_INF: 10,
  TOL_ZERO: 0.5,
  FAIXA_BAIXA: 10,
  FAIXA_MEDIA: 20,
  FAIXA_ALTA: 50,
});

const CONFIG_FILE_PATH = path.resolve(__dirname, '../../config/anomaly-params.json');

let runtimeParamsOverride = null;

function toValidNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Carrega os parâmetros ativos de anomalia a partir de:
 * 1. Override explícito passado por argumento (customParams)
 * 2. Override em memória configurado via setAnomalyParamsOverride() (RNF13 / CT06)
 * 3. Variáveis de ambiente ANOMALY_*
 * 4. Arquivo externo backend/src/config/anomaly-params.json
 * 5. Valores normativos padrão da 1ª Entrega
 */
function resolveAnomalyParams(customParams = null) {
  let fileParams = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      fileParams = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    } catch {
      fileParams = {};
    }
  }

  const base = {
    LIM_SUP: toValidNumber(
      process.env.ANOMALY_LIM_SUP ?? fileParams.LIM_SUP,
      DEFAULT_ANOMALY_PARAMS.LIM_SUP
    ),
    LIM_INF: toValidNumber(
      process.env.ANOMALY_LIM_INF ?? fileParams.LIM_INF,
      DEFAULT_ANOMALY_PARAMS.LIM_INF
    ),
    TOL_ZERO: toValidNumber(
      process.env.ANOMALY_TOL_ZERO ?? fileParams.TOL_ZERO,
      DEFAULT_ANOMALY_PARAMS.TOL_ZERO
    ),
    FAIXA_BAIXA: toValidNumber(
      process.env.ANOMALY_FAIXA_BAIXA ?? fileParams.FAIXA_BAIXA,
      DEFAULT_ANOMALY_PARAMS.FAIXA_BAIXA
    ),
    FAIXA_MEDIA: toValidNumber(
      process.env.ANOMALY_FAIXA_MEDIA ?? fileParams.FAIXA_MEDIA,
      DEFAULT_ANOMALY_PARAMS.FAIXA_MEDIA
    ),
    FAIXA_ALTA: toValidNumber(
      process.env.ANOMALY_FAIXA_ALTA ?? fileParams.FAIXA_ALTA,
      DEFAULT_ANOMALY_PARAMS.FAIXA_ALTA
    ),
  };

  const merged = {
    ...base,
    ...(runtimeParamsOverride || {}),
    ...(customParams || {}),
  };

  return {
    LIM_SUP: toValidNumber(merged.LIM_SUP, DEFAULT_ANOMALY_PARAMS.LIM_SUP),
    LIM_INF: toValidNumber(merged.LIM_INF, DEFAULT_ANOMALY_PARAMS.LIM_INF),
    TOL_ZERO: toValidNumber(merged.TOL_ZERO, DEFAULT_ANOMALY_PARAMS.TOL_ZERO),
    FAIXA_BAIXA: toValidNumber(merged.FAIXA_BAIXA, DEFAULT_ANOMALY_PARAMS.FAIXA_BAIXA),
    FAIXA_MEDIA: toValidNumber(merged.FAIXA_MEDIA, DEFAULT_ANOMALY_PARAMS.FAIXA_MEDIA),
    FAIXA_ALTA: toValidNumber(merged.FAIXA_ALTA, DEFAULT_ANOMALY_PARAMS.FAIXA_ALTA),
  };
}

/**
 * Permite atualizar os parâmetros de anomalia em tempo de execução sem alterar código-fonte (RNF13 / CT06).
 *
 * @param {Partial<typeof DEFAULT_ANOMALY_PARAMS>} newParams
 */
function setAnomalyParamsOverride(newParams = {}) {
  runtimeParamsOverride = {
    ...(runtimeParamsOverride || {}),
    ...newParams,
  };
  return resolveAnomalyParams();
}

/**
 * Remove overrides em memória e restaura a configuração padrão/ambiente.
 */
function resetAnomalyParamsOverride() {
  runtimeParamsOverride = null;
  return resolveAnomalyParams();
}

/**
 * Calcula o desvio percentual conforme fórmula oficial:
 * desvio (%) = ((consumo medido - consumo esperado) / consumo esperado) * 100
 *
 * @param {number} measuredKwh
 * @param {number} expectedKwh
 * @returns {number}
 */
function calculateDeviationPercent(measuredKwh, expectedKwh) {
  const measured = Number(measuredKwh);
  const expected = Number(expectedKwh);

  if (!Number.isFinite(measured) || measured < 0) {
    throw new Error('O consumo medido deve ser um número maior ou igual a zero.');
  }
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new Error('O consumo esperado (E) deve ser um número maior que zero (RN03).');
  }

  return Number((((measured - expected) / expected) * 100).toFixed(6));
}

/**
 * Classifica a severidade de uma leitura já identificada como anomalia (RN07 / TD-02).
 *
 * Pseudocódigo da Seção 4.5 (2ª Entrega):
 * 1. Se falha total OU módulo do desvio >= FAIXA_ALTA, severidade Alta.
 * 2. Senão, se módulo do desvio >= FAIXA_MEDIA, severidade Média.
 * 3. Senão, para a anomalia restante, severidade Baixa.
 *
 * @param {string} anomalyType 'falha_total' | 'consumo_acima' | 'consumo_abaixo'
 * @param {number} deviationPercent
 * @param {typeof DEFAULT_ANOMALY_PARAMS} params
 * @returns {{ severity: 'Baixa'|'Media'|'Alta', severityLabel: 'Baixa'|'Média'|'Alta' }}
 */
function classifySeverity(anomalyType, deviationPercent, params) {
  const absDeviation = Math.abs(Number(deviationPercent));

  if (anomalyType === 'falha_total' || absDeviation >= params.FAIXA_ALTA) {
    return { severity: 'Alta', severityLabel: 'Alta' };
  }

  if (absDeviation >= params.FAIXA_MEDIA) {
    return { severity: 'Media', severityLabel: 'Média' };
  }

  return { severity: 'Baixa', severityLabel: 'Baixa' };
}

/**
 * Executa a detecção determinística de anomalia e classificação de severidade (RN06, RN07, TD-01, TD-02).
 *
 * Pseudocódigo de referência (Seção 4.5 da 2ª Entrega):
 * 1. Se medido <= TOL_ZERO, classificar como falha total (Caminho P1).
 * 2. Caso contrário, calcular desvio percentual = ((medido - E) / E) * 100.
 * 3. Se desvio >= LIM_SUP, classificar como consumo acima (Caminhos P2, P5, P6).
 * 4. Senão, se desvio <= -LIM_INF, classificar como consumo abaixo (Caminhos P3, P5, P6).
 * 5. Senão, não classificar como anomalia (Caminho P4).
 *
 * @param {number} measuredKwh Consumo medido em kWh
 * @param {number} expectedKwh Consumo esperado (E) em kWh
 * @param {Partial<typeof DEFAULT_ANOMALY_PARAMS>} [customParams] Parâmetros opcionais
 */
function detectAnomaly(measuredKwh, expectedKwh, customParams = null) {
  const measured = Number(measuredKwh);
  const expected = Number(expectedKwh);
  const params = resolveAnomalyParams(customParams);
  const deviationPercent = calculateDeviationPercent(measured, expected);

  let isAnomaly = false;
  let anomalyType = null;
  let anomalyLabel = 'Sem anomalia';
  let pathId = 'P4';

  // 1. Se medido <= TOL_ZERO, classificar como falha total (prevalece sobre desvios — TD-01 Regra R1)
  if (measured <= params.TOL_ZERO) {
    isAnomaly = true;
    anomalyType = 'falha_total';
    anomalyLabel = 'Falha total';
    pathId = 'P1';
  } else if (deviationPercent >= params.LIM_SUP) {
    // 3. Se desvio >= +LIM_SUP, classificar como consumo acima (TD-01 Regra R2)
    isAnomaly = true;
    anomalyType = 'consumo_acima';
    anomalyLabel = 'Consumo acima';
    pathId = 'P2';
  } else if (deviationPercent <= -params.LIM_INF) {
    // 4. Senão, se desvio <= -LIM_INF (e acima de TOL_ZERO), classificar como consumo abaixo (TD-01 Regra R3)
    isAnomaly = true;
    anomalyType = 'consumo_abaixo';
    anomalyLabel = 'Consumo abaixo';
    pathId = 'P3';
  }

  if (!isAnomaly) {
    return {
      isAnomaly: false,
      anomalyType: null,
      anomalyLabel: 'Sem anomalia',
      severity: null,
      severityLabel: null,
      measuredConsumptionKwh: measured,
      expectedConsumptionKwh: expected,
      deviationPercent,
      pathId: 'P4',
      appliedParams: params,
    };
  }

  const { severity, severityLabel } = classifySeverity(anomalyType, deviationPercent, params);

  if (anomalyType !== 'falha_total') {
    if (severity === 'Alta') {
      pathId = 'P6';
    } else if (severity === 'Media') {
      pathId = 'P5';
    }
  }

  return {
    isAnomaly: true,
    anomalyType,
    anomalyLabel,
    severity,
    severityLabel,
    measuredConsumptionKwh: measured,
    expectedConsumptionKwh: expected,
    deviationPercent,
    pathId,
    appliedParams: params,
  };
}

module.exports = {
  DEFAULT_ANOMALY_PARAMS,
  resolveAnomalyParams,
  setAnomalyParamsOverride,
  resetAnomalyParamsOverride,
  calculateDeviationPercent,
  classifySeverity,
  detectAnomaly,
};
