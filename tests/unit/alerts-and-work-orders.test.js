const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getDbConnection, closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage6.test.sqlite');

describe('Etapa 6 — Alertas e Ordens de Serviço (CT07, CT08, CT09, CT10, CT11, CT12)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;
  let gestorToken;
  let tecnico1Token;
  let tecnico2Token;

  beforeEach(async () => {
    prevEnv = process.env.NODE_ENV;
    prevDbTestPath = process.env.DB_TEST_PATH;
    process.env.NODE_ENV = 'test';
    process.env.DB_TEST_PATH = TEST_DB_FILE;

    resetAndSeedDatabase();
    app = createApp();

    const gestorLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'gestor', password: 'Gestor@123' },
    });
    assert.equal(gestorLogin.status, 200);
    gestorToken = gestorLogin.body.token;

    const tec1Login = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico1', password: 'Tecnico1@123' },
    });
    assert.equal(tec1Login.status, 200);
    tecnico1Token = tec1Login.body.token;

    const tec2Login = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico2', password: 'Tecnico2@123' },
    });
    assert.equal(tec2Login.status, 200);
    tecnico2Token = tec2Login.body.token;
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

  it('CT07: Deve atualizar o alerta ativo existente sem duplicação quando nova leitura do mesmo tipo ocorre (RF07, RN08, CA07.3)', async () => {
    // Passo 1: Registrar leitura de 115 kWh para equipamento 1 (E = 100 kWh -> +15% -> consumo_acima / Baixa)
    const firstBatch = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        scenario: 'manual',
        equipment_id: 1,
        measured_consumption_kwh: 115,
      },
    });
    assert.equal(firstBatch.status, 201);
    assert.equal(firstBatch.body.data.created_alerts_count, 1);

    const listAfterFirst = await invokeApp(app, {
      method: 'GET',
      url: '/api/alerts?equipment_id=1&status=Ativo',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(listAfterFirst.status, 200);
    assert.equal(listAfterFirst.body.count, 1);
    const firstAlert = listAfterFirst.body.items[0];
    assert.equal(firstAlert.anomaly_type, 'consumo_acima');
    assert.equal(firstAlert.severity, 'Baixa');
    assert.equal(firstAlert.measured_consumption_kwh, 115);
    assert.equal(firstAlert.occurrence_count, 1);

    // Passo 2: Registrar nova leitura de 160 kWh para o mesmo equipamento 1 (+60% -> consumo_acima / Alta)
    const secondBatch = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        scenario: 'manual',
        equipment_id: 1,
        measured_consumption_kwh: 160,
      },
    });
    assert.equal(secondBatch.status, 201);
    assert.equal(secondBatch.body.data.created_alerts_count, 0);
    assert.equal(secondBatch.body.data.updated_alerts_count, 1);

    // Passo 3: Consultar os alertas ativos do equipamento 1
    const listAfterSecond = await invokeApp(app, {
      method: 'GET',
      url: '/api/alerts?equipment_id=1&status=Ativo',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(listAfterSecond.status, 200);
    assert.equal(listAfterSecond.body.count, 1);

    const updatedAlert = listAfterSecond.body.items[0];
    assert.equal(updatedAlert.id, firstAlert.id);
    assert.equal(updatedAlert.anomaly_type, 'consumo_acima');
    assert.equal(updatedAlert.measured_consumption_kwh, 160);
    assert.equal(updatedAlert.deviation_percent, 60);
    assert.equal(updatedAlert.severity, 'Alta');
    assert.equal(updatedAlert.occurrence_count, 2);
  });

  it('CT08: Deve filtrar alertas por severidade, região, tipo de equipamento e situação, exibindo identificação textual e visual (RF08, RNF09)', async () => {
    // Gerar alerta Baixa em poste da REG-A (equipamento 1, E=100 -> 115 kWh = +15%)
    await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'manual', equipment_id: 1, measured_consumption_kwh: 115 },
    });

    // Gerar alerta Media em poste da REG-B (equipamento 11, E=100 -> 125 kWh = +25%)
    await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'manual', equipment_id: 11, measured_consumption_kwh: 125 },
    });

    // Gerar alerta Alta em prédio municipal da REG-A (equipamento 16, cenário falha -> 0.5 kWh)
    await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 16 },
    });

    // Passo 1: Filtrar por severidade Alta
    const altaRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/alerts?severity=Alta',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(altaRes.status, 200);
    assert.equal(altaRes.body.count, 1);
    assert.equal(altaRes.body.items[0].equipment_id, 16);
    assert.equal(altaRes.body.items[0].severity_label, 'Alta');
    assert.equal(altaRes.body.items[0].severity_badge.text, 'Alta');
    assert.ok(altaRes.body.items[0].severity_badge.color);
    assert.ok(altaRes.body.items[0].severity_badge.cssClass);

    // Passo 2: Filtrar por região REG-A (id 1) e situação Ativo
    const regAAtivoRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/alerts?region_id=1&status=Ativo',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(regAAtivoRes.status, 200);
    assert.equal(regAAtivoRes.body.count, 2);
    assert.ok(regAAtivoRes.body.items.every((a) => a.region_id === 1 && a.status === 'Ativo'));

    // Passo 3: Filtrar por tipo de equipamento 'predio_municipal'
    const predioRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/alerts?equipment_type=predio_municipal',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(predioRes.status, 200);
    assert.equal(predioRes.body.count, 1);
    assert.equal(predioRes.body.items[0].equipment_type, 'predio_municipal');
  });

  it('CT09: Deve abrir OS por alerta, por ocorrência e manualmente, recusando segunda OS ativa para o mesmo alerta e local vazio (RF09, RN09, RN19)', async () => {
    // Criar alerta ativo no equipamento 1
    const batchRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    const alertId = batchRes.body.data.created_alerts[0].id;

    // Passo 1: Abrir OS a partir do alerta ativo
    const osAlertRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    assert.equal(osAlertRes.status, 201);
    assert.equal(osAlertRes.body.item.status, 'Aberta');
    assert.equal(osAlertRes.body.item.origin, 'alerta');
    assert.equal(osAlertRes.body.item.alert_id, alertId);
    assert.ok(osAlertRes.body.item.code.startsWith('OS-'));

    // Passo 2: Tentar abrir segunda OS para o mesmo alerta ativo enquanto a primeira está Aberta (RN19)
    const duplicateOsRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    assert.equal(duplicateOsRes.status, 409);
    assert.equal(duplicateOsRes.body.code, 'ACTIVE_WORK_ORDER_ALREADY_EXISTS');
    assert.equal(duplicateOsRes.body.field, 'alert_id');

    // Preparar ocorrência cidadã no banco para testar abertura por ocorrência (Passo 3)
    const db = getDbConnection();
    const occInsert = db
      .prepare(
        `
        INSERT INTO occurrences (
          protocol, citizen_name, citizen_email, citizen_phone, citizen_cpf_simulated,
          type, description, region_id, equipment_id, address_reference,
          latitude, longitude, status, created_at, updated_at
        ) VALUES (
          'PROTOCOLO-202611120001', 'Maria Cidadã Fictícia', 'maria.ficticia@exemplo.local',
          '71999990000', '000.000.000-00', 'poste apagado',
          'Poste apagado em frente à praça central.', 1, 2, 'Praça Municipal, 10',
          -12.9714, -38.5014, 'Aberta', '2026-11-12T10:00:00Z', '2026-11-12T10:00:00Z'
        )
      `
      )
      .run();
    const occurrenceId = Number(occInsert.lastInsertRowid);

    // Passo 3: Abrir OS a partir da ocorrência registrada
    const osOccRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'cidadao', occurrence_id: occurrenceId },
    });
    assert.equal(osOccRes.status, 201);
    assert.equal(osOccRes.body.item.status, 'Aberta');
    assert.equal(osOccRes.body.item.origin, 'cidadao');
    assert.equal(osOccRes.body.item.occurrence_id, occurrenceId);
    assert.equal(osOccRes.body.item.occurrence_status, 'Em atendimento');

    // Passo 4: Abrir OS manual preenchendo local e descrição válidos
    const osManualRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        origin: 'manual',
        region_id: 1,
        location: 'Avenida Sete de Setembro, Ponto 42',
        description: 'Inspeção preventiva de quadro de comando.',
      },
    });
    assert.equal(osManualRes.status, 201);
    assert.equal(osManualRes.body.item.status, 'Aberta');
    assert.equal(osManualRes.body.item.origin, 'manual');

    // Passo 5: Tentar abrir OS manual com local vazio
    const osInvalidRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        origin: 'manual',
        region_id: 1,
        location: '   ',
        description: 'Inspeção sem local informado.',
      },
    });
    assert.equal(osInvalidRes.status, 400);
    assert.equal(osInvalidRes.body.field, 'location');
  });

  it('CT10: Deve atribuir e reatribuir OS em Aberta/Atribuída, recusar reatribuição em atendimento, bloquear Técnico/Visitante e proteger dados pessoais do cidadão (RF02, RF10, RN11, RN15, RN21, RNF05, RNF07)', async () => {
    // Inserir ocorrência cidadã com dados pessoais sintéticos e abrir OS vinculada
    const db = getDbConnection();
    const occInsert = db
      .prepare(
        `
        INSERT INTO occurrences (
          protocol, citizen_name, citizen_email, citizen_phone, citizen_cpf_simulated,
          type, description, region_id, equipment_id, address_reference,
          latitude, longitude, status, created_at, updated_at
        ) VALUES (
          'PROTOCOLO-202611120002', 'João Cidadão Sintético', 'joao.sintetico@exemplo.local',
          '71988887777', '111.222.333-44', 'oscilação de energia',
          'Oscilação constante no poste da esquina.', 1, 3, 'Rua Chile, 25',
          -12.9714, -38.5014, 'Aberta', '2026-11-12T11:00:00Z', '2026-11-12T11:00:00Z'
        )
      `
      )
      .run();
    const occurrenceId = Number(occInsert.lastInsertRowid);

    const openRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'cidadao', occurrence_id: occurrenceId },
    });
    assert.equal(openRes.status, 201);
    const osId = openRes.body.item.id;

    // Passo 1: Como Gestor, atribuir a OS Aberta ao Técnico 1 (id 2)
    const assign1Res = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });
    assert.equal(assign1Res.status, 200);
    assert.equal(assign1Res.body.item.status, 'Atribuída');
    assert.equal(assign1Res.body.item.assigned_technician_id, 2);

    // Passo 2: Como Gestor, reatribuir a OS Atribuída ao Técnico 2 (id 3)
    const assign2Res = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 3 },
    });
    assert.equal(assign2Res.status, 200);
    assert.equal(assign2Res.body.item.status, 'Atribuída');
    assert.equal(assign2Res.body.item.assigned_technician_id, 3);

    // Passo 4: Como Técnico, tentar atribuir uma OS
    const techAssignRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      headers: { Authorization: `Bearer ${tecnico1Token}` },
      body: { technician_id: 2 },
    });
    assert.equal(techAssignRes.status, 403);

    // Passo 5: Sem autenticação (Visitante), enviar requisição de atribuição
    const anonAssignRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      body: { technician_id: 2 },
    });
    assert.equal(anonAssignRes.status, 401);

    // Passo 3: Avançar a OS para Em atendimento (com Técnico 2 atribuído) e tentar reatribuir como Gestor
    const progressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/progress`,
      headers: { Authorization: `Bearer ${tecnico2Token}` },
      body: { progress_notes: 'Equipe em deslocamento para inspeção.' },
    });
    assert.equal(progressRes.status, 200);
    assert.equal(progressRes.body.item.status, 'Em atendimento');

    const reassignInProgressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${osId}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });
    assert.equal(reassignInProgressRes.status, 422);
    assert.equal(reassignInProgressRes.body.code, 'INVALID_STATE_TRANSITION');

    // Passo 6: Consultar a OS originada de ocorrência cidadã como Técnico vs Gestor (RN15, RNF07)
    const techGetRes = await invokeApp(app, {
      method: 'GET',
      url: `/api/work-orders/${osId}`,
      headers: { Authorization: `Bearer ${tecnico2Token}` },
    });
    assert.equal(techGetRes.status, 200);
    assert.equal(techGetRes.body.item.occurrence_protocol, 'PROTOCOLO-202611120002');
    assert.equal(techGetRes.body.item.citizen_name, undefined);
    assert.equal(techGetRes.body.item.citizen_email, undefined);
    assert.equal(techGetRes.body.item.citizen_phone, undefined);
    assert.equal(techGetRes.body.item.citizen_cpf_simulated, undefined);

    const gestorGetRes = await invokeApp(app, {
      method: 'GET',
      url: `/api/work-orders/${osId}`,
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(gestorGetRes.status, 200);
    assert.equal(gestorGetRes.body.item.citizen_name, 'João Cidadão Sintético');
    assert.equal(gestorGetRes.body.item.citizen_cpf_simulated, '111.222.333-44');
  });

  it('CT11: Deve permitir atendimento e encerramento com solução apenas ao Técnico atribuído e ao Gestor, resolvendo automaticamente o alerta vinculado e auditando (RF11, RN10, RN12, RN18, RNF16, OD-12)', async () => {
    // Criar 2 alertas ativos (equipamento 1 e equipamento 2) e abrir 2 OS vinculadas
    const batch1 = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    const alert1Id = batch1.body.data.created_alerts[0].id;

    const batch2 = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 2 },
    });
    const alert2Id = batch2.body.data.created_alerts[0].id;

    const os1Open = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alert1Id },
    });
    const os1Id = os1Open.body.item.id;

    // Atribuir OS 1 ao Técnico 1 (id 2)
    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });

    // Passo 1: Tentar atualizar/encerrar a OS 1 com o Técnico 2 (não atribuído)
    const unassignedProgressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/progress`,
      headers: { Authorization: `Bearer ${tecnico2Token}` },
      body: { progress_notes: 'Tentativa indevida pelo Técnico 2' },
    });
    assert.equal(unassignedProgressRes.status, 403);
    assert.equal(unassignedProgressRes.body.code, 'FORBIDDEN_NOT_ASSIGNED');

    // Passo 2: Como Técnico 1 (atribuído), alterar andamento para Em atendimento
    const tech1ProgressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/progress`,
      headers: { Authorization: `Bearer ${tecnico1Token}` },
      body: { progress_notes: 'Iniciando substituição de relé.' },
    });
    assert.equal(tech1ProgressRes.status, 200);
    assert.equal(tech1ProgressRes.body.item.status, 'Em atendimento');

    // Passo 3: Tentar encerrar como Concluída sem preencher a descrição da solução
    const emptySolutionRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/close`,
      headers: { Authorization: `Bearer ${tecnico1Token}` },
      body: { solution_description: '   ' },
    });
    assert.equal(emptySolutionRes.status, 400);
    assert.equal(emptySolutionRes.body.field, 'solution_description');

    // Passo 4: Preencher solução 'Substituição de relé fotoelétrico' e confirmar encerramento
    const close1Res = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/close`,
      headers: { Authorization: `Bearer ${tecnico1Token}` },
      body: { solution_description: 'Substituição de relé fotoelétrico' },
    });
    assert.equal(close1Res.status, 200);
    assert.equal(close1Res.body.item.status, 'Concluída');
    assert.equal(close1Res.body.item.solution_description, 'Substituição de relé fotoelétrico');
    assert.equal(close1Res.body.item.alert_status, 'Resolvido');

    // Verificar que o alerta 1 passou automaticamente para Resolvido (RN18)
    const alert1Res = await invokeApp(app, {
      method: 'GET',
      url: `/api/alerts/${alert1Id}`,
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(alert1Res.body.item.status, 'Resolvido');
    assert.ok(alert1Res.body.item.resolved_at);

    // Passo 5: Repetir o fluxo de atualização e encerramento em uma segunda OS usando o perfil Gestor (OD-12)
    const os2Open = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alert2Id },
    });
    const os2Id = os2Open.body.item.id;

    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });

    const gestorProgressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/progress`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { progress_notes: 'Atendimento acompanhado pela gestão.' },
    });
    assert.equal(gestorProgressRes.status, 200);
    assert.equal(gestorProgressRes.body.item.status, 'Em atendimento');

    const gestorCloseRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/close`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { solution_description: 'Reaperto de conexões no barramento.' },
    });
    assert.equal(gestorCloseRes.status, 200);
    assert.equal(gestorCloseRes.body.item.status, 'Concluída');
    assert.equal(gestorCloseRes.body.item.alert_status, 'Resolvido');

    // Verificar registros de auditoria das mudanças de estado (RNF16)
    const auditRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/audit?action=WORK_ORDER_CLOSED',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.items.length >= 2);
  });

  it('CT12: Deve cancelar OS em Aberta ou Atribuída com justificativa obrigatória, manter o alerta Ativo para nova OS e recusar cancelamento em atendimento (RF18, RN14, RN21, RN25, TD-05)', async () => {
    // Criar alerta ativo no equipamento 1 e abrir OS vinculada
    const batchRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    const alertId = batchRes.body.data.created_alerts[0].id;

    const open1Res = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    assert.equal(open1Res.status, 201);
    const os1Id = open1Res.body.item.id;

    // Passo 1: Como Gestor, tentar cancelar a OS sem justificativa
    const cancelEmptyRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/cancel`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { cancellation_reason: '   ' },
    });
    assert.equal(cancelEmptyRes.status, 400);
    assert.equal(cancelEmptyRes.body.field, 'cancellation_reason');

    // Passo 2: Cancelar a OS informando justificativa válida
    const cancelOkRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os1Id}/cancel`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { cancellation_reason: 'Abertura em duplicidade de triagem operacional.' },
    });
    assert.equal(cancelOkRes.status, 200);
    assert.equal(cancelOkRes.body.item.status, 'Cancelada');
    assert.equal(
      cancelOkRes.body.item.cancellation_reason,
      'Abertura em duplicidade de triagem operacional.'
    );
    assert.equal(cancelOkRes.body.item.alert_status, 'Ativo');

    // Passo 3: Abrir uma nova OS para o mesmo alerta ativo (RN25)
    const open2Res = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    assert.equal(open2Res.status, 201);
    const os2Id = open2Res.body.item.id;

    // Passo 4: Colocar a nova OS em Em atendimento e tentar cancelá-la
    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/assign`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { technician_id: 2 },
    });
    await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/progress`,
      headers: { Authorization: `Bearer ${tecnico1Token}` },
      body: { progress_notes: 'Atendimento em campo iniciado.' },
    });

    const cancelInProgressRes = await invokeApp(app, {
      method: 'PATCH',
      url: `/api/work-orders/${os2Id}/cancel`,
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { cancellation_reason: 'Tentativa de cancelar OS já em atendimento.' },
    });
    assert.equal(cancelInProgressRes.status, 422);
    assert.equal(cancelInProgressRes.body.code, 'INVALID_STATE_TRANSITION');
  });
});
