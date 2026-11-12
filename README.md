# SGE-Urbano — Sistema de Gestão Energética Urbana

> **AVISO DE TRANSPARÊNCIA (`RNF17`):** O **SGE-Urbano** é uma aplicação web de **simulação acadêmica** para monitoramento energético de equipamentos públicos (iluminação pública e prédios municipais). Todos os dados de consumo energético são **simulados** (identificados com origem `SIMULADO`). Não há integração com concessionárias de energia, medidores físicos reais ou dispositivos IoT.

---

## 1. Sobre o Projeto

Desenvolvido no contexto do **Trabalho A3 — UC Gestão e Qualidade de Software (UNIFACS)**, dentro do eixo temático **Ordem pública e manutenção da cidade**.

### Integrantes da Equipe
- **Eduardo Araujo** — RA: 1272327420
- **Gabriel Santana** — RA: 12723211354
- **João Anísio** — RA: 12723213518
- **Marcelo Carmo** — RA: 1272323017
- **Tiago Maciel** — RA: 1272326567

---

## 2. Tecnologias Utilizadas

| Camada | Tecnologia |
|---|---|
| Backend | Node.js |
| Framework HTTP/REST | Express |
| Banco de Dados | SQLite |
| Frontend | HTML5, CSS3 e JavaScript (Vanilla) |
| Mapa Interativo | Leaflet.js + OpenStreetMap |
| Testes Automatizados | Cypress |
| Cobertura de Código | Istanbul / `nyc` |

---

## 3. Pré-requisitos

- **Node.js** `v20+` ou `v22+` (testado em `v22.16.0`)
- **npm** `v10+`
- Conexão com a internet (apenas para carregamento das tiles públicas do OpenStreetMap no mapa Leaflet.js)

---

## 4. Instalação e Configuração

1. Na raiz do projeto, instale as dependências:
   ```bash
   npm install
   ```

2. (Opcional) Crie o arquivo `.env` a partir do modelo `.env.example`:
   ```bash
   cp .env.example .env
   ```
   *(No Windows PowerShell: `Copy-Item .env.example .env`)*

---

## 5. Execução

- **Modo Desenvolvimento (com recarregamento automático):**
  ```bash
  npm run dev
  ```

- **Modo Normal:**
  ```bash
  npm start
  ```

- **Modo de Teste (`NODE_ENV=test`):**
  ```bash
  npm run start:test
  ```

- **Executar Migrações do Banco SQLite:**
  ```bash
  npm run db:migrate
  ```

- **Resetar e Recarregar a Seed de Referência (Exclusivo em Ambiente de Teste — `RNF20`):**
  ```bash
  npm run db:seed:test
  ```

- **Testes Unitários e de Banco de Dados:**
  ```bash
  npm run test:unit
  ```

Após iniciar o servidor, acesse no navegador:
- Interface Web: `http://localhost:3000`
- Diagnóstico da API (`Health Check`): `http://localhost:3000/api/health`

---

## 6. Contas Sintéticas da Massa de Referência (Seed Fixa)

> As senhas são persistidas no SQLite exclusivamente como hash `scrypt` (`RNF04`). O perfil `Cidadão` não possui cadastro nem login (`RN01`, `RN22`).

| Perfil | Usuário (`username`) | E-mail Sintético | Senha para Teste | Status |
|---|---|---|---|---|
| **Gestor** | `gestor` | `gestor@sge-urbano.simulado.local` | `Gestor@123` | `Ativo` |
| **Técnico 1** | `tecnico1` | `tecnico1@sge-urbano.simulado.local` | `Tecnico1@123` | `Ativo` |
| **Técnico 2** | `tecnico2` | `tecnico2@sge-urbano.simulado.local` | `Tecnico2@123` | `Ativo` |

---

## 7. Documentação do Projeto (`docs/`)

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — Visão geral da arquitetura em camadas.
- [`docs/architecture/database-er-diagram.md`](docs/architecture/database-er-diagram.md) — Diagrama Entidade-Relacionamento (DER) e restrições de integridade.
- [`docs/architecture/data-dictionary.md`](docs/architecture/data-dictionary.md) — Dicionário de Dados completo do SQLite.
- [`docs/decisions/ADR-001-sqlite-and-schema.md`](docs/decisions/ADR-001-sqlite-and-schema.md) — Decisão arquitetural sobre `node:sqlite`, índices parciais e trava `RNF20`.
- [`docs/open-decisions.md`](docs/open-decisions.md) — Registro de pendências documentais e decisões técnicas aprovadas.
- [`docs/requirements-traceability.md`](docs/requirements-traceability.md) — Matriz completa de rastreabilidade (`RF`, `RNF`, `RN`, `UC`, `CA` e `CT`).
