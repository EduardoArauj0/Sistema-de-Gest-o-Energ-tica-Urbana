const crypto = require('node:crypto');
const { equipmentRepository } = require('./equipment.repository');
const { regionsRepository } = require('../regions/regions.repository');
const { auditService } = require('../audit/audit.service');
const { AppError } = require('../../shared/errors/AppError');

function normalizeEquipmentType(rawType) {
  if (!rawType || typeof rawType !== 'string') {
    return null;
  }
  const cleaned = rawType
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  if (cleaned === 'poste') {
    return 'poste';
  }
  if (cleaned === 'predio_municipal' || cleaned === 'predio') {
    return 'predio_municipal';
  }
  return null;
}

class EquipmentService {
  listEquipments(filters = {}) {
    const normalizedType = filters.type ? normalizeEquipmentType(filters.type) || filters.type : null;
    return equipmentRepository.findAll({
      regionId: filters.regionId ?? filters.region_id ?? null,
      type: normalizedType,
      status: filters.status ?? null,
    });
  }

  getById(id) {
    const equipment = equipmentRepository.findById(id);
    if (!equipment) {
      throw new AppError('Equipamento não encontrado.', {
        statusCode: 404,
        code: 'EQUIPMENT_NOT_FOUND',
        field: 'id',
        reason: 'Nenhum equipamento corresponde ao identificador informado.',
      });
    }
    return equipment;
  }

  validateAndNormalizePayload(payload = {}, existing = null) {
    const rawType = payload.type ?? payload.tipo ?? existing?.type;
    const type = normalizeEquipmentType(rawType);

    if (!type) {
      throw new AppError(
        'O campo tipo de equipamento é obrigatório e deve ser "poste" ou "predio_municipal".',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'type',
          reason: 'Tipo de equipamento ausente ou inválido (RN02).',
        }
      );
    }

    const rawRegionId =
      payload.region_id ?? payload.regiao_id ?? payload.regionId ?? existing?.region_id;

