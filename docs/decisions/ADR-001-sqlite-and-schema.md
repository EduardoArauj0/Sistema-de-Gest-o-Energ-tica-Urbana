# ADR-001 — Uso do `node:sqlite` Nativo, Índices Parciais e Trava de Ambiente (`RNF20`)

- **Data:** 2026-11-11
- **Status:** Aceito (Etapa 2)
- **Requisitos relacionados:** `RNF02`, `RNF04`, `RNF15`, `RNF18`, `RNF19`, `RNF20`, `RN08`, `RN14`, `RN19`, `CT01`, `CT07`, `CT09`, `CT17`, `CT26`

---

## 1. Contexto

O SGE-Urbano exige persistência relacional em **SQLite** com consultas parametrizadas (`RNF19`), integridade referencial, preservação dos registros após reinicialização (`RNF02`), proibição de exclusão física de alertas, ocorrências e OS (`RN14`), prevenção de duplicidade de alertas ativos (`RN08`) e de OS ativas para o mesmo alerta (`RN19`), e restrição do reset/seed exclusivamente ao ambiente de teste (`RNF20`).

---

## 2. Decisões Tomadas

1. **Driver SQLite Nativo (`node:sqlite` — `DatabaseSync`):**
   - O runtime Node.js `v22.16.0` inclui nativamente o módulo `node:sqlite` (`DatabaseSync`), que oferece suporte completo a *prepared statements* parametrizados (`db.prepare(sql)`), transações e `PRAGMA foreign_keys = ON`.
   - Evita falhas de compilação nativa C++ (`node-gyp`) em ambientes Windows (`RNF15` — portabilidade e execução em máquina limpa), mantendo zero dependências externas nativas.

2. **Índices Únicos Parciais para Regras de Negócio Críticas (`RN08` e `RN19`):**
   - `idx_alerts_unique_active_per_equip_type`: garante no nível do motor SQLite que nunca existam dois alertas com `status IN ('Ativo', 'Suspenso')` para o mesmo par `(equipment_id, anomaly_type)`.
   - `idx_work_orders_unique_active_per_alert`: garante no nível do motor SQLite que nunca existam duas OS com `status IN ('Aberta', 'Atribuída', 'Em atendimento')` para o mesmo `alert_id`, liberando a abertura de nova OS caso a anterior seja `Cancelada` (`RN25`).

3. **Proteção contra Exclusão Física (`RN14`) combinada com Reset de Teste (`RNF20`):**
   - Todas as chaves estrangeiras utilizam `ON DELETE RESTRICT`.
   - Triggers `BEFORE DELETE` bloqueiam a remoção física de registros em `alerts`, `occurrences` e `work_orders` durante a operação normal.
   - A função `resetAndSeedDatabase()` e a rota `POST /api/testing/reset` exigem `NODE_ENV === 'test'` (`RNF20`, `CT26`). Fora do ambiente de teste, a rota não é montada em `app.js` e a função lança erro `403 Forbidden (TEST_ONLY_OPERATION)` sem alterar nenhum dado.
