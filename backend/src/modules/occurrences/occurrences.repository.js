const { getDbConnection } = require('../../database/connection');

class OccurrencesRepository {
  /**
   * Gera um protocolo único no formato PROTOCOLO-YYYYMMDDXXXX (RN22, RN26, OD-04).
   */
  generateNextProtocol(nowIso = new Date().toISOString()) {
    const db = getDbConnection();
    const datePart = nowIso.slice(0, 10).replace(/-/g, '');
    const prefix = `PROTOCOLO-${datePart}`;

    const rows = db
      .prepare('SELECT protocol FROM occurrences WHERE protocol LIKE ?')
      .all(`${prefix}%`);

    let maxSeq = 0;
    for (const row of rows) {
      const tail = String(row.protocol).slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }

    const nextSeq = maxSeq + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  create(data) {
    const db = getDbConnection();
    const stmt = db.prepare(`
      INSERT INTO occurrences (
        protocol,
        citizen_name,
        citizen_email,
        citizen_phone,
        citizen_cpf_simulated,
        type,
        description,
        region_id,
        equipment_id,
        address_reference,
        latitude,
        longitude,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aberta', ?, ?)
    `);

    const result = stmt.run(
      data.protocol,
      data.citizen_name,
      data.citizen_email,
      data.citizen_phone ?? null,
      data.citizen_cpf_simulated ?? null,
      data.type,
      data.description,
      Number(data.region_id),
      data.equipment_id ? Number(data.equipment_id) : null,
      data.address_reference,
      Number(data.latitude),
      Number(data.longitude),
      data.created_at,
      data.created_at
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  findById(id) {
    const db = getDbConnection();
    return db
      .prepare(
        `
        SELECT
          o.*,
          r.code AS region_code,
          r.name AS region_name,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          wo.id AS active_work_order_id,
          wo.code AS active_work_order_code,
          wo.status AS active_work_order_status
        FROM occurrences o
        INNER JOIN regions r ON r.id = o.region_id
        LEFT JOIN equipments e ON e.id = o.equipment_id
        LEFT JOIN work_orders wo
          ON wo.occurrence_id = o.id
          AND wo.status IN ('Aberta', 'Atribuída', 'Em atendimento')
        WHERE o.id = ?
      `
      )
      .get(Number(id));
  }

  findByProtocol(protocol) {
    const db = getDbConnection();
    const normalized = String(protocol || '').trim();
    if (!normalized) {
      return null;
    }

    return db
      .prepare(
        `
        SELECT
          o.id,
          o.protocol,
          o.type,
          o.status,
          o.created_at,
          o.updated_at
        FROM occurrences o
        WHERE UPPER(o.protocol) = UPPER(?)
        LIMIT 1
      `
      )
      .get(normalized);
  }

  findAll({
    status = null,
    type = null,
    regionId = null,
    equipmentId = null,
    protocol = null,
    limit = 200,
  } = {}) {
    const db = getDbConnection();
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(String(status).trim());
    }

    if (type) {
      conditions.push('o.type = ?');
      params.push(String(type).trim());
    }

    if (regionId !== null && regionId !== undefined && regionId !== '') {
      conditions.push('o.region_id = ?');
      params.push(Number(regionId));
    }

    if (equipmentId !== null && equipmentId !== undefined && equipmentId !== '') {
      conditions.push('o.equipment_id = ?');
      params.push(Number(equipmentId));
    }

    if (protocol) {
      conditions.push('UPPER(o.protocol) LIKE UPPER(?)');
      params.push(`%${String(protocol).trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    return db
      .prepare(
        `
        SELECT
          o.*,
          r.code AS region_code,
          r.name AS region_name,
          e.code AS equipment_code,
          e.name AS equipment_name,
          e.type AS equipment_type,
          wo.id AS active_work_order_id,
          wo.code AS active_work_order_code,
          wo.status AS active_work_order_status
        FROM occurrences o
        INNER JOIN regions r ON r.id = o.region_id
        LEFT JOIN equipments e ON e.id = o.equipment_id
        LEFT JOIN work_orders wo
          ON wo.occurrence_id = o.id
          AND wo.status IN ('Aberta', 'Atribuída', 'Em atendimento')
        ${whereClause}
        ORDER BY o.id DESC
        LIMIT ?
      `
      )
      .all(...params, safeLimit);
  }
}

module.exports = {
  OccurrencesRepository,
  occurrencesRepository: new OccurrencesRepository(),
};