    if (rawRegionId === undefined || rawRegionId === null || rawRegionId === '') {
      throw new AppError('O campo região do equipamento é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'region_id',
        reason: 'Todo equipamento deve pertencer a uma região (RN02 / CA04.3).',
      });
    }

    const regionId = Number(rawRegionId);
    const region = Number.isInteger(regionId) ? regionsRepository.findById(regionId) : null;
    if (!region) {
      throw new AppError('A região informada para o equipamento não existe.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'region_id',
        reason: 'Informe uma região cadastrada válida (RN02 / CA04.3).',
      });
    }

    if (!existing && region.status !== 'Ativo') {
      throw new AppError(
        'Não é permitido cadastrar equipamento em uma região Inativa ou Bloqueada.',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'region_id',
          reason: 'Selecione uma região com status Ativo (UC03).',
        }
      );
    }

    const rawLocation = payload.location ?? payload.localizacao ?? existing?.location ?? '';
    const location = String(rawLocation).trim();
    if (!location || location.length < 3 || location.length > 200) {
      throw new AppError(
        'O campo localização do equipamento é obrigatório e deve ter entre 3 e 200 caracteres.',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'location',
          reason: 'Informe uma localização textual válida (entre 3 e 200 caracteres).',
        }
      );
    }

    const rawExpected =
      payload.expected_consumption_kwh ??
      payload.consumo_esperado_kwh ??
      payload.expectedConsumptionKwh ??
      payload.consumoEsperado ??
      existing?.expected_consumption_kwh;

    if (rawExpected === undefined || rawExpected === null || rawExpected === '') {
      throw new AppError('O campo consumo esperado (em kWh) é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'expected_consumption_kwh',
        reason: 'O consumo esperado do equipamento é obrigatório e maior que zero (RN03 / CA04.2).',
      });
    }

    const expectedConsumptionKwh = Number(rawExpected);
    if (!Number.isFinite(expectedConsumptionKwh) || expectedConsumptionKwh <= 0) {
      throw new AppError(
        'O campo consumo esperado deve ser um número maior que zero (em kWh).',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'expected_consumption_kwh',
          reason: 'Consumo esperado menor ou igual a zero não é permitido (RN03 / CA04.2).',
        }
      );
    }

    const rawName = payload.name ?? payload.nome ?? existing?.name ?? '';
    const typeLabel = type === 'poste' ? 'Poste' : 'Prédio Municipal';
    const name = String(rawName).trim() || `${typeLabel} — ${location.slice(0, 60)}`;

    const rawCode = payload.code ?? payload.codigo ?? existing?.code ?? '';
    const prefix = type === 'poste' ? 'EQ-POSTE' : 'EQ-PREDIO';
    const code =
      String(rawCode).trim().toUpperCase() ||
      `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const latitude = Number(
      payload.latitude ?? existing?.latitude ?? region.latitude_center
    );
    const longitude = Number(
      payload.longitude ?? existing?.longitude ?? region.longitude_center
    );

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new AppError('O campo latitude do equipamento é inválido.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'latitude',
        reason: 'A latitude deve estar entre -90 e 90.',
      });
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError('O campo longitude do equipamento é inválido.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'longitude',
        reason: 'A longitude deve estar entre -180 e 180.',
      });
    }

    return {
      code,
      name,
      type,
      regionId: region.id,
      location,
      expectedConsumptionKwh,
      latitude,
      longitude,
    };
  }

  createEquipment(payload, actor) {
    const normalized = this.validateAndNormalizePayload(payload);

    if (equipmentRepository.findByCode(normalized.code)) {
      throw new AppError('Já existe um equipamento cadastrado com este código.', {
        statusCode: 409,
        code: 'DUPLICATE_EQUIPMENT_CODE',
        field: 'code',
        reason: 'O código identificador do equipamento deve ser único.',
      });
    }

    const nowIso = new Date().toISOString();
    const created = equipmentRepository.create({
      ...normalized,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_CREATED',
      targetType: 'equipment',
      targetId: created.id,
      reason: 'Cadastro de novo equipamento público.',
      details: {
        code: created.code,
        type: created.type,
        regionId: created.region_id,
        expectedConsumptionKwh: created.expected_consumption_kwh,
      },
    });

    return created;
  }

  updateEquipment(id, payload, actor) {
    const existing = this.getById(id);
    const normalized = this.validateAndNormalizePayload(payload, existing);

    if (equipmentRepository.findByCode(normalized.code, existing.id)) {
      throw new AppError('Já existe outro equipamento cadastrado com este código.', {
        statusCode: 409,
        code: 'DUPLICATE_EQUIPMENT_CODE',
        field: 'code',
        reason: 'O código identificador do equipamento deve ser único.',
      });
    }

    const nowIso = new Date().toISOString();
    const updated = equipmentRepository.update(existing.id, {
      ...normalized,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_UPDATED',
      targetType: 'equipment',
      targetId: updated.id,
      reason: 'Atualização cadastral de equipamento.',
      details: {
        code: updated.code,
        type: updated.type,
        regionId: updated.region_id,
        expectedConsumptionKwh: updated.expected_consumption_kwh,
      },
    });

    return updated;
  }

  inactivateEquipment(id, actor) {
    const existing = this.getById(id);

    if (existing.status === 'Inativo') {
      throw new AppError('O equipamento selecionado já está inativo.', {
        statusCode: 400,
        code: 'EQUIPMENT_ALREADY_INACTIVE',
        field: 'status',
        reason: 'Não é possível inativar um equipamento que já está no estado Inativo.',
      });
    }

    const nowIso = new Date().toISOString();
    const inactivated = equipmentRepository.inactivate(existing.id, nowIso);

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_INACTIVATED',
      targetType: 'equipment',
      targetId: existing.id,
      reason: 'Inativação de equipamento mantendo histórico (RN04).',
      details: {
        previousStatus: existing.status,
        newStatus: 'Inativo',
      },
    });

    return inactivated;
  }

  /**
   * Bloqueia um equipamento Ativo com validação de motivo >= 10 caracteres (RF17, RN16, RN17, RN27, CT18, CT19).
   */
  blockEquipment(id, payload = {}, actor) {
    const existing = this.getById(id);

    if (payload.confirmed === false) {
      throw new AppError('Operação de bloqueio cancelada na confirmação.', {
        statusCode: 400,
        code: 'CONFIRMATION_CANCELLED',
        field: 'confirmed',
        reason: 'O bloqueio exige confirmação explícita do Gestor (UC15-E4).',
      });
    }

    if (existing.status === 'Bloqueado') {
      throw new AppError('O equipamento selecionado já se encontra Bloqueado.', {
        statusCode: 400,
        code: 'ALREADY_BLOCKED',
        field: 'status',
        reason: 'Não é permitido bloquear um objeto que já está Bloqueado (CA17.3 / TD-06).',
      });
    }

    if (existing.status !== 'Ativo') {
      throw new AppError('Somente equipamentos no estado Ativo podem ser bloqueados.', {
        statusCode: 400,
        code: 'INVALID_STATE_FOR_BLOCK',
        field: 'status',
        reason: 'Equipamentos Inativos não podem ser bloqueados (RN27 / CA17.10 / TD-06).',
      });
    }

    const rawReason = payload.reason ?? payload.motivo ?? '';
    const trimmedReason = String(rawReason).trim();

    if (trimmedReason.length < 10) {
      throw new AppError(
        'O campo motivo do bloqueio é obrigatório e deve conter no mínimo 10 caracteres.',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'reason',
          reason: 'O motivo do bloqueio deve ter no mínimo 10 caracteres (RN16 / CA17.2).',
        }
      );
    }

    const nowIso = new Date().toISOString();
    const result = equipmentRepository.blockWithEffects(existing.id, {
      reason: trimmedReason,
      actorUserId: actor.id,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_BLOCKED',
      targetType: 'equipment',
      targetId: existing.id,
      reason: trimmedReason,
      details: {
        code: existing.code,
        previousStatus: existing.status,
        newStatus: 'Bloqueado',
        suspendedAlertsCount: result.suspendedAlertsCount,
      },
    });

    return result;
  }

  /**
   * Desbloqueia um equipamento Bloqueado mediante confirmação, sem necessidade de motivo (RF17, RN17, CA17.13, CT19).
   */
  unblockEquipment(id, payload = {}, actor) {
    const existing = this.getById(id);

    if (payload.confirmed === false) {
      throw new AppError('Operação de desbloqueio cancelada na confirmação.', {
        statusCode: 400,
        code: 'CONFIRMATION_CANCELLED',
        field: 'confirmed',
        reason: 'O desbloqueio exige confirmação explícita do Gestor.',
      });
    }

    if (existing.status !== 'Bloqueado') {
      throw new AppError('O equipamento selecionado não está Bloqueado.', {
        statusCode: 400,
        code: 'NOT_BLOCKED',
        field: 'status',
        reason: 'Somente equipamentos no estado Bloqueado podem ser desbloqueados (UC15).',
      });
    }

    const nowIso = new Date().toISOString();
    const result = equipmentRepository.unblockWithEffects(existing.id, { nowIso });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_UNBLOCKED',
      targetType: 'equipment',
      targetId: existing.id,
      reason: 'Desbloqueio confirmado pelo Gestor (sem necessidade de motivo — CA17.13).',
      details: {
        code: existing.code,
        previousStatus: 'Bloqueado',
        newStatus: result.equipment.status,
        reactivatedAlertsCount: result.reactivatedAlertsCount,
      },
    });

    return result;
  }
}

module.exports = {
  EquipmentService,
  equipmentService: new EquipmentService(),
};
