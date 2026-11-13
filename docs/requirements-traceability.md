# Matriz de Rastreabilidade Completa — SGE-Urbano

Este documento mantém a rastreabilidade contínua entre **Requisitos Funcionais (`RF01`–`RF18`)**, **Requisitos Não Funcionais (`RNF01`–`RNF20`)**, **Regras de Negócio (`RN01`–`RN30`)**, **Casos de Uso (`UC01`–`UC16`)**, **Critérios de Aceitação (`CA01.1`–`CA18.3`)**, **Casos de Teste (`CT01`–`CT26`)**, módulos/arquivos implementados e situação atual.

### Legenda de Situação da Implementação
- **Não iniciado**: ainda não entrou na etapa de desenvolvimento correspondente.
- **Em desenvolvimento**: infraestrutura ou parte do requisito iniciada na etapa atual.
- **Implementado**: código escrito e funcional, aguardando execução completa da suíte de testes.
- **Testado**: coberto por testes executados e aprovados no nível correspondente.
- **Validado**: integrado ponta a ponta e verificado contra todos os critérios de aceitação.
- **Parcial**: implementado parcialmente ou dependente de evidência manual externa (ex.: commits de integrantes no GitHub).
- **Bloqueado por decisão pendente**: aguardando definição do proprietário.

---

## 1. Requisitos Funcionais (`RF01` a `RF18`)

