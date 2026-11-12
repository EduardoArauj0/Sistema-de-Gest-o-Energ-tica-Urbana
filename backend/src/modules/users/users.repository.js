const { getDbConnection } = require('../../database/connection');

/**
 * Repositório de Usuários — única camada que executa SQL na tabela users (RNF18, RNF19).
 */
class UsersRepository {
  /**
   * Busca usuário por username ou e-mail para autenticação.
   * Inclui password_hash exclusivamente para verificação interna pelo AuthService.
   *
   * @param {string} identifier username ou email
   */
  findByIdentifierWithHash(identifier) {
    const db = getDbConnection();
    const normalized = String(identifier || '').trim().toLowerCase();
    const stmt = db.prepare(`
      SELECT id, name, username, email, password_hash, role, status, created_at, updated_at
      FROM users
      WHERE lower(username) = ? OR lower(email) = ?
      LIMIT 1
    `);
    return stmt.get(normalized, normalized) || null;
  }

  /**
   * Busca usuário por ID sem expor o password_hash.
   *
   * @param {number} id
   */
  findById(id) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT id, name, username, email, role, status, created_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `);
    return stmt.get(Number(id)) || null;
  }

  /**
   * Lista usuários com perfil 'tecnico' e status 'Ativo' (RN11).
   */
  findActiveTechnicians() {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT id, name, username, email, role, status, created_at, updated_at
      FROM users
      WHERE role = 'tecnico' AND status = 'Ativo'
      ORDER BY id ASC
    `);
    return stmt.all();
  }

  /**
   * Lista todos os usuários cadastrados (sem expor password_hash).
   */
  findAll() {
    const db = getDbConnection();
    const stmt = db.prepare(`
      SELECT id, name, username, email, role, status, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `);
    return stmt.all();
  }
}

module.exports = {
  UsersRepository,
  usersRepository: new UsersRepository(),
};
