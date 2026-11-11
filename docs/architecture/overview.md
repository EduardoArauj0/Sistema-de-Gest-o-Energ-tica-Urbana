# Arquitetura do Sistema — SGE-Urbano

## 1. Visão Geral

O **SGE-Urbano (Sistema de Gestão Energética Urbana)** é estruturado como um **Monólito Modular em Camadas**, garantindo simplicidade operacional, alta testabilidade e cumprimento rigoroso dos Requisitos Não Funcionais (`RNF12`, `RNF13`, `RNF18`, `RNF19`, `RNF20`).

### Stack Tecnológica Obrigatória

| Camada | Tecnologia |
|---|---|
| Runtime Backend | Node.js (`v22+`) |
| Framework HTTP/REST | Express (`v4`) |
| Persistência | SQLite |
| Frontend | HTML5, CSS3 e JavaScript (Vanilla) |
| Mapa Interativo | Leaflet.js + Tiles públicas do OpenStreetMap |
| Testes Automatizados | Cypress + Testes Unitários Node |
| Cobertura de Código | Istanbul / `nyc` |

---

## 2. Separação de Responsabilidades (`RNF18`)

1. **Camada de Apresentação (`frontend/`)**
   - Interface web em português do Brasil (`RNF10`).
   - Banner permanente de transparência informando que todos os dados são simulados (`RNF17`).
   - Visões separadas por perfil (`Cidadão`, `Técnico`, `Gestor`).

2. **Camada de Rotas e Controladores (`backend/src/modules/*/*.routes.js` e `*.controller.js`)**
   - Recebe requisições HTTP, extrai parâmetros e delega aos serviços.
   - Não contém lógica de negócio nem instruções SQL.

3. **Camada de Middlewares (`backend/src/middlewares/`)**
   - Autenticação e expiração de sessão por inatividade de 30 minutos (`RNF06`).
   - Controle de acesso baseado em perfil (`RBAC` — `RNF05`, `RN01`).
   - Tratamento centralizado de erros com indicação de `field` e `reason` (`RNF09`).

4. **Camada de Serviços (`backend/src/modules/*/*.service.js`)**
   - Orquestra regras de negócio, validações de domínio, transições de estado e registros de auditoria (`RNF16`).

5. **Módulo Isolado de Anomalias (`backend/src/modules/anomalies/`)**
   - Implementa `RN06` e `RN07` de forma 100% pura, determinística (`RNF01`) e parametrizável (`RNF13`), sem qualquer dependência de banco de dados ou interface (`RNF12`).

6. **Camada de Repositórios (`backend/src/modules/*/*.repository.js`)**
   - **Única camada autorizada a acessar o SQLite (`RNF18`).**
   - Executa apenas consultas parametrizadas (`?`) para prevenir SQL Injection (`RNF19`).