| ID | Descrição Resumida | Prioridade | RNs Associadas | UCs | Critérios de Aceitação | Casos de Teste | Módulos / Arquivos | Testes Automatizados | Situação |
|---|---|---|---|---|---|---|---|---|---|
| **RF01** | Autenticar Gestor e Técnico (login/logout); Cidadão sem login | Alta | RN01, RN30 | UC01 | CA01.1, CA01.2, CA01.3 | CT01 | `backend/src/modules/auth/` | `tests/unit/auth-and-rbac.test.js` (`CT01`) | **Testado** (API Backend; UI na Etapa 9) |
| **RF02** | Restringir funcionalidades e dados conforme perfil | Alta | RN01, RN15, RN30 | UC01, UC08, UC09, UC15 | CA02.1, CA02.2 | CT01, CT10, CT18 | `backend/src/middlewares/auth.middleware.js` | `tests/unit/auth-and-rbac.test.js` (`CT01`) | **Em desenvolvimento** (Middleware RBAC testado na Etapa 3) |
| **RF03** | Cadastrar, consultar, editar e inativar regiões | Alta | RN04, RN20 | UC02 | CA03.1, CA03.2, CA03.3 | CT02 | `backend/src/modules/regions/` | `tests/unit/regions-and-equipment.test.js` (`CT02`) | **Testado** (API Backend; UI na Etapa 9) |
| **RF04** | Cadastrar, consultar, editar e inativar equipamentos | Alta | RN02, RN03, RN04 | UC03 | CA04.1, CA04.2, CA04.3 | CT03 | `backend/src/modules/equipment/` | `tests/unit/regions-and-equipment.test.js` (`CT03`) | **Testado** (API Backend; UI na Etapa 9) |
| **RF05** | Gerar leituras simuladas em lote (normal, pico, falha) | Alta | RN04, RN05, RN24 | UC04 | CA05.1, CA05.2, CA05.3 | CT04, CT24 | `backend/src/modules/readings/` | `tests/unit/anomalies-and-readings.test.js` (`CT04`) | **Testado** (API Backend; UI na Etapa 9) |
| **RF06** | Detectar anomalias (acima, abaixo, falha total) | Alta | RN06, RN28 | UC05 | CA06.1 a CA06.8 | CT05, CT06 | `backend/src/modules/anomalies/anomalyEngine.js` | `tests/unit/anomalies-and-readings.test.js` (`CT05`, `CT06`) | **Testado** (`CT05` e `CT06` aprovados; cobertura `nyc` na Etapa 10) |
| **RF07** | Gerar/atualizar alerta para anomalia e classificar severidade | Alta | RN06, RN07, RN08 | UC05 | CA07.1, CA07.2, CA07.3 | CT05, CT06, CT07 | `backend/src/modules/anomalies/anomalyEngine.js`, `readings.repository.js` | `tests/unit/anomalies-and-readings.test.js` (`CT04`–`CT06`) | **Em desenvolvimento** (Severidade e criação/atualização em `readings` testadas; módulo de alertas na Etapa 6) |
| **RF08** | Listar e filtrar alertas (severidade, região, tipo, situação) | Alta | RN07, RN08 | UC06 | CA08.1, CA08.2 | CT08 | `backend/src/modules/alerts/` (Etapa 6) | Planejado (`CT08`) | Não iniciado |
| **RF09** | Abrir OS a partir de alerta, ocorrência ou manualmente | Alta | RN09, RN10, RN19 | UC07 | CA09.1, CA09.2, CA09.3 | CT09 | `backend/src/modules/work-orders/` (Etapa 6) | Planejado (`CT09`) | Não iniciado |
| **RF10** | Atribuir OS a técnico e reatribuir (Aberta ou Atribuída) | Alta | RN10, RN11, RN21 | UC08 | CA10.1, CA10.2, CA10.3 | CT10 | `backend/src/modules/work-orders/` (Etapa 6) | Planejado (`CT10`) | Não iniciado |
| **RF11** | Atualizar andamento e encerrar OS com solução aplicada | Alta | RN10, RN12, RN18 | UC09 | CA11.1 a CA11.5 | CT11 | `backend/src/modules/work-orders/` (Etapa 6) | Planejado (`CT11`) | Não iniciado |
| **RF12** | Registrar ocorrência pelo cidadão sem login e gerar protocolo | Alta | RN13, RN22, RN23, RN26 | UC10 | CA12.1, CA12.2, CA12.3 | CT13 | `backend/src/modules/occurrences/` (Etapa 7) | Planejado (`CT13`) | Não iniciado |
| **RF13** | Consultar status da ocorrência por protocolo (apenas status e tipo) | Média | RN15, RN22, RN26 | UC11 | CA13.1 | CT14 | `backend/src/modules/occurrences/` (Etapa 7) | Planejado (`CT14`) | Não iniciado |
| **RF14** | Exibir dashboard com cards, gráficos, tabelas e filtros (mês corrente) | Alta | RN05, RN24 | UC12 | CA14.1, CA14.2, CA14.3 | CT15 | `backend/src/modules/dashboard/` (Etapa 8) | Planejado (`CT15`) | Não iniciado |
| **RF15** | Exibir mapa interativo com ocorrências e informações básicas | Alta | RN01, RN29 | UC13 | CA15.1, CA15.2, CA15.3 | CT21 | `backend/src/modules/occurrences/`, `frontend/` (Etapas 8/9) | Planejado (`CT21`) | Não iniciado |
| **RF16** | Emitir relatório de consumo (região/tipo, diário/mensal) e exportar CSV | Alta | RN24 | UC14 | CA16.1, CA16.2, CA16.3 | CT16 | `backend/src/modules/reports/` (Etapa 8) | Planejado (`CT16`) | Não iniciado |
| **RF17** | Bloquear e desbloquear regiões e equipamentos com auditoria | Alta | RN16, RN17, RN27 | UC15 | CA17.1 a CA17.13 | CT18, CT19, CT20 | `backend/src/modules/regions/`, `backend/src/modules/equipment/` | `tests/unit/regions-and-equipment.test.js` (`CT18`–`CT20`) | **Testado** (API Backend; UI na Etapa 9) |
| **RF18** | Cancelar OS em Aberta ou Atribuída com justificativa obrigatória | Média | RN10, RN14, RN21, RN25 | UC16 | CA18.1, CA18.2, CA18.3 | CT12 | `backend/src/modules/work-orders/` (Etapa 6) | Planejado (`CT12`) | Não iniciado |

---

## 2. Requisitos Não Funcionais (`RNF01` a `RNF20`)

