const { AppError } = require('../../shared/errors/AppError');
const { dashboardRepository } = require('./dashboard.repository');
const { formatAlert } = require('../alerts/alerts.service');

const EQUIPMENT_TYPE_LABELS = Object.freeze({
  poste: 'Poste de Iluminação',
  predio_municipal: 'Prédio Municipal',
});

/**
 * Resolve o intervalo de datas para o Dashboard (padrão: mês corrente — CA14.1).
 */
function resolvePeriodBounds({ startDate = null, endDate = null, month = null } = {}) {
  const now = new Date();
  let startIso;
  let endIso;
  let periodLabel;

  if (month && /^\d{4}-\d{2}$/.test(String(month).trim())) {
    const [y, m] = String(month).trim().split('-').map(Number);
    const firstDay = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    startIso = firstDay.toISOString();
    endIso = lastDay.toISOString();
    periodLabel = `${String(m).padStart(2, '0')}/${y}`;
  } else if (startDate || endDate) {
    const rawStart = startDate ? String(startDate).trim() : '1970-01-01';
    const rawEnd = endDate ? String(endDate).trim() : '2099-12-31';

    startIso = rawStart.length === 10 ? `${rawStart}T00:00:00.000Z` : rawStart;
    endIso = rawEnd.length === 10 ? `${rawEnd}T23:59:59.999Z` : rawEnd;

    if (Number.isNaN(Date.parse(startIso))) {
      throw new AppError('Data inicial inválida.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'start_date',
        reason: 'Informe a data inicial no formato AAAA-MM-DD.',
      });
    }
    if (Number.isNaN(Date.parse(endIso))) {
      throw new AppError('Data final inválida.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'end_date',
        reason: 'Informe a data final no formato AAAA-MM-DD.',
      });
    }
    if (startIso > endIso) {
      throw new AppError('Período inválido: a data inicial não pode ser posterior à data final.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'start_date',
        reason: 'A data inicial deve ser anterior ou igual à data final.',
      });
    }
    periodLabel = `${startIso.slice(0, 10)} a ${endIso.slice(0, 10)}`;
  } else {
    // Mês corrente padrão (CA14.1)
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const firstDay = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    startIso = firstDay.toISOString();
    endIso = lastDay.toISOString();
    periodLabel = `Mês Corrente (${String(m + 1).padStart(2, '0')}/${y})`;
  }

  return { startIso, endIso, periodLabel };
}

class DashboardService {
  getDashboardData(filters = {}) {
    const startDate = filters.start_date ?? filters.startDate ?? null;
    const endDate = filters.end_date ?? filters.endDate ?? null;
    const month = filters.month ?? null;
    const regionId = filters.region_id ?? filters.regionId ?? null;
    const equipmentType = filters.equipment_type ?? filters.equipmentType ?? null;

    const { startIso, endIso, periodLabel } = resolvePeriodBounds({
      startDate,
      endDate,
      month,
    });

    const raw = dashboardRepository.getSummaryMetrics({
      startIso,
      endIso,
      regionId,
      equipmentType,
    });

    const isEmpty = raw.cards.readings_count === 0;

    return {
      dataOrigin: 'SIMULADO',
      period: {
        start_date: startIso.slice(0, 10),
        end_date: endIso.slice(0, 10),
        start_iso: startIso,
        end_iso: endIso,
        label: periodLabel,
        is_default_current_month: !startDate && !endDate && !month,
      },
      filters: {
        region_id: regionId ? Number(regionId) : null,
        equipment_type: equipmentType || null,
      },
      isEmpty,
      emptyMessage: isEmpty
        ? 'Nenhum dado de consumo simulado encontrado para os filtros selecionados.'
        : null,
      cards: raw.cards,
      charts: {
        consumption_by_region: raw.charts.consumption_by_region,
        consumption_by_type: raw.charts.consumption_by_type.map((row) => ({
          ...row,
          equipment_type_label:
            EQUIPMENT_TYPE_LABELS[row.equipment_type] || row.equipment_type,
        })),
        alerts_by_severity: raw.charts.alerts_by_severity.map((row) => ({
          ...row,
          severity_label: row.severity === 'Media' ? 'Média' : row.severity,
        })),
        daily_trend: raw.charts.daily_trend,
      },
      tables: {
        recent_alerts: raw.tables.recent_alerts.map(formatAlert),
        recent_work_orders: raw.tables.recent_work_orders,
      },
    };
  }

  /**
   * Retorna os marcadores e metadados do mapa interativo (RF15, UC13, RN29, CA15.1–CA15.3, CT21).
   */
  getMapOverview(filters = {}) {
    const data = dashboardRepository.getMapData({
      regionId: filters.region_id ?? filters.regionId ?? null,
      status: filters.status ?? null,
      type: filters.type ?? null,
    });

    return {
      dataOrigin: 'SIMULADO',
      center: {
        latitude: -12.9862,
        longitude: -38.4801,
        zoom: 13,
      },
      tileConfig: {
        provider: 'OpenStreetMap',
        library: 'Leaflet.js',
        urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors (Dados operacionais SIMULADOS)',
        offlineFallbackMessage:
          'Aviso: Não foi possível carregar os blocos cartográficos externos do OpenStreetMap. Os marcadores de ocorrências e equipamentos permanecem disponíveis para consulta.',
      },
      occurrences_count: data.occurrence_markers.length,
      equipments_count: data.equipment_markers.length,
      occurrence_markers: data.occurrence_markers.map((marker) => ({
        ...marker,
        popup: {
          protocol: marker.protocol,
          type: marker.type,
          status: marker.status,
          region_name: marker.region_name,
          address_reference: marker.address_reference,
        },
      })),
      equipment_markers: data.equipment_markers,
      regions: data.regions,
    };
  }
}

const dashboardService = new DashboardService();

module.exports = {
  DashboardService,
  dashboardService,
  resolvePeriodBounds,
};
