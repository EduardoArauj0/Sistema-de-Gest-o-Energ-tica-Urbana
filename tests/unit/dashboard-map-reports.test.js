const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { closeDbConnection } = require('../../backend/src/database/connection');
const { resetAndSeedDatabase } = require('../../backend/src/database/seed');
const { createApp } = require('../../backend/src/app');
const { invokeApp } = require('../helpers/request');

const TEST_DB_FILE = path.resolve(__dirname, '../../backend/data/unit-stage8.test.sqlite');

describe('Etapa 8 — Dashboard, Mapa Interativo, Relatórios CSV e Persistência após Reinício (CT15, CT16, CT17, CT21)', () => {
  let prevEnv;
  let prevDbTestPath;
  let app;
  let gestorToken;
  let tecnicoToken;

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

    const tecLogin = await invokeApp(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'tecnico1', password: 'Tecnico1@123' },
    });
    assert.equal(tecLogin.status, 200);
    tecnicoToken = tecLogin.body.token;
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

  it('CT15: Deve exibir indicadores consistentes no Dashboard para o mês corrente em <= 3s, atualizar por filtros e informar estado vazio (RF14, RNF11)', async () => {
    // Gerar 1 lote normal (20 equipamentos) e 1 leitura de falha no equipamento 1 (gera 1 alerta ativo)
    const batchNormal = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'normal' },
    });
    assert.equal(batchNormal.status, 201);

    const batchFalha = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    assert.equal(batchFalha.status, 201);
    const alertId = batchFalha.body.data.created_alerts[0].id;

    // Abrir 1 OS vinculada ao alerta ativo
    const osRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    assert.equal(osRes.status, 201);

    // Passo 1 do CT15: Carregar Dashboard no período padrão (mês corrente) e medir tempo <= 3s (RNF11)
    const t0 = performance.now();
    const dashRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/dashboard',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    const elapsedMs = performance.now() - t0;

    assert.equal(dashRes.status, 200);
    assert.ok(elapsedMs <= 3000, `Tempo de resposta (${elapsedMs}ms) deve ser <= 3000ms (RNF11)`);
    assert.equal(dashRes.body.period.is_default_current_month, true);
    assert.equal(dashRes.body.isEmpty, false);
    assert.equal(dashRes.body.cards.readings_count, 21);
    assert.equal(dashRes.body.cards.active_alerts_count, 1);
    assert.equal(dashRes.body.cards.open_work_orders_count, 1);
    assert.equal(dashRes.body.cards.unit, 'kWh');
    assert.equal(dashRes.body.charts.consumption_by_region.length, 2);
    assert.equal(dashRes.body.charts.consumption_by_type.length, 2);

    // Passo 2 do CT15: Aplicar filtro por região REG-A (id 1) e tipo 'poste'
    const filteredRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/dashboard?region_id=1&equipment_type=poste',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(filteredRes.status, 200);
    assert.equal(filteredRes.body.filters.region_id, 1);
    assert.equal(filteredRes.body.filters.equipment_type, 'poste');
    assert.equal(filteredRes.body.charts.consumption_by_region.length, 1);
    assert.equal(filteredRes.body.charts.consumption_by_region[0].region_code, 'REG-A');
    assert.equal(filteredRes.body.charts.consumption_by_type.length, 1);
    assert.equal(filteredRes.body.charts.consumption_by_type[0].equipment_type, 'poste');

    // Passo 3 do CT15: Aplicar filtro sem dados (ano 2090) -> estado vazio claro (CA14.3)
    const emptyRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/dashboard?start_date=2090-01-01&end_date=2090-01-31',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(emptyRes.status, 200);
    assert.equal(emptyRes.body.isEmpty, true);
    assert.equal(emptyRes.body.cards.total_consumption_kwh, 0);
    assert.ok(emptyRes.body.emptyMessage.includes('Nenhum dado de consumo simulado'));
  });

  it('CT16: Deve emitir relatório de consumo com granularidade diária e mensal, exportar CSV idêntico aos dados da tela e recusar período inválido (RF16, RN24, RNF17)', async () => {
    // Gerar leituras em duas datas distintas de novembro/2026 na REG-A (id 1)
    await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        scenario: 'normal',
        region_id: 1,
        recorded_at: '2026-11-10T10:00:00.000Z',
      },
    });

    await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: {
        scenario: 'pico',
        region_id: 1,
        recorded_at: '2026-11-12T15:00:00.000Z',
      },
    });

    // Passo 1 do CT16: Emitir relatório com granularidade diária para REG-A
    const dailyRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/reports/consumption?start_date=2026-11-01&end_date=2026-11-30&region_id=1&granularity=diario',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(dailyRes.status, 200);
    assert.equal(dailyRes.body.granularity, 'diario');
    assert.equal(dailyRes.body.unit, 'kWh');
    assert.equal(dailyRes.body.dataOrigin, 'SIMULADO');
    // 2 dias x 2 tipos de equipamento (poste e predio_municipal) na REG-A = 4 linhas
    assert.equal(dailyRes.body.rows.length, 4);

    // Passo 2 do CT16: Alternar para granularidade mensal e verificar consistência da soma
    const monthlyRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/reports/consumption?start_date=2026-11-01&end_date=2026-11-30&region_id=1&granularity=mensal',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(monthlyRes.status, 200);
    assert.equal(monthlyRes.body.granularity, 'mensal');
    // 1 mês (2026-11) x 2 tipos de equipamento na REG-A = 2 linhas
    assert.equal(monthlyRes.body.rows.length, 2);
    assert.equal(
      monthlyRes.body.summary.total_measured_kwh,
      dailyRes.body.summary.total_measured_kwh
    );

    // Passo 3 do CT16: Exportar relatório em CSV e comparar com os dados retornados
    const csvRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/reports/consumption/csv?start_date=2026-11-01&end_date=2026-11-30&region_id=1&granularity=diario',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(csvRes.status, 200);
    assert.ok(String(csvRes.headers['content-type']).includes('text/csv'));
    const csvLines = String(csvRes.text).trim().split('\n');
    // 1 cabeçalho + 4 linhas de dados = 5 linhas
    assert.equal(csvLines.length, 5);
    assert.ok(csvLines[0].includes('Periodo,Regiao_Codigo,Regiao_Nome,Tipo_Equipamento'));
    assert.ok(csvLines[1].includes('2026-11-10,REG-A'));
    assert.ok(csvLines[1].includes('SIMULADO'));

    // Passo 4 do CT16: Informar data inicial maior que data final -> recusa com 400 (CA16.3)
    const invalidPeriodRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/reports/consumption?start_date=2026-11-25&end_date=2026-11-10',
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(invalidPeriodRes.status, 400);
    assert.equal(invalidPeriodRes.body.code, 'VALIDATION_ERROR');
    assert.equal(invalidPeriodRes.body.field, 'start_date');
  });

  it('CT17: Deve preservar alertas, ocorrências e ordens de serviço íntegros após encerramento e reinício da aplicação (RNF02, RN14)', async () => {
    // Passo 1: Criar 1 alerta ativo, 1 ocorrência cidadã e 1 OS vinculada
    const batchRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/readings/generate-batch',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { scenario: 'falha', equipment_id: 1 },
    });
    const alertId = batchRes.body.data.created_alerts[0].id;

    const occRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'poste apagado',
        description: 'Poste apagado antes do reinício do servidor.',
        region_id: 1,
        equipment_id: 1,
        address_reference: 'Praça Municipal, 01',
        citizen_name: 'Cidadão Persistência',
        citizen_email: 'persistencia@simulado.local',
        citizen_phone: '71990001111',
      },
    });
    const { protocol } = occRes.body;

    const osRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/work-orders',
      headers: { Authorization: `Bearer ${gestorToken}` },
      body: { origin: 'alerta', alert_id: alertId },
    });
    const osId = osRes.body.item.id;
    const osCode = osRes.body.item.code;

    // Passo 2 e 3: Encerrar a conexão SQLite e recriar a aplicação simulando reinício do servidor
    closeDbConnection();
    const restartedApp = createApp();

    // Passo 4: Consultar novamente o alerta, a ocorrência e a OS após o reinício
    const alertAfter = await invokeApp(restartedApp, {
      method: 'GET',
      url: `/api/alerts/${alertId}`,
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(alertAfter.status, 200);
    assert.equal(alertAfter.body.item.id, alertId);
    assert.equal(alertAfter.body.item.status, 'Ativo');

    const occAfter = await invokeApp(restartedApp, {
      method: 'GET',
      url: `/api/occurrences/public/${protocol}`,
    });
    assert.equal(occAfter.status, 200);
    assert.equal(occAfter.body.item.protocol, protocol);
    assert.equal(occAfter.body.item.status, 'Aberta');

    const osAfter = await invokeApp(restartedApp, {
      method: 'GET',
      url: `/api/work-orders/${osId}`,
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.equal(osAfter.status, 200);
    assert.equal(osAfter.body.item.code, osCode);
    assert.equal(osAfter.body.item.status, 'Aberta');
  });

  it('CT21: Deve fornecer marcadores geográficos de ocorrências e equipamentos para o mapa interativo com popup seguro e aviso de fallback de tiles (RF15, RN29)', async () => {
    // Registrar ocorrência com coordenadas na REG-A
    const occRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/occurrences',
      body: {
        type: 'oscilação de energia',
        description: 'Oscilação no poste próximo ao elevador.',
        region_id: 1,
        equipment_id: 2,
        address_reference: 'Praça Tomé de Souza, 02',
        citizen_name: 'Cidadão Mapa',
        citizen_email: 'mapa@simulado.local',
        citizen_phone: '71992223333',
      },
    });
    assert.equal(occRes.status, 201);

    // Consultar visão do mapa como Técnico (RF15, UC13)
    const mapRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/dashboard/map',
      headers: { Authorization: `Bearer ${tecnicoToken}` },
    });
    assert.equal(mapRes.status, 200);
    assert.equal(mapRes.body.occurrences_count, 1);
    assert.equal(mapRes.body.equipments_count, 20);
    assert.ok(mapRes.body.tileConfig.urlTemplate.includes('openstreetmap.org'));
    assert.ok(mapRes.body.tileConfig.offlineFallbackMessage);

    const marker = mapRes.body.occurrence_markers[0];
    assert.equal(marker.popup.type, 'oscilação de energia');
    assert.equal(marker.popup.status, 'Aberta');
    assert.equal(marker.citizen_name, undefined);
    assert.equal(marker.citizen_email, undefined);
  });
});
