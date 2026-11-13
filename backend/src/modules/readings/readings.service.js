const crypto = require('node:crypto');
const { getEnv } = require('../../config/env');
const { AppError } = require('../../shared/errors/AppError');
const { logger } = require('../../shared/logger/logger');
const readingsRepository = require('./readings.repository');
const { auditService } = require('../audit/audit.service');
const {
  detectAnomaly,
  resolveAnomalyParams,
  setAnomalyParamsOverride,
  resetAnomalyParamsOverride,
} = require('../anomalies/anomalyEngine');

const VALID_SCENARIOS = ['normal', 'pico', 'falha', 'manual'];

class ReadingsService {
  /**
   * Calcula o consumo medido simulado para um equipamento de acordo com o cenário (RF05, RN04, RN05, OD-03).
   */
  computeSimulatedConsumption(expectedKwh, scenario, customMeasuredKwh = null) {
    if (customMeasuredKwh !== null && customMeasuredKwh !== undefined && customMeasuredKwh !== '') {
      const parsed = Number(customMeasuredKwh);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new AppError('O consumo medido informado é inválido.', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'measured_consumption_kwh',
          reason: 'Informe um valor numérico maior ou igual a zero (em kWh).',
        });
      }
      return Number(parsed.toFixed(4));
    }

    const expected = Number(expectedKwh);
    const env = getEnv();

    switch (scenario) {
      case 'normal':
        // Consumo dentro da faixa normal (0% de desvio para total determinismo — RNF01, CT04)
        return Number(expected.toFixed(4));
      case 'falha':
        // Consumo <= TOL_ZERO (0,5 kWh), disparando falha_total com severidade Alta (CA05.3, CT04)
        return 0.5;
      case 'pico': {
        // Consumo multiplicado pelo fator configurável SIMULATION_PEAK_FACTOR (padrão 1.50 = +50% — OD-03)
        const factor = Number(env.simulationPeakFactor) || 1.5;
        return Number((expected * factor).toFixed(4));
      }
      default:
        return Number(expected.toFixed(4));
    }
  }

  /**
   * Gera um lote de leituras simuladas para equipamentos ativos em regiões ativas (RF05, RF06, RF07, UC04, UC05).
   */
  generateBatch(payload = {}, actor = null) {
    const scenario = String(payload.scenario || 'normal').trim().toLowerCase();

    if (!VALID_SCENARIOS.includes(scenario)) {
      throw new AppError('O cenário de simulação informado é inválido.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'scenario',
        reason: `O cenário deve ser um dos valores permitidos: ${VALID_SCENARIOS.join(', ')}.`,
      });
    }

    // Tratamento de falha controlada no gerador (RNF03, UC04-E2, CT04)
    if (payload.inject_error === true || payload.injectError === true) {
      logger.error('Falha no gerador de leituras simuladas em lote (RNF03 / UC04-E2).', {
        operation: 'BATCH_READING_GENERATION',
        userId: actor?.id ?? null,
        details: {
          scenario,
          region_id: payload.region_id ?? null,
          equipment_id: payload.equipment_id ?? null,
        },
      });

      throw new AppError(
        'Não foi possível concluir a geração de leituras simuladas devido a uma falha no gerador. Os dados existentes foram preservados.',
        {
          statusCode: 500,
          code: 'READING_GENERATOR_ERROR',
          field: 'generator',
          reason: 'Falha interna durante a execução do gerador de leituras em lote.',
        }
      );
    }

    const regionId = payload.region_id ?? payload.regionId ?? null;
    const equipmentId = payload.equipment_id ?? payload.equipmentId ?? null;
    const customMeasuredKwh =
      payload.measured_consumption_kwh ?? payload.measuredConsumptionKwh ?? null;

    const eligibleEquipments = readingsRepository.findEligibleActiveEquipments({
      regionId,
      equipmentId,
    });
    const skippedEquipments = readingsRepository.findSkippedEquipments({
      regionId,
      equipmentId,
    });

    if (eligibleEquipments.length === 0) {
      throw new AppError(
        'Não existem equipamentos ativos em regiões ativas elegíveis para geração de leituras simuladas.',
        {
          statusCode: 422,
          code: 'NO_ELIGIBLE_ACTIVE_EQUIPMENTS',
          field: 'equipment_id',
          reason:
            'Equipamentos ou regiões inativos/bloqueados não podem receber novas leituras (RN04, RN17).',
        }
      );
    }

    const batchId = `BATCH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const recordedAt = payload.recorded_at || new Date().toISOString();

    const readingItems = eligibleEquipments.map((equipment) => {
      const measuredKwh = this.computeSimulatedConsumption(
        equipment.expected_consumption_kwh,
        scenario,
        customMeasuredKwh
      );

      const evaluation = detectAnomaly(measuredKwh, equipment.expected_consumption_kwh);

      return {
        equipment_id: equipment.id,
        equipment_code: equipment.code,
        equipment_name: equipment.name,
        region_id: equipment.region_id,
        region_code: equipment.region_code,
        batch_id: batchId,
        scenario,
        measured_consumption_kwh: evaluation.measuredConsumptionKwh,
        expected_consumption_kwh: evaluation.expectedConsumptionKwh,
        deviation_percent: evaluation.deviationPercent,
        is_anomaly: evaluation.isAnomaly,
        anomaly_type: evaluation.anomalyType,
        anomaly_label: evaluation.anomalyLabel,
        severity: evaluation.severity,
        severity_label: evaluation.severityLabel,
        recorded_at: recordedAt,
        created_by_user_id: actor?.id ?? null,
      };
    });

    const saved = readingsRepository.saveBatchReadingsAndAlerts(readingItems);

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'gestor',
      action: 'BATCH_READINGS_GENERATED',
      targetType: 'reading_batch',
      targetId: batchId,
      reason: `Geração de lote simulado no cenário '${scenario}'`,
      details: {
        batch_id: batchId,
        scenario,
        generated_count: saved.readings.length,
        skipped_count: skippedEquipments.length,
        anomalies_count: saved.readings.filter((r) => r.is_anomaly).length,
        created_alerts_count: saved.createdAlerts.length,
        updated_alerts_count: saved.updatedAlerts.length,
      },
    });

    return {
      batch_id: batchId,
      scenario,
      origin: 'SIMULADO',
      unit: 'kWh',
      recorded_at: recordedAt,
      generated_count: saved.readings.length,
      skipped_count: skippedEquipments.length,
      anomalies_count: saved.readings.filter((r) => r.is_anomaly).length,
      created_alerts_count: saved.createdAlerts.length,
      updated_alerts_count: saved.updatedAlerts.length,
      skipped_equipments: skippedEquipments,
      readings: saved.readings,
      created_alerts: saved.createdAlerts,
      updated_alerts: saved.updatedAlerts,
    };
  }

  listReadings(filters = {}) {
    return readingsRepository.findAll({
      equipmentId: filters.equipment_id ?? filters.equipmentId,
      regionId: filters.region_id ?? filters.regionId,
      scenario: filters.scenario,
      isAnomaly: filters.is_anomaly ?? filters.isAnomaly,
      batchId: filters.batch_id ?? filters.batchId,
      startDate: filters.start_date ?? filters.startDate,
      endDate: filters.end_date ?? filters.endDate,
      limit: filters.limit,
    });
  }

  getAnomalyParams() {
    return resolveAnomalyParams();
  }

  updateAnomalyParams(newParams = {}, actor = null) {
    if (newParams.reset === true) {
      const restored = resetAnomalyParamsOverride();
      return restored;
    }

    const sanitized = {};
    const keys = ['LIM_SUP', 'LIM_INF', 'TOL_ZERO', 'FAIXA_BAIXA', 'FAIXA_MEDIA', 'FAIXA_ALTA'];

    for (const key of keys) {
      if (newParams[key] !== undefined && newParams[key] !== null) {
        const num = Number(newParams[key]);
        if (!Number.isFinite(num) || num < 0) {
          throw new AppError(`O parâmetro '${key}' possui valor inválido.`, {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            field: key,
            reason: 'O parâmetro deve ser um número maior ou igual a zero.',
          });
        }
        sanitized[key] = num;
      }
    }

    const updated = setAnomalyParamsOverride(sanitized);

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'gestor',
      action: 'ANOMALY_PARAMS_UPDATED',
      targetType: 'anomaly_params',
      targetId: 'runtime_config',
      reason: 'Atualização parametrizada de limites de anomalia (RNF13)',
      details: updated,
    });

    return updated;
  }
}

const readingsService = new ReadingsService();

module.exports = readingsService;
module.exports.ReadingsService = ReadingsService;
module.exports.readingsService = readingsService;
