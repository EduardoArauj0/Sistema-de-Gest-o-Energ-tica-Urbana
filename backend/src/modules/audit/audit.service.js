const { auditRepository } = require('./audit.repository');

/**
 * Serviço de Auditoria (RNF05, RNF16, RN16, RN20).
 * Registra quem (actor), quando (created_at) e o quê (action, target, reason, details).
 */
class AuditService {
  /**
   * @param {object} params
   * @param {number|null} [params.actorUserId]
   * @param {string|null} [params.actorRole]
   * @param {string} params.action
   * @param {string} params.targetType
   * @param {string|number|null} [params.targetId]
   * @param {string|null} [params.reason]
   * @param {object|null} [params.details]
   */
  record({
    actorUserId = null,
    actorRole = 'visitante',
    action,
    targetType,
    targetId = null,
    reason = null,
    details = null,
  }) {
    const detailsJson = details ? JSON.stringify(details) : null;
    return auditRepository.create({
      actorUserId,
      actorRole,
      action,
      targetType,
      targetId,
      reason,
      detailsJson,
      createdAt: new Date().toISOString(),
    });
  }

  listLogs(filters = {}) {
    return auditRepository.findAll(filters);
  }
}

module.exports = {
  AuditService,
  auditService: new AuditService(),
};
