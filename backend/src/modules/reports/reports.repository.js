const { getDbConnection } = require('../../database/connection');

class ReportsRepository {
  /**
   * Consulta o relatório agregado de consumo por período, região, tipo de equipamento
   * e granularidade diária ou mensal (RF16, UC14, RN24, RNF17, CA16.1, CT16).
   */
  getConsumptionReport({
    startIso,
    endIso,
    granularity = 'diario',
    regionId = null,
    equipmentType = null,
  }) {
    const db = getDbConnection();
    const isMonthly = granularity === 'mensal' || granularity === 'monthly';
    const periodExpr = isMonthly
      ? 'substr(rd.recorded_at, 1, 7)'
      : 'substr(rd.recorded_at, 1, 10)';

    const conditions = ['rd.recorded_at >= ?', 'rd.recorded_at <= ?'];
    const params = [startIso, endIso];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('e.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentType) {
      conditions.push('e.type = ?');
      params.push(String(equipmentType).trim());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = db
      .prepare(
        `
        SELECT
          ${periodExpr} AS period,
          r.id AS region_id,
          r.code AS region_code,
          r.name AS region_name,
          e.type AS equipment_type,
          COUNT(rd.id) AS readings_count,
          ROUND(COALESCE(SUM(rd.measured_consumption_kwh), 0), 4) AS measured_consumption_kwh,
          ROUND(COALESCE(SUM(rd.expected_consumption_kwh), 0), 4) AS expected_consumption_kwh,
          ROUND(COALESCE(AVG(rd.deviation_percent), 0), 2) AS avg_deviation_percent,
          COALESCE(SUM(CASE WHEN rd.is_anomaly = 1 THEN 1 ELSE 0 END), 0) AS anomalies_count
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        INNER JOIN regions r ON r.id = e.region_id
        ${whereClause}
        GROUP BY ${periodExpr}, r.id, r.code, r.name, e.type
        ORDER BY period ASC, r.id ASC, e.type ASC
      `
      )
      .all(...params);

    return rows;
  }
}

module.exports = {
  ReportsRepository,
  reportsRepository: new ReportsRepository(),
};
