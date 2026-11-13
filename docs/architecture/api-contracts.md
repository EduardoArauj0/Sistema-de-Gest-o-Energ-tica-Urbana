# Contratos da API REST — SGE-Urbano

Este documento descreve os contratos dos endpoints implementados na API REST do **SGE-Urbano**, atualizado a cada etapa de desenvolvimento.

---

## 1. Convenções Gerais

- **Base URL:** `/api`
- **Formato de dados:** `application/json; charset=utf-8`
- **Transparência (`RNF17`):** Todas as respostas de domínio incluem `"dataOrigin": "SIMULADO"`.
- **Autenticação (`RF01`, `RNF05`, `RNF06`):**
  - Suporta header `Authorization: Bearer <token>`, header `x-session-token: <token>` ou cookie `HttpOnly` `sge_session=<token>`.
  - Expiração automática por inatividade após **30 minutos** (`RNF06`).
- **Formato padrão de erro (`RNF09`, `RNF10`):**
  ```json
  {
    "error": true,
    "code": "VALIDATION_ERROR",
    "message": "Mensagem clara em português do Brasil.",
    "field": "nome_do_campo",
    "reason": "Motivo específico da recusa."
  }
  ```

---

## 2. Diagnóstico e Ambiente

### `GET /api/health`
- **Acesso:** Público
- **Resposta `200 OK`:**
  ```json
  {
    "status": "ok",
    "service": "SGE-Urbano API",
    "environment": "development",
    "dataOrigin": "SIMULADO",
    "simulationNotice": "AVISO: Todos os dados de consumo e ocorrências deste sistema são SIMULADOS para fins acadêmicos (RNF17).",
    "timestamp": "2026-11-11T00:00:00.000Z"
  }
  ```

### `POST /api/testing/reset` *(Exclusivo quando `NODE_ENV=test` — `RNF20`, `CT26`)*
- **Acesso:** Apenas ambiente de teste (`404 Not Found` fora de `NODE_ENV=test`).
- **Resposta `200 OK`:** Recria a seed sintética de referência (`3` usuários, `2` regiões, `20` equipamentos).

---

## 3. Autenticação e Sessão (`RF01`, `RF02`, `RN01`, `RNF04`–`RNF06`, `CT01`)

### `POST /api/auth/login`
- **Acesso:** Público (Gestor e Técnico; Cidadão não faz login).
- **Corpo da Requisição:**
  ```json
  {
    "username": "gestor",
    "password": "Gestor@123"
  }
  ```
- **Resposta `200 OK`:**
  ```json
  {
    "dataOrigin": "SIMULADO",
    "message": "Autenticação realizada com sucesso.",
    "token": "<64-hex-session-token>",
    "expiresAt": "2026-11-11T00:30:00.000Z",
    "timeoutMinutes": 30,
    "initialView": "gestor-dashboard",
    "user": {
      "id": 1,
      "name": "Gestor Municipal Sintético",
      "username": "gestor",
      "email": "gestor@sge-urbano.simulado.local",
      "role": "gestor",
      "status": "Ativo"
    }
  }
  ```
- **Respostas de Erro:**
  - `400 VALIDATION_ERROR`: `username` ou `password` ausente (indica `field` e `reason`).
  - `401 INVALID_CREDENTIALS`: credencial inválida ou usuário inativo (mensagem genérica `"Credenciais inválidas. Verifique seu usuário e senha."` — `CA01.2`, sem abrir sessão e registrando `AUTH_LOGIN_FAILURE` na auditoria).

### `POST /api/auth/logout`
- **Acesso:** Autenticado (`gestor`, `tecnico`)
- **Efeito:** Revoga a sessão no SQLite (`CA01.3`), limpa o cookie `sge_session` e registra `AUTH_LOGOUT` na auditoria.
- **Resposta `200 OK`:**
  ```json
  {
    "dataOrigin": "SIMULADO",
    "message": "Sessão encerrada com sucesso."
  }
  ```

### `GET /api/auth/me`
- **Acesso:** Autenticado (`gestor`, `tecnico`)
- **Efeito:** Valida a sessão ativa, verifica inatividade de 30 minutos (`RNF06`) e renova a janela de expiração.
- **Respostas de Erro:**
  - `401 UNAUTHENTICATED`: visitante sem token (registra `ACCESS_DENIED`).
  - `401 SESSION_EXPIRED`: sessão ociosa por $\ge 30$ minutos (revoga sessão e registra `SESSION_EXPIRED`).
  - `401 INVALID_SESSION`: sessão inexistente ou já encerrada por logout.

---

## 4. Usuários (`RF02`, `RF10`, `RN01`, `RN11`)

