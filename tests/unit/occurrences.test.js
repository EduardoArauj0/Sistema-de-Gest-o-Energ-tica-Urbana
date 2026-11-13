const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage7.test.sqlite');

describe('Etapa 7 — Ocorrências Cidadãs e Consulta Pública por Protocolo (CT13, CT14)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;

  beforeEach(() => {
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

  it('CT13: Deve permitir registro público de ocorrência sem login, gerar protocolo único e validar campos obrigatórios com campo e motivo em pt-BR (RF12, RN13, RN22, RN23, RN26, RNF09, RNF10)', async () => {
    // Verificar listagem pública dos 5 tipos permitidos de ocorrência (RN23 / OD-02)
    const typesRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/occurrences/types',
    });
    assert.equal(typesRes.status, 200);
    assert.deepEqual(typesRes.body.items, [
      'poste apagado',
      'oscilação de energia',
      'falta de energia',
      'prédio público com consumo anormal',
      'iluminação acesa durante o dia',
    ]);

    // Passo 1 do CT13: Registrar ocorrência válida sem login
    const createRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'poste apagado',
        description: 'Poste apagado há duas noites em frente à escola municipal.',
        region_id: 1,
        equipment_id: 1,
        address_reference: 'Praça Municipal, em frente ao nº 15',
        citizen_name: 'Ana Cidadã Fictícia',
        citizen_email: 'ana.ficticia@simulado.local',
        citizen_phone: '71991234567',
        citizen_cpf_simulated: '000.111.222-33',
      },
    });

    assert.equal(createRes.status, 201);
    assert.match(createRes.body.protocol, /^PROTOCOLO-\d{12}$/);
    assert.equal(createRes.body.item.status, 'Aberta');
    assert.equal(createRes.body.item.type, 'poste apagado');

    // Passo 2 do CT13: Tentar enviar o formulário sem um campo obrigatório (ex.: descrição vazia)
    const missingDescRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'poste apagado',
        description: '  ',
        region_id: 1,
        address_reference: 'Praça Municipal, 15',
        citizen_name: 'Ana Cidadã Fictícia',
        citizen_email: 'ana.ficticia@simulado.local',
        citizen_phone: '71991234567',
      },
    });
    assert.equal(missingDescRes.status, 400);
    assert.equal(missingDescRes.body.code, 'VALIDATION_ERROR');
    assert.equal(missingDescRes.body.field, 'description');
    assert.ok(missingDescRes.body.reason);
    assert.equal(missingDescRes.body.protocol, undefined);

    // Validar recusa quando tipo não pertence aos 5 tipos de RN23
    const invalidTypeRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'tipo inexistente',
        description: 'Descrição válida da ocorrência.',
        region_id: 1,
        address_reference: 'Praça Municipal, 15',
        citizen_name: 'Ana Cidadã Fictícia',
        citizen_email: 'ana.ficticia@simulado.local',
        citizen_phone: '71991234567',
      },
    });
    assert.equal(invalidTypeRes.status, 400);
    assert.equal(invalidTypeRes.body.field, 'type');

    // Validar recusa quando telefone e CPF fictício estão simultaneamente ausentes (OD-05 / RN13)
    const missingContactIdRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'falta de energia',
        description: 'Queda de energia no quarteirão.',
        region_id: 1,
        address_reference: 'Rua Chile, 40',
        citizen_name: 'Ana Cidadã Fictícia',
        citizen_email: 'ana.ficticia@simulado.local',
      },
    });
    assert.equal(missingContactIdRes.status, 400);
    assert.equal(missingContactIdRes.body.field, 'citizen_phone');
  });

  it('CT14: Deve consultar protocolo publicamente exibindo apenas status e tipo sem dados pessoais, tratar protocolo inexistente e sincronizar ciclo com OS (RF13, RN15, RN26, RNF07)', async () => {
    // Registrar ocorrência válida
    const createRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'iluminação acesa durante o dia',
        description: 'Postes acesos ao meio-dia na avenida principal.',
        region_id: 2,
        equipment_id: 11,
        address_reference: 'Av. ACM, Ponto 11',
        citizen_name: 'Pedro Cidadão Sintético',
        citizen_email: 'pedro.sintetico@simulado.local',
        citizen_phone: '71987654321',
        citizen_cpf_simulated: '999.888.777-66',
      },
    });
    assert.equal(createRes.status, 201);
    const { protocol } = createRes.body;
    const occurrenceId = createRes.body.item.id;

    // Passo 1 do CT14: Consultar protocolo válido sem login
    const publicRes = await invokeApp(app, {
      method: 'GET',
      url: `/api/occurrences/public/${protocol}`,
    });
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.item.protocol, protocol);
    assert.equal(publicRes.body.item.status, 'Aberta');
    assert.equal(publicRes.body.item.type, 'iluminação acesa durante o dia');

    // Verificar proteção estrita de dados pessoais na consulta pública (CA13.1, RN15, RN26, RNF07)
    assert.equal(publicRes.body.item.citizen_name, undefined);
    assert.equal(publicRes.body.item.citizen_email, undefined);
    assert.equal(publicRes.body.item.citizen_phone, undefined);
    assert.equal(publicRes.body.item.citizen_cpf_simulated, undefined);
    const rawJson = JSON.stringify(publicRes.body);
    assert.equal(rawJson.includes('Pedro Cidadão Sintético'), false);
    assert.equal(rawJson.includes('pedro.sintetico@simulado.local'), false);
    assert.equal(rawJson.includes('999.888.777-66'), false);

    // Passo 2 do CT14: Consultar protocolo inexistente
    const notFoundRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/occurrences/public/PROTOCOLO-INEXISTENTE',
    });
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.code, 'OCCURRENCE_NOT_FOUND');

    // Verificar visibilidade administrativa: Gestor vê dados pessoais; Técnico não vê (RN15, RNF07)
    const gestorLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });
    const gestorToken = gestorLogin.body.token;

    const tecLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico1', password: 'Tecnico1@123' },
    });
    const tecnicoToken = tecLogin.body.token;

    const gestorList = await invokeApp(app, {
      method: 'GET',
      url: '/api/occurrences',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(gestorList.status, 200);
    assert.equal(gestorList.body.items[0].citizen_name, 'Pedro Cidadão Sintético');

    const tecList = await invokeApp(app, {
      method: 'GET',
      url: '/api/occurrences',
      headers: { Authorization: `Bearer ${tecnicoToken}` },
    });
    assert.equal(tecList.status, 200);
    assert.equal(tecList.body.items[0].citizen_name, undefined);
    assert.equal(tecList.body.items[0].citizen_cpf_simulated, undefined);

    // Verificar sincronização do status público com abertura e conclusão de OS (OD-01)
    const openOsRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'cidadao', occurrence_id: occurrenceId },
    });
    assert.equal(openOsRes.status, 201);
    const osId = openOsRes.body.item.id;

    const publicInProgress = await invokeApp(app, {
      method: 'GET',
      url: `/api/occurrences/public?protocol=${protocol}`,
    });
    assert.equal(publicInProgress.status, 200);
    assert.equal(publicInProgress.body.item.status, 'Em atendimento');

    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });
    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/progress`,
      headers: { Authorization: `Bearer ${tecnicoToken}` },
      body: { progress_notes: 'Ajuste de fotocélula em andamento.' },
    });
    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/close`,
      headers: { Authorization: `Bearer ${tecnicoToken}` },
      body: { solution_description: 'Fotocélula substituída e testada.' },
    });

    const publicResolved = await invokeApp(app, {
      method: 'GET',
      url: `/api/occurrences/public/${protocol}`,
    });
    assert.equal(publicResolved.status, 200);
    assert.equal(publicResolved.body.item.status, 'Resolvida');
  });
});
