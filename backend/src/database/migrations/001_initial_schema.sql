-- =============================================================================
-- SGE-Urbano — Migração 001: Esquema Inicial Completo
-- Rastreabilidade: RF01–RF18, RNF02, RNF04, RNF06, RNF07, RNF16, RNF17, RNF19, RN01–RN30
-- =============================================================================

-- 1. Tabela de Usuários (RF01, RF02, RN01, RN11, RN30, RNF04)
-- O Cidadão não possui cadastro/login (RN01, RN22).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  username TEXT NOT NULL UNIQUE CHECK (length(trim(username)) >= 3),
  email TEXT NOT NULL UNIQUE CHECK (email LIKE '%_@_%.__%'),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  role TEXT NOT NULL CHECK (role IN ('gestor', 'tecnico')),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Tabela de Sessões Autenticadas (RF01, RNF06, RN30)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 3. Tabela de Regiões (RF03, RF15, RF17, RN04, RN16, RN17, RN20, RN27, RN29)
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) >= 2),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) >= 2 AND length(trim(name)) <= 100),
  description TEXT,
  latitude_center REAL NOT NULL CHECK (latitude_center BETWEEN -90.0 AND 90.0),
  longitude_center REAL NOT NULL CHECK (longitude_center BETWEEN -180.0 AND 180.0),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo', 'Bloqueado')),
  previous_operational_status TEXT CHECK (
    previous_operational_status IN ('Ativo', 'Inativo') OR previous_operational_status IS NULL
  ),
  block_reason TEXT CHECK (block_reason IS NULL OR length(trim(block_reason)) >= 10),
  blocked_at TEXT,
  blocked_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  inactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 4. Tabela de Equipamentos Públicos (RF04, RF05, RF15, RF17, RN02, RN03, RN04, RN16, RN17, RN20, RN27, RN29)
CREATE TABLE IF NOT EXISTS equipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) >= 2),
  name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  type TEXT NOT NULL CHECK (type IN ('poste', 'predio_municipal')),
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  location TEXT NOT NULL CHECK (length(trim(location)) >= 3 AND length(trim(location)) <= 200),
  expected_consumption_kwh REAL NOT NULL CHECK (expected_consumption_kwh > 0),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo', 'Bloqueado')),
  previous_operational_status TEXT CHECK (
    previous_operational_status IN ('Ativo', 'Inativo') OR previous_operational_status IS NULL
  ),
  blocked_by_region_cascade INTEGER NOT NULL DEFAULT 0 CHECK (blocked_by_region_cascade IN (0, 1)),
  block_reason TEXT CHECK (block_reason IS NULL OR length(trim(block_reason)) >= 10),
  blocked_at TEXT,
  blocked_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  inactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipments_region_id ON equipments(region_id);
CREATE INDEX IF NOT EXISTS idx_equipments_status ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_equipments_type ON equipments(type);

-- 5. Tabela de Leituras Simuladas (RF05, RF06, RF14, RF16, RN04, RN05, RN24, RNF17)
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
  batch_id TEXT,
  scenario TEXT NOT NULL CHECK (scenario IN ('normal', 'pico', 'falha', 'manual')),
  measured_consumption_kwh REAL NOT NULL CHECK (measured_consumption_kwh >= 0),
  expected_consumption_kwh REAL NOT NULL CHECK (expected_consumption_kwh > 0),
  deviation_percent REAL NOT NULL,
  is_anomaly INTEGER NOT NULL DEFAULT 0 CHECK (is_anomaly IN (0, 1)),
  anomaly_type TEXT CHECK (
    anomaly_type IN ('falha_total', 'consumo_acima', 'consumo_abaixo') OR anomaly_type IS NULL
  ),
  severity TEXT CHECK (severity IN ('Baixa', 'Media', 'Alta') OR severity IS NULL),
  unit TEXT NOT NULL DEFAULT 'kWh' CHECK (unit = 'kWh'),
  origin TEXT NOT NULL DEFAULT 'SIMULADO' CHECK (origin = 'SIMULADO'),
  recorded_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_readings_equipment_id ON readings(equipment_id);
CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON readings(recorded_at);

-- 6. Tabela de Alertas de Anomalia (RF07, RF08, RN07, RN08, RN14, RN17, RN18, RN25)
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  last_reading_id INTEGER NOT NULL REFERENCES readings(id) ON DELETE RESTRICT,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('falha_total', 'consumo_acima', 'consumo_abaixo')),
  severity TEXT NOT NULL CHECK (severity IN ('Baixa', 'Media', 'Alta')),
  measured_consumption_kwh REAL NOT NULL,
  expected_consumption_kwh REAL NOT NULL,
  deviation_percent REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Suspenso', 'Resolvido')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

