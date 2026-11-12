# Dicionário de Dados — SGE-Urbano

Este documento detalha todas as tabelas, colunas, tipos, restrições e regras de negócio associadas ao banco de dados SQLite do **SGE-Urbano**.

---

## 1. Tabela `users`
Armazena as contas autenticáveis do sistema (`Gestor` e `Técnico`). Conforme `RN01` e `RN22`, o `Cidadão` não possui conta nem login.

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único do usuário. |
| `name` | `TEXT` | Não | `CHECK (length(trim(name)) >= 2)` | Nome de exibição (sintético). |
| `username` | `TEXT` | Não | `UNIQUE`, `>= 3 chars` | Login de usuário (`gestor`, `tecnico1`, `tecnico2`). |
| `email` | `TEXT` | Não | `UNIQUE`, formato de e-mail | E-mail institucional sintético. |
| `password_hash` | `TEXT` | Não | `CHECK (password_hash LIKE 'scrypt$%')` | Hash seguro da senha (`RNF04`); nunca armazena texto claro. |
| `role` | `TEXT` | Não | `CHECK (role IN ('gestor', 'tecnico'))` | Perfil de autorização (`RN01`, `RF01`, `RF02`). |
| `status` | `TEXT` | Não | `DEFAULT 'Ativo'`, `IN ('Ativo', 'Inativo')` | Situação cadastral (`RN11`). |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora de criação. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última atualização. |

---

