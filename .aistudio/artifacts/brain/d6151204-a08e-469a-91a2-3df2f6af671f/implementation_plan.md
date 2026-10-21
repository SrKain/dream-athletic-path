# TASK-107 — Estabilização do Mailer, Progresso Persistido, Filtros Avançados e Gestão de Coaches

Plataforma resiliente e durável de recrutamento internacional para a agência Go Team Go, desacoplando a execução do Mailer do ciclo de vida da aba do navegador, garantindo transparência operacional auditável, filtros multicritério de orçamento e consulta paginada de histórico no servidor, além de unificar a gestão e interações de coaches na tela de Universidades.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> As seguintes decisões estratégicas foram alinhadas e confirmadas na Fase 1:

- **Orquestração Desacoplada do Navegador**: Implementação de endpoint de worker protegido do lado do servidor (`/api/mailer/worker` ou Server Function idempotente com trigger assíncrono server-side) como despachante autoritativo de rajadas, mantendo o navegador puramente como cliente de visualização, telemetria em polling e emissor de comandos manuais.
- **Transparência de Características Importadas no Histórico**: Novos envios registrarão snapshot imutável das características importadas (`league`, `state`, `budget_level`, `toefl_level`, etc.) na campanha/log. Envios anteriores com vínculo inequívoco com a universidade exibirão o rótulo "Inferido do cadastro atual", e registros sem correspondência exibirão "Não disponível".
- **Sequência de Rollout em Quatro Fases Estritas**:
  1. **Fase 1 (P0)**: Resiliência de execução, isolamento de falhas ambíguas, reconciliação manual e novo dashboard de status/saúde do envio.
  2. **Fase 2 (P1)**: Multi-select de budget no Mailer com semântica OR e persistência no filtro da campanha.
  3. **Fase 3 (P1)**: Histórico completo com paginação real no servidor (25/50/100) e filtros multicritério.
  4. **Fase 4 (P1)**: Aba Coaches em `/admin/universities`, componentes compartilhados com `/admin/coaches`, CRUD com controle de concorrência e timeline completa de interações.

---

### 1. Overview & Core Concept

- **O que faz**:
  - Elimina a dependência de manter a aba do navegador aberta para processar campanhas de e-mail de recrutamento.
  - Oferece visibilidade de estado em tempo real: percentual de conclusão baseado no banco, contagem segregada (`ativos`, `pendentes`, `processando`, `retry`, `aceitos pelo Resend`, `suprimidos`), tempo decorrido, último avanço, próximo lote e estimativa honesta (ETA).
  - Previne disparos duplicados colocando em quarentena (`reconciliation_required`) qualquer caso de aceite incerto ou falha de rede pós-chamada ao Resend, bloqueando auto-retentativas cegas.
  - Permite aos consultores filtrar o Mailer selecionando qualquer combinação das 4 faixas de orçamento cadastradas (`0–1000`, `1000–5000`, `5000–10000`, `10000+`).
  - Permite auditar todo o histórico de envios sem o teto de 100 registros, com paginação real e filtros de características importadas.
  - Integra a visualização e gestão de contatos de técnicos universitários diretamente na tela de Universidades em aba própria, preservando a rota `/admin/coaches` e o modal de cadastro.
- **Público-alvo**: Administradores e consultores da agência Go Team Go (`agency_admin`).
- **Valor agregado**: Confiança operacional em envios de grande escala (300 a 3.300 destinatários), redução drástica de erros humanos e facilidade de pesquisa de técnicos e históricos de comunicação.

---

### 2. User Experience & Visual Design

Seguindo as diretrizes de `UI&UX.md` e do guia de SaaS & Dashboards (`references/3_saas_dashboard.md`):
- **Cores & Densidade**: Paleta 60-30-10 OKLCH com fundo off-white editorial, superfícies de cards limpos com borda sutil de 1px (`border-slate-200 dark:border-neutral-800`), verde esmeralda (`#061b13` / `--primary`) para ações afirmativas e semântica estrita para status (verde: ativo/concluído, âmbar: cooldown/retry, vermelho: quarentena/erro).
- **Semântica Visual & Tipografia**: Proibição de fake pills em metadados estáticos. Uso de texto limpo com separadores tipográficos (`·`). Números e contadores com `font-mono tabular-nums` para evitar oscilações visuais de layout.
- **Controles de Multi-Select (Budget)**:
  - Trigger em botão de seleção elegante com contador de faixas selecionadas (ex.: `Orçamento: 2 selecionadas` ou `Todas as faixas`).
  - Popover acessível contendo checkboxes com touch targets $\ge 44\text{px}$, opções de atalho `"Selecionar todas"` e `"Limpar"`, mantendo sincronia com a contagem de destinatários filtrados.