| ID | Atributo | Requisito Resumido | Casos de Teste | Módulos / Arquivos | Situação |
|---|---|---|---|---|---|
| **RNF01** | Confiabilidade | Detecção de anomalias determinística (100% idêntica para mesma entrada) | CT06 | `backend/src/modules/anomalies/anomalyEngine.js` | **Testado** (100 repetições idênticas validadas em `anomalies-and-readings.test.js`) |
| **RNF02** | Confiabilidade | Alertas, ocorrências e OS íntegros após reinício da aplicação | CT17 | `backend/src/database/connection.js`, `001_initial_schema.sql` | **Em desenvolvimento** (Schema SQLite persistente e triggers `RN14` criados na Etapa 2) |
| **RNF03** | Confiabilidade | Falha no gerador não impede consulta; erro registrado em log | CT04 | `backend/src/shared/logger/logger.js`, `backend/src/modules/readings/readings.service.js` | **Testado** (Falha injetada, preservação de dados e log `app-error.log` validados em `CT04`) |
| **RNF04** | Segurança | Senhas armazenadas com hash seguro, nunca em texto claro | CT01 | `backend/src/shared/security/password.js`, `referenceSeedData.js`, `001_initial_schema.sql` | **Testado** (`database.test.js`, `auth-and-rbac.test.js`) |
| **RNF05** | Segurança | Autenticação/autorização por perfil validada no servidor em cada requisição | CT01, CT10, CT18 | `backend/src/middlewares/auth.middleware.js` | **Em desenvolvimento** (Middleware validado para rotas da Etapa 3 em `auth-and-rbac.test.js`) |
| **RNF06** | Segurança | Sessão expira após 30 minutos de inatividade | CT01 | `backend/src/modules/auth/auth.service.js`, `sessions.repository.js` | **Testado** (Validado com 29min vs $\ge 30$min em `auth-and-rbac.test.js`) |
| **RNF07** | Segurança/Privacidade | Dados pessoais do cidadão mínimos e visíveis apenas ao Gestor | CT10, CT14 | `backend/src/modules/occurrences/`, `backend/src/modules/work-orders/` (Etapas 6/7) | Não iniciado |
| **RNF08** | Usabilidade | Registro de ocorrência em até 3 interações a partir da tela inicial | CT13 | `frontend/` (Etapa 9) | Não iniciado |
| **RNF09** | Usabilidade | Severidade por cor e texto; erros informam campo e motivo | CT03, CT08, CT13 | `backend/src/shared/errors/AppError.js`, `backend/src/middlewares/error.middleware.js` | **Em desenvolvimento** (`AppError` com `field` e `reason` criado na Etapa 1) |
| **RNF10** | Usabilidade | Interface e mensagens em português do Brasil (`pt-BR`) | CT13, CT23 | `frontend/index.html`, `backend/src/middlewares/error.middleware.js` | **Em desenvolvimento** (Base `pt-BR` criada na Etapa 1) |
| **RNF11** | Eficiência | Dashboard carrega em até 3s com a massa de referência (2 regiões, 20 equipamentos) | CT15 | `backend/src/modules/dashboard/`, `frontend/` (Etapas 8/10) | Não iniciado |
| **RNF12** | Manutenibilidade | Regras de anomalia em módulo isolado, sem banco ou interface | CT06 | `backend/src/modules/anomalies/anomalyEngine.js` | **Testado** (Isolamento estrutural e funcional validados em `CT06`) |
| **RNF13** | Manutenibilidade | Limites e faixas configuráveis sem alteração de código | CT06 | `backend/src/config/anomaly-params.json`, `anomalyEngine.js`, `readings.service.js` | **Testado** (Alteração de `LIM_SUP` de `10%` para `15%` validada com `114`/`115 kWh` em `CT06`) |
| **RNF14** | Manutenibilidade | Projeto versionado no GitHub com commits de pelo menos 2 integrantes | CT25 | Repositório Git (commits manuais pelo proprietário/equipe) | Em desenvolvimento (Git inicializado) |
| **RNF15** | Portabilidade | Compatibilidade em Chrome, Firefox e Edge atuais + documentação de execução | CT22 | `README.md`, `frontend/` | **Em desenvolvimento** (`README.md` criado na Etapa 1) |
| **RNF16** | Auditabilidade | Ações críticas (login, estado de OS, bloqueio/desbloqueio) registram quem, quando e o quê | CT01, CT11, CT12, CT19, CT20 | `backend/src/modules/audit/` | **Em desenvolvimento** (Módulo de auditoria e eventos de login/acesso negado testados na Etapa 3) |
| **RNF17** | Transparência | Aviso permanente de dados simulados na interface e origem `"SIMULADO"` nas leituras | CT04, CT24 | `frontend/index.html`, `backend/src/app.js` | **Em desenvolvimento** (Banner inicial e `/api/health` na Etapa 1) |
| **RNF18** | Manutenibilidade | API REST em Node.js/Express organizada em camadas com SQLite isolado no repositório | CT06 | `backend/src/` | **Em desenvolvimento** (Estrutura modular iniciada na Etapa 1) |
| **RNF19** | Segurança | Servidor valida tipo, formato e limites e usa consultas SQL parametrizadas | CT03 | `backend/src/modules/regions/`, `backend/src/modules/equipment/` | **Testado** (Validado com limites e vetor SQL Injection em `regions-and-equipment.test.js`) |
| **RNF20** | Segurança | Endpoint/script de reset e seed existe somente em ambiente de teste | CT26 | `backend/src/database/seed.js`, `backend/src/modules/testing/testing.routes.js`, `backend/src/app.js` | **Testado** (Validado em `tests/unit/database.test.js` na Etapa 2) |