-- RN08: Não deve existir mais de um alerta ativo/suspenso para o mesmo equipamento e mesmo tipo de anomalia
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_unique_active_per_equip_type
  ON alerts(equipment_id, anomaly_type)
  WHERE status IN ('Ativo', 'Suspenso');

CREATE INDEX IF NOT EXISTS idx_alerts_filters
  ON alerts(status, severity, region_id, equipment_id);

-- 7. Tabela de Ocorrências Cidadãs (RF12, RF13, RF15, RN13, RN14, RN15, RN22, RN23, RN26, RN29, RNF07)
CREATE TABLE IF NOT EXISTS occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol TEXT NOT NULL UNIQUE CHECK (length(trim(protocol)) >= 10),
  citizen_name TEXT NOT NULL CHECK (length(trim(citizen_name)) >= 2),
  citizen_email TEXT NOT NULL CHECK (citizen_email LIKE '%_@_%.__%'),
  citizen_phone TEXT,
  citizen_cpf_simulated TEXT,
  type TEXT NOT NULL CHECK (
    type IN (
      'poste apagado',
      'oscilação de energia',
      'falta de energia',
      'prédio público com consumo anormal',
      'iluminação acesa durante o dia'
    )
  ),
  description TEXT NOT NULL CHECK (length(trim(description)) >= 3),
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  equipment_id INTEGER REFERENCES equipments(id) ON DELETE RESTRICT,
  address_reference TEXT NOT NULL CHECK (length(trim(address_reference)) >= 3),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  status TEXT NOT NULL DEFAULT 'Aberta' CHECK (
    status IN ('Aberta', 'Em atendimento', 'Resolvida', 'Cancelada')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (citizen_phone IS NOT NULL AND length(trim(citizen_phone)) >= 8) OR
    (citizen_cpf_simulated IS NOT NULL AND length(trim(citizen_cpf_simulated)) >= 11)
  )
);

CREATE INDEX IF NOT EXISTS idx_occurrences_protocol ON occurrences(protocol);
CREATE INDEX IF NOT EXISTS idx_occurrences_region_id ON occurrences(region_id);

-- 8. Tabela de Ordens de Serviço — OS (RF09, RF10, RF11, RF15, RF18, RN09–RN12, RN14, RN18, RN19, RN21, RN25)
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('alerta', 'cidadao', 'manual')),
  alert_id INTEGER REFERENCES alerts(id) ON DELETE RESTRICT,
  occurrence_id INTEGER REFERENCES occurrences(id) ON DELETE RESTRICT,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  equipment_id INTEGER REFERENCES equipments(id) ON DELETE RESTRICT,
  location TEXT NOT NULL CHECK (length(trim(location)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) >= 3),
  description TEXT NOT NULL CHECK (length(trim(description)) >= 3),
  status TEXT NOT NULL DEFAULT 'Aberta' CHECK (
    status IN ('Aberta', 'Atribuída', 'Em atendimento', 'Concluída', 'Cancelada')
  ),
  assigned_technician_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  progress_notes TEXT,
  solution_description TEXT,
  cancellation_reason TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status != 'Concluída' OR (solution_description IS NOT NULL AND length(trim(solution_description)) > 0))
  ),
  CHECK (
    (status != 'Cancelada' OR (cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) > 0))
  )
);

-- RN19: Um alerta ativo possui no máximo uma OS em Aberta, Atribuída ou Em atendimento
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_unique_active_per_alert
  ON work_orders(alert_id)
  WHERE alert_id IS NOT NULL AND status IN ('Aberta', 'Atribuída', 'Em atendimento');

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_technician ON work_orders(assigned_technician_id);

-- 9. Tabela de Registros de Auditoria (RNF05, RNF16, RN16, RN20)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 10. Tabela de Controle Interno para Permitir Reset Exclusivamente em Ambiente de Teste (RN14, RNF20)
CREATE TABLE IF NOT EXISTS _system_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO _system_flags (key, value) VALUES ('allow_physical_delete', '0');

-- Triggers de Proteção contra Exclusão Física (RN14: Alertas, ocorrências e OS não são excluídos fisicamente)
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_alerts
BEFORE DELETE ON alerts
WHEN (SELECT value FROM _system_flags WHERE key = 'allow_physical_delete') != '1'
BEGIN
  SELECT RAISE(ABORT, 'RN14: Alertas não podem ser excluídos fisicamente.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_occurrences
BEFORE DELETE ON occurrences
WHEN (SELECT value FROM _system_flags WHERE key = 'allow_physical_delete') != '1'
BEGIN
  SELECT RAISE(ABORT, 'RN14: Ocorrências não podem ser excluídas fisicamente.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_work_orders
BEFORE DELETE ON work_orders
WHEN (SELECT value FROM _system_flags WHERE key = 'allow_physical_delete') != '1'
BEGIN
  SELECT RAISE(ABORT, 'RN14: Ordens de serviço não podem ser excluídas fisicamente.');
END;
