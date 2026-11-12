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