---

## 3. Regras de Negócio (`RN01` a `RN30`)

| ID | Descrição Resumida | Requisitos / UCs | Casos de Teste | Situação |
|---|---|---|---|---|
| **RN01** | Perfis exclusivos (Gestor, Técnico, Cidadão) e escopo de acesso | RF01, RF02 / UC01 | CT01, CT10 | **Em desenvolvimento** (Validado nas Etapas 3 e 4) |
| **RN02** | Equipamento pertence a 1 região e 1 tipo (`poste` ou `predio_municipal`) | RF04 / UC03 | CT03 | **Testado** (`regions-and-equipment.test.js`) |
| **RN03** | Consumo esperado obrigatório e $> 0$ | RF04 / UC03 | CT03 | **Testado** (`regions-and-equipment.test.js` e `database.test.js`) |
| **RN04** | Equipamento ou região inativos não geram leituras, mas mantêm histórico | RF03, RF04, RF05 / UC02, UC04 | CT02, CT04 | **Testado** (`regions-and-equipment.test.js` e `anomalies-and-readings.test.js`) |
| **RN05** | Toda leitura possui origem `"SIMULADO"`, data/hora e equipamento | RF05, RNF17 / UC04 | CT04, CT24 | **Testado** (Validado na API/Banco em `CT04`; UI em `CT24` na Etapa 9) |
| **RN06** | Detecção: falha total ($\le \text{TOL\_ZERO}$), acima ($\ge +\text{LIM\_SUP}$), abaixo ($\le -\text{LIM\_INF}$ e $> \text{TOL\_ZERO}$) | RF06 / UC05 | CT05, CT06 | **Testado** (Todos os 14 valores limites e caminhos P1–P6 validados em `CT05`/`CT06`) |
| **RN07** | Severidade: Alta (falha total ou $\|\text{desvio}\| \ge 50\%$), Média ($20\%$ a $<50\%$), Baixa ($10\%$ a $<20\%$) | RF07 / UC05 | CT05, CT06, CT08 | **Testado** (Classificação validada em `CT05`/`CT06`; UI em `CT08` na Etapa 9) |
| **RN08** | No máximo 1 alerta ativo por equipamento e tipo de anomalia (atualiza existente) | RF07, RF08 / UC05 | CT07 | **Em desenvolvimento** (Atualização sem duplicação validada no gerador na Etapa 5; `CT07` completo na Etapa 6) |
| **RN09** | Toda OS possui local identificado, origem (`alerta`, `cidadao`, `manual`) e estado | RF09 / UC07 | CT09 | Não iniciado |
| **RN10** | Transições de estado de OS/ocorrência seguem estritamente a tabela aprovada (Seção 4.7 / OD-01) | RF09–RF11, RF18 | CT09, CT11, CT12 | Não iniciado |
| **RN11** | OS só pode ser atribuída a usuário com perfil Técnico ativo | RF10 / UC08 | CT10 | Não iniciado |
| **RN12** | Apenas Técnico atribuído ou Gestor atualiza andamento e encerra OS (com solução) | RF11 / UC09 | CT11 | Não iniciado |
| **RN13** | Ocorrência exige tipo, descrição, região, endereço/referência e identificação do cidadão | RF12 / UC10 | CT13 | Não iniciado |
| **RN14** | Alertas, ocorrências e OS não são excluídos fisicamente (preservação histórica) | RNF02, RF18 | CT17 | Não iniciado |
| **RN15** | Dados pessoais do cidadão são visíveis somente ao Gestor | RF02, RNF07 / UC10 | CT10, CT14 | Não iniciado |
| **RN16** | Bloqueio exige motivo $\ge 10$ caracteres, confirmação imediata e registro de auditoria | RF17, RNF16 / UC15 | CT18, CT19, CT20 | **Testado** (`regions-and-equipment.test.js`) |
| **RN17** | Objeto bloqueado não gera leituras/alertas, suspende alertas ativos e preserva OS em andamento; desbloqueio restaura estado | RF17 / UC15 | CT19, CT20 | **Testado** (`regions-and-equipment.test.js`; integração com gerador na Etapa 5) |
| **RN18** | Alerta passa automaticamente para `Resolvido` quando OS vinculada é `Concluída` | RF11 / UC09 | CT11 | Não iniciado |
| **RN19** | Alerta ativo possui no máximo uma OS em `Aberta`, `Atribuída` ou `Em atendimento` | RF09 / UC07 | CT09 | Não iniciado |
| **RN20** | Inativar região inativa em cascata equipamentos vinculados e registra no histórico | RF03 / UC02 | CT02 | **Testado** (`regions-and-equipment.test.js`) |
| **RN21** | Reatribuição e cancelamento de OS restritos ao Gestor em OS `Aberta` ou `Atribuída`; cancelamento exige justificativa | RF10, RF18 / UC08, UC16 | CT10, CT12 | Não iniciado |
| **RN22** | Cidadão não tem senha; recebe protocolo único para acompanhamento | RF12, RF13 / UC10, UC11 | CT13, CT14 | Não iniciado |
| **RN23** | Tipos permitidos de ocorrência (5 tipos controlados conforme `RN23` e `OD-02`) | RF12 / UC10 | CT13 | Não iniciado |
| **RN24** | Unidade de consumo é `kWh` e leituras são geradas em lote por botão do Gestor | RF05, RF14, RF16 / UC04 | CT04 | **Testado** (Validado na API em `CT04`; UI na Etapa 9) |
| **RN25** | Se OS vinculada a alerta for `Cancelada`, alerta permanece `Ativo` e permite nova OS | RF18 / UC16 | CT12 | Não iniciado |
| **RN26** | Protocolo único (`PROTOCOLO-YYYYMMDDXXXX`); consulta pública exibe apenas status e tipo; CPF é fictício | RF12, RF13, RNF07 / UC11 | CT14 | Não iniciado |
| **RN27** | Bloqueio de região bloqueia em cascata equipamentos Ativos; só Ativos podem ser bloqueados; desbloqueio exige só confirmação | RF17 / UC15 | CT18, CT20 | **Testado** (`regions-and-equipment.test.js`) |
| **RN28** | Consumo abaixo é desvio percentual negativo em relação ao esperado $E$ | RF06 / UC05 | CT05 | **Testado** (`anomalies-and-readings.test.js`) |
| **RN29** | Coordenadas geográficas simuladas fixas exibidas com Leaflet.js e OpenStreetMap | RF15 / UC13 | CT21 | Não iniciado |
| **RN30** | Gestor e Técnico autenticam-se com sessão no servidor; Cidadão sem login; persistência em SQLite | RF01, RNF02, RNF18 | CT01, CT17 | **Testado** (Validado em `auth-and-rbac.test.js`) |

