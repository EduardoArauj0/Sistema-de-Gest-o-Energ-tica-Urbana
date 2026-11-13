const { getDbConnection, runInTransaction } = require('../../database/connection');

/**
 * Repositório de Equipamentos — única camada que executa SQL na tabela equipments
 * e nos efeitos transacionais de bloqueio/desbloqueio sobre alertas (RN17, RNF18, RNF19).
 */
class EquipmentRepository {
  findAll({ regionId = null, type = null, status = null } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('e.region_id = ?');
      params.push(Number(regionId));
    }
    if (type) {
      conditions.push('e.type = ?');
      params.push(type);
    }
    if (status) {
      conditions.push('e.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
      SELECT
        e.*,
        r.code AS region_code,
        r.name AS region_name,
        r.status AS region_status
      FROM equipments e
      INNER JOIN regions r ON r.id = e.region_id
      ${whereClause}
      ORDER BY e.id ASC
    `);

    return stmt.all(...params);
  }

  findById(id) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT
        e.*,
        r.code AS region_code,
        r.name AS region_name,
        r.status AS region_status
      FROM equipments e
      INNER JOIN regions r ON r.id = e.region_id
      WHERE e.id = ?
      LIMIT 1
    `);
    return stmt.get(Number(id)) || null;
  }

  findByCode(code, excludeId = null) {
    const db = getDbConnection();
    if (excludeId !== null && excludeId !== undefined) {
      return (
        db
          .prepare('SELECT * FROM equipments WHERE lower(code) = lower(?) AND id != ? LIMIT 1')
          .get(String(code).trim(), Number(excludeId)) || null
      );
    }
    return (
      db
        .prepare('SELECT * FROM equipments WHERE lower(code) = lower(?) LIMIT 1')
        .get(String(code).trim()) || null
    );
  }

  create({
    code,
    name,
    type,
    regionId,
    location,
    expectedConsumptionKwh,
    latitude,
    longitude,
    nowIso,
  }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      INSERT INTO equipments (
        code, name, type, region_id, location, expected_consumption_kwh,
        latitude, longitude, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Ativo', ?, ?)
    `);

    const result = stmt.run(
      code,
      name,
      type,
      Number(regionId),
      location,
      Number(expectedConsumptionKwh),
      Number(latitude),
      Number(longitude),
      nowIso,
      nowIso
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  update(
    id,
    {
      code,
      name,
      type,
      regionId,
      location,
      expectedConsumptionKwh,
      latitude,
      longitude,
      nowIso,
    }
  ) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      UPDATE equipments
      SET
        code = ?,
        name = ?,
        type = ?,
        region_id = ?,
        location = ?,
        expected_consumption_kwh = ?,
        latitude = ?,
        longitude = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      code,
      name,
      type,
      Number(regionId),
      location,
      Number(expectedConsumptionKwh),
      Number(latitude),
      Number(longitude),
      nowIso,
      Number(id)
    );

    return this.findById(Number(id));
  }

  inactivate(id, nowIso) {
    const db = getDbConnection();
    db.prepare(`
      UPDATE equipments
      SET
        status = 'Inativo',
        previous_operational_status = NULL,
        blocked_by_region_cascade = 0,
        block_reason = NULL,
        blocked_at = NULL,
        blocked_by_user_id = NULL,
        inactivated_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, Number(id));

    return this.findById(Number(id));
  }

  /**
   * Bloqueia um equipamento Ativo e suspende seus alertas Ativos,
   * preservando integralmente as OS em andamento (RN16, RN17, CA17.7, CA17.9, CT19).
   */
  blockWithEffects(equipmentId, { reason, actorUserId, nowIso }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(`
        UPDATE equipments
        SET
          previous_operational_status = status,
          status = 'Bloqueado',
          blocked_by_region_cascade = 0,
          block_reason = ?,
          blocked_at = ?,
          blocked_by_user_id = ?,
          updated_at = ?
        WHERE id = ?
      `).run(reason, nowIso, Number(actorUserId), nowIso, Number(equipmentId));

      const alertsSuspended = db.prepare(`
        UPDATE alerts
        SET status = 'Suspenso', updated_at = ?
        WHERE equipment_id = ? AND status = 'Ativo'
      `).run(nowIso, Number(equipmentId));

      return {
        equipment: this.findById(Number(equipmentId)),
        suspendedAlertsCount: Number(alertsSuspended.changes),
      };
    });
  }

  /**
   * Desbloqueia um equipamento Bloqueado, restaurando seu estado operacional anterior
   * e devolvendo os alertas Suspensos ao estado Ativo (RN17, CA17.5, CA17.12, CT19).
   */
  unblockWithEffects(equipmentId, { nowIso }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(`
        UPDATE equipments
        SET
          status = COALESCE(previous_operational_status, 'Ativo'),
          previous_operational_status = NULL,
          blocked_by_region_cascade = 0,
          block_reason = NULL,
          blocked_at = NULL,
          blocked_by_user_id = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(nowIso, Number(equipmentId));

      const alertsReactivated = db.prepare(`
        UPDATE alerts
        SET status = 'Ativo', updated_at = ?
        WHERE equipment_id = ? AND status = 'Suspenso'
      `).run(nowIso, Number(equipmentId));

      return {
        equipment: this.findById(Number(equipmentId)),
        reactivatedAlertsCount: Number(alertsReactivated.changes),
      };
    });
  }
}

module.exports = {
  EquipmentRepository,
  equipmentRepository: new EquipmentRepository(),
};
