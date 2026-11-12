const { getEnv } = require('../config/env');
const { authService } = require('../modules/auth/auth.service');
const { auditService } = require('../modules/audit/audit.service');
const { AppError } = require('../shared/errors/AppError');

const SESSION_COOKIE_NAME = 'sge_session';

/**
 * Extrai o token de sessão a partir do header Authorization (Bearer),
 * header x-session-token ou cookie sge_session.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }

  const customHeader = req.headers['x-session-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey === SESSION_COOKIE_NAME) {
        const value = rest.join('=').trim();
        if (value) {
          return decodeURIComponent(value);
        }
      }
    }
  }

  return null;
}

/**
 * Middleware que exige sessão autenticada e válida no servidor (RNF05, RNF06, CA01.3, CA02.2).
 */
function requireAuth(req, _res, next) {
  const token = extractSessionToken(req);
  const endpointTarget = `${req.method} ${req.originalUrl}`;

  if (!token) {
    auditService.record({
      actorUserId: null,
      actorRole: 'visitante',
      action: 'ACCESS_DENIED',
      targetType: 'endpoint',
      targetId: endpointTarget,
      reason: 'Tentativa de acesso sem autenticação (visitante) a recurso protegido (CA02.2 / RNF05).',
    });

    return next(
      new AppError('Autenticação obrigatória para acessar este recurso.', {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        field: 'Authorization',
        reason: 'Faça login como Gestor ou Técnico para acessar esta funcionalidade.',
      })
    );
  }

  // Em ambiente de teste, permite simular avanço do relógio para validar expiração de 30 minutos (CT01)
  let simulatedNowMs = null;
  if (getEnv().isTest && req.headers['x-test-advance-minutes'] !== undefined) {
    const advanceMinutes = Number(req.headers['x-test-advance-minutes']);
    if (Number.isFinite(advanceMinutes)) {
      simulatedNowMs = Date.now() + advanceMinutes * 60 * 1000;
    }
  }

  try {
    const { user, session } = authService.validateSession(token, { simulatedNowMs });
    req.user = user;
    req.session = session;
    req.sessionToken = token;
    return next();
  } catch (err) {
    auditService.record({
      actorUserId: null,
      actorRole: 'visitante',
      action: 'ACCESS_DENIED',
      targetType: 'endpoint',
      targetId: endpointTarget,
      reason: err.message || 'Sessão inválida ou expirada.',
      details: { errorCode: err.code || 'INVALID_SESSION' },
    });
    return next(err);
  }
}

/**
 * Middleware que restringe o acesso aos perfis autorizados (RF02, RN01, RNF05, CA02.1).
 *
 * @param  {...('gestor'|'tecnico')} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(
        new AppError('Autenticação obrigatória para acessar este recurso.', {
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          field: 'Authorization',
          reason: 'Usuário não autenticado.',
        })
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      const endpointTarget = `${req.method} ${req.originalUrl}`;
      auditService.record({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'ACCESS_DENIED',
        targetType: 'endpoint',
        targetId: endpointTarget,
        reason: `Acesso negado: perfil "${req.user.role}" não possui permissão (requer: ${allowedRoles.join(', ')}).`,
        details: {
          requiredRoles: allowedRoles,
          userRole: req.user.role,
        },
      });

      return next(
        new AppError(
          'Acesso negado: seu perfil de usuário não possui permissão para esta funcionalidade.',
          {
            statusCode: 403,
            code: 'FORBIDDEN_PROFILE',
            field: 'role',
            reason: `Esta operação é restrita ao(s) perfil(is): ${allowedRoles.join(', ')} (RN01 / RF02).`,
          }
        )
      );
    }

    return next();
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  extractSessionToken,
  requireAuth,
  requireRole,
};
