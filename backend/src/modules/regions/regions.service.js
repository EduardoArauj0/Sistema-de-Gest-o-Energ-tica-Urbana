const { regionsRepository } = require('./regions.repository');
const { auditService } = require('../audit/audit.service');
const { AppError } = require('../../shared/errors/AppError');

const DEFAULT_LAT_CENTER = -12.9714;
const DEFAULT_LNG_CENTER = -38.5014;

function normalizeRegionInput(payload = {}, existing = null) {
  const rawName = payload.name ?? payload.nome ?? existing?.name ?? '';
  const name = String(rawName).trim();

  if (!name || name.length < 2 || name.length > 100) {
    throw new AppError(
      'O campo nome da região é obrigatório e deve ter entre 2 e 100 caracteres.',
      {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'name',
        reason: 'Informe um nome válido para a região (entre 2 e 100 caracteres).',
      }
    );
  }

  const rawCode = payload.code ?? payload.codigo ?? existing?.code ?? '';
  let code = String(rawCode).trim().toUpperCase();
  if (!code) {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase()
      .slice(0, 12);
    code = `REG-${slug || Date.now().toString().slice(-4)}`;
  }

  if (code.length < 2 || code.length > 20) {
    throw new AppError('O campo código da região deve ter entre 2 e 20 caracteres.', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      field: 'code',
      reason: 'O código identificador da região deve ter entre 2 e 20 caracteres.',
    });
  }

  const rawDescription = payload.description ?? payload.descricao ?? existing?.description ?? null;
  const description =
    rawDescription !== null && rawDescription !== undefined ? String(rawDescription).trim() : null;

  if (description && description.length > 255) {
    throw new AppError('O campo descrição da região deve ter no máximo 255 caracteres.', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      field: 'description',
      reason: 'Limite máximo de 255 caracteres excedido na descrição.',
    });
  }

  const rawLat =
    payload.latitude_center ??
    payload.latitudeCenter ??
    existing?.latitude_center ??
    DEFAULT_LAT_CENTER;
  const rawLng =
    payload.longitude_center ??
    payload.longitudeCenter ??
    existing?.longitude_center ??
    DEFAULT_LNG_CENTER;

  const latitudeCenter = Number(rawLat);
  const longitudeCenter = Number(rawLng);

  if (!Number.isFinite(latitudeCenter) || latitudeCenter < -90 || latitudeCenter > 90) {
    throw new AppError('O campo latitude central da região é inválido.', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      field: 'latitude_center',
      reason: 'A latitude deve ser um número entre -90 e 90.',
    });
  }

  if (!Number.isFinite(longitudeCenter) || longitudeCenter < -180 || longitudeCenter > 180) {
    throw new AppError('O campo longitude central da região é inválido.', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      field: 'longitude_center',
      reason: 'A longitude deve ser um número entre -180 e 180.',
    });
  }

  return {
    code,
    name,
    description,
    latitudeCenter,
    longitudeCenter,
  };
}

class RegionsService {
  listRegions(filters = {}) {
    return regionsRepository.findAll(filters);
  }

  listPublicActiveRegions() {
    return regionsRepository.findPublicActive();
  }

  getById(id) {
    const region = regionsRepository.findById(id);
    if (!region) {
      throw new AppError('Região não encontrada.', {
        statusCode: 404,
        code: 'REGION_NOT_FOUND',
        field: 'id',
        reason: 'Nenhuma região corresponde ao identificador informado.',
      });
    }
    return region;
  }

  createRegion(payload, actor) {
    const normalized = normalizeRegionInput(payload);

    if (regionsRepository.findByName(normalized.name)) {
      throw new AppError('Já existe uma região cadastrada com este nome.', {
        statusCode: 409,
        code: 'DUPLICATE_REGION_NAME',
        field: 'name',
        reason: 'O nome da região deve ser único.',
      });
    }

    if (regionsRepository.findByCode(normalized.code)) {
      throw new AppError('Já existe uma região cadastrada com este código.', {
        statusCode: 409,
        code: 'DUPLICATE_REGION_CODE',
        field: 'code',
        reason: 'O código da região deve ser único.',
      });
    }

    const nowIso = new Date().toISOString();
    const created = regionsRepository.create({
      ...normalized,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'REGION_CREATED',
      targetType: 'region',
      targetId: created.id,
      reason: 'Cadastro de nova região.',
      details: { code: created.code, name: created.name },
    });

    return created;
  }