### `GET /api/users/technicians`
- **Acesso:** Exclusivo `gestor` (`403 FORBIDDEN_PROFILE` para `tecnico`, `401 UNAUTHENTICATED` para visitante).
- **Resposta `200 OK`:** Lista os técnicos ativos disponíveis para atribuição/reatribuição de OS (sem `password_hash`).

### `GET /api/users`
- **Acesso:** Exclusivo `gestor`.
- **Resposta `200 OK`:** Lista os usuários cadastrados (sem `password_hash`).

---

## 5. Auditoria (`RNF16`)

### `GET /api/audit`
- **Acesso:** Exclusivo `gestor`.
- **Query Params Opcionais:** `action`, `target_type`, `target_id`, `actor_user_id`, `limit` (padrão `100`).
- **Resposta `200 OK`:** Lista cronológica decrescente dos eventos de auditoria com autor, perfil, data/hora, ação, objeto, motivo e metadados.

---

## 6. Regiões (`RF03`, `RF17`, `RN04`, `RN16`, `RN17`, `RN20`, `RN27`, `CT02`, `CT20`)

### `GET /api/regions/public`
- **Acesso:** Público (usado pelo formulário de ocorrência do Cidadão — `RF12`, `UC10`).
- **Resposta `200 OK`:** Lista regiões com `status = 'Ativo'`.

### `GET /api/regions`
- **Acesso:** Exclusivo `gestor`.
- **Query Params Opcionais:** `status` (`Ativo` | `Inativo` | `Bloqueado`).
- **Resposta `200 OK`:** Lista regiões com contagem de equipamentos totais e ativos.

### `POST /api/regions`
- **Acesso:** Exclusivo `gestor`.
- **Corpo:** `{ "name": "Região C", "code": "REG-C", "description": "...", "latitude_center": -12.97, "longitude_center": -38.50 }`

### `PUT /api/regions/:id`
- **Acesso:** Exclusivo `gestor`.

### `PATCH /api/regions/:id/inactivate`
- **Acesso:** Exclusivo `gestor`.
- **Efeito (`RN20`, `CA03.2`, `CA03.3`, `CT02`):** Altera a região para `Inativo`, inativa em cascata todos os equipamentos vinculados, preserva todo o histórico e registra `REGION_INACTIVATED` na auditoria.

### `POST /api/regions/:id/block`
- **Acesso:** Exclusivo `gestor` (`403` para `tecnico`, `401` para `visitante`, ambos auditados).
- **Corpo:** `{ "reason": "Motivo com no mínimo 10 caracteres", "confirmed": true }`
- **Efeito (`RN16`, `RN17`, `RN27`, `CT20`):** Exige região `Ativo` e `reason.trim().length >= 10`. Altera a região e todos os seus equipamentos `Ativo` para `Bloqueado`, suspende alertas ativos (`Suspenso`), preserva OS em andamento e registra `REGION_BLOCKED`.

### `POST /api/regions/:id/unblock`
- **Acesso:** Exclusivo `gestor`.
- **Corpo:** `{ "confirmed": true }` (sem necessidade de motivo — `CA17.13`).
- **Efeito (`RN17`, `RN27`, `CT20`):** Restaura a região e os equipamentos vinculados ao estado operacional anterior (`Ativo`), reativa alertas `Suspenso` para `Ativo` e registra `REGION_UNBLOCKED`.

---

## 7. Equipamentos (`RF04`, `RF17`, `RN02`–`RN04`, `RN16`, `RN17`, `RNF09`, `RNF19`, `CT03`, `CT18`, `CT19`)

### `GET /api/equipments`
- **Acesso:** Exclusivo `gestor` (`CA02.1`, `CT01`).
- **Query Params Opcionais:** `region_id`, `type` (`poste` | `predio_municipal`), `status` (`Ativo` | `Inativo` | `Bloqueado`).

### `POST /api/equipments`
- **Acesso:** Exclusivo `gestor`.
- **Corpo:**
  ```json
  {
    "type": "poste",
    "region_id": 1,
    "location": "Praça Municipal, Ponto 03",
    "expected_consumption_kwh": 100,
    "name": "Poste Simulado 03",
    "code": "EQ-POSTE-99"
  }
  ```
- **Validações (`RN02`, `RN03`, `RNF09`, `RNF19`, `CT03`):**
  - `expected_consumption_kwh <= 0` é recusado com `400 VALIDATION_ERROR` (`field: "expected_consumption_kwh"`).
  - Ausência de `region_id` ou região inexistente/inativa é recusada (`field: "region_id"`).
  - Textos com caracteres especiais ou vetores SQL Injection em `location` são persistidos com segurança por *prepared statements* sem execução SQL.

### `PUT /api/equipments/:id`
- **Acesso:** Exclusivo `gestor`.

