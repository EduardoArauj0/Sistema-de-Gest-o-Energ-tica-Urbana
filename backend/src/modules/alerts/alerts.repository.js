const { getDbConnection } = require('../../database/connection');

class AlertsRepository {
  /**
   * Lista alertas com filtros combináveis por severidade, região, equipamento, tipo de equipamento,
   * tipo de anomalia e situação (RF08, UC06, CA08.1, CA08.2, CT08).
   */
  findAll({
    severity = null,
    regionId = null,
    equipmentId = null,
    equipmentType = null,
    anomalyType = null,
    status = null,
    limit = 200,
  } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (severity) {
      const normalizedSeverity =
        String(severity).trim().toLowerCase() === 'média' ||
        String(severity).trim().toLowerCase() === 'media'
          ? 'Media'
          : String(severity).trim();
      conditions.push('a.severity = ?');
      params.push(normalizedSeverity);
    }

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('a.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('a.equipment_id = ?');
      params.push(Number(equipmentId));
    }

    if (equipmentType) {
      conditions.push('e.type = ?');
      params.push(String(equipmentType).trim());
    }

    if (anomalyType) {
      conditions.push('a.anomaly_type = ?');
      params.push(String(anomalyType).trim());
    }

    if (status) {
      conditions.push('a.status = ?');
      params.push(String(status).trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    return db
      .prepare(
        `
        SELECT
          a.id,
          a.equipment_id,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          e.location AS equipment_location,
          e.status AS equipment_status,
          e.latitude AS equipment_latitude,
          e.longitude AS equipment_longitude,
          a.region_id,
          r.code AS region_code,
          r.name AS region_name,
          a.last_reading_id,
          a.anomaly_type,
          a.severity,
          a.measured_consumption_kwh,
          a.expected_consumption_kwh,
          a.deviation_percent,
          a.status,
          a.occurrence_count,
          a.message,
          a.created_at,
          a.updated_at,
          a.resolved_at,
          wo.id AS active_work_order_id,
          wo.code AS active_work_order_code,
          wo.status AS active_work_order_status
        FROM alerts a
        INNER JOIN equipments e ON e.id = a.equipment_id
        INNER JOIN regions r ON r.id = a.region_id
        LEFT JOIN work_orders wo
          ON wo.alert_id = a.id
          AND wo.status IN ('Aberta', 'Atribuída', 'Em atendimento')
        ${whereClause}
        ORDER BY
          CASE a.severity
            WHEN 'Alta' THEN 1
            WHEN 'Media' THEN 2
            WHEN 'Baixa' THEN 3
            ELSE 4
          END ASC,
          a.updated_at DESC,
          a.id DESC
        LIMIT ?
      `
      )
      .all(...params, safeLimit);
  }

  findById(id) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT
          a.id,
          a.equipment_id,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          e.location AS equipment_location,
          e.status AS equipment_status,
          e.latitude AS equipment_latitude,
          e.longitude AS equipment_longitude,
          a.region_id,
          r.code AS region_code,
          r.name AS region_name,
          a.last_reading_id,
          a.anomaly_type,
          a.severity,
          a.measured_consumption_kwh,
          a.expected_consumption_kwh,
          a.deviation_percent,
          a.status,
          a.occurrence_count,
          a.message,
          a.created_at,
          a.updated_at,
          a.resolved_at,
          wo.id AS active_work_order_id,
          wo.code AS active_work_order_code,
          wo.status AS active_work_order_status
        FROM alerts a
        INNER JOIN equipments e ON e.id = a.equipment_id
        INNER JOIN regions r ON r.id = a.region_id
        LEFT JOIN work_orders wo
          ON wo.alert_id = a.id
          AND wo.status IN ('Aberta', 'Atribuída', 'Em atendimento')
        WHERE a.id = ?
      `
      )
      .get(Number(id));
  }
}

module.exports = {
  AlertsRepository,
  alertsRepository: new AlertsRepository(),
};
