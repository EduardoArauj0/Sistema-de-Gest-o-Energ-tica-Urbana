const { getDbConnection } = require('../../database/connection');

class DashboardRepository {
  /**
   * Calcula os indicadores agregados e séries de gráficos do Dashboard (RF14, UC12, RN24, RNF11, CT15).
   */
  getSummaryMetrics({ startIso, endIso, regionId = null, equipmentType = null }) {
    const db = getDbConnection();

    const readingConditions = ['rd.recorded_at >= ?', 'rd.recorded_at <= ?'];
    const readingParams = [startIso, endIso];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      readingConditions.push('e.region_id = ?');
      readingParams.push(Number(regionId));
    }

    if (equipmentType) {
      readingConditions.push('e.type = ?');
      readingParams.push(String(equipmentType).trim());
    }

    const readingWhere = `WHERE ${readingConditions.join(' AND ')}`;

    const consumptionTotals = db
      .prepare(
        `
        SELECT
          COUNT(rd.id) AS readings_count,
          COALESCE(SUM(rd.measured_consumption_kwh), 0) AS total_consumption_kwh,
          COALESCE(SUM(rd.expected_consumption_kwh), 0) AS total_expected_kwh,
          COALESCE(SUM(CASE WHEN rd.is_anomaly = 1 THEN 1 ELSE 0 END), 0) AS anomalous_readings_count
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        ${readingWhere}
      `
      )
      .get(...readingParams);

    // Contagem de alertas ativos filtrados por região e tipo de equipamento
    const alertConditions = ["a.status = 'Ativo'"];
    const alertParams = [];
    if (regionId !== null && regionId !== undefined && regionId !== '') {
      alertConditions.push('a.region_id = ?');
      alertParams.push(Number(regionId));
    }
    if (equipmentType) {
      alertConditions.push('e.type = ?');
      alertParams.push(String(equipmentType).trim());
    }
    const alertWhere = `WHERE ${alertConditions.join(' AND ')}`;

    const activeAlertsRow = db
      .prepare(
        `
        SELECT COUNT(a.id) AS count
        FROM alerts a
        INNER JOIN equipments e ON e.id = a.equipment_id
        ${alertWhere}
      `
      )
      .get(...alertParams);

    // Contagem de OS em aberto/andamento ('Aberta', 'Atribuída', 'Em atendimento')
    const osConditions = ["wo.status IN ('Aberta', 'Atribuída', 'Em atendimento')"];
    const osParams = [];
    if (regionId !== null && regionId !== undefined && regionId !== '') {
      osConditions.push('wo.region_id = ?');
      osParams.push(Number(regionId));
    }
    if (equipmentType) {
      osConditions.push('e.type = ?');
      osParams.push(String(equipmentType).trim());
    }
    const osWhere = `WHERE ${osConditions.join(' AND ')}`;

    const openOsRow = db
      .prepare(
        `
        SELECT COUNT(wo.id) AS count
        FROM work_orders wo
        LEFT JOIN equipments e ON e.id = wo.equipment_id
        ${osWhere}
      `
      )
      .get(...osParams);

    // Contagem de ocorrências abertas/em atendimento
    const occConditions = ["o.status IN ('Aberta', 'Em atendimento')"];
    const occParams = [];
    if (regionId !== null && regionId !== undefined && regionId !== '') {
      occConditions.push('o.region_id = ?');
      occParams.push(Number(regionId));
    }
    if (equipmentType) {
      occConditions.push('e.type = ?');
      occParams.push(String(equipmentType).trim());
    }
    const occWhere = `WHERE ${occConditions.join(' AND ')}`;

    const openOccurrencesRow = db
      .prepare(
        `
        SELECT COUNT(o.id) AS count
        FROM occurrences o
        LEFT JOIN equipments e ON e.id = o.equipment_id
        ${occWhere}
      `
      )
      .get(...occParams);

    // Contagem de equipamentos ativos no escopo
    const eqConditions = ["e.status = 'Ativo'", "r.status = 'Ativo'"];
    const eqParams = [];
    if (regionId !== null && regionId !== undefined && regionId !== '') {
      eqConditions.push('e.region_id = ?');
      eqParams.push(Number(regionId));
    }
    if (equipmentType) {
      eqConditions.push('e.type = ?');
      eqParams.push(String(equipmentType).trim());
    }
    const eqWhere = `WHERE ${eqConditions.join(' AND ')}`;

