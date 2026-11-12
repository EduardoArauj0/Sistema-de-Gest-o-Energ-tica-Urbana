const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDbConnection, closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage3.test.sqlite');

describe('Etapa 3 — Autenticação, Sessão 30min, RBAC por Perfil e Auditoria (CT01)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;

  before(() => {
    prevEnv = process.env.NODE_ENV;
    prevDbTestPath = process.env.DB_TEST_PATH;
    process.env.NODE_ENV = 'test';
    process.env.DB_TEST_PATH = TEST_DB_FILE;
    resetAndSeedDatabase();
    app = createApp();
  });

  after(() => {
    closeDbConnection();
    process.env.NODE_ENV = prevEnv;
    if (prevDbTestPath === undefined) {
      delete process.env.DB_TEST_PATH;
    } else {
      process.env.DB_TEST_PATH = prevDbTestPath;
    }

    for (const suffix of ['', '-shm', '-wal']) {
      const f = `${TEST_DB_FILE}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignora se já removido
        }
      }
    }
  });

  it('CT01 Passos 1 e 2: deve autenticar Gestor, permitir acesso ao perfil e encerrar sessão no logout (CA01.1, CA01.3)', async () => {
    const loginRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });

    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.user.role, 'gestor');
    assert.equal(loginRes.body.initialView, 'gestor-dashboard');
    assert.equal(loginRes.body.timeoutMinutes, 30);
    assert.equal(loginRes.body.user.password_hash, undefined);

    const token = loginRes.body.token;

    // Consulta rota protegida como Gestor
    const meRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.username, 'gestor');

    const techListRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/users/technicians',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(techListRes.status, 200);
    assert.equal(techListRes.body.count, 2);

    // Passo 2: Executar logout e confirmar que a requisição interna exige novo login
    const logoutRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(afterLogoutRes.status, 401);
    assert.equal(afterLogoutRes.body.code, 'INVALID_SESSION');
  });

  it('CT01 Passos 3 e 4: Técnico não acessa funcionalidade exclusiva do Gestor e Visitante não acessa área protegida (CA02.1, CA02.2, RNF05)', async () => {
    // Passo 4: Como visitante (sem token), tentar acessar funcionalidade protegida
    const visitorRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/users/technicians',
    });
    assert.equal(visitorRes.status, 401);
    assert.equal(visitorRes.body.code, 'UNAUTHENTICATED');

    // Passo 3: Autenticar como Técnico e tentar acessar funcionalidade restrita ao Gestor
    const techLoginRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico1', password: 'Tecnico1@123' },
    });
    assert.equal(techLoginRes.status, 200);
    assert.equal(techLoginRes.body.user.role, 'tecnico');
    assert.equal(techLoginRes.body.initialView, 'tecnico-os');

    const techToken = techLoginRes.body.token;

    const forbiddenRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/users/technicians',
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.code, 'FORBIDDEN_PROFILE');
  });

  it('CT01 Passo 5: deve manter sessão antes de 30min e expirar exatamente a partir de 30 minutos de inatividade (RNF06)', async () => {
    const loginRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico2', password: 'Tecnico2@123' },
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token;

    // 29 minutos de inatividade: ainda válida
    const activeAt29MinRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-test-advance-minutes': '29',
      },
    });
    assert.equal(activeAt29MinRes.status, 200);

    // 60 minutos acumulados (> 30min desde a última atividade renovada em +29min): expira
    const expiredRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-test-advance-minutes': '60',
      },
    });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.code, 'SESSION_EXPIRED');

    // Mesmo sem avanço de relógio, a sessão já está revogada no banco após expirar
    const subsequentRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(subsequentRes.status, 401);
    assert.equal(subsequentRes.body.code, 'INVALID_SESSION');
  });

  it('CT01 Passos 6 e 7: senha inválida gera mensagem genérica sem abrir sessão e eventos críticos ficam auditados (CA01.2, RNF04, RNF16)', async () => {
    const db = getDbConnection();
    const sessionsBefore = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;

    const invalidLoginRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'SenhaIncorreta999' },
    });

    assert.equal(invalidLoginRes.status, 401);
    assert.equal(invalidLoginRes.body.code, 'INVALID_CREDENTIALS');
    assert.equal(
      invalidLoginRes.body.message,
      'Credenciais inválidas. Verifique seu usuário e senha.'
    );

    const sessionsAfter = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
    assert.equal(sessionsAfter, sessionsBefore);

    // Autenticar como Gestor para consultar a trilha de auditoria (GET /api/audit)
    const managerLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });
    const managerToken = managerLogin.body.token;

    const auditRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/audit?limit=50',
      headers: { Authorization: `Bearer ${managerToken}` },
    });

    assert.equal(auditRes.status, 200);
    const actions = auditRes.body.items.map((item) => item.action);
    assert.ok(actions.includes('AUTH_LOGIN_SUCCESS'));
    assert.ok(actions.includes('AUTH_LOGIN_FAILURE'));
    assert.ok(actions.includes('AUTH_LOGOUT'));
    assert.ok(actions.includes('SESSION_EXPIRED'));
    assert.ok(actions.includes('ACCESS_DENIED'));
  });
});
