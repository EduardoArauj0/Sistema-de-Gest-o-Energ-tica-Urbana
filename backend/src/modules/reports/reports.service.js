const { AppError } = require('../../shared/errors/AppError');
const { reportsRepository } = require('./reports.repository');
const { resolvePeriodBounds } = require('../dashboard/dashboard.service');

const VALID_GRANULARITIES = ['diario', 'mensal', 'daily', 'monthly'];

const EQUIPMENT_TYPE_LABELS = Object.freeze({
  poste: 'Poste de Iluminação',
  predio_municipal: 'Prédio Municipal',
});

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

class ReportsService {
  /**
   * Gera os dados estruturados do relatório de consumo por período, região, tipo e granularidade
   * (RF16, UC14, RN24, RNF09, RNF10, RNF17, CA16.1–CA16.3, CT16).
   */
  generateConsumptionReport(filters = {}) {
    const rawGranularity = String(filters.granularity || 'diario')
      .trim()
      .toLowerCase();

    if (!VALID_GRANULARITIES.includes(rawGranularity)) {
      throw new AppError('Granularidade inválida para o relatório de consumo.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'granularity',
        reason: "Informe a granularidade como 'diario' ou 'mensal'.",
      });
    }

    const normalizedGranularity =
      rawGranularity === 'mensal' || rawGranularity === 'monthly' ? 'mensal' : 'diario';

    const startDate = filters.start_date ?? filters.startDate ?? null;
    const endDate = filters.end_date ?? filters.endDate ?? null;
    const regionId = filters.region_id ?? filters.regionId ?? null;
    const equipmentType = filters.equipment_type ?? filters.equipmentType ?? null;

    // Valida datas e recusa quando start_date > end_date (CA16.3, UC14-E1, CT16 passo 4)
    const { startIso, endIso, periodLabel } = resolvePeriodBounds({
      startDate,
      endDate,
    });

    const rawRows = reportsRepository.getConsumptionReport({
      startIso,
      endIso,
      granularity: normalizedGranularity,
      regionId,
      equipmentType,
    });

    const rows = rawRows.map((row) => ({
      period: row.period,
      region_id: row.region_id,
      region_code: row.region_code,
      region_name: row.region_name,
      equipment_type: row.equipment_type,
      equipment_type_label:
        EQUIPMENT_TYPE_LABELS[row.equipment_type] || row.equipment_type,
      readings_count: Number(row.readings_count),
      measured_consumption_kwh: Number(row.measured_consumption_kwh),
      expected_consumption_kwh: Number(row.expected_consumption_kwh),
      avg_deviation_percent: Number(row.avg_deviation_percent),
      anomalies_count: Number(row.anomalies_count),
      unit: 'kWh',
      origin: 'SIMULADO',
    }));

    const summary = rows.reduce(
      (acc, r) => {
        acc.total_readings_count += r.readings_count;
        acc.total_measured_kwh = Number(
          (acc.total_measured_kwh + r.measured_consumption_kwh).toFixed(4)
        );
        acc.total_expected_kwh = Number(
          (acc.total_expected_kwh + r.expected_consumption_kwh).toFixed(4)
        );
        acc.total_anomalies_count += r.anomalies_count;
        return acc;
      },
      {
        total_readings_count: 0,
        total_measured_kwh: 0,
        total_expected_kwh: 0,
        total_anomalies_count: 0,
        unit: 'kWh',
        origin: 'SIMULADO',
      }
    );

    return {
      dataOrigin: 'SIMULADO',
      unit: 'kWh',
      granularity: normalizedGranularity,
      period: {
        start_date: startIso.slice(0, 10),
        end_date: endIso.slice(0, 10),
        label: periodLabel,
      },
      filters: {
        region_id: regionId ? Number(regionId) : null,
        equipment_type: equipmentType || null,
      },
      summary,
      count: rows.length,
      rows,
    };
  }

  /**
   * Exporta exatamente os mesmos dados do relatório em formato CSV (CA16.2, CT16 passo 3).
   */
  exportConsumptionCsv(filters = {}) {
    const report = this.generateConsumptionReport(filters);

    const headers = [
      'Periodo',
      'Regiao_Codigo',
      'Regiao_Nome',
      'Tipo_Equipamento',
      'Quantidade_Leituras',
      'Consumo_Medido_kWh',
      'Consumo_Esperado_kWh',
      'Desvio_Percentual_Medio',
      'Quantidade_Anomalias',
      'Unidade',
      'Origem_Dados',
    ];

    const lines = [headers.join(',')];

    for (const row of report.rows) {
      const cells = [
        row.period,
        row.region_code,
        row.region_name,
        row.equipment_type,
        row.readings_count,
        row.measured_consumption_kwh,
        row.expected_consumption_kwh,
        row.avg_deviation_percent,
        row.anomalies_count,
        row.unit,
        row.origin,
      ].map(escapeCsvCell);

      lines.push(cells.join(','));
    }

    return {
      filename: `relatorio-consumo-${report.granularity}-${report.period.start_date}-a-${report.period.end_date}.csv`,
      csvContent: `${lines.join('\n')}\n`,
      report,
    };
  }
}

const reportsService = new ReportsService();

module.exports = {
  ReportsService,
  reportsService,
};
