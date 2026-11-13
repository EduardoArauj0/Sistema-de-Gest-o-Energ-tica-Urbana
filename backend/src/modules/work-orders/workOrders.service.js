const { AppError } = require('../../shared/errors/AppError');
const { workOrdersRepository } = require('./workOrders.repository');
const { alertsRepository } = require('../alerts/alerts.repository');
const { regionsRepository } = require('../regions/regions.repository');
const { equipmentRepository } = require('../equipment/equipment.repository');
const { usersRepository } = require('../users/users.repository');
const { auditService } = require('../audit/audit.service');

const VALID_ORIGINS = ['alerta', 'cidadao', 'manual'];

/**
 * Aplica a regra de privacidade LGPD (RN15, RNF07, CA12.3, CT10 passo 6):
 * Apenas o perfil 'gestor' pode visualizar os dados pessoais do cidadão vinculados à ocorrência.
 * Para o perfil 'tecnico', os campos pessoais são omitidos do payload.
 */
function sanitizeWorkOrderForActor(row, actor = null) {
  if (!row) {
    return null;
  }

  const isGestor = actor?.role === 'gestor';
  const copy = { ...row };

  if (!isGestor) {
    delete copy.citizen_name;
    delete copy.citizen_email;
    delete copy.citizen_phone;
    delete copy.citizen_cpf_simulated;
  }

  return copy;
}

class WorkOrdersService {
  list(filters = {}, actor = null) {
    const rows = workOrdersRepository.findAll({
      status: filters.status,
      origin: filters.origin,
      regionId: filters.region_id ?? filters.regionId,
      equipmentId: filters.equipment_id ?? filters.equipmentId,
      assignedTechnicianId: filters.assigned_technician_id ?? filters.assignedTechnicianId,
      alertId: filters.alert_id ?? filters.alertId,
      occurrenceId: filters.occurrence_id ?? filters.occurrenceId,
      limit: filters.limit,
    });

    return rows.map((row) => sanitizeWorkOrderForActor(row, actor));
  }

  getById(id, actor = null) {
    const row = workOrdersRepository.findById(id);
    if (!row) {
      throw new AppError('Ordem de Serviço não encontrada.', {
        statusCode: 404,
        code: 'WORK_ORDER_NOT_FOUND',
        field: 'id',
        reason: 'Não existe Ordem de Serviço cadastrada com o identificador informado.',
      });
    }
    return sanitizeWorkOrderForActor(row, actor);
  }

  /**
   * Abre uma nova Ordem de Serviço a partir de Alerta, Ocorrência Cidadã ou Registro Manual
   * (RF09, UC07, RN09, RN10, RN19, CA09.1–CA09.3, CT09).
   */
  openWorkOrder(payload = {}, actor = null) {
    const origin = String(payload.origin || '').trim().toLowerCase();

    if (!VALID_ORIGINS.includes(origin)) {
      throw new AppError('A origem da Ordem de Serviço é inválida.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'origin',
        reason: `A origem deve ser um dos valores permitidos: ${VALID_ORIGINS.join(', ')}.`,
      });
    }

    const nowIso = new Date().toISOString();
    const code = workOrdersRepository.generateNextCode(nowIso);

    let alertId = null;
    let occurrenceId = null;
    let regionId = null;
    let equipmentId = null;
    let location = '';
    let title = '';
    let description = '';
    let latitude = -12.9714;
    let longitude = -38.5014;

    if (origin === 'alerta') {
      const rawAlertId = payload.alert_id ?? payload.alertId;
      if (!rawAlertId) {
        throw new AppError('O identificador do alerta é obrigatório para OS de alerta.', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'alert_id',
          reason: 'Informe o alerta ativo que originará a Ordem de Serviço.',
        });
      }

      const alert = alertsRepository.findById(rawAlertId);
      if (!alert) {
        throw new AppError('Alerta não encontrado.', {
          statusCode: 404,
          code: 'ALERT_NOT_FOUND',
          field: 'alert_id',
          reason: 'O alerta informado não existe.',
        });
      }

