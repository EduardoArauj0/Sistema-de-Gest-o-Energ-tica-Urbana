const { getDbConnection, runInTransaction } = require('../../database/connection');

/**
 * Repositório de Regiões — única camada que executa SQL na tabela regions
 * e nas cascatas transacionais associadas (RN17, RN20, RN27, RNF18, RNF19).
 */
class RegionsRepository {
  findAll({ status = null } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM equipments e WHERE e.region_id = r.id) AS total_equipments,
        (SELECT COUNT(*) FROM equipments e WHERE e.region_id = r.id AND e.status = 'Ativo') AS active_equipments
      FROM regions r
      ${whereClause}
      ORDER BY r.id ASC
    `);

    return stmt.all(...params);
  }

  findPublicActive() {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT id, code, name, description, latitude_center, longitude_center, status
      FROM regions
      WHERE status = 'Ativo'
      ORDER BY id ASC
    `);
    return stmt.all();
  }

  findById(id) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM equipments e WHERE e.region_id = r.id) AS total_equipments,
        (SELECT COUNT(*) FROM equipments e WHERE e.region_id = r.id AND e.status = 'Ativo') AS active_equipments
      FROM regions r
      WHERE r.id = ?
      LIMIT 1
    `);
    return stmt.get(Number(id)) || null;
  }

  findByName(name, excludeId = null) {
    const db = getDbConnection();
    if (excludeId !== null && excludeId !== undefined) {
      return (
        db
          .prepare('SELECT * FROM regions WHERE lower(name) = lower(?) AND id != ? LIMIT 1')
          .get(String(name).trim(), Number(excludeId)) || null
      );
    }
    return (
      db
        .prepare('SELECT * FROM regions WHERE lower(name) = lower(?) LIMIT 1')
        .get(String(name).trim()) || null
    );
  }

  findByCode(code, excludeId = null) {
    const db = getDbConnection();
    if (excludeId !== null && excludeId !== undefined) {
      return (
        db
          .prepare('SELECT * FROM regions WHERE lower(code) = lower(?) AND id != ? LIMIT 1')
          .get(String(code).trim(), Number(excludeId)) || null
      );
    }
    return (
      db
        .prepare('SELECT * FROM regions WHERE lower(code) = lower(?) LIMIT 1')
        .get(String(code).trim()) || null
    );
  }

  create({ code, name, description, latitudeCenter, longitudeCenter, nowIso }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      INSERT INTO regions (
        code, name, description, latitude_center, longitude_center, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'Ativo', ?, ?)
    `);

    const result = stmt.run(
      code,
      name,
      description,
      latitudeCenter,
      longitudeCenter,
      nowIso,
      nowIso
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  update(id, { code, name, description, latitudeCenter, longitudeCenter, nowIso }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      UPDATE regions
      SET code = ?, name = ?, description = ?, latitude_center = ?, longitude_center = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      code,
      name,
      description,
      latitudeCenter,
      longitudeCenter,
      nowIso,
      Number(id)
    );

    return this.findById(Number(id));
  }

  /**
   * Inativa uma região e aplica inativação em cascata aos seus equipamentos vinculados,
   * preservando integralmente o histórico de leituras, alertas e OS (RN04, RN20, CA03.2, CA03.3, CT02).
   */
  inactivateWithCascade(regionId, nowIso) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(`
        UPDATE regions
        SET
          status = 'Inativo',
          previous_operational_status = NULL,
          block_reason = NULL,
          blocked_at = NULL,
          blocked_by_user_id = NULL,
          inactivated_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(nowIso, nowIso, Number(regionId));

      const eqUpdateResult = db.prepare(`
        UPDATE equipments
        SET
          status = 'Inativo',
          previous_operational_status = NULL,
          blocked_by_region_cascade = 0,
          block_reason = NULL,
          blocked_at = NULL,
          blocked_by_user_id = NULL,
          inactivated_at = COALESCE(inactivated_at, ?),
          updated_at = ?
        WHERE region_id = ? AND status != 'Inativo'
      `).run(nowIso, nowIso, Number(regionId));

      return {
        region: this.findById(Number(regionId)),
        cascadedEquipmentsCount: Number(eqUpdateResult.changes),
      };
    });
  }

  /**
   * Bloqueia uma região Ativa e aplica bloqueio em cascata a todos os equipamentos Ativos
   * vinculados a ela, suspendendo alertas ativos e preservando OS em andamento (RN16, RN17, RN27, CT20).
   */
  blockWithCascade(regionId, { reason, actorUserId, nowIso }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(`
        UPDATE regions
        SET
          previous_operational_status = status,
          status = 'Bloqueado',
          block_reason = ?,
          blocked_at = ?,
          blocked_by_user_id = ?,
          updated_at = ?
        WHERE id = ?
      `).run(reason, nowIso, Number(actorUserId), nowIso, Number(regionId));

      // RN27 / CA17.11: todos os equipamentos Ativos vinculados passam a Bloqueados
      const eqBlockResult = db.prepare(`
        UPDATE equipments
        SET
          previous_operational_status = status,
          status = 'Bloqueado',
          blocked_by_region_cascade = 1,
          block_reason = ?,
          blocked_at = ?,
          blocked_by_user_id = ?,
          updated_at = ?
        WHERE region_id = ? AND status = 'Ativo'
      `).run(reason, nowIso, Number(actorUserId), nowIso, Number(regionId));

      // RN17: alertas ativos vinculados aos equipamentos bloqueados da região ficam Suspensos
      const alertsSuspendedResult = db.prepare(`
        UPDATE alerts
        SET status = 'Suspenso', updated_at = ?
        WHERE region_id = ? AND status = 'Ativo'
      `).run(nowIso, Number(regionId));

      return {
        region: this.findById(Number(regionId)),
        cascadedEquipmentsCount: Number(eqBlockResult.changes),
        suspendedAlertsCount: Number(alertsSuspendedResult.changes),
      };
    });
  }

  /**
   * Desbloqueia uma região Bloqueada, restaurando seu estado operacional anterior (Ativo),
   * restaurando os equipamentos bloqueados pela região e reativando alertas suspensos (RN17, RN27, CT20).
   */
  unblockWithCascade(regionId, { nowIso }) {
    const db = getDbConnection();

    return runInTransaction(db, () => {
      db.prepare(`
        UPDATE regions
        SET
          status = COALESCE(previous_operational_status, 'Ativo'),
          previous_operational_status = NULL,
          block_reason = NULL,
          blocked_at = NULL,
          blocked_by_user_id = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(nowIso, Number(regionId));

      const eqUnblockResult = db.prepare(`
        UPDATE equipments
        SET
          status = COALESCE(previous_operational_status, 'Ativo'),
          previous_operational_status = NULL,
          blocked_by_region_cascade = 0,
          block_reason = NULL,
          blocked_at = NULL,
          blocked_by_user_id = NULL,
          updated_at = ?
        WHERE region_id = ? AND status = 'Bloqueado'
      `).run(nowIso, Number(regionId));

      const alertsReactivatedResult = db.prepare(`
        UPDATE alerts
        SET status = 'Ativo', updated_at = ?
        WHERE region_id = ? AND status = 'Suspenso'
      `).run(nowIso, Number(regionId));

      return {
        region: this.findById(Number(regionId)),
        restoredEquipmentsCount: Number(eqUnblockResult.changes),
        reactivatedAlertsCount: Number(alertsReactivatedResult.changes),
      };
    });
  }
}

module.exports = {
  RegionsRepository,
  regionsRepository: new RegionsRepository(),
};
