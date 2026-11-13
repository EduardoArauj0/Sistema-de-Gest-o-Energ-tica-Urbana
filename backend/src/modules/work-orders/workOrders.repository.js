const { getDbConnection, runInTransaction } = require('../../database/connection');

class WorkOrdersRepository {
  /**
   * Gera um código sequencial único para a Ordem de Serviço (ex.: OS-20261112-0001).
   */
  generateNextCode(nowIso = new Date().toISOString()) {
    const db = getDbConnection();
    const datePart = nowIso.slice(0, 10).replace(/-/g, '');
    const row = db.prepare('SELECT COUNT(*) AS count FROM work_orders').get();
    const nextSeq = (row ? Number(row.count) : 0) + 1;
    return `OS-${datePart}-${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Verifica se já existe uma OS ativa (Aberta, Atribuída ou Em atendimento) para o alerta informado (RN19).
   */
  findActiveByAlertId(alertId) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT id, code, status
        FROM work_orders
        WHERE alert_id = ?
          AND status IN ('Aberta', 'Atribuída', 'Em atendimento')
        LIMIT 1
      `
      )
      .get(Number(alertId));
  }

  /**
   * Verifica se já existe uma OS ativa (Aberta, Atribuída ou Em atendimento) para a ocorrência cidadã informada.
   */
  findActiveByOccurrenceId(occurrenceId) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT id, code, status
        FROM work_orders
        WHERE occurrence_id = ?
          AND status IN ('Aberta', 'Atribuída', 'Em atendimento')
        LIMIT 1
      `
      )
      .get(Number(occurrenceId));
  }

  findOccurrenceById(occurrenceId) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT
          o.*,
          r.code AS region_code,
          r.name AS region_name
        FROM occurrences o
        INNER JOIN regions r ON r.id = o.region_id
        WHERE o.id = ?
      `
      )
      .get(Number(occurrenceId));
  }

  /**
   * Cria uma nova Ordem de Serviço em transação atômica, atualizando o estado da ocorrência cidadã
   * para 'Em atendimento' quando originada de chamado cidadão (RF09, UC07, OD-01).
   */
  create(data) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      const insertStmt = db.prepare(`
        INSERT INTO work_orders (
          code,
          origin,
          alert_id,
          occurrence_id,
          region_id,
          equipment_id,
          location,
          title,
          description,
          status,
          assigned_technician_id,
          created_by_user_id,
          latitude,
          longitude,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aberta', NULL, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        data.code,
        data.origin,
        data.alert_id ?? null,
        data.occurrence_id ?? null,
        data.region_id,
        data.equipment_id ?? null,
        data.location,
        data.title,
        data.description,
        data.created_by_user_id,
        data.latitude,
        data.longitude,
        data.created_at,
        data.created_at
      );

      if (data.origin === 'cidadao' && data.occurrence_id) {
        db.prepare(
          `
          UPDATE occurrences
          SET status = 'Em atendimento', updated_at = ?
          WHERE id = ?
        `
        ).run(data.created_at, Number(data.occurrence_id));
      }

      return this.findById(Number(result.lastInsertRowid));
    });
  }

  findById(id) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT
          wo.*,
          r.code AS region_code,
          r.name AS region_name,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          tech.name AS assigned_technician_name,
          tech.username AS assigned_technician_username,
          creator.name AS created_by_name,
          a.anomaly_type AS alert_anomaly_type,
          a.severity AS alert_severity,
          a.status AS alert_status,
          occ.protocol AS occurrence_protocol,
          occ.type AS occurrence_type,
          occ.status AS occurrence_status,
          occ.citizen_name AS citizen_name,
          occ.citizen_email AS citizen_email,
          occ.citizen_phone AS citizen_phone,
          occ.citizen_cpf_simulated AS citizen_cpf_simulated
        FROM work_orders wo
        INNER JOIN regions r ON r.id = wo.region_id
        LEFT JOIN equipments e ON e.id = wo.equipment_id
        LEFT JOIN users tech ON tech.id = wo.assigned_technician_id
        LEFT JOIN users creator ON creator.id = wo.created_by_user_id
        LEFT JOIN alerts a ON a.id = wo.alert_id
        LEFT JOIN occurrences occ ON occ.id = wo.occurrence_id
        WHERE wo.id = ?
      `
      )
      .get(Number(id));
  }

  findAll({
    status = null,
    origin = null,
    regionId = null,
    equipmentId = null,
    assignedTechnicianId = null,
    alertId = null,
    occurrenceId = null,
    limit = 200,
  } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('wo.status = ?');
      params.push(String(status).trim());
    }

    if (origin) {
      conditions.push('wo.origin = ?');
      params.push(String(origin).trim());
    }

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('wo.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('wo.equipment_id = ?');
      params.push(Number(equipmentId));
    }

    if (
      assignedTechnicianId !== null &&
      assignedTechnicianId !== undefined &&
      assignedTechnicianId !== ''
    ) {
      conditions.push('wo.assigned_technician_id = ?');
      params.push(Number(assignedTechnicianId));
    }

    if (alertId !== null && alertId !== undefined && alertId !== '') {
      conditions.push('wo.alert_id = ?');
      params.push(Number(alertId));
    }

    if (occurrenceId !== null && occurrenceId !== undefined && occurrenceId !== '') {
      conditions.push('wo.occurrence_id = ?');
      params.push(Number(occurrenceId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    return db
      .prepare(
        `
        SELECT
          wo.*,
          r.code AS region_code,
          r.name AS region_name,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          tech.name AS assigned_technician_name,
          tech.username AS assigned_technician_username,
          creator.name AS created_by_name,
          a.anomaly_type AS alert_anomaly_type,
          a.severity AS alert_severity,
          a.status AS alert_status,
          occ.protocol AS occurrence_protocol,
          occ.type AS occurrence_type,
          occ.status AS occurrence_status,
          occ.citizen_name AS citizen_name,
          occ.citizen_email AS citizen_email,
          occ.citizen_phone AS citizen_phone,
          occ.citizen_cpf_simulated AS citizen_cpf_simulated
        FROM work_orders wo
        INNER JOIN regions r ON r.id = wo.region_id
        LEFT JOIN equipments e ON e.id = wo.equipment_id
        LEFT JOIN users tech ON tech.id = wo.assigned_technician_id
        LEFT JOIN users creator ON creator.id = wo.created_by_user_id
        LEFT JOIN alerts a ON a.id = wo.alert_id
        LEFT JOIN occurrences occ ON occ.id = wo.occurrence_id
        ${whereClause}
        ORDER BY wo.id DESC
        LIMIT ?
      `
      )
      .all(...params, safeLimit);
  }

  assignTechnician(id, technicianId, nowIso) {
    const db = getDbConnection();
    db.prepare(
      `
      UPDATE work_orders
      SET
        status = 'Atribuída',
        assigned_technician_id = ?,
        updated_at = ?
      WHERE id = ?
    `
    ).run(Number(technicianId), nowIso, Number(id));

    return this.findById(Number(id));
  }

  updateProgress(id, { progressNotes, startedAt, updatedAt }) {
    const db = getDbConnection();
    db.prepare(
      `
      UPDATE work_orders
      SET
        status = 'Em atendimento',
        progress_notes = COALESCE(?, progress_notes),
        started_at = COALESCE(started_at, ?),
        updated_at = ?
      WHERE id = ?
    `
    ).run(progressNotes ?? null, startedAt, updatedAt, Number(id));

    return this.findById(Number(id));
  }

  /**
   * Encerra a OS como 'Concluída' e resolve automaticamente o alerta vinculado (RN18)
   * ou a ocorrência cidadã vinculada (OD-01) na mesma transação.
   */
  closeWorkOrder(id, { solutionDescription, progressNotes, completedAt, alertId, occurrenceId }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(
        `
        UPDATE work_orders
        SET
          status = 'Concluída',
          solution_description = ?,
          progress_notes = COALESCE(?, progress_notes),
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
      `
      ).run(solutionDescription, progressNotes ?? null, completedAt, completedAt, Number(id));

      if (alertId) {
        db.prepare(
          `
          UPDATE alerts
          SET
            status = 'Resolvido',
            resolved_at = ?,
            updated_at = ?
          WHERE id = ?
        `
        ).run(completedAt, completedAt, Number(alertId));
      }

      if (occurrenceId) {
        db.prepare(
          `
          UPDATE occurrences
          SET
            status = 'Resolvida',
            updated_at = ?
          WHERE id = ?
        `
        ).run(completedAt, Number(occurrenceId));
      }

      return this.findById(Number(id));
    });
  }

  /**
   * Cancela a OS preservando o registro histórico (RN14), mantendo o alerta vinculado Ativo (RN25)
   * ou retornando a ocorrência cidadã para 'Aberta' (OD-01).
   */
  cancelWorkOrder(id, { cancellationReason, cancelledAt, occurrenceId }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(
        `
        UPDATE work_orders
        SET
          status = 'Cancelada',
          cancellation_reason = ?,
          cancelled_at = ?,
          updated_at = ?
        WHERE id = ?
      `
      ).run(cancellationReason, cancelledAt, cancelledAt, Number(id));

      if (occurrenceId) {
        db.prepare(
          `
          UPDATE occurrences
          SET
            status = 'Aberta',
            updated_at = ?
          WHERE id = ?
            AND status = 'Em atendimento'
        `
        ).run(cancelledAt, Number(occurrenceId));
      }

      return this.findById(Number(id));
    });
  }
}

module.exports = {
  WorkOrdersRepository,
  workOrdersRepository: new WorkOrdersRepository(),
};