      if (alert.status !== 'Ativo') {
        throw new AppError(
          `Não é possível abrir Ordem de Serviço para um alerta na situação '${alert.status}'.`,
          {
            statusCode: 422,
            code: 'INVALID_ALERT_STATUS',
            field: 'alert_id',
            reason: 'Somente alertas com situação Ativo podem gerar uma nova Ordem de Serviço.',
          }
        );
      }

      // RN19 / CA09.3 / CT09 passo 2: Um alerta ativo possui no máximo uma OS em Aberta, Atribuída ou Em atendimento
      const existingActiveOs = workOrdersRepository.findActiveByAlertId(alert.id);
      if (existingActiveOs) {
        throw new AppError(
          `Já existe uma Ordem de Serviço ativa (${existingActiveOs.code} — ${existingActiveOs.status}) vinculada a este alerta (RN19).`,
          {
            statusCode: 409,
            code: 'ACTIVE_WORK_ORDER_ALREADY_EXISTS',
            field: 'alert_id',
            reason:
              'Um alerta ativo não pode possuir mais de uma Ordem de Serviço nos estados Aberta, Atribuída ou Em atendimento (RN19).',
          }
        );
      }

      alertId = alert.id;
      regionId = alert.region_id;
      equipmentId = alert.equipment_id;
      location = String(payload.location || alert.equipment_location || '').trim();
      title =
        String(payload.title || '').trim() ||
        `Atendimento de Alerta #${alert.id} (${alert.equipment_code})`;
      description = String(payload.description || '').trim() || alert.message;
      latitude = Number(payload.latitude ?? alert.equipment_latitude ?? -12.9714);
      longitude = Number(payload.longitude ?? alert.equipment_longitude ?? -38.5014);
    } else if (origin === 'cidadao') {
      const rawOccId = payload.occurrence_id ?? payload.occurrenceId;
      if (!rawOccId) {
        throw new AppError(
          'O identificador da ocorrência cidadã é obrigatório para OS de ocorrência.',
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            field: 'occurrence_id',
            reason: 'Informe a ocorrência cidadã que originará a Ordem de Serviço.',
          }
        );
      }

      const occurrence = workOrdersRepository.findOccurrenceById(rawOccId);
      if (!occurrence) {
        throw new AppError('Ocorrência cidadã não encontrada.', {
          statusCode: 404,
          code: 'OCCURRENCE_NOT_FOUND',
          field: 'occurrence_id',
          reason: 'A ocorrência cidadã informada não existe.',
        });
      }

      if (occurrence.status === 'Resolvida' || occurrence.status === 'Cancelada') {
        throw new AppError(
          `Não é possível abrir Ordem de Serviço para uma ocorrência na situação '${occurrence.status}'.`,
          {
            statusCode: 422,
            code: 'INVALID_OCCURRENCE_STATUS',
            field: 'occurrence_id',
            reason: 'Ocorrências já resolvidas ou canceladas não podem gerar nova OS.',
          }
        );
      }

      const existingActiveOs = workOrdersRepository.findActiveByOccurrenceId(occurrence.id);
      if (existingActiveOs) {
        throw new AppError(
          `Já existe uma Ordem de Serviço ativa (${existingActiveOs.code} — ${existingActiveOs.status}) vinculada a esta ocorrência.`,
          {
            statusCode: 409,
            code: 'ACTIVE_WORK_ORDER_ALREADY_EXISTS',
            field: 'occurrence_id',
            reason: 'Esta ocorrência já possui uma Ordem de Serviço em andamento.',
          }
        );
      }

      occurrenceId = occurrence.id;
      regionId = occurrence.region_id;
      equipmentId = occurrence.equipment_id ?? null;
      location = String(payload.location || occurrence.address_reference || '').trim();
      title =
        String(payload.title || '').trim() ||
        `Atendimento Ocorrência ${occurrence.protocol} (${occurrence.type})`;
      description = String(payload.description || '').trim() || occurrence.description;
      latitude = Number(payload.latitude ?? occurrence.latitude ?? -12.9714);
      longitude = Number(payload.longitude ?? occurrence.longitude ?? -38.5014);
    } else {
      // Origem 'manual' (CA09.1, CT09 passos 4 e 5)
      location = String(payload.location || '').trim();
      if (!location) {
        throw new AppError(
          'O local da Ordem de Serviço é obrigatório para abertura manual (RN09).',
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            field: 'location',
            reason: 'Informe o endereço, ponto de referência ou localização da Ordem de Serviço.',
          }
        );
      }

      const rawEquipId = payload.equipment_id ?? payload.equipmentId ?? null;
      const rawRegionId = payload.region_id ?? payload.regionId ?? null;

      let equipment = null;
      if (rawEquipId) {
        equipment = equipmentRepository.findById(rawEquipId);
        if (!equipment) {
          throw new AppError('Equipamento informado não encontrado.', {
            statusCode: 404,
            code: 'EQUIPMENT_NOT_FOUND',
            field: 'equipment_id',
            reason: 'O equipamento vinculado à Ordem de Serviço não existe.',
          });
        }
        equipmentId = equipment.id;
        regionId = rawRegionId ? Number(rawRegionId) : equipment.region_id;
      } else if (rawRegionId) {
        regionId = Number(rawRegionId);
      } else {
        // Caso o usuário informe apenas local e descrição, associa à primeira região ativa ou exige region_id
        const activeRegions = regionsRepository.findAll({ status: 'Ativo' });
        if (activeRegions.length > 0) {
          regionId = activeRegions[0].id;
        }
      }

      const region = regionId ? regionsRepository.findById(regionId) : null;
      if (!region) {
        throw new AppError('A região da Ordem de Serviço é obrigatória.', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'region_id',
          reason: 'Selecione uma região válida para a Ordem de Serviço.',
        });
      }

      description = String(payload.description || payload.title || '').trim();
      if (description.length < 3) {
        throw new AppError('A descrição da Ordem de Serviço é obrigatória.', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'description',
          reason: 'Informe uma descrição com pelo menos 3 caracteres.',
        });
      }

      title =
        String(payload.title || '').trim() ||
        `OS Manual — ${location.slice(0, 50)}`;
      latitude = Number(
        payload.latitude ?? equipment?.latitude ?? region.latitude_center ?? -12.9714
      );
      longitude = Number(
        payload.longitude ?? equipment?.longitude ?? region.longitude_center ?? -38.5014
      );
    }

    const created = workOrdersRepository.create({
      code,
      origin,
      alert_id: alertId,
      occurrence_id: occurrenceId,
      region_id: regionId,
      equipment_id: equipmentId,
      location,
      title,
      description,
      created_by_user_id: actor?.id ?? 1,
      latitude,
      longitude,
      created_at: nowIso,
    });

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'gestor',
      action: 'WORK_ORDER_OPENED',
      targetType: 'work_order',
      targetId: created.id,
      reason: `Abertura de Ordem de Serviço (${origin})`,
      details: {
        code: created.code,
        origin: created.origin,
        status: created.status,
        alert_id: created.alert_id,
        occurrence_id: created.occurrence_id,
        equipment_id: created.equipment_id,
        region_id: created.region_id,
      },
    });

    return sanitizeWorkOrderForActor(created, actor);
  }

  /**
   * Atribui ou reatribui uma Ordem de Serviço a um Técnico ativo
   * (RF10, UC08, RN10, RN11, RN21, CA10.1–CA10.3, CT10).
   */
  assignTechnician(id, payload = {}, actor = null) {
    const existing = workOrdersRepository.findById(id);
    if (!existing) {
      throw new AppError('Ordem de Serviço não encontrada.', {
        statusCode: 404,
        code: 'WORK_ORDER_NOT_FOUND',
        field: 'id',
        reason: 'Não existe Ordem de Serviço cadastrada com o identificador informado.',
      });
    }

    // RN10 / RN21 / CA10.3 / CT10 passo 3: Atribuição/reatribuição somente em Aberta ou Atribuída
    if (existing.status !== 'Aberta' && existing.status !== 'Atribuída') {
      throw new AppError(
        `Não é permitido atribuir ou reatribuir técnico para uma Ordem de Serviço no estado '${existing.status}' (RN21).`,
        {
          statusCode: 422,
          code: 'INVALID_STATE_TRANSITION',
          field: 'status',
          reason:
            'A atribuição ou reatribuição de técnico é permitida apenas quando a OS está nos estados Aberta ou Atribuída.',
        }
      );
    }

    const rawTechId =
      payload.technician_id ??
      payload.technicianId ??
      payload.assigned_technician_id ??
      payload.assignedTechnicianId;

    if (!rawTechId) {
      throw new AppError('O identificador do Técnico é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'technician_id',
        reason: 'Selecione um usuário com perfil Técnico ativo para atribuição (RN11).',
      });
    }

    const techUser = usersRepository.findById(rawTechId);
    if (!techUser || techUser.role !== 'tecnico' || techUser.status !== 'Ativo') {
      throw new AppError(
        'A Ordem de Serviço só pode ser atribuída a um usuário ativo com perfil Técnico (RN11).',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'technician_id',
          reason: 'O usuário informado não existe, não possui perfil Técnico ou está inativo.',
        }
      );
    }

    const isReassignment =
      existing.status === 'Atribuída' && existing.assigned_technician_id !== null;
    const nowIso = new Date().toISOString();

    const updated = workOrdersRepository.assignTechnician(existing.id, techUser.id, nowIso);

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'gestor',
      action: isReassignment ? 'WORK_ORDER_REASSIGNED' : 'WORK_ORDER_ASSIGNED',
      targetType: 'work_order',
      targetId: updated.id,
      reason: isReassignment
        ? `Reatribuição da OS ${updated.code} para o técnico ${techUser.username}`
        : `Atribuição da OS ${updated.code} para o técnico ${techUser.username}`,
      details: {
        code: updated.code,
        previous_status: existing.status,
        new_status: updated.status,
        previous_technician_id: existing.assigned_technician_id,
        assigned_technician_id: techUser.id,
        assigned_technician_username: techUser.username,
      },
    });

    return sanitizeWorkOrderForActor(updated, actor);
  }

  /**
   * Atualiza o andamento da OS e transiciona de 'Atribuída' para 'Em atendimento'
   * (RF11, UC09, RN10, RN12, OD-12, CA11.1, CA11.2, CT11).
   */
  updateProgress(id, payload = {}, actor = null) {
    const existing = workOrdersRepository.findById(id);
    if (!existing) {
      throw new AppError('Ordem de Serviço não encontrada.', {
        statusCode: 404,
        code: 'WORK_ORDER_NOT_FOUND',
        field: 'id',
        reason: 'Não existe Ordem de Serviço cadastrada com o identificador informado.',
      });
    }

    // RN12 / OD-12 / CT11 passo 1: Técnico não atribuído é proibido de alterar andamento
    if (actor?.role === 'tecnico' && existing.assigned_technician_id !== actor.id) {
      auditService.record({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        targetType: 'work_order',
        targetId: existing.id,
        reason: `Tentativa de atualizar andamento da OS ${existing.code} por técnico não atribuído (RN12)`,
        details: {
          work_order_id: existing.id,
          assigned_technician_id: existing.assigned_technician_id,
          attempted_by_user_id: actor.id,
        },
      });

      throw new AppError(
        'Acesso negado: apenas o Técnico atribuído à Ordem de Serviço ou o Gestor podem atualizar o seu andamento (RN12).',
        {
          statusCode: 403,
          code: 'FORBIDDEN_NOT_ASSIGNED',
          field: 'assigned_technician_id',
          reason: 'Esta Ordem de Serviço está atribuída a outro profissional.',
        }
      );
    }

    // Transição permitida apenas a partir de 'Atribuída' ou já 'Em atendimento' (Seção 4.7 / TD-04)
    if (existing.status !== 'Atribuída' && existing.status !== 'Em atendimento') {
      throw new AppError(
        `Não é permitido iniciar ou atualizar andamento de uma Ordem de Serviço no estado '${existing.status}' (RN10).`,
        {
          statusCode: 422,
          code: 'INVALID_STATE_TRANSITION',
          field: 'status',
          reason:
            'A Ordem de Serviço precisa estar no estado Atribuída ou Em atendimento para registrar andamento.',
        }
      );
    }

    const nowIso = new Date().toISOString();
    const progressNotes =
      payload.progress_notes !== undefined || payload.notes !== undefined
        ? String(payload.progress_notes ?? payload.notes ?? '').trim()
        : null;

    const updated = workOrdersRepository.updateProgress(existing.id, {
      progressNotes,
      startedAt: nowIso,
      updatedAt: nowIso,
    });

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'tecnico',
      action: 'WORK_ORDER_IN_PROGRESS',
      targetType: 'work_order',
      targetId: updated.id,
      reason: `Atualização de andamento da OS ${updated.code}`,
      details: {
        code: updated.code,
        previous_status: existing.status,
        new_status: updated.status,
        progress_notes: updated.progress_notes,
      },
    });

    return sanitizeWorkOrderForActor(updated, actor);
  }

  /**
   * Encerra a OS como 'Concluída' exigindo descrição da solução aplicada e resolvendo alerta/ocorrência vinculados
   * (RF11, UC09, RN10, RN12, RN18, OD-12, CA11.3–CA11.5, CT11).
   */
  closeWorkOrder(id, payload = {}, actor = null) {
    const existing = workOrdersRepository.findById(id);
    if (!existing) {
      throw new AppError('Ordem de Serviço não encontrada.', {
        statusCode: 404,
        code: 'WORK_ORDER_NOT_FOUND',
        field: 'id',
        reason: 'Não existe Ordem de Serviço cadastrada com o identificador informado.',
      });
    }

    // RN12 / OD-12 / CT11 passo 1: Técnico não atribuído não pode encerrar a OS
    if (actor?.role === 'tecnico' && existing.assigned_technician_id !== actor.id) {
      auditService.record({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        targetType: 'work_order',
        targetId: existing.id,
        reason: `Tentativa de encerrar OS ${existing.code} por técnico não atribuído (RN12)`,
        details: {
          work_order_id: existing.id,
          assigned_technician_id: existing.assigned_technician_id,
          attempted_by_user_id: actor.id,
        },
      });

      throw new AppError(
        'Acesso negado: apenas o Técnico atribuído à Ordem de Serviço ou o Gestor podem encerrá-la (RN12).',
        {
          statusCode: 403,
          code: 'FORBIDDEN_NOT_ASSIGNED',
          field: 'assigned_technician_id',
          reason: 'Esta Ordem de Serviço está atribuída a outro profissional.',
        }
      );
    }

    // RN10 / Seção 4.7 / TD-04 / CA11.4: Encerramento permitido somente a partir de 'Em atendimento'
    if (existing.status !== 'Em atendimento') {
      throw new AppError(
        `Não é permitido encerrar uma Ordem de Serviço que está no estado '${existing.status}' (RN10).`,
        {
          statusCode: 422,
          code: 'INVALID_STATE_TRANSITION',
          field: 'status',
          reason:
            'Somente Ordens de Serviço no estado Em atendimento podem ser encerradas como Concluída.',
        }
      );
    }

    const rawSolution =
      payload.solution_description ?? payload.solutionDescription ?? payload.solution ?? '';
    const solutionDescription = String(rawSolution).trim();

    // RN12 / CA11.3 / CT11 passo 3: Descrição da solução obrigatória
    if (!solutionDescription) {
      throw new AppError(
        'A descrição da solução aplicada é obrigatória para encerrar a Ordem de Serviço (RN12).',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'solution_description',
          reason: 'Informe a solução técnica aplicada antes de concluir a Ordem de Serviço.',
        }
      );
    }

    const nowIso = new Date().toISOString();
    const progressNotes =
      payload.progress_notes !== undefined
        ? String(payload.progress_notes).trim()
        : existing.progress_notes;

    const closed = workOrdersRepository.closeWorkOrder(existing.id, {
      solutionDescription,
      progressNotes,
      completedAt: nowIso,
      alertId: existing.alert_id,
      occurrenceId: existing.occurrence_id,
    });

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'tecnico',
      action: 'WORK_ORDER_CLOSED',
      targetType: 'work_order',
      targetId: closed.id,
      reason: `Encerramento da OS ${closed.code}: ${solutionDescription}`,
      details: {
        code: closed.code,
        previous_status: existing.status,
        new_status: closed.status,
        solution_description: solutionDescription,
        resolved_alert_id: closed.alert_id,
        resolved_occurrence_id: closed.occurrence_id,
      },
    });

    return sanitizeWorkOrderForActor(closed, actor);
  }

  /**
   * Cancela uma OS nos estados 'Aberta' ou 'Atribuída' mediante justificativa obrigatória,
   * mantendo o alerta vinculado Ativo e liberado para nova OS (RF18, UC16, RN10, RN14, RN21, RN25, TD-05, CT12).
   */
  cancelWorkOrder(id, payload = {}, actor = null) {
    const existing = workOrdersRepository.findById(id);
    if (!existing) {
      throw new AppError('Ordem de Serviço não encontrada.', {
        statusCode: 404,
        code: 'WORK_ORDER_NOT_FOUND',
        field: 'id',
        reason: 'Não existe Ordem de Serviço cadastrada com o identificador informado.',
      });
    }

    // RN21 / CA18.1 / CA18.3 / TD-05 / CT12 passo 4: Cancelamento somente em 'Aberta' ou 'Atribuída'
    if (existing.status !== 'Aberta' && existing.status !== 'Atribuída') {
      throw new AppError(
        `Não é permitido cancelar uma Ordem de Serviço que está no estado '${existing.status}' (RN21).`,
        {
          statusCode: 422,
          code: 'INVALID_STATE_TRANSITION',
          field: 'status',
          reason:
            'O cancelamento é permitido exclusivamente para Ordens de Serviço nos estados Aberta ou Atribuída.',
        }
      );
    }

    const rawReason =
      payload.cancellation_reason ??
      payload.cancellationReason ??
      payload.reason ??
      payload.justification ??
      '';
    const cancellationReason = String(rawReason).trim();

    // RN21 / CA18.2 / CT12 passo 1: Justificativa obrigatória
    if (!cancellationReason) {
      throw new AppError(
        'A justificativa é obrigatória para cancelar uma Ordem de Serviço (RN21).',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'cancellation_reason',
          reason: 'Informe o motivo do cancelamento da Ordem de Serviço.',
        }
      );
    }

    const nowIso = new Date().toISOString();

    const cancelled = workOrdersRepository.cancelWorkOrder(existing.id, {
      cancellationReason,
      cancelledAt: nowIso,
      occurrenceId: existing.occurrence_id,
    });

    auditService.record({
      actorUserId: actor?.id ?? null,
      actorRole: actor?.role ?? 'gestor',
      action: 'WORK_ORDER_CANCELLED',
      targetType: 'work_order',
      targetId: cancelled.id,
      reason: cancellationReason,
      details: {
        code: cancelled.code,
        previous_status: existing.status,
        new_status: cancelled.status,
        cancellation_reason: cancellationReason,
        alert_id: cancelled.alert_id,
        alert_status: cancelled.alert_status,
      },
    });

    return sanitizeWorkOrderForActor(cancelled, actor);
  }
}

const workOrdersService = new WorkOrdersService();

module.exports = {
  WorkOrdersService,
  workOrdersService,
};
