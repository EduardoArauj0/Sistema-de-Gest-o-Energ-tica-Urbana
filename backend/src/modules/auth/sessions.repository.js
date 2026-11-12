const { getDbConnection } = require('../../database/connection');

/**
 * Repositório de Sessões — única camada que executa SQL na tabela sessions (RNF06, RNF18, RN30).
 */
class SessionsRepository {
  create({ id, userId, createdAt, lastActivityAt, expiresAt }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, last_activity_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `);
    stmt.run(id, userId, createdAt, lastActivityAt, expiresAt);
    return {
      id,
      user_id: userId,
      created_at: createdAt,
      last_activity_at: lastActivityAt,
      expires_at: expiresAt,
      revoked_at: null,
    };
  }

  findByIdWithUser(sessionId) {
    if (!sessionId) {
      return null;
    }
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT
        s.id AS session_id,
        s.user_id,
        s.created_at AS session_created_at,
        s.last_activity_at,
        s.expires_at,
        s.revoked_at,
        u.id AS u_id,
        u.name AS u_name,
        u.username AS u_username,
        u.email AS u_email,
        u.role AS u_role,
        u.status AS u_status
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
    `);
    return stmt.get(String(sessionId)) || null;
  }

  updateActivity(sessionId, { lastActivityAt, expiresAt }) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      UPDATE sessions
      SET last_activity_at = ?, expires_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `);
    stmt.run(lastActivityAt, expiresAt, String(sessionId));
  }

  revoke(sessionId, revokedAt = new Date().toISOString()) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      UPDATE sessions
      SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `);
    stmt.run(revokedAt, String(sessionId));
  }
}

module.exports = {
  SessionsRepository,
  sessionsRepository: new SessionsRepository(),
};
