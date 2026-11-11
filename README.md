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

- **Testes Unitários Base:**
  ```bash
  npm run test:unit
  ```

Após iniciar o servidor, acesse no navegador:
- Interface Web: `http://localhost:3000`
- Diagnóstico da API (`Health Check`): `http://localhost:3000/api/health`

---

## 6. Documentação do Projeto (`docs/`)

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — Visão geral da arquitetura em camadas.
- [`docs/open-decisions.md`](docs/open-decisions.md) — Registro de pendências documentais e decisões técnicas aprovadas.
- [`docs/requirements-traceability.md`](docs/requirements-traceability.md) — Matriz completa de rastreabilidade (`RF`, `RNF`, `RN`, `UC`, `CA` e `CT`).