## 2. Tabela `sessions`
Controla as sessões ativas no servidor e a expiração por inatividade de 30 minutos (`RNF06`, `RN30`, `CT01`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `TEXT` | Não | `PRIMARY KEY` | Token único da sessão (UUID/hex). |
| `user_id` | `INTEGER` | Não | `FK -> users(id) ON DELETE RESTRICT` | Usuário autenticado na sessão. |
| `created_at` | `TEXT` | Não | ISO 8601 | Momento do login. |
| `last_activity_at` | `TEXT` | Não | ISO 8601 | Última requisição autenticada válida. |
| `expires_at` | `TEXT` | Não | ISO 8601 | Limite de validade (`last_activity_at + 30 min` — `RNF06`). |
| `revoked_at` | `TEXT` | Sim | `NULL` | Preenchido no logout explícito (`RF01`, `CA01.3`). |

---

## 3. Tabela `regions`
Armazena as regiões urbanas monitoradas (`RF03`, `RF17`, `RN04`, `RN16`, `RN17`, `RN20`, `RN27`, `OD-06`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único da região. |
| `code` | `TEXT` | Não | `UNIQUE`, `>= 2 chars` | Código curto da região (ex.: `REG-A`, `REG-B`). |
| `name` | `TEXT` | Não | `UNIQUE`, `2..100 chars` | Nome da região. |
| `description` | `TEXT` | Sim | — | Descrição complementar opcional. |
| `latitude_center` | `REAL` | Não | `-90..90` | Latitude central simulada (fallback do mapa `CA15.1` / `UC13-A1`). |
| `longitude_center` | `REAL` | Não | `-180..180` | Longitude central simulada. |
| `status` | `TEXT` | Não | `DEFAULT 'Ativo'`, `IN ('Ativo', 'Inativo', 'Bloqueado')` | Estado operacional da região. |
| `previous_operational_status` | `TEXT` | Sim | `IN ('Ativo', 'Inativo')` | Estado anterior salvo ao bloquear para restauração no desbloqueio (`RN17`). |
| `block_reason` | `TEXT` | Sim | `NULL` ou `length(trim(block_reason)) >= 10` | Motivo de bloqueio (`RN16`, `OD-09`, `CT18`). |
| `blocked_at` | `TEXT` | Sim | ISO 8601 | Data/hora do bloqueio ativo. |
| `blocked_by_user_id` | `INTEGER` | Sim | `FK -> users(id) ON DELETE RESTRICT` | Gestor que efetuou o bloqueio. |
| `inactivated_at` | `TEXT` | Sim | ISO 8601 | Data/hora da inativação (`RN20`). |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora de criação. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última alteração. |

---

## 4. Tabela `equipments`
Armazena os equipamentos públicos monitorados: postes de iluminação e prédios municipais (`RF04`, `RF17`, `RN02`, `RN03`, `RN04`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único do equipamento. |
| `code` | `TEXT` | Não | `UNIQUE`, `>= 2 chars` | Código identificador (ex.: `EQ-POSTE-01`). |
| `name` | `TEXT` | Não | `>= 2 chars` | Nome descritivo do equipamento. |
| `type` | `TEXT` | Não | `IN ('poste', 'predio_municipal')` | Tipo obrigatório (`RN02`). |
| `region_id` | `INTEGER` | Não | `FK -> regions(id) ON DELETE RESTRICT` | Região vinculada obrigatória (`RN02`, `CA04.3`). |
| `location` | `TEXT` | Não | `3..200 chars` | Endereço/localização textual (`RF04`, `CT03`). |
| `expected_consumption_kwh` | `REAL` | Não | `CHECK (expected_consumption_kwh > 0)` | Consumo esperado $E$ em kWh (`RN03`, `CA04.2`, `CT03`). |
| `latitude` | `REAL` | Não | `-90..90` | Latitude simulada fixa (`RN29`). |
| `longitude` | `REAL` | Não | `-180..180` | Longitude simulada fixa (`RN29`). |
| `status` | `TEXT` | Não | `DEFAULT 'Ativo'`, `IN ('Ativo', 'Inativo', 'Bloqueado')` | Estado operacional (`RN04`, `RN17`, `RN20`). |
| `previous_operational_status` | `TEXT` | Sim | `IN ('Ativo', 'Inativo')` | Estado anterior para restauração após desbloqueio (`RN17`). |
| `blocked_by_region_cascade` | `INTEGER` | Não | `DEFAULT 0`, `IN (0, 1)` | Indica se o bloqueio decorreu de cascata da região (`RN27`, `CT20`). |
| `block_reason` | `TEXT` | Sim | `NULL` ou `length(trim(block_reason)) >= 10` | Motivo do bloqueio (`RN16`). |
| `blocked_at` | `TEXT` | Sim | ISO 8601 | Data/hora do bloqueio. |
| `blocked_by_user_id` | `INTEGER` | Sim | `FK -> users(id) ON DELETE RESTRICT` | Gestor autor do bloqueio. |
| `inactivated_at` | `TEXT` | Sim | ISO 8601 | Data/hora da inativação. |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora de criação. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última alteração. |

---

## 5. Tabela `readings`
Armazena o histórico de leituras simuladas em lote (`RF05`, `RF06`, `RN04`, `RN05`, `RN24`, `RNF17`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único da leitura. |
| `equipment_id` | `INTEGER` | Não | `FK -> equipments(id) ON DELETE RESTRICT` | Equipamento medido (`RN05`). |
| `batch_id` | `TEXT` | Sim | — | Identificador do lote de simulação. |
| `scenario` | `TEXT` | Não | `IN ('normal', 'pico', 'falha', 'manual')` | Cenário utilizado na geração (`RF05`). |
| `measured_consumption_kwh` | `REAL` | Não | `CHECK (measured_consumption_kwh >= 0)` | Consumo medido em kWh (`RN24`). |
| `expected_consumption_kwh` | `REAL` | Não | `CHECK (expected_consumption_kwh > 0)` | Consumo esperado $E$ vigente no momento da leitura. |
| `deviation_percent` | `REAL` | Não | — | Desvio percentual calculado: $((M - E) / E) \times 100$. |
| `is_anomaly` | `INTEGER` | Não | `DEFAULT 0`, `IN (0, 1)` | Indicador booleano de anomalia (`RF06`). |
| `anomaly_type` | `TEXT` | Sim | `IN ('falha_total', 'consumo_acima', 'consumo_abaixo')` | Tipo de anomalia detectada (`RN06`). |
| `severity` | `TEXT` | Sim | `IN ('Baixa', 'Media', 'Alta')` | Severidade classificada (`RN07`). |
| `unit` | `TEXT` | Não | `DEFAULT 'kWh'`, `CHECK (unit = 'kWh')` | Unidade de medida obrigatória (`RN24`). |
| `origin` | `TEXT` | Não | `DEFAULT 'SIMULADO'`, `CHECK (origin = 'SIMULADO')` | Identificação permanente de dado simulado (`RN05`, `RNF17`). |
| `recorded_at` | `TEXT` | Não | ISO 8601 | Data/hora da leitura (`RN05`). |
| `created_by_user_id` | `INTEGER` | Sim | `FK -> users(id) ON DELETE RESTRICT` | Gestor que acionou o lote. |

---

## 6. Tabela `alerts`
Armazena os alertas gerados pelas anomalias detectadas (`RF07`, `RF08`, `RN07`, `RN08`, `RN14`, `RN17`, `RN18`, `RN25`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único do alerta. |
| `equipment_id` | `INTEGER` | Não | `FK -> equipments(id) ON DELETE RESTRICT` | Equipamento associado ao alerta. |
| `region_id` | `INTEGER` | Não | `FK -> regions(id) ON DELETE RESTRICT` | Região do equipamento (otimiza filtro `RF08`). |
| `last_reading_id` | `INTEGER` | Não | `FK -> readings(id) ON DELETE RESTRICT` | Última leitura anômala que criou ou atualizou o alerta (`RN08`). |
| `anomaly_type` | `TEXT` | Não | `IN ('falha_total', 'consumo_acima', 'consumo_abaixo')` | Tipo da anomalia (`RN06`, `RN08`). |
| `severity` | `TEXT` | Não | `IN ('Baixa', 'Media', 'Alta')` | Severidade atual do alerta (`RN07`). |
| `measured_consumption_kwh` | `REAL` | Não | — | Valor medido na leitura mais recente. |
| `expected_consumption_kwh` | `REAL` | Não | — | Valor esperado do equipamento. |
| `deviation_percent` | `REAL` | Não | — | Desvio percentual registrado. |
| `status` | `TEXT` | Não | `DEFAULT 'Ativo'`, `IN ('Ativo', 'Suspenso', 'Resolvido')` | Estado do alerta (`RN17`, `RN18`, `RN25`). |
| `occurrence_count` | `INTEGER` | Não | `DEFAULT 1`, `>= 1` | Quantidade de leituras acumuladas no alerta sem duplicação (`RN08`, `CT07`). |
| `message` | `TEXT` | Não | — | Mensagem descritiva em `pt-BR`. |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora de abertura do alerta. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última atualização. |
| `resolved_at` | `TEXT` | Sim | ISO 8601 | Data/hora de resolução automática ao concluir OS (`RN18`). |

---

## 7. Tabela `occurrences`
Armazena as ocorrências registradas pela população sem login (`RF12`, `RF13`, `RF15`, `RN13`, `RN14`, `RN15`, `RN22`, `RN23`, `RN26`, `RNF07`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador interno da ocorrência. |
| `protocol` | `TEXT` | Não | `UNIQUE`, `>= 10 chars` | Protocolo único (`PROTOCOLO-YYYYMMDDXXXX` — `RN26`, `OD-04`). |
| `citizen_name` | `TEXT` | Não | `>= 2 chars` | Nome sintético do solicitante (visível só ao Gestor — `RNF07`). |
| `citizen_email` | `TEXT` | Não | Formato de e-mail | E-mail sintético do solicitante (visível só ao Gestor — `RNF07`). |
| `citizen_phone` | `TEXT` | Sim | — | Telefone fictício do solicitante (visível só ao Gestor — `RNF07`). |
| `citizen_cpf_simulated` | `TEXT` | Sim | — | CPF fictício para validação de máscara (visível só ao Gestor — `RNF07`, `RN26`). |
| `type` | `TEXT` | Não | 5 tipos de `RN23` (`OD-02`) | Tipo do problema relatado. |
| `description` | `TEXT` | Não | `>= 3 chars` | Descrição do problema (`CA12.2`, `CT13`). |
| `region_id` | `INTEGER` | Não | `FK -> regions(id) ON DELETE RESTRICT` | Região selecionada pelo cidadão (`RF12`). |
| `equipment_id` | `INTEGER` | Sim | `FK -> equipments(id) ON DELETE RESTRICT` | Equipamento vinculado (opcional — `CT21`). |
| `address_reference` | `TEXT` | Não | `>= 3 chars` | Endereço ou ponto de referência informado. |
| `latitude` | `REAL` | Não | `-90..90` | Coordenada simulada (equipamento ou centro da região — `CA15.1`). |
| `longitude` | `REAL` | Não | `-180..180` | Coordenada simulada. |
| `status` | `TEXT` | Não | `DEFAULT 'Aberta'`, `IN ('Aberta', 'Em atendimento', 'Resolvida', 'Cancelada')` | Estado da ocorrência (`CA12.1`, `OD-01`). |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora do registro. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última atualização. |

---

## 8. Tabela `work_orders`
Armazena as Ordens de Serviço (`RF09`, `RF10`, `RF11`, `RF15`, `RF18`, `RN09`–`RN12`, `RN14`, `RN18`, `RN19`, `RN21`, `RN25`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único da OS. |
| `code` | `TEXT` | Não | `UNIQUE` | Código amigável da OS (ex.: `OS-2026-0001`). |
| `origin` | `TEXT` | Não | `IN ('alerta', 'cidadao', 'manual')` | Origem da OS (`RF09`, `RN09`). |
| `alert_id` | `INTEGER` | Sim | `FK -> alerts(id) ON DELETE RESTRICT` | Alerta de origem (quando `origin = 'alerta'`). |
| `occurrence_id` | `INTEGER` | Sim | `FK -> occurrences(id) ON DELETE RESTRICT` | Ocorrência de origem (quando `origin = 'cidadao'`). |
| `region_id` | `INTEGER` | Não | `FK -> regions(id) ON DELETE RESTRICT` | Região onde ocorre o atendimento. |
| `equipment_id` | `INTEGER` | Sim | `FK -> equipments(id) ON DELETE RESTRICT` | Equipamento associado (quando aplicável). |
| `location` | `TEXT` | Não | `length(trim(location)) > 0` | Localização obrigatória (`RN09`, `CA09.2`, `CT09`). |
| `title` | `TEXT` | Não | `>= 3 chars` | Título resumido da OS. |
| `description` | `TEXT` | Não | `>= 3 chars` | Descrição detalhada do serviço. |
| `status` | `TEXT` | Não | `DEFAULT 'Aberta'`, `IN ('Aberta', 'Atribuída', 'Em atendimento', 'Concluída', 'Cancelada')` | Estado no ciclo de vida (Seção 4.7 da 2ª entrega). |
| `assigned_technician_id` | `INTEGER` | Sim | `FK -> users(id) ON DELETE RESTRICT` | Técnico responsável (`RF10`, `RN11`). |
| `created_by_user_id` | `INTEGER` | Não | `FK -> users(id) ON DELETE RESTRICT` | Gestor que abriu a OS. |
| `progress_notes` | `TEXT` | Sim | — | Anotações de andamento (`RF11`). |
| `solution_description` | `TEXT` | Sim | Obrigatório quando `status = 'Concluída'` | Solução aplicada no encerramento (`RN12`, `CA11.2`, `CA11.3`). |
| `cancellation_reason` | `TEXT` | Sim | Obrigatório quando `status = 'Cancelada'` | Justificativa de cancelamento (`RF18`, `RN21`, `CA18.1`). |
| `latitude` | `REAL` | Não | `-90..90` | Latitude para exibição no mapa (`RF15`, `CA15.3`). |
| `longitude` | `REAL` | Não | `-180..180` | Longitude para exibição no mapa. |
| `started_at` | `TEXT` | Sim | ISO 8601 | Data/hora de início do atendimento (`Em atendimento`). |
| `completed_at` | `TEXT` | Sim | ISO 8601 | Data/hora de encerramento (`Concluída` — `CA11.2`). |
| `cancelled_at` | `TEXT` | Sim | ISO 8601 | Data/hora de cancelamento (`Cancelada`). |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora de abertura. |
| `updated_at` | `TEXT` | Não | ISO 8601 | Data/hora da última transição. |

---

## 9. Tabela `audit_logs`
Registra a trilha de auditoria das ações críticas e tentativas de acesso negado (`RNF05`, `RNF16`, `RN16`, `RN20`).

| Coluna | Tipo SQLite | Nulo? | Restrições / Default | Descrição e Rastreabilidade |
|---|---|---|---|---|
| `id` | `INTEGER` | Não | `PRIMARY KEY AUTOINCREMENT` | Identificador único do evento auditado. |
| `actor_user_id` | `INTEGER` | Sim | `FK -> users(id) ON DELETE RESTRICT` | Autor da ação (`NULL` quando visitante/login inválido). |
| `actor_role` | `TEXT` | Sim | — | Perfil do autor no momento da ação (`gestor`, `tecnico`, `visitante`). |
| `action` | `TEXT` | Não | — | Código da ação executada ou recusada. |
| `target_type` | `TEXT` | Não | — | Tipo do objeto afetado (`user`, `region`, `equipment`, `work_order`, etc.). |
| `target_id` | `TEXT` | Sim | — | Identificador do objeto afetado. |
| `reason` | `TEXT` | Sim | — | Motivo/justificativa informada (ex.: bloqueio `RN16`, cancelamento `RF18`). |
| `details_json` | `TEXT` | Sim | JSON | Metadados adicionais da transição (estado anterior/novo). |
| `created_at` | `TEXT` | Não | ISO 8601 | Data/hora exata do evento (`RNF16`). |