  updateRegion(id, payload, actor) {
    const existing = this.getById(id);
    const normalized = normalizeRegionInput(payload, existing);

    if (regionsRepository.findByName(normalized.name, existing.id)) {
      throw new AppError('Já existe outra região cadastrada com este nome.', {
        statusCode: 409,
        code: 'DUPLICATE_REGION_NAME',
        field: 'name',
        reason: 'O nome da região deve ser único.',
      });
    }

    if (regionsRepository.findByCode(normalized.code, existing.id)) {
      throw new AppError('Já existe outra região cadastrada com este código.', {
        statusCode: 409,
        code: 'DUPLICATE_REGION_CODE',
        field: 'code',
        reason: 'O código da região deve ser único.',
      });
    }

    const nowIso = new Date().toISOString();
    const updated = regionsRepository.update(existing.id, {
      ...normalized,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'REGION_UPDATED',
      targetType: 'region',
      targetId: updated.id,
      reason: 'Atualização cadastral da região.',
      details: { code: updated.code, name: updated.name },
    });

    return updated;
  }

  /**
   * Inativa região e aplica inativação em cascata aos equipamentos vinculados (RF03, RN04, RN20, CT02).
   */
  inactivateRegion(id, actor) {
    const existing = this.getById(id);

    if (existing.status === 'Inativo') {
      throw new AppError('A região selecionada já está inativa.', {
        statusCode: 400,
        code: 'REGION_ALREADY_INACTIVE',
        field: 'status',
        reason: 'Não é possível inativar uma região que já se encontra no estado Inativo.',
      });
    }

    const nowIso = new Date().toISOString();
    const result = regionsRepository.inactivateWithCascade(existing.id, nowIso);

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'REGION_INACTIVATED',
      targetType: 'region',
      targetId: existing.id,
      reason: 'Inativação de região com cascata para equipamentos vinculados (RN20).',
      details: {
        previousStatus: existing.status,
        newStatus: 'Inativo',
        cascadedEquipmentsCount: result.cascadedEquipmentsCount,
      },
    });

    return result;
  }

  /**
   * Bloqueia região Ativa e aplica cascata aos equipamentos Ativos vinculados (RF17, RN16, RN17, RN27, CT20).
   */
  blockRegion(id, payload = {}, actor) {
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
      throw new AppError('A região selecionada já se encontra Bloqueada.', {
        statusCode: 400,
        code: 'ALREADY_BLOCKED',
        field: 'status',
        reason: 'Não é permitido bloquear um objeto que já está Bloqueado (CA17.3 / TD-06).',
      });
    }

    if (existing.status !== 'Ativo') {
      throw new AppError('Somente regiões no estado Ativo podem ser bloqueadas.', {
        statusCode: 400,
        code: 'INVALID_STATE_FOR_BLOCK',
        field: 'status',
        reason: 'Objetos Inativos não podem ser bloqueados (RN27 / CA17.10 / TD-06).',
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
    const result = regionsRepository.blockWithCascade(existing.id, {
      reason: trimmedReason,
      actorUserId: actor.id,
      nowIso,
    });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'REGION_BLOCKED',
      targetType: 'region',
      targetId: existing.id,
      reason: trimmedReason,
      details: {
        previousStatus: existing.status,
        newStatus: 'Bloqueado',
        cascadedEquipmentsCount: result.cascadedEquipmentsCount,
        suspendedAlertsCount: result.suspendedAlertsCount,
      },
    });

    return result;
  }

  /**
   * Desbloqueia região Bloqueada mediante confirmação, sem exigir motivo (RF17, RN17, RN27, CA17.13, CT20).
   */
  unblockRegion(id, payload = {}, actor) {
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
      throw new AppError('A região selecionada não está Bloqueada.', {
        statusCode: 400,
        code: 'NOT_BLOCKED',
        field: 'status',
        reason: 'Somente objetos no estado Bloqueado podem ser desbloqueados (UC15).',
      });
    }

    const nowIso = new Date().toISOString();
    const result = regionsRepository.unblockWithCascade(existing.id, { nowIso });

    auditService.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'REGION_UNBLOCKED',
      targetType: 'region',
      targetId: existing.id,
      reason: 'Desbloqueio confirmado pelo Gestor (sem necessidade de motivo — CA17.13).',
      details: {
        previousStatus: 'Bloqueado',
        newStatus: result.region.status,
        restoredEquipmentsCount: result.restoredEquipmentsCount,
        reactivatedAlertsCount: result.reactivatedAlertsCount,
      },
    });

    return result;
  }
}

module.exports = {
  RegionsService,
  regionsService: new RegionsService(),
};