---

## 4. Casos de Teste (`CT01` a `CT26`)

| ID | Título do Caso de Teste | Nível | Candidato à Automação | Situação |
|---|---|---|---|---|
| **CT01** | Autenticação, controle de acesso e armazenamento de senha | Integração, Sistema, Aceitação | SIM (Cypress E2E/API + `tests/unit/auth-and-rbac.test.js`) | **Testado** (Validado na API/Banco em `auth-and-rbac.test.js`; E2E UI na Etapa 10) |
| **CT02** | Inativação de região e inativação em cascata dos equipamentos | Sistema, Aceitação | SIM (Cypress E2E/API + `regions-and-equipment.test.js`) | **Testado** (Validado na API/Banco; E2E na Etapa 10) |
| **CT03** | Validação do consumo esperado e de entrada de texto (SQLi) | Integração, Sistema, Aceitação | SIM (Cypress E2E/API + `regions-and-equipment.test.js`) | **Testado** (Validado na API/Banco; E2E na Etapa 10) |
| **CT04** | Geração em lote, origem simulada e resiliência à falha do gerador | Integração, Sistema, Aceitação | SIM (Cypress E2E/API + `anomalies-and-readings.test.js`) | **Testado** (Validado na API/Banco em `anomalies-and-readings.test.js`; E2E na Etapa 10) |
| **CT05** | Detecção de anomalias e severidade por análise de valor-limite | Unidade, Aceitação | SIM (Unidade `anomalies-and-readings.test.js` / Cypress `cy.task`) | **Testado** (Todos os 14 valores limites validados em `anomalies-and-readings.test.js`) |
| **CT06** | Caixa-branca do módulo de regras: comandos, decisões, determinismo, isolamento e configuração | Unidade, Integração Estrutural | SIM (Unidade `anomalies-and-readings.test.js` / Cypress `cy.task` + `nyc`) | **Testado** (Caminhos P1–P6, determinismo 100x, isolamento e `LIM_SUP=15%` validados; cobertura `nyc` na Etapa 10) |
| **CT07** | Atualização de alerta ativo sem duplicação | Integração | SIM (Cypress API) | Não iniciado |
| **CT08** | Filtros de alertas e identificação textual/visual da severidade | Sistema, Aceitação | SIM (Cypress E2E) | Não iniciado |
| **CT09** | Abertura de OS por alerta, ocorrência e registro manual | Integração, Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT10** | Atribuição/reatribuição de OS e autorização por perfil (privacidade LGPD) | Integração, Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT11** | Atendimento e encerramento de OS com solução (Técnico atribuído e Gestor) | Integração, Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT12** | Cancelamento de OS e preservação do alerta vinculado | Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT13** | Registro de ocorrência pelo Cidadão e medição de até três interações | Sistema, Aceitação | SIM (Cypress E2E) | Não iniciado |
| **CT14** | Consulta de ocorrência por protocolo e privacidade da resposta | Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT15** | Dashboard: consistência, filtros, estado vazio e desempenho ($\le 3\text{s}$) | Sistema, Aceitação | SIM (Cypress E2E) | Não iniciado |
| **CT16** | Relatório de consumo, agregação, granularidade, CSV e período inválido | Sistema, Aceitação | SIM (Cypress E2E/API) | Não iniciado |
| **CT17** | Persistência de alertas, ocorrências e OS após reinício | Sistema | NÃO (Execução controlada de reinício) | Não iniciado |
| **CT18** | Permissão e validação do motivo para bloquear equipamento (9 vs 10 chars) | Sistema, Aceitação | SIM (Cypress E2E/API + `regions-and-equipment.test.js`) | **Testado** (Validado na API/Banco; E2E na Etapa 10) |
| **CT19** | Efeitos do bloqueio e desbloqueio de equipamento; preservação e auditoria | Integração, Sistema, Aceitação | SIM (Cypress E2E/API + `regions-and-equipment.test.js`) | **Testado** (Validado na API/Banco; E2E na Etapa 10) |
| **CT20** | Bloqueio e desbloqueio de região com cascata para equipamentos | Sistema, Integração, Aceitação | SIM (Cypress E2E/API + `regions-and-equipment.test.js`) | **Testado** (Validado na API/Banco; E2E na Etapa 10) |
| **CT21** | Mapa de ocorrências e informações do marcador | Sistema, Aceitação | SIM (Cypress E2E) | Não iniciado |
| **CT22** | Compatibilidade em Chrome, Firefox e Edge | Sistema | NÃO (Smoke test em navegadores) | Não iniciado |
| **CT23** | Idioma da interface em português do Brasil | Sistema, Aceitação | NÃO / Complementar automatizado | Não iniciado |
| **CT24** | Transparência da simulação e origem das leituras (`SIMULADO`) | Integração, Sistema | SIM (Cypress E2E/API) | Não iniciado |
| **CT25** | Verificação de versionamento e commits de integrantes no GitHub | Aceitação | NÃO (Inspeção documental GitHub) | Não iniciado |
| **CT26** | Indisponibilidade do reset/seed no ambiente normal | Integração, Sistema | SIM (Cypress API + `tests/unit/database.test.js`) | **Testado** (Validado em `tests/unit/database.test.js`) |
