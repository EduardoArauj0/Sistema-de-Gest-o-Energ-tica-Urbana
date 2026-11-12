const crypto = require('node:crypto');
const { getEnv } = require('../../config/env');
const { usersRepository } = require('../users/users.repository');
const { sessionsRepository } = require('./sessions.repository');
const { auditService } = require('../audit/audit.service');
const { verifyPassword } = require('../../shared/security/password');
const { AppError } = require('../../shared/errors/AppError');

const GENERIC_LOGIN_ERROR_MSG = 'Credenciais inválidas. Verifique seu usuário e senha.';

class AuthService {
  /**
   * Autentica Gestor ou Técnico e abre sessão controlada no servidor (RF01, RN01, RN30, UC01).
   *
   * @param {object} credentials
   * @param {string} [credentials.identifier]
   * @param {string} [credentials.username]
   * @param {string} [credentials.email]
   * @param {string} [credentials.password]
   */
  login({ identifier, username, email, password } = {}) {
    const loginId = String(identifier || username || email || '').trim();

    if (!loginId) {
      throw new AppError('O campo usuário ou e-mail é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'username',
        reason: 'Informe o nome de usuário ou e-mail para autenticar.',
      });
    }

    if (!password || typeof password !== 'string') {
      throw new AppError('O campo senha é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'password',
        reason: 'Informe a senha para autenticar.',
      });
    }

    const userRecord = usersRepository.findByIdentifierWithHash(loginId);

    if (
      !userRecord ||
      userRecord.status !== 'Ativo' ||
      !verifyPassword(password, userRecord.password_hash)
    ) {
      auditService.record({
        actorUserId: userRecord ? userRecord.id : null,
        actorRole: userRecord ? userRecord.role : 'visitante',
        action: 'AUTH_LOGIN_FAILURE',
        targetType: 'session',
        targetId: loginId,
        reason: 'Tentativa de login com credenciais inválidas ou usuário inativo.',
        details: { attemptedIdentifier: loginId },
      });

      // CA01.2 / UC01-E1: mensagem genérica, sem abrir sessão
      throw new AppError(GENERIC_LOGIN_ERROR_MSG, {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        field: 'credentials',
        reason: GENERIC_LOGIN_ERROR_MSG,
      });
    }

    const env = getEnv();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const timeoutMs = env.sessionTimeoutMinutes * 60 * 1000;
    const expiresAtIso = new Date(nowMs + timeoutMs).toISOString();
    const token = crypto.randomBytes(32).toString('hex');

    sessionsRepository.create({
      id: token,
      userId: userRecord.id,
      createdAt: nowIso,
      lastActivityAt: nowIso,
      expiresAt: expiresAtIso,
    });

    const safeUser = {
      id: userRecord.id,
      name: userRecord.name,
      username: userRecord.username,
      email: userRecord.email,
      role: userRecord.role,
      status: userRecord.status,
    };

    const initialView = userRecord.role === 'gestor' ? 'gestor-dashboard' : 'tecnico-os';

    auditService.record({
      actorUserId: safeUser.id,
      actorRole: safeUser.role,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'session',
      targetId: token.slice(0, 12),
      reason: 'Autenticação realizada com sucesso.',
      details: { username: safeUser.username, role: safeUser.role, initialView },
    });

    return {
      token,
      expiresAt: expiresAtIso,
      timeoutMinutes: env.sessionTimeoutMinutes,
      initialView,
      user: safeUser,
    };
  }

  /**
   * Valida o token de sessão em cada requisição protegida e aplica expiração
   * por inatividade de 30 minutos (RNF05, RNF06, CT01).
   *
   * @param {string} token
   * @param {object} [options]
   * @param {number} [options.simulatedNowMs] Usado em ambiente de teste para simular passagem de tempo (CT01)
   */
  validateSession(token, { simulatedNowMs = null } = {}) {
    if (!token) {
      throw new AppError('Autenticação obrigatória para acessar este recurso.', {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        field: 'Authorization',
        reason: 'Nenhum token de sessão foi informado.',
      });
    }

    const sessionRow = sessionsRepository.findByIdWithUser(token);
    if (!sessionRow || sessionRow.revoked_at !== null || sessionRow.u_status !== 'Ativo') {
      throw new AppError('Sessão inválida ou encerrada. Faça login novamente.', {
        statusCode: 401,
        code: 'INVALID_SESSION',
        field: 'Authorization',
        reason: 'A sessão informada não existe ou já foi encerrada.',
      });
    }

    const nowMs = Number.isFinite(simulatedNowMs) ? simulatedNowMs : Date.now();
    const expiresAtMs = Date.parse(sessionRow.expires_at);

    if (nowMs >= expiresAtMs) {
      const nowIso = new Date(nowMs).toISOString();
      sessionsRepository.revoke(token, nowIso);

      auditService.record({
        actorUserId: sessionRow.u_id,
        actorRole: sessionRow.u_role,
        action: 'SESSION_EXPIRED',
        targetType: 'session',
        targetId: token.slice(0, 12),
        reason: 'Sessão encerrada automaticamente após 30 minutos de inatividade (RNF06).',
        details: {
          lastActivityAt: sessionRow.last_activity_at,
          expiredAt: sessionRow.expires_at,
        },
      });

      throw new AppError(
        'Sua sessão expirou após 30 minutos de inatividade. Faça login novamente.',
        {
          statusCode: 401,
          code: 'SESSION_EXPIRED',
          field: 'Authorization',
          reason: 'Tempo limite de inatividade (30 minutos) atingido (RNF06).',
        }
      );
    }

    const env = getEnv();
    const updatedActivityIso = new Date(nowMs).toISOString();
    const updatedExpiresIso = new Date(
      nowMs + env.sessionTimeoutMinutes * 60 * 1000
    ).toISOString();

    sessionsRepository.updateActivity(token, {
      lastActivityAt: updatedActivityIso,
      expiresAt: updatedExpiresIso,
    });

    return {
      session: {
        id: sessionRow.session_id,
        createdAt: sessionRow.session_created_at,
        lastActivityAt: updatedActivityIso,
        expiresAt: updatedExpiresIso,
      },
      user: {
        id: sessionRow.u_id,
        name: sessionRow.u_name,
        username: sessionRow.u_username,
        email: sessionRow.u_email,
        role: sessionRow.u_role,
        status: sessionRow.u_status,
      },
    };
  }

  /**
   * Encerra explicitamente a sessão do usuário (RF01, CA01.3, CT01).
   *
   * @param {string} token
   * @param {object|null} [actor]
   */
  logout(token, actor = null) {
    if (token) {
      sessionsRepository.revoke(token, new Date().toISOString());
    }

    if (actor) {
      auditService.record({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'AUTH_LOGOUT',
        targetType: 'session',
        targetId: token ? token.slice(0, 12) : null,
        reason: 'Logout explícito executado pelo usuário.',
      });
    }
  }
}

module.exports = {
  AuthService,
  authService: new AuthService(),
};
