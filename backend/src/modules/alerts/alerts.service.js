const { AppError } = require('../../shared/errors/AppError');
const { alertsRepository } = require('./alerts.repository');

const ANOMALY_LABELS = Object.freeze({
  falha_total: 'Falha total',
  consumo_acima: 'Consumo acima',
  consumo_abaixo: 'Consumo abaixo',
});

const SEVERITY_BADGES = Object.freeze({
  Alta: {
    text: 'Alta',
    color: '#dc2626',
    cssClass: 'badge-severity-alta',
  },
  Media: {
    text: 'Média',
    color: '#d97706',
    cssClass: 'badge-severity-media',
  },
  Baixa: {
    text: 'Baixa',
    color: '#2563eb',
    cssClass: 'badge-severity-baixa',
  },
});

function formatAlert(row) {
  if (!row) {
    return null;
  }

  const badge = SEVERITY_BADGES[row.severity] || {
    text: row.severity,
    color: '#6b7280',
    cssClass: 'badge-severity-default',
  };

  return {
    ...row,
    anomaly_label: ANOMALY_LABELS[row.anomaly_type] || row.anomaly_type,
    severity_label: badge.text,
    severity_badge: badge,
  };
}

class AlertsService {
  list(filters = {}) {
    const rows = alertsRepository.findAll({
      severity: filters.severity,
      regionId: filters.region_id ?? filters.regionId,
      equipmentId: filters.equipment_id ?? filters.equipmentId,
      equipmentType: filters.equipment_type ?? filters.equipmentType,
      anomalyType: filters.anomaly_type ?? filters.anomalyType,
      status: filters.status,
      limit: filters.limit,
    });

    return rows.map(formatAlert);
  }

  getById(id) {
    const row = alertsRepository.findById(id);
    if (!row) {
      throw new AppError('Alerta não encontrado.', {
        statusCode: 404,
        code: 'ALERT_NOT_FOUND',
        field: 'id',
        reason: 'Não existe alerta cadastrado com o identificador informado.',
      });
    }
    return formatAlert(row);
  }
}

const alertsService = new AlertsService();

module.exports = {
  AlertsService,
  alertsService,
  formatAlert,
};