    const activeEquipmentsRow = db
      .prepare(
        `
        SELECT COUNT(e.id) AS count
        FROM equipments e
        INNER JOIN regions r ON r.id = e.region_id
        ${eqWhere}
      `
      )
      .get(...eqParams);

    // Gráfico 1: Consumo por região
    const consumptionByRegion = db
      .prepare(
        `
        SELECT
          r.id AS region_id,
          r.code AS region_code,
          r.name AS region_name,
          COUNT(rd.id) AS readings_count,
          ROUND(COALESCE(SUM(rd.measured_consumption_kwh), 0), 4) AS total_measured_kwh,
          ROUND(COALESCE(SUM(rd.expected_consumption_kwh), 0), 4) AS total_expected_kwh
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        INNER JOIN regions r ON r.id = e.region_id
        ${readingWhere}
        GROUP BY r.id, r.code, r.name
        ORDER BY r.id ASC
      `
      )
      .all(...readingParams);

    // Gráfico 2: Consumo por tipo de equipamento
    const consumptionByType = db
      .prepare(
        `
        SELECT
          e.type AS equipment_type,
          COUNT(rd.id) AS readings_count,
          ROUND(COALESCE(SUM(rd.measured_consumption_kwh), 0), 4) AS total_measured_kwh,
          ROUND(COALESCE(SUM(rd.expected_consumption_kwh), 0), 4) AS total_expected_kwh
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        ${readingWhere}
        GROUP BY e.type
        ORDER BY e.type ASC
      `
      )
      .all(...readingParams);

    // Gráfico 3: Alertas ativos por severidade
    const alertsBySeverity = db
      .prepare(
        `
        SELECT
          a.severity,
          COUNT(a.id) AS count
        FROM alerts a
        INNER JOIN equipments e ON e.id = a.equipment_id
        ${alertWhere}
        GROUP BY a.severity
      `
      )
      .all(...alertParams);

    // Gráfico 4: Tendência diária no período
    const dailyTrend = db
      .prepare(
        `
        SELECT
           substr(rd.recorded_at, 1, 10) AS date,
          COUNT(rd.id) AS readings_count,
          ROUND(COALESCE(SUM(rd.measured_consumption_kwh), 0), 4) AS total_measured_kwh,
          ROUND(COALESCE(SUM(rd.expected_consumption_kwh), 0), 4) AS total_expected_kwh
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        ${readingWhere}
        GROUP BY substr(rd.recorded_at, 1, 10)
        ORDER BY date ASC
      `
      )
      .all(...readingParams);

    // Tabela de alertas ativos recentes
    const recentAlerts = db
      .prepare(
        `
        SELECT
          a.id,
          a.equipment_id,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          a.region_id,
          r.code AS region_code,
          r.name AS region_name,
          a.anomaly_type,
          a.severity,
          a.measured_consumption_kwh,
          a.expected_consumption_kwh,
          a.deviation_percent,
          a.status,
          a.occurrence_count,
          a.updated_at
        FROM alerts a
        INNER JOIN equipments e ON e.id = a.equipment_id
        INNER JOIN regions r ON r.id = a.region_id
        ${alertWhere}
        ORDER BY
          CASE a.severity WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 ELSE 3 END ASC,
          a.updated_at DESC
        LIMIT 10
      `
      )
      .all(...alertParams);

    // Tabela de OS abertas/em andamento recentes
    const recentWorkOrders = db
      .prepare(
        `
        SELECT
          wo.id,
          wo.code,
          wo.origin,
          wo.title,
          wo.location,
          wo.status,
          wo.region_id,
          r.code AS region_code,
          r.name AS region_name,
          wo.equipment_id,
          e.code AS equipment_code,
          e.type AS equipment_type,
          tech.name AS assigned_technician_name,
          wo.created_at,
          wo.updated_at
        FROM work_orders wo
        INNER JOIN regions r ON r.id = wo.region_id
        LEFT JOIN equipments e ON e.id = wo.equipment_id
        LEFT JOIN users tech ON tech.id = wo.assigned_technician_id
        ${osWhere}
        ORDER BY wo.id DESC
        LIMIT 10
      `
      )
      .all(...osParams);

