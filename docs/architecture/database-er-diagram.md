# Modelagem de Dados e Diagrama Entidade-Relacionamento (DER) — SGE-Urbano

## 1. Visão Geral da Modelagem

O banco de dados relacional do **SGE-Urbano** foi projetado em **SQLite** (via módulo nativo `node:sqlite` do Node.js `v22+`) com ativação estrita de integridade referencial (`PRAGMA foreign_keys = ON`) e políticas `ON DELETE RESTRICT` em todas as chaves estrangeiras para garantir a preservação histórica exigida por `RN04`, `RN14`, `RN20` e `RNF02`.

---

## 2. Diagrama Entidade-Relacionamento (DER)

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "possui"
    USERS ||--o{ REGIONS : "bloqueia"
    USERS ||--o{ EQUIPMENTS : "bloqueia"
    USERS ||--o{ READINGS : "dispara lote"
    USERS ||--o{ WORK_ORDERS : "cria"
    USERS ||--o{ WORK_ORDERS : "atribuído a (Técnico)"
    USERS ||--o{ AUDIT_LOGS : "executa ação"

    REGIONS ||--|{ EQUIPMENTS : "contém (RN02)"
    REGIONS ||--o{ ALERTS : "agrupa"
    REGIONS ||--o{ OCCURRENCES : "localiza"
    REGIONS ||--o{ WORK_ORDERS : "localiza"

    EQUIPMENTS ||--o{ READINGS : "gera (RN05)"
    EQUIPMENTS ||--o{ ALERTS : "origina (RN08)"
    EQUIPMENTS ||--o{ OCCURRENCES : "vincula (opcional)"
    EQUIPMENTS ||--o{ WORK_ORDERS : "vincula (opcional)"

    READINGS ||--o| ALERTS : "atualiza / cria"
    ALERTS ||--o{ WORK_ORDERS : "origina OS (RN19)"
    OCCURRENCES ||--o{ WORK_ORDERS : "origina OS"

    USERS {
        INTEGER id PK
        TEXT name
        TEXT username UK
        TEXT email UK
        TEXT password_hash "scrypt$salt$hash (RNF04)"
        TEXT role "gestor | tecnico (RN01)"
        TEXT status "Ativo | Inativo"
        TEXT created_at
        TEXT updated_at
    }

    SESSIONS {
        TEXT id PK
        INTEGER user_id FK
        TEXT created_at
        TEXT last_activity_at
        TEXT expires_at "30 min (RNF06)"
        TEXT revoked_at
    }

    REGIONS {
        INTEGER id PK
        TEXT code UK
        TEXT name UK
        TEXT description
        REAL latitude_center
        REAL longitude_center
        TEXT status "Ativo | Inativo | Bloqueado"
        TEXT previous_operational_status
        TEXT block_reason ">= 10 chars (RN16)"
        TEXT blocked_at
        INTEGER blocked_by_user_id FK
        TEXT inactivated_at
        TEXT created_at
        TEXT updated_at
    }

    EQUIPMENTS {
        INTEGER id PK
        TEXT code UK
        TEXT name
        TEXT type "poste | predio_municipal (RN02)"
        INTEGER region_id FK
        TEXT location
        REAL expected_consumption_kwh "> 0 (RN03)"
        REAL latitude
        REAL longitude
        TEXT status "Ativo | Inativo | Bloqueado"
        TEXT previous_operational_status
        INTEGER blocked_by_region_cascade
        TEXT block_reason ">= 10 chars (RN16)"
        TEXT blocked_at
        INTEGER blocked_by_user_id FK
        TEXT inactivated_at
        TEXT created_at
        TEXT updated_at
    }

    READINGS {
        INTEGER id PK
        INTEGER equipment_id FK
        TEXT batch_id
        TEXT scenario "normal | pico | falha | manual"
        REAL measured_consumption_kwh
        REAL expected_consumption_kwh
        REAL deviation_percent
        INTEGER is_anomaly
        TEXT anomaly_type "falha_total | consumo_acima | consumo_abaixo"
        TEXT severity "Baixa | Media | Alta"
        TEXT unit "kWh (RN24)"
        TEXT origin "SIMULADO (RN05 / RNF17)"
        TEXT recorded_at
        INTEGER created_by_user_id FK
    }

    ALERTS {
        INTEGER id PK
        INTEGER equipment_id FK
        INTEGER region_id FK
        INTEGER last_reading_id FK
        TEXT anomaly_type
        TEXT severity "Baixa | Media | Alta"
        REAL measured_consumption_kwh
        REAL expected_consumption_kwh
        REAL deviation_percent
        TEXT status "Ativo | Suspenso | Resolvido"
        INTEGER occurrence_count
        TEXT message
        TEXT created_at
        TEXT updated_at
        TEXT resolved_at
    }

    OCCURRENCES {
        INTEGER id PK
        TEXT protocol UK "PROTOCOLO-YYYYMMDDXXXX (RN26)"
        TEXT citizen_name "Restrito ao Gestor (RNF07)"
        TEXT citizen_email "Restrito ao Gestor (RNF07)"
        TEXT citizen_phone "Restrito ao Gestor (RNF07)"
        TEXT citizen_cpf_simulated "Restrito ao Gestor (RNF07)"
        TEXT type "5 tipos da RN23"
        TEXT description
        INTEGER region_id FK
        INTEGER equipment_id FK
        TEXT address_reference
        REAL latitude
        REAL longitude
        TEXT status "Aberta | Em atendimento | Resolvida | Cancelada"
        TEXT created_at
        TEXT updated_at
    }

    WORK_ORDERS {
        INTEGER id PK
        TEXT code UK
        TEXT origin "alerta | cidadao | manual (RN09)"
        INTEGER alert_id FK
        INTEGER occurrence_id FK
        INTEGER region_id FK
        INTEGER equipment_id FK
        TEXT location
        TEXT title
        TEXT description
        TEXT status "Aberta | Atribuída | Em atendimento | Concluída | Cancelada"
        INTEGER assigned_technician_id FK
        INTEGER created_by_user_id FK
        TEXT progress_notes
        TEXT solution_description
        TEXT cancellation_reason
        REAL latitude
        REAL longitude
        TEXT started_at
        TEXT completed_at
        TEXT cancelled_at
        TEXT created_at
        TEXT updated_at
    }

    AUDIT_LOGS {
        INTEGER id PK
        INTEGER actor_user_id FK
        TEXT actor_role
        TEXT action
        TEXT target_type
        TEXT target_id
        TEXT reason
        TEXT details_json
        TEXT created_at
    }
```

---

## 3. Regras de Integridade Impostas no Próprio Banco de Dados

1. **Prevenção de Duplicidade de Alertas Ativos (`RN08`, `CA07.3`, `CT07`):**
   - Índice único parcial `idx_alerts_unique_active_per_equip_type` sobre `(equipment_id, anomaly_type) WHERE status IN ('Ativo', 'Suspenso')`.
2. **Prevenção de Segunda OS Ativa para o Mesmo Alerta (`RN19`, `CA09.3`, `CT09`, `CT12`):**
   - Índice único parcial `idx_work_orders_unique_active_per_alert` sobre `(alert_id) WHERE alert_id IS NOT NULL AND status IN ('Aberta', 'Atribuída', 'Em atendimento')`.
   - Quando uma OS vinculada a um alerta é `Cancelada` (`RN25`) ou `Concluída`, ela deixa de ocupar o índice parcial, permitindo abrir uma nova OS caso o alerta permaneça `Ativo`.
3. **Proibição de Exclusão Física (`RN14`, `RNF02`, `CT17`):**
   - Todas as chaves estrangeiras usam `ON DELETE RESTRICT`.
   - Triggers `trg_prevent_delete_alerts`, `trg_prevent_delete_occurrences` e `trg_prevent_delete_work_orders` bloqueiam comandos `DELETE` físicos em operação normal, permitindo limpeza somente dentro da transação controlada de `resetAndSeedDatabase()` quando `NODE_ENV === 'test'` (`RNF20`).
4. **Validação de Domínio por `CHECK` Constraints:**
   - `equipments.expected_consumption_kwh > 0` (`RN03`, `CT03`).
   - `readings.origin = 'SIMULADO'` e `readings.unit = 'kWh'` (`RN05`, `RN24`, `RNF17`).
   - `users.password_hash LIKE 'scrypt$%'` (`RNF04` — impede gravação de senha em texto claro).
   - `regions.block_reason` e `equipments.block_reason` com `length(trim(block_reason)) >= 10` (`RN16`, `OD-09`, `CT18`).
