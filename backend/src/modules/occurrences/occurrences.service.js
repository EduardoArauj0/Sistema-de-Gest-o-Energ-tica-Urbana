const { AppError } = require('../../shared/errors/AppError');
const { occurrencesRepository } = require('./occurrences.repository');
const { regionsRepository } = require('../regions/regions.repository');
const { equipmentRepository } = require('../equipment/equipment.repository');
const { auditService } = require('../audit/audit.service');

const ALLOWED_OCCURRENCE_TYPES = Object.freeze([
  'poste apagado',
  'oscilação de energia',
  'falta de energia',
  'prédio público com consumo anormal',
  'iluminação acesa durante o dia',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Aplica a regra de privacidade LGPD (RN15, RNF07, CA12.3):
 * Somente o perfil 'gestor' pode visualizar os dados pessoais do cidadão.
 */
function sanitizeOccurrenceForActor(row, actor = null) {
  if (!row) {
    return null;
  }

  const copy = { ...row };
  const isGestor = actor?.role === 'gestor';

  if (!isGestor) {
    delete copy.citizen_name;
    delete copy.citizen_email;
    delete copy.citizen_phone;
    delete copy.citizen_cpf_simulated;
  }

  return copy;
}

class OccurrencesService {
  getAllowedTypes() {
    return ALLOWED_OCCURRENCE_TYPES;
  }

  /**
   * Registra uma nova ocorrência cidadã sem necessidade de login (RF12, UC10, RN13, RN22, RN23, RN26, OD-02, OD-04, OD-05, CT13).
   */
  createPublicOccurrence(payload = {}) {
    const type = String(payload.type || '').trim();
    if (!ALLOWED_OCCURRENCE_TYPES.includes(type)) {
      throw new AppError('O tipo da ocorrência é obrigatório e deve ser válido.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'type',
        reason: `Selecione um dos tipos permitidos: ${ALLOWED_OCCURRENCE_TYPES.join(', ')}.`,
      });
    }

    const description = String(payload.description || '').trim();
    if (description.length < 3 || description.length > 500) {
      throw new AppError('A descrição da ocorrência é obrigatória.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'description',
        reason: 'Informe uma descrição detalhada entre 3 e 500 caracteres.',
      });
    }

    const rawRegionId = payload.region_id ?? payload.regionId;
    if (rawRegionId === undefined || rawRegionId === null || rawRegionId === '') {
      throw new AppError('A região da ocorrência é obrigatória.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'region_id',
        reason: 'Selecione a região onde o problema foi identificado.',
      });
    }

    const region = regionsRepository.findById(rawRegionId);
    if (!region || region.status !== 'Ativo') {
      throw new AppError('A região selecionada é inválida ou não está ativa.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'region_id',
        reason: 'Selecione uma região ativa cadastrada no sistema.',
      });
    }

    const addressReference = String(
      payload.address_reference ?? payload.addressReference ?? payload.location ?? ''
    ).trim();
    if (addressReference.length < 3 || addressReference.length > 200) {
      throw new AppError('O endereço ou ponto de referência é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'address_reference',
        reason: 'Informe um endereço ou referência entre 3 e 200 caracteres.',
      });
    }

    const citizenName = String(payload.citizen_name ?? payload.citizenName ?? '').trim();
    if (citizenName.length < 2 || citizenName.length > 120) {
      throw new AppError('O nome do cidadão é obrigatório.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'citizen_name',
        reason: 'Informe o nome (fictício/simulado) com pelo menos 2 caracteres.',
      });
    }

    const citizenEmail = String(payload.citizen_email ?? payload.citizenEmail ?? '').trim();
    if (!EMAIL_REGEX.test(citizenEmail)) {
      throw new AppError('O e-mail de contato do cidadão é obrigatório e deve ser válido.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'citizen_email',
        reason: 'Informe um endereço de e-mail válido (ex.: cidadao@simulado.local).',
      });
    }

    const rawPhone = String(payload.citizen_phone ?? payload.citizenPhone ?? '').trim();
    const rawCpf = String(
      payload.citizen_cpf_simulated ?? payload.citizenCpfSimulated ?? payload.citizen_cpf ?? ''
    ).trim();

    const hasValidPhone = rawPhone.length >= 8;
    const hasValidCpf = rawCpf.length >= 11;

    if (!hasValidPhone && !hasValidCpf) {
      throw new AppError(
        'É obrigatório informar ao menos um telefone ou CPF fictício/simulado para identificação da ocorrência (RN13).',
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'citizen_phone',
          reason:
            'Preencha o telefone de contato (mín. 8 dígitos) ou o CPF fictício/simulado (mín. 11 caracteres).',
        }
      );
    }

    const rawEquipmentId = payload.equipment_id ?? payload.equipmentId ?? null;
    let equipment = null;
    if (rawEquipmentId !== null && rawEquipmentId !== undefined && rawEquipmentId !== '') {
      equipment = equipmentRepository.findById(rawEquipmentId);
      if (!equipment) {
        throw new AppError('O equipamento informado não foi encontrado.', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          field: 'equipment_id',
          reason: 'Selecione um equipamento válido ou deixe o campo em branco.',
        });
      }
    }

    const latitude = Number(
      payload.latitude ?? equipment?.latitude ?? region.latitude_center ?? -12.9714
    );
    const longitude = Number(
      payload.longitude ?? equipment?.longitude ?? region.longitude_center ?? -38.5014
    );

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new AppError('Latitude inválida.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'latitude',
        reason: 'A latitude deve estar entre -90 e 90.',
      });
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError('Longitude inválida.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'longitude',
        reason: 'A longitude deve estar entre -180 e 180.',
      });
    }

    const nowIso = new Date().toISOString();
    const protocol = occurrencesRepository.generateNextProtocol(nowIso);

    const created = occurrencesRepository.create({
      protocol,
      citizen_name: citizenName,
      citizen_email: citizenEmail,
      citizen_phone: hasValidPhone ? rawPhone : null,
      citizen_cpf_simulated: hasValidCpf ? rawCpf : null,
      type,
      description,
      region_id: region.id,
      equipment_id: equipment ? equipment.id : null,
      address_reference: addressReference,
      latitude,
      longitude,
      created_at: nowIso,
    });

    auditService.record({
      actorUserId: null,
      actorRole: 'cidadao',
      action: 'OCCURRENCE_REGISTERED',
      targetType: 'occurrence',
      targetId: created.id,
      reason: `Registro público de ocorrência (${created.protocol})`,
      details: {
        protocol: created.protocol,
        type: created.type,
        region_id: created.region_id,
        status: created.status,
      },
    });

    return {
      id: created.id,
      protocol: created.protocol,
      status: created.status,
      type: created.type,
      description: created.description,
      region_id: created.region_id,
      region_code: created.region_code,
      region_name: created.region_name,
      equipment_id: created.equipment_id,
      address_reference: created.address_reference,
      latitude: created.latitude,
      longitude: created.longitude,
      created_at: created.created_at,
    };
  }

  /**
   * Consulta pública de ocorrência por protocolo sem login (RF13, UC11, RN15, RN22, RN26, RNF07, CA13.1, CT14).
   * Exibe EXCLUSIVAMENTE protocolo, status e tipo da ocorrência (e carimbos de data), sem expor dados pessoais.
   */
  consultByProtocol(protocol) {
    const cleanProtocol = String(protocol || '').trim();
    if (!cleanProtocol) {
      throw new AppError('Informe o número do protocolo para realizar a consulta.', {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        field: 'protocol',
        reason: 'O número do protocolo é obrigatório.',
      });
    }

    const row = occurrencesRepository.findByProtocol(cleanProtocol);
    if (!row) {
      throw new AppError('Nenhuma ocorrência foi encontrada para o protocolo informado.', {
        statusCode: 404,
        code: 'OCCURRENCE_NOT_FOUND',
        field: 'protocol',
        reason: 'Verifique se o código do protocolo foi digitado corretamente.',
      });
    }

    return {
      protocol: row.protocol,
      status: row.status,
      type: row.type,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  list(filters = {}, actor = null) {
    const rows = occurrencesRepository.findAll({
      status: filters.status,
      type: filters.type,
      regionId: filters.region_id ?? filters.regionId,
      equipmentId: filters.equipment_id ?? filters.equipmentId,
      protocol: filters.protocol,
      limit: filters.limit,
    });

    return rows.map((row) => sanitizeOccurrenceForActor(row, actor));
  }

  getById(id, actor = null) {
    const row = occurrencesRepository.findById(id);
    if (!row) {
      throw new AppError('Ocorrência não encontrada.', {
        statusCode: 404,
        code: 'OCCURRENCE_NOT_FOUND',
        field: 'id',
        reason: 'Não existe ocorrência cadastrada com o identificador informado.',
      });
    }

    return sanitizeOccurrenceForActor(row, actor);
  }
}

const occurrencesService = new OccurrencesService();

module.exports = {
  OccurrencesService,
  occurrencesService,
  ALLOWED_OCCURRENCE_TYPES,
};
