const { getDbConnection, runInTransaction } = require('../../database/connection');

class ReadingsRepository {
  /**
   * Busca todos os equipamentos elegíveis para geração de leitura (RN04, RN17, CA03.2, CA05.2, CA17.6, CA17.8):
   * Apenas equipamentos com status = 'Ativo' vinculados a regiões com status = 'Ativo'.
   */
  findEligibleActiveEquipments({ regionId = null, equipmentId = null } = {}) {
    const db = getDbConnection();
    const conditions = ["e.status = 'Ativo'", "r.status = 'Ativo'"];
    const params = [];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('e.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('e.id = ?');
      params.push(Number(equipmentId));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    return db
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
          e.expected_consumption_kwh,
          e.status,
          r.status AS region_status
        FROM equipments e
        INNER JOIN regions r ON r.id = e.region_id
        ${whereClause}
        ORDER BY e.id ASC
      `
      )
      .all(...params);
  }

  /**
   * Busca equipamentos excluídos da geração em lote (Inativos, Bloqueados ou com Região Inativa/Bloqueada)
   * para transparência no resumo do lote.
   */
  findSkippedEquipments({ regionId = null, equipmentId = null } = {}) {
    const db = getDbConnection();
    const conditions = ["(e.status != 'Ativo' OR r.status != 'Ativo')"];
    const params = [];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('e.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('e.id = ?');
      params.push(Number(equipmentId));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    return db
      .prepare(
        `
        SELECT
          e.id,
          e.code,
          e.name,
          e.status AS equipment_status,
          e.region_id,
          r.code AS region_code,
          r.status AS region_status
        FROM equipments e
        INNER JOIN regions r ON r.id = e.region_id
        ${whereClause}
        ORDER BY e.id ASC
      `
      )
      .all(...params);
  }

  /**
   * Persiste um lote de leituras simuladas e cria/atualiza alertas de anomalia na mesma transação
   * (UC04 -> UC05, RN05, RN08, RN24, RNF17).
   */
  saveBatchReadingsAndAlerts(readingItems) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      const insertReadingStmt = db.prepare(`
        INSERT INTO readings (
          equipment_id,
          batch_id,
          scenario,
          measured_consumption_kwh,
          expected_consumption_kwh,
          deviation_percent,
          is_anomaly,
          anomaly_type,
          severity,
          unit,
          origin,
          recorded_at,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'kWh', 'SIMULADO', ?, ?)
      `);

      const findActiveAlertStmt = db.prepare(`
        SELECT id, occurrence_count, status
        FROM alerts
        WHERE equipment_id = ?
          AND anomaly_type = ?
          AND status IN ('Ativo', 'Suspenso')
        LIMIT 1
      `);

      const insertAlertStmt = db.prepare(`
        INSERT INTO alerts (
          equipment_id,
          region_id,
          last_reading_id,
          anomaly_type,
          severity,
          measured_consumption_kwh,
          expected_consumption_kwh,
          deviation_percent,
          status,
          occurrence_count,
          message,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Ativo', 1, ?, ?, ?)
      `);

      const updateAlertStmt = db.prepare(`
        UPDATE alerts
        SET
          last_reading_id = ?,
          severity = ?,
          measured_consumption_kwh = ?,
          expected_consumption_kwh = ?,
          deviation_percent = ?,
          occurrence_count = occurrence_count + 1,
          message = ?,
          updated_at = ?
        WHERE id = ?
      `);

      const savedReadings = [];
      const createdAlerts = [];
      const updatedAlerts = [];

      for (const item of readingItems) {
        const result = insertReadingStmt.run(
          item.equipment_id,
          item.batch_id,
          item.scenario,
          item.measured_consumption_kwh,
          item.expected_consumption_kwh,
          item.deviation_percent,
          item.is_anomaly ? 1 : 0,
          item.anomaly_type,
          item.severity,
          item.recorded_at,
          item.created_by_user_id ?? null
        );

        const readingId = Number(result.lastInsertRowid);
        let alertAction = null;
        let alertId = null;

        if (item.is_anomaly) {
          const existingAlert = findActiveAlertStmt.get(item.equipment_id, item.anomaly_type);
          const alertMessage = `${item.anomaly_label} detectada no equipamento ${item.equipment_code} (${item.measured_consumption_kwh} kWh medidos vs. ${item.expected_consumption_kwh} kWh esperados; desvio ${item.deviation_percent.toFixed(2)}%; severidade ${item.severity_label}).`;

          if (existingAlert) {
            updateAlertStmt.run(
              readingId,
              item.severity,
              item.measured_consumption_kwh,
              item.expected_consumption_kwh,
              item.deviation_percent,
              alertMessage,
              item.recorded_at,
              existingAlert.id
            );
            alertAction = 'updated';
            alertId = existingAlert.id;
            updatedAlerts.push({
              id: existingAlert.id,
              equipment_id: item.equipment_id,
              anomaly_type: item.anomaly_type,
              severity: item.severity,
              occurrence_count: existingAlert.occurrence_count + 1,
            });
          } else {
            const alertResult = insertAlertStmt.run(
              item.equipment_id,
              item.region_id,
              readingId,
              item.anomaly_type,
              item.severity,
              item.measured_consumption_kwh,
              item.expected_consumption_kwh,
              item.deviation_percent,
              alertMessage,
              item.recorded_at,
              item.recorded_at
            );
            alertAction = 'created';
            alertId = Number(alertResult.lastInsertRowid);
            createdAlerts.push({
              id: alertId,
              equipment_id: item.equipment_id,
              anomaly_type: item.anomaly_type,
              severity: item.severity,
              occurrence_count: 1,
            });
          }
        }

        savedReadings.push({
          id: readingId,
          equipment_id: item.equipment_id,
          equipment_code: item.equipment_code,
          equipment_name: item.equipment_name,
          region_id: item.region_id,
          region_code: item.region_code,
          batch_id: item.batch_id,
          scenario: item.scenario,
          measured_consumption_kwh: item.measured_consumption_kwh,
          expected_consumption_kwh: item.expected_consumption_kwh,
          deviation_percent: item.deviation_percent,
          is_anomaly: Boolean(item.is_anomaly),
          anomaly_type: item.anomaly_type,
          anomaly_label: item.anomaly_label,
          severity: item.severity,
          severity_label: item.severity_label,
          unit: 'kWh',
          origin: 'SIMULADO',
          recorded_at: item.recorded_at,
          alert_id: alertId,
          alert_action: alertAction,
        });
      }

      return {
        readings: savedReadings,
        createdAlerts,
        updatedAlerts,
      };
    });
  }

  /**
   * Lista leituras registradas com filtros opcionais.
   */
  findAll({
    equipmentId = null,
    regionId = null,
    scenario = null,
    isAnomaly = null,
    batchId = null,
    startDate = null,
    endDate = null,
    limit = 200,
  } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('rd.equipment_id = ?');
      params.push(Number(equipmentId));
    }

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('e.region_id = ?');
      params.push(Number(regionId));
    }

    if (scenario) {
      conditions.push('rd.scenario = ?');
      params.push(scenario);
    }

    if (isAnomaly !== null && isAnomaly !== undefined && isAnomaly !== '') {
      const boolInt = isAnomaly === true || isAnomaly === 'true' || isAnomaly === '1' || isAnomaly === 1 ? 1 : 0;
      conditions.push('rd.is_anomaly = ?');
      params.push(boolInt);
    }

    if (batchId) {
      conditions.push('rd.batch_id = ?');
      params.push(batchId);
    }

    if (startDate) {
      conditions.push('rd.recorded_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('rd.recorded_at <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    const rows = db
      .prepare(
        `
        SELECT
          rd.id,
          rd.equipment_id,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          e.region_id,
          r.code AS region_code,
          r.name AS region_name,
          rd.batch_id,
          rd.scenario,
          rd.measured_consumption_kwh,
          rd.expected_consumption_kwh,
          rd.deviation_percent,
          rd.is_anomaly,
          rd.anomaly_type,
          rd.severity,
          rd.unit,
          rd.origin,
          rd.recorded_at,
          rd.created_by_user_id
        FROM readings rd
        INNER JOIN equipments e ON e.id = rd.equipment_id
        INNER JOIN regions r ON r.id = e.region_id
        ${whereClause}
        ORDER BY rd.id DESC
        LIMIT ?
      `
      )
      .all(...params, safeLimit);

    return rows.map((row) => ({
      ...row,
      is_anomaly: Boolean(row.is_anomaly),
    }));
  }

  countAll() {
    const db = getDbConnection();
    const row = db.prepare('SELECT COUNT(*) AS count FROM readings').get();
    return row ? row.count : 0;
  }
}

module.exports = new ReadingsRepository();
