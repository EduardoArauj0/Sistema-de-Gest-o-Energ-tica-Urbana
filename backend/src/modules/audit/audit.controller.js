const { auditService } = require('./audit.service');

class AuditController {
  list(req, res, next) {
    try {
      const { action, target_type, target_id, actor_user_id, limit } = req.query;
      const items = auditService.listLogs({
        action,
        targetType: target_type,
        targetId: target_id,
        actorUserId: actor_user_id,
        limit,
      });

      res.status(200).json({
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  AuditController,
  auditController: new AuditController(),
};