- **Dashboard Operacional de Envio (Mailer)**:
  - Header informativo com ID curto da campanha, tipo de envio (single, multi, catalog), indicador de saúde em badge acessível e texto orientador em linguagem humana clara.
  - Barra de progresso contínua com duplo indicador visual: aceitos pelo provedor vs. total terminal (enviados + falhados + cancelados) sobre destinatários ativos.
  - Tabela paginada e filtrável de destinatários da campanha em execução, exibindo status individual de cada contato, tentativas e fase do provedor.
  - Ações operacionais: `Pausar`, `Retomar` (habilitado apenas se elegível), `Cancelar` (com diálogo de confirmação), `Atualizar` e `Revisar incidente` quando em quarentena.
- **Aba Coaches em Universidades**:
  - Abas superiores limpas: `[Universidades]` | `[Coaches]`.
  - Tabela de técnicos de alta densidade (36–44px por linha) com busca, filtros por universidade, estado, liga, cargo e status de supressão/preferência.
  - Gaveta (*drawer*) ou modal de perfil do coach com ficha de contato, histórico cronológico de e-mails recebidos, cliques/aberturas e gestão de sinais de recrutamento.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Servidor como Autoridade Exclusiva da Fila**:
  - *Abordagem*: O processamento do lote é desencadeado no servidor. O cliente pode acionar um tick de aceleração quando aberto, mas caso a aba feche, a campanha continua elegível e seu progresso é preservado e retomado sem perda de integridade.
  - *Trade-off*: Evita a necessidade de serviços externos pesados de fila (como RabbitMQ ou SQS), alavancando a infraestrutura de banco já existente com `mailer_queue` e locking seguro via lease.
- **Decisão 2: Quarentena Inegociável para Respostas Ambíguas do Resend**:
  - *Abordagem*: Se uma chamada HTTP à API do Resend sofrer timeout ou retornar erro de persistência pós-resposta, o item é marcado como `reconciliation_required` e a campanha entra em quarentena.
  - *Trade-off*: Exige intervenção humana/verificação para destravar, mas **elimina 100% o risco de disparar e-mails duplicados** para técnicos universitários, preservando a reputação de domínio da agência.
- **Decisão 3: Normalização de Filtro de Budget em Array de Strings**:
  - *Abordagem*: Persistência no campo `filters` de `mailer_campaigns` como `budgetLevels: string[]`. Leitura retrocompatível com a chave legada `budget: string`.
  - *Trade-off*: Sem faixas selecionadas equivale a todas as faixas (sem restrição). Uma ou mais selecionadas aplicam disjunção (OR) estrita, respeitando os 4 valores canônicos.
- **Decisão 4: Reutilização Modular sem Duplicação de Código entre Rotas**:
  - *Abordagem*: Extração de componentes especializados (`CoachDirectoryTable`, `CoachFormDialog`, `CoachProfileDrawer`, `CoachPreferencesCard`) utilizados tanto em `/_authenticated/admin/coaches.tsx` quanto na nova aba de `/_authenticated/admin/universities.tsx`.
  - *Trade-off*: Mantém DRY e SOLID sem romper nenhuma URL existente.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER (AGENCY ADMIN)                               │
│  - Mailer Dashboard (Polling / Status / Controls: Pause, Resume, Cancel)         │
│  - Universities Route (/admin/universities -> Tabs: Universities | Coaches)     │
│  - Dedicated Coaches Route (/admin/coaches)                                      │
└───────────────────────┬──────────────────────────────────┬───────────────────────┘
                        │ HTTP / Server Functions          │
                        ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            SERVER RUNTIME (TANSTACK START)                       │
│  - mailer-runner.server.ts (Coordenação de bursts, lease & watchdog)              │
│  - mailer-history.server.ts (Query paginada 25/50/100 & filtros compostos)        │
│  - coach-directory.server.ts (Listagem, normalização e controle de concorrência) │
│  - coach-preferences.server.ts (CRUD de preferências e supressões manuais)       │
└───────────────────────┬──────────────────────────────────┬───────────────────────┘
                        │ Service Role / RPC               │ REST Batch API
                        ▼                                  ▼