    return {
      cards: {
        total_consumption_kwh: Number((consumptionTotals?.total_consumption_kwh || 0).toFixed(4)),
        total_expected_kwh: Number((consumptionTotals?.total_expected_kwh || 0).toFixed(4)),
        readings_count: Number(consumptionTotals?.readings_count || 0),
        anomalous_readings_count: Number(consumptionTotals?.anomalous_readings_count || 0),
        active_alerts_count: Number(activeAlertsRow?.count || 0),
        open_work_orders_count: Number(openOsRow?.count || 0),
        open_occurrences_count: Number(openOccurrencesRow?.count || 0),
        active_equipments_count: Number(activeEquipmentsRow?.count || 0),
        unit: 'kWh',
      },
      charts: {
        consumption_by_region: consumptionByRegion,
        consumption_by_type: consumptionByType,
        alerts_by_severity: alertsBySeverity,
        daily_trend: dailyTrend,
      },
      tables: {
        recent_alerts: recentAlerts,
        recent_work_orders: recentWorkOrders,
      },
    };
  }

  /**
   * Obtém marcadores de ocorrências, equipamentos e regiões para o mapa interativo (RF15, UC13, RN29, CT21).
   */
  getMapData({ regionId = null, status = null, type = null } = {}) {
    const db = getDbConnection();

    const occConditions = [];
    const occParams = [];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      occConditions.push('o.region_id = ?');
      occParams.push(Number(regionId));
    }

    if (status) {
      occConditions.push('o.status = ?');
      occParams.push(String(status).trim());
    }

    if (type) {
      occConditions.push('o.type = ?');
      occParams.push(String(type).trim());
    }

    const occWhere = occConditions.length > 0 ? `WHERE ${occConditions.join(' AND ')}` : '';

    // CA15.2 / RN15 / RNF07 / CT21: Os marcadores do mapa trazem protocolo, tipo, situação, endereço/referência e coordenadas sem expor dados pessoais do cidadão
    const occurrenceMarkers = db
      .prepare(
        `
        SELECT
          o.id,
          o.protocol,
          o.type,
          o.status,
          o.description,
          o.address_reference,
          o.region_id,
          r.code AS region_code,
          r.name AS region_name,
          o.equipment_id,
          e.code AS equipment_code,
          o.latitude,
          o.longitude,
          o.created_at,
          o.updated_at
        FROM occurrences o
        INNER JOIN regions r ON r.id = o.region_id
        LEFT JOIN equipments e ON e.id = o.equipment_id
        ${occWhere}
        ORDER BY o.id DESC
      `
      )
      .all(...occParams);

    const eqConditions = [];
    const eqParams = [];
    if (regionId !== null && regionId !== undefined && regionId !== '') {
      eqConditions.push('e.region_id = ?');
      eqParams.push(Number(regionId));
    }
    const eqWhere = eqConditions.length > 0 ? `WHERE ${eqConditions.join(' AND ')}` : '';

    const equipmentMarkers = db
      .prepare(
        `
        SELECT
          e.id,
          e.code,
          e.name,
          e.type,
          e.region_id,
          r.code AS region_code,
          r.name AS region_name,
          e.location,
          e.expected_consumption_kwh,
          e.status,
          e.latitude,
          e.longitude,
          (
            SELECT COUNT(*)
            FROM alerts a
            WHERE a.equipment_id = e.id AND a.status = 'Ativo'
          ) AS active_alerts_count
        FROM equipments e
        INNER JOIN regions r ON r.id = e.region_id
        ${eqWhere}
        ORDER BY e.id ASC
      `
      )
      .all(...eqParams);

    const regions = db
      .prepare(
        `
        SELECT
          id,
          code,
          name,
          status,
          latitude_center,
          longitude_center
        FROM regions
        ORDER BY id ASC
      `
      )
      .all();

    return {
      occurrence_markers: occurrenceMarkers,
      equipment_markers: equipmentMarkers,
      regions,
    };
  }
}

module.exports = {
  DashboardRepository,
  dashboardRepository: new DashboardRepository(),
};