### `PATCH /api/equipments/:id/inactivate`
- **Acesso:** Exclusivo `gestor`.
- **Efeito (`RN04`):** Inativa o equipamento preservando leituras, alertas e OS históricas.

### `POST /api/equipments/:id/block`
- **Acesso:** Exclusivo `gestor` (`CT18`).
- **Corpo:** `{ "reason": "1234567890", "confirmed": true }`
- **Efeito (`RN16`, `RN17`, `CT18`, `CT19`):** Exige equipamento `Ativo` e `reason.trim().length >= 10`. Altera para `Bloqueado`, suspende alertas ativos (`Suspenso`), preserva OS em andamento e registra `EQUIPMENT_BLOCKED`.

### `POST /api/equipments/:id/unblock`
- **Acesso:** Exclusivo `gestor`.
- **Corpo:** `{ "confirmed": true }` (sem motivo — `CA17.13`).
- **Efeito (`RN17`, `CT19`):** Restaura o estado operacional anterior (`Ativo`), devolve alertas `Suspenso` para `Ativo` e registra `EQUIPMENT_UNBLOCKED`.

---

## 8. Leituras Simuladas e Parâmetros de Anomalia (`RF05`, `RF06`, `RF07`, `RN04`–`RN08`, `RN24`, `RN28`, `RNF01`, `RNF03`, `RNF12`, `RNF13`, `RNF17`, `CT04`–`CT06`)

### `POST /api/readings/generate-batch`
- **Acesso:** Exclusivo `gestor` (`CA05.1`, `RN01`).
- **Corpo da Requisição:**
  ```json
  {
    "scenario": "normal",
    "region_id": 1,
    "equipment_id": null,
    "measured_consumption_kwh": null,
    "inject_error": false
  }
  ```
- **Cenários suportados (`scenario`):**
  - `"normal"`: Consumo medido igual ao esperado $E$ ($\text{desvio} = 0\%$, sem anomalia — `CA05.1`, `CT04`).
  - `"pico"`: Consumo medido multiplicado por `SIMULATION_PEAK_FACTOR` (padrão `1.50` = $+50\%$, `consumo_acima`, severidade `Alta` — `OD-03`).
  - `"falha"`: Consumo medido de `0.5 kWh` ($\le \text{TOL\_ZERO}$, `falha_total`, severidade `Alta` — `CA05.3`, `CT04`).
  - `"manual"`: Permite informar `measured_consumption_kwh` explícito para testes determinísticos de valor-limite.
- **Regras de Elegibilidade (`RN04`, `RN17`, `CA03.2`, `CA05.2`, `CT04`):**
  - Apenas equipamentos com `status = 'Ativo'` pertencentes a regiões com `status = 'Ativo'` recebem leituras.
  - Equipamentos/regiões `Inativo` ou `Bloqueado` são ignorados e reportados em `skipped_equipments`.
- **Tratamento de Falha no Gerador (`RNF03`, `UC04-E2`, `CT04`):**
  - Se ocorrer falha (`inject_error: true`), o sistema registra erro estruturado em `logs/app-error.log` com `operation: "BATCH_READING_GENERATION"`, preserva integralmente as leituras existentes e retorna `500 READING_GENERATOR_ERROR`.
- **Integração com Alertas (`UC04 -> UC05`, `RN08`):**
  - Leituras anômalas criam alerta `Ativo` ou atualizam o alerta ativo existente do mesmo `(equipment_id, anomaly_type)` sem duplicação (`occurrence_count + 1`).

### `GET /api/readings`
- **Acesso:** Autenticado (`gestor`, `tecnico`).
- **Query Params Opcionais:** `equipment_id`, `region_id`, `scenario`, `is_anomaly`, `batch_id`, `start_date`, `end_date`, `limit`.
- **Resposta `200 OK`:** Lista as leituras com `origin: "SIMULADO"`, `unit: "kWh"`, `deviation_percent`, `anomaly_type` e `severity`.

### `GET /api/readings/anomaly-params`
- **Acesso:** Autenticado (`gestor`, `tecnico`).
- **Resposta `200 OK`:** Retorna os parâmetros ativos (`LIM_SUP`, `LIM_INF`, `TOL_ZERO`, `FAIXA_BAIXA`, `FAIXA_MEDIA`, `FAIXA_ALTA`).

### `PUT /api/readings/anomaly-params`
- **Acesso:** Exclusivo `gestor` (`RNF13`, `CT06`).
- **Corpo:** `{ "LIM_SUP": 15 }` ou `{ "reset": true }`.
- **Efeito:** Atualiza os parâmetros de detecção em tempo de execução sem necessidade de alterar código-fonte e registra `ANOMALY_PARAMS_UPDATED` na auditoria.
