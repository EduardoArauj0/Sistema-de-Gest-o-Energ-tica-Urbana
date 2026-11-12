const { getDbConnection } = require('../../database/connection');

/**
 * Repositório de Auditoria — única camada que executa SQL na tabela audit_logs (RNF16, RNF18, RNF19).
 */
class AuditRepository {
  /**
   * Insere um registro de auditoria usando consulta parametrizada.
   *
   * @param {object} data
   * @param {number|null} [data.actorUserId]
   * @param {string|null} [data.actorRole]
   * @param {string} data.action
   * @param {string} data.targetType
   * @param {string|null} [data.targetId]
   * @param {string|null} [data.reason]
   * @param {string|null} [data.detailsJson]
   * @param {string} data.createdAt
   */
  create({
    actorUserId = null,
    actorRole = null,
    action,
    targetType,
    targetId = null,
    reason = null,
    detailsJson = null,
    createdAt = new Date().toISOString(),
  }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        actor_user_id, actor_role, action, target_type, target_id, reason, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      actorUserId,
      actorRole,
      action,
      targetType,
      targetId !== null && targetId !== undefined ? String(targetId) : null,
      reason,
      detailsJson,
      createdAt
    );

    return {
      id: Number(result.lastInsertRowid),
      actor_user_id: actorUserId,
      actor_role: actorRole,
      action,
      target_type: targetType,
      target_id: targetId !== null && targetId !== undefined ? String(targetId) : null,
      reason,
      details_json: detailsJson,
      created_at: createdAt,
    };
  }

  /**
   * Lista registros de auditoria com filtros opcionais parametrizados.
   *
   * @param {object} [filters]
   * @param {string} [filters.action]
   * @param {string} [filters.targetType]
   * @param {string} [filters.targetId]
   * @param {number} [filters.actorUserId]
   * @param {number} [filters.limit=100]
   */
  findAll({ action, targetType, targetId, actorUserId, limit = 100 } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (action) {
      conditions.push('a.action = ?');
      params.push(action);
    }
    if (targetType) {
      conditions.push('a.target_type = ?');
      params.push(targetType);
    }
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      conditions.push('a.target_id = ?');
      params.push(String(targetId));
    }
    if (actorUserId !== undefined && actorUserId !== null && actorUserId !== '') {
      conditions.push('a.actor_user_id = ?');
      params.push(Number(actorUserId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    params.push(safeLimit);

    const stmt = db.prepare(`
      SELECT
        a.id,
        a.actor_user_id,
        u.name AS actor_name,
        u.username AS actor_username,
        a.actor_role,
        a.action,
        a.target_type,
        a.target_id,
        a.reason,
        a.details_json,
        a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ?
    `);

    return stmt.all(...params).map((row) => ({
      ...row,
      details: row.details_json ? JSON.parse(row.details_json) : null,
    }));
  }
}

module.exports = {
  AuditRepository,
  auditRepository: new AuditRepository(),
};