┌──────────────────────────────────────────┐     ┌─────────────────────────────────┐
│         SUPABASE EXTERNAL (DB)           │     │          RESEND API             │
│  - mailer_campaigns                      │     │  - Batches de até 100 emails    │
│  - mailer_queue (Status, attempts, lease)│     │  - Idempotency-Key headers      │
│  - recruit_email_logs & email_events     │     │  - Webhooks de entrega/clique   │
│  - universities (coaches JSONB)          │     └─────────────────────────────────┘
└──────────────────────────────────────────┘
```

#### Mapeamento de Entidades e Estados:
- **Subestados Derivados da Campanha**:
  - `scheduled`: aguardando início ou próximo horário (`next_batch_at`).
  - `sending`: worker ativo executando rajada sob lease válido.
  - `waiting_provider`: lote enviado ao provedor aguardando confirmação.
  - `waiting_retry`: lote em cooldown após rate limit (429) ou erro temporário.
  - `reconciliation_required`: quarentena por resposta incerta ou erro transacional.
  - `manual_pause`: pausada pelo usuário.
  - `completed` / `cancelled`: estados finais.
- **Histórico Paginado**:
  - Contrato: `{ items: MailerHistoryItem[], total: number, page: number, pageSize: number, totalPages: number }`.
  - Snapshot de características em `recruit_email_logs.metadata` para novos envios.

---

### 5. Plano de Execução em Fases

#### Fase 1 (P0): Desacoplamento do Mailer, Máquina de Estados e Dashboard de Saúde
1. Criação de `src/lib/email/mailer-runner.server.ts` e refatoração em `mailer-queue.server.ts` para coordenar batches com proteção contra timeout e verificação de lease.
2. Implementação do endpoint de verificação e trigger desacoplado do navegador.
3. Tratamento estrito de quarentena com `reconciliation_required` em casos de ambiguidade do Resend, impedindo retomadas cegas.
4. Refatoração do painel de envio em `src/routes/_authenticated/admin/mailer.tsx` com polling leve (5–10s), métricas auditáveis completas, log de eventos de campanha e ações seguras.
5. Testes unitários de estados, transições, concorrência e quarentena em `src/lib/email/mailer-runner.test.ts`.

#### Fase 2 (P1): Budget Multisseleção
1. Criação do componente `SearchableMultiSelect` ou popover de multi-select com checkboxes e touch targets $\ge 44\text{px}$.
2. Atualização dos filtros em `mailer.tsx` para `selectedBudgetLevels: UniversityBudgetLevel[]`.
3. Validação da lógica OR interna e AND externa combinada com estados, ligas e supressões.
4. Persistência de `budgetLevels` no payload e JSON de filtros da campanha.
5. Testes de filtragem em `src/lib/email/mailer-filtering.test.ts`.

#### Fase 3 (P1): Histórico Completo Paginado e Características Importadas
1. Implementação de `getPaginatedMailerHistoryServerFn` em `recruit-email.functions.ts` suportando `page`, `pageSize` (25/50/100), ordenação estável (`sent_at DESC, id DESC`), e filtros por busca, campanha, status, atleta, universidade e características importadas.
2. Snapshot de atributos nos novos envios e rotulagem clara ("Inferido do cadastro atual" vs. "Não disponível") para registros pré-existentes.
3. Atualização da aba Histórico no Mailer com controles de paginação, contador de total real e estados de loading/empty.
4. Testes de paginação e filtros no servidor.

#### Fase 4 (P1): Aba Coaches em /admin/universities e Unificação da Gestão
1. Criação de componentes compartilhados em `src/components/coaches/`: `CoachDirectoryTable`, `CoachFormDialog`, `CoachProfileDrawer` e `CoachPreferencesEditor`.
2. Adição da aba `Coaches` em `src/routes/_authenticated/admin/universities.tsx`.
3. Refatoração de `src/routes/_authenticated/admin/coaches.tsx` para utilizar os componentes compartilhados.
4. Implementação de controle de concorrência atômico para atualizações no array JSONB `universities.coaches`.
5. Integração da timeline de interações e histórico de e-mails no perfil do coach.
6. Testes unitários para edição de coaches, preferências manuais vs. automáticas e prevenção de conflito.

---

### 6. Critérios de Validação e Aceite

- [ ] **Continuidade**: Campanha segue processando e retoma após fechamento e reabertura da aba ou atualização da página.
- [ ] **Segurança Antiduplicação**: Falhas ambíguas entram em quarentena documentada e não realizam auto-retry.
- [ ] **Observabilidade**: Painel reflete métricas reais de banco (ativos, pendentes, retries, aceitos, suprimidos, cancelados) e ETA honesto.
- [ ] **Budget**: Seleção de qualquer subconjunto das 4 faixas de orçamento reflete exatamente nos destinatários enfileirados.
- [ ] **Histórico**: Listagem paginada (25/50/100) com total correto, filtros funcionais e ausência de dados inventados em envios legados.
- [ ] **Gestão de Coaches**: Aba funcional em `/admin/universities`, compatibilidade integral com `/admin/coaches` e cadastro dentro de Universidade, sem perda ou duplicação de dados.
- [ ] **Qualidade de Código**: `bun run typecheck`, `bun run lint` (0 erros), `bun run test` (todos os testes verdes) e `bun run build` validados com sucesso.
- [ ] **Governança**: `bun.lock`, `package.json` e migrations 0001–0027 mantidos intactos; `CERNE.md` e `BACKLOGER.md` atualizados a cada entrega.
