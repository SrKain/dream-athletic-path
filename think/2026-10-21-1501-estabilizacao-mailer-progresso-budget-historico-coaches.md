# TASK-107 — Plano integrado: continuidade do Mailer, transparência do disparo, filtros e gestão de coaches

- **Data/hora:** 2026-10-21 15:01 (America/Sao_Paulo).
- **Repositório:** `SrKain/dream-athletic-path`; diagnóstico na `main` HEAD `54494b760a253298c8131bceba6715d5edcd33e5`.
- **Solicitante:** Kauan (Usuário Humano).
- **Executor previsto:** Google AI Studio, operando sobre o repositório.
- **Status:** **[PENDENTE — PLANO PUBLICADO PARA APROVAÇÃO HUMANA EXPLÍCITA]**.
- **Natureza deste commit:** documentação apenas; não autoriza implementação, migration, execução de campanha ou envio real.
- **Dependências:** preservar TASK-103 (cards), TASK-105 (texto/preview), TASK-106 (rajadas seguras, leitura completa e migration 0027). Não reimplementar nem desfazer a TASK-106.
- **Governança obrigatória:** `AGENTS.md`, `README.md`, `CERNE.md`, `BACKLOGER.md`, `UI&UX.md` e todos os Markdown de `think/`, especialmente TASK-093/094/103/105/106. Depois da aprovação, atualizar `CERNE.md` e `BACKLOGER.md` ao alterar código; seguir Bun 1.3.14 e CI.

## 0. Diagnóstico baseado no código atual (separar evidência de hipótese)

**Constatações verificáveis:**

1. Em `src/routes/_authenticated/admin/mailer.tsx`, `triggerOrchestratorTick` usa `setTimeout` no navegador e chama `processMailerMicroBatchServerFn`. O próprio painel informa “Mantenha esta aba aberta”. Ao desmontar a página, o timer é cancelado. Portanto o progresso da campanha **depende da presença do cliente**, embora a fila seja persistida no banco. Sem disparador independente, a campanha pode permanecer `running` e não avançar após fechar/suspender a aba, perder rede, desconectar ou encerrar o navegador.
2. A inicialização restaura apenas a campanha mais recente entre `running/queued/paused`; o `useEffect` de orquestração ativa automaticamente somente `running`. Existem estados que não autoavançam. `controllerId` estável apenas durante a vida da aba e lease no servidor pode retardar uma retomada após refresh/mudança de dispositivo. Múltiplas abas usam `BroadcastChannel`, mas o controle real deve permanecer no servidor.
3. `src/lib/email/mailer-queue.server.ts` já tem lease, idempotência, `mailer_burst_ready`, `complete_mailer_burst`, cooldown/retry e pausa para aceitação ambígua/erro de persistência. `resumeCampaign` **bloqueia propositalmente** `last_error` com “Manual reconciliation required”: esse cenário não é “retomar com um botão”; exige reconciliação para evitar duplicidade.
4. `getCampaignQueueProgress` agrega estados, mas a UI depende de ticks para atualizar o painel e não expõe todos os motivos de bloqueio nem “última atividade” confiável. `percentComplete` usa estados finais sobre `total_recipients`; suprimidos são contados separadamente. Não confundir `sent` (aceito pelo provedor) com `delivered` ou `opened`.
5. Filtro de budget em `mailer.tsx`: `filterBudget: string = "all"` com comparação única `item.budgetLevel !== filterBudget`. `BUDGET_LEVELS` em `src/lib/universities-constants.ts`; tipo `UniversityBudgetLevel` em `src/types/db.ts`. Atualmente não permite OR de faixas escolhidas.
6. Histórico do Mailer: `getMailerHistoryServerFn` em `recruit-email.functions.ts` limita a consulta a **100** registros, sem paginação nem filtros do banco; a aba apenas faz `historyLogs.map`. Logo, filtro client-side seria incorreto para todo o histórico.
7. `/admin/universities` lista todas as universidades carregadas com `fetchAllUniversities`, sem paginação de exibição, apesar da TASK-106 ter corrigido a busca acima do limite PostgREST. `/admin/coaches` já possui cadastro/edição, preferências e supressões, mas não pagina e usa filtro simples. `universities.coaches` (JSONB) permanece fonte para Mailer; `public.coaches` é legado.
8. Interações: `recruit_email_logs` armazena envio/provedor; `email_events` contém eventos `delivered/opened/clicked/bounced/complained`, URL clicada e indicador de automação; `getEmailEventTimeline` usa provider ID prioritariamente e consulta até 50 eventos. `coach_interest_signals` e `email_suppressions` já são geridos; não confundir interesse com opt-out.

**Ainda não comprovado:** qual disparo específico parou e por quê; se 0027 e RPCs estão aplicadas no Supabase **de produção**; existência de instabilidades no Resend, Vercel, tokens/sessão, quotas e configurações Cron. Antes de corrigir, coletar evidência somente-leitura (IDs mascarados, status, `last_error`, `next_batch_at`, contagens `pending/processing/retry/sent`, lease, `locked_until`, webhook/logs e deploy SHA). Não acessar nem enviar mensagens sem autorização. Não presumir que “parada” significa erro: pode ser cooldown, pausa manual, quarentena ou limite do provedor.

## 1. Resultado de produto e prioridades

- **P0 — Continuidade e confiança:** campanha continua sem navegador; usuário vê estado verdadeiro, motivo, instante da última atividade, próximo passo e uma ação segura; recuperação automática apenas para casos inequívocos.
- **P1 — Budget de múltipla escolha:** selecionar exatamente qualquer subconjunto das faixas cadastradas no Mailer.
- **P1 — Histórico completo:** filtros por características importadas + paginação real em servidor (25/50/100) com total e navegação.
- **P1 — Universidades/Coaches:** aba Coaches dentro de `/admin/universities` com CRUD adicional, paginação, filtros, perfil com preferências CRUD e histórico de interações. Preservar `/admin/coaches` e cadastro no modal de Universidade.

Entregar em fases integradas com um único contrato de dados, mantendo compatibilidade no rollout. Segurança e correção de fila precedem melhorias cosméticas.

## 2. Entrega A — Estado durável, retomada segura e transparência do Mailer (P0)

### 2.1 Observabilidade e causa-raiz (diagnóstico primeiro)

- Instrumentar `campaignId`, `burstId`, `workerId`, `controllerId`, `leaseUntil`, `lastAttemptAt`, `lastProgressAt`, `nextAttemptAt`, `lastProviderResultAt`, `lastErrorCode`, `failurePhase` e `resumeEligibility` sem expor dados pessoais, IDs completos ou segredos nos logs públicos.
- Inventariar estados reais da tabela, gatilhos SQL/RPC, chamados a Resend, timeouts, `429 Retry-After`, contadores, worker lease e comportamento após fechar/reabrir a aba; reconstruir linha temporal da falha. Checar `0025→0026→0027` e se o endpoint `mailer_burst_ready` funciona em produção. Confirmar relógios (UTC), timeouts e limites do ambiente.
- Registrar eventos operacionais de transição em estrutura append-only (ex.: `mailer_campaign_events`) com `campaign_id`, `event_type`, `reason_code`, `occurred_at`, `worker`, `attempt`, `metadata` saneado e actor. Se migration necessária, criar **novo** arquivo aditivo depois de 0027, com índices, autorização, RLS e rollback; nunca editar migrations aplicadas. Não marcar evento “sent” se a transação falhou.

### 2.2 Eliminar dependência do navegador

**Diretriz arquitetural:** a fila `mailer_queue` e o banco são a fonte de verdade. Extrair de `processMailerQueue` o contrato de execução autenticada do worker. O browser se torna painel de **leitura e comandos**, não responsável por manter o envio vivo.

- **Opção recomendada (validar antes):** agendador durável no Supabase externo (Supabase Cron/pg_cron) aciona worker protegido server-side/Edge Function, que encontra campanhas elegíveis e executa apenas as rajadas vencidas, respeitando `next_batch_at`, lease e configuração de tamanho da TASK-106. Proteção service_role, segredos no Vault e limites do runtime. Supabase Cron pode ter precisão em segundos em versões compatíveis; confirmar versão/Postgres, permissões, quota e telemetria antes de selecionar cadência.
- **Alternativa:** Vercel Cron/worker dedicado, somente se plano contratado e frequência sustentarem a meta. Vercel Cron Pro/Enterprise suporta agendamento no mínimo por minuto; Hobby pode ser limitado a diário. Não alegar rajada automática de 1s com um agendador limitado a 1 minuto. Worker dedicado/infra de fila durável é opção se o requisito de throughput demandar disparos mais frequentes. NÃO introduzir segunda fonte de verdade com PGMQ sem migração explícita aprovada.
- Um único coordenador do lado do servidor deve controlar a elegibilidade; múltiplas invocações são esperadas e devem ser idempotentes. Nunca dar privilégio de service_role ao navegador nem expor endpoint de worker sem verificação de assinatura/autorização. Proteger contra replay, condições de corrida e abuso.
- Reutilizar `claim_mailer_queue_batch`, `complete_mailer_burst` e idempotency keys da TASK-106. Não alterar supressões, ordem dos cards, body HTML/text, tags, `Reply-To`, métricas, links e estratégias seguras de retry por mero refactor. Observar duração P95 da rajada e runtime Vercel/Edge; impor time budget, não usar `sleep` serverless em loop indefinido.
- Inicialização do envio após transação de enfileiramento somente por mecanismo server-side que continue em outros dispositivos. Ao reabrir, usuário readquire o **painel**, não a posse obrigatória do disparo.

### 2.3 Máquina de estados e reconciliação

- Preservar valores existentes do enum SQL (`queued/running/paused/completed/failed/cancelled`) por compatibilidade; criar **subestado derivado e tipado**: `scheduled`, `sending`, `waiting_provider`, `waiting_retry`, `waiting_lease`, `recovering`, `stalled`, `reconciliation_required`, `manual_pause`. Diferenciar status da campanha de saúde do worker e fase do provedor.
- **Recuperação automática permitida:** worker caiu antes de confirmar aceitação; lease expirou; a reserva expirou e o provedor não pode ter aceitado; rate limit expirou; falha transitória não ambígua com idempotência válida. Exigir transições SQL compare-and-swap/lock, guardas de tentativas e auditoria; `recover_stale_mailer_queue_reservations` deve recusar possíveis aceites incertos.
- **Recuperação automática PROIBIDA:** `PROVIDER_AMBIGUOUS`, aceitação Resend sem persistência, divergência de `provider_message_id`, falha de atomicidade dos logs, cancelamento e opt-out. Nesses casos: quarentena, contagens, motivo visível, comando “Revisar incidente” e fluxo administrativo de reconciliação com dupla verificação/registro do resultado. O botão “Retomar” deve ficar desabilitado com explicação até limpar o bloqueio **após** reconciliação documentada; jamais apagar `last_error` para forçar retry.
- Detectar campanhas `running` sem progresso **depois** de `next_batch_at` + tolerância P95 e sem cooldown/lease válido; não confundir espera legítima com travamento. Watchdog auditável tenta reativação segura e alerta quando requer humano. Prevenir falso “completed” com itens `processing/pending/retry` ou ambiguidades.
- Idempotência nas ações Pausar/Retomar/Cancelar com `expectedStatus`, verificação de agência e `campaignId`; reler estado depois da operação. Coerência em concorrência, pausa durante rajada e envio em trânsito.
- Limitar mudanças de schema a migrações aditivas, backup do schema e dry-run/rollback. Revisar restrições da migration 0027 e status de aplicação antes de qualquer deploy. Não editar filas antigas nem reprocessar campanhas existentes automaticamente; requer avaliação e autorização específicas.

### 2.4 Dashboard operacional do envio

- Exibir **sempre**, inclusive após refresh e em outra sessão autenticada, visão de campanhas recentes/ativas e seleção de campanha (não apenas última). Mostrar diferença entre progresso persistido e conexão do navegador.
- Cabeçalho com ID abreviado, nome/assunto, tipo, criado em, horário do último avanço, próximo processamento, saúde (`Em fila / Enviando / Aguardando limite / Tentando novamente / Pausada / Travada / Requer revisão / Concluída / Cancelada`), texto de motivo orientado a ação e badge acessível.
- Métricas mutuamente coerentes: destinatários selecionados, suprimidos (fora da fila), enfileirados ativos, pendentes, processando, aguardando retry, aceitos pelo Resend, falhados e cancelados; `total_active = pending + processing + retry + accepted + failed + cancelled`. Se RPC atual mistura `pending+retry`, detalhar separação em agregação nova sem quebrar consumidores. `sent/accepted` **não é** `delivered`; recebimento, aberturas, cliques, bounce e spam são métricas assíncronas do webhook.
- Barra de progresso por estado terminal (`sent+failed+cancelled` / ativos); destaque `sent/ativos` separado. ETA somente quando amostra suficiente e worker saudável: média móvel das rajadas reais, pausa, cooldown e retries; não prometer horário quando `paused/stalled/reconciliation_required`. Mostrar `Atualizado há ...` e aviso de dados antigos.
- Lista/Tabela de destinatários da campanha paginada com fase e erros sanitizados (sem conteúdo sensível), ordenação e filtro por status, opção de visualizar histórico de um endereço. Timeline operacional de eventos de campanha. Atualização/polling **read-only** de 5–15s com backoff e atualização imediata após comandos; sem disparar e-mails a partir de polling.
- Controls `Pausar`, `Retomar` (somente elegível), `Cancelar`, `Atualizar`, `Ver motivo`, `Revisar incidente`, com bloqueios claros, feedback, confirmação para irreversíveis, acessibilidade `aria-live`, dark/light e 360px conforme `UI&UX.md`.

## 3. Entrega B — Budget multisseleção no Mailer (P1)

- Trocar `filterBudget: string` por `selectedBudgetLevels: UniversityBudgetLevel[]` ou `ReadonlySet<UniversityBudgetLevel>`, com componente multi-select acessível (checkbox em popover com “Selecionar todas”, “Limpar”, contador e chips removíveis; mobile min 44px; navegação por teclado).
- Faixas existentes **não** serão renomeadas: `0–1000`, `1000–5000`, `5000–10000`, `10000+`. Tratar valores como categorias importadas, **não** converter para comparação numérica sobreposta e não criar novas bandas. `null` só entra sem filtro; filtro ativo exclui `null`, salvo opção futura explícita “Sem orçamento informado”.
- Sem faixas selecionadas = **todas as faixas** (sem filtro), estado `Todos`; uma ou mais = OR dentro do campo (`includes(item.budgetLevel)`); combinar por AND com Estado/Liga/HBCU/TOEFL/busca e supressões.
- Preservar seleção manual de destinatários e política existente de “Selecionar todos filtrados”; ao trocar budget, não apagar seleção manual silenciosamente; mostrar contadores “visíveis / selecionados fora do filtro / suprimidos” e pré-confirmação exata do público a enfileirar.
- Persistir o filtro aplicado em `mailer_campaigns.filters` como `budgetLevels: string[]` com normalização/validação do servidor; compatibilidade de leitura para `filters.budget: string` legado, sem refazer campanhas anteriores. Testar ordem, OR/AND, limpar, nulidade e interação com busca.

## 4. Entrega C — Histórico completo, características importadas e paginação (P1)

- Remover a dependência de `getMailerHistoryServerFn` com `.limit(100)` como fonte única. Criar serviço de consulta **paginada no servidor** sob `requireAgency`, contrato `{items,total,page,pageSize,appliedFilters,hasNextPage}`; tamanhos permitidos `25|50|100`, default 25, página >=1, ordenação estável `sent_at DESC,id DESC`; filtro e total calculados sobre conjunto inteiro **antes** do `range`. Resetar página a 1 quando qualquer filtro mudar. Debounce na busca e cancelamento de requisições obsoletas.
- Filtros combinados: busca nome/e-mail/assunto/universidade; intervalo de datas; campanha; tipo (single/multi/catálogo); status; atleta; universidade; **características importadas** `state,city,league,is_hbcu,budget_level,toefl_level` e cargo do coach (quando disponível). Mesma semântica AND entre dimensões e, onde aplicável, OR entre valores da mesma dimensão. Opções provenientes de enum/dados existentes, não de placeholders.
- Atenção histórica: `recruit_email_logs` registra `university_name` e `recipient_email`, mas não comprova o estado/league/budget importado **no momento do envio**. Para novos envios, criar snapshot mínimo somente leitura de filtros/características usadas no registro associado ao envio/campanha (aditivo, IDs canônicos e proveniência); para históricos antigos, oferecer `características atuais da universidade (inferidas)` somente quando vínculo inequívoco, com rótulo explícito, e `não disponível` quando ambíguo. Nunca atribuir histórico pelo nome/email isolado sem controle de homônimos e mudança de cadastro.
- Se `recruit_email_logs` e `email_events` forem grandes, criar índices compostos adequados às consultas reais via migration aprovada, e considerar view/RPC paginada `security invoker` ou serviço servidor que junta dados com batch e cache curto; evitar `select("*")`/N+1. Preservar histórico de sent/failed/suppressed e `provider_id`; timeline por provedor quando existir.
- UI: filtros com `Limpar filtros`, quantidade exata `Mostrando 26–50 de 1380`, paginação anterior/próxima e controle 25/50/100; estados loading/empty/error/retry; compactação para cartões no mobile; filtros no URL quando viável; não carregar 3.000 registros no navegador só para paginar.

## 5. Entrega D — Aba Coaches em /admin/universities: cadastro, preferências, histórico (P1)

- Adicionar duas abas claras em `/_authenticated/admin/universities.tsx`: `Universidades` e `Coaches`. **Não remover** o cadastro/edição de coaches no formulário de Universidade **nem** a rota `/admin/coaches`; inserir/editar por qualquer entrada usa um único serviço, componentes de formulário e validações compartilhados.
- Reutilizar a lógica de `src/routes/_authenticated/admin/coaches.tsx`, extraindo componentes `CoachDirectory`, `CoachForm`, `CoachProfileDrawer`, `CoachPreferencesEditor` e hooks/serviços específicos. Evitar duplicar JSX, regras de permissão e `universities.coaches`; componente comum deve servir a aba e rota legada. Preservar associação manual de `public.coaches` legados sem conversão destrutiva.
- Listas `Universidades` e `Coaches`: paginação 25/50/100 (25 padrão), filtros antes da página, total real, busca, ordenação estável, URL/tab persistida, seleção clara e não depender só de carregamento parcial. Filtros coaches: universidade, nome, e-mail, estado, cidade, liga, HBCU, budget, TOEFL, função/cargo, com/sem preferência, estado de supressão, última interação. Não inferir “engajado” de abertura por bot.
- Perfil do coach mostra dados de contato/afiliação, preferências de recrutamento (`fully_recruited`, `position_not_needed`, `other_positions_only`, `specific_athlete_dislike`) e comunicação (pause `temporary_6m` vs bloqueio `permanent`), ativas/expiradas, origem, data e observações, e ações `adicionar/editar/encerrar`.
- O CRUD de preferências deve reutilizar `getCoachPreferencesServerFn`, `addCoachPreferenceSignalServerFn`, `closeCoachPreferenceSignalServerFn`, `setCoachSuppressionServerFn`, `removeManualCoachSuppressionServerFn`; como hoje não há edição geral de sinal, propor **endpoint administrativo novo** de edição restrito a sinais manuais, com validação `reason/position/athlete_id/notes/expires_at`, audit trail e version check. Sinais capturados de webhook/evento não devem ser editados como se fossem manuais. Supressão originada de unsubscribe/complaint não pode ser removida via interface. Sinais de fit **não** são opt-out.
- Interações: unir envios `recruit_email_logs` e `email_events` por `provider_email_id` e/ou `campaign_id`/vínculo canônico; para o coach, permitir timeline por campanha/envio com `enfileirado, aceito, entregue, aberto, clicado (URL), bounce, reclamação, falha, descadastro`, hora, assunto, atleta e canal. Sinalizar cliques/aberturas prováveis de bot; “não houve evento” ≠ não leu. Páginas de eventos/encaminhamentos devem ser paginadas, não limitadas silenciosamente a 50. Garantir que e-mails compartilhados ou alterados não mesclem pessoas sem confirmação; preservar associação ao endereço usado **na data do envio**. Respeitar retenção de dados e LGPD.
- Manter como canônico `universities.coaches` JSONB no curto prazo, mas mudanças no array inteiro podem causar lost updates. Implementar comandos atômicos/controle otimista (ID do coach + universidade + `updated_at/version`, CAS ou RPC SQL restrita) e mensagem de conflito, sem recriar IDs nem descartar outros coaches. Se normalização `coaches` em tabela for necessária mais tarde, apresentar **migration separada** com mapeamento/deduplicação, backfill verificável e plano de rollback, nunca fazer big bang nesta entrega.
- Acesso: somente `agency_admin`, autenticação no servidor, RLS e menor privilégio. Não expor PII no painel público, não fazer busca de dados por email arbitrário para visitantes, logs sem e-mails completos, validação server-side, auditoria de alterações e dos bloqueios de comunicação. Mobile-first, rótulos em pt-BR coerentes e a11y.

## 6. Arquitetura SOLID, módulos previstos e contratos

- **SRP:** `mailer-campaign-repository.server.ts` (dados/contagens), `mailer-runner.server.ts` (coordena worker), `mailer-health.ts` (função pura de saúde), `mailer-campaign-service.server.ts` (comandos/transições), `mailer-history.server.ts` (query paginada), `mailer-filtering.ts` (semântica de filtros), `coach-directory.server.ts`, `coach-preferences.server.ts`, `coach-interactions.server.ts`; UI em componentes sob `src/components/` e hooks com nomes semânticos. Nomes sugeridos: adaptar aos padrões reais.
- **OCP/DIP:** contratos tipados para `QueueWorker`, `CampaignRepository`, `Scheduler`, `HistoryQuery`, `CoachRepository`, `ProviderDelivery`, com injeção de interfaces para testes; não vincular lógica de domínio diretamente ao Supabase SDK/Resend no JSX.
- **LSP/ISP:** evitar interface monolítica; operações `readProgress`, `runEligibleBurst`, `changeCampaignState`, `listHistory` isoladas. As implementações de teste e produção devem seguir idênticas pré/pós-condições de transição, contagem e idempotência.
- Validação tipada `zod` já disponível; `requireAgency` para funções administrativas; componentes UI sem secrets/service_role. Eventos assinados/campanha e cursor estáveis; não adicionar scheduler concorrente sem desligar a autoridade do navegador.
- Candidatos de integração: `src/lib/email/mailer-queue.server.ts`, `recruit-email.functions.ts`, `mailer-metrics.server.ts`, `src/routes/_authenticated/admin/mailer.tsx`, `coaches.tsx`, `universities.tsx`, `src/types/db.ts`, `src/lib/universities-fetch.ts`, migrations aditivas posteriores a 0027 e testes. Não tocar templates de e-mail da TASK-105 exceto se um teste provar necessidade.

## 7. Entrega e governança por fases (um plano, gates explícitos)

**Fase 0 — Evidência e design:** diagnosticar campanhas afetadas e schema live somente-leitura; registrar matriz de causa/impacto, ADR escolhendo scheduler/worker e alternativas, contrato API, pontos de rollback, custos/limites; propor migrations. Não mudar produção sem aprovação.
**Fase 1 — P0:** worker durável, recuperação com guardas, watchdog, telemetria de campanha, testes e dashboard. Feature flag `MAILER_SERVER_ORCHESTRATION` e kill switch de envio; iniciar em staging/sandbox e validar sem coach real.
**Fase 2 — P1 filtros:** budget multi e histórico paginado com snapshots/legados bem marcados; verificar consistência de contagem/seleção.
**Fase 3 — P1 coaches:** aba em universities, componentes comuns com /coaches, paginação/filtros, perfil com preferências e timeline.
**Fase 4 — Integração/rollout:** CI, segurança, testes end-to-end com mocks, smoke autorizado com destinatários internos e liberação gradual, monitoramento P95/cooldowns/erros e rollback sem reenvio.

Uma entrega consolidada **após cada etapa testada**, não muitas microversões editoriais. Cada fase deve incluir `CERNE.md` e `BACKLOGER.md` vivos. A TASK-107 só pode ser `[CONCLUÍDO]` após critérios de aceite e CI verde. `package.json`, `bun.lock`, migrations já aplicadas e histórico git Lovable são protegidos. Qualquer dependency upgrade requer necessidade demonstrada e autorização, com Bun 1.3.14.

### Matriz obrigatória de testes (Vitest, sem rede/Resend real)

- **Continuidade/estado:** aba fechada, PC suspenso, reconexão, troca de dispositivo, deploy/restart da função, runner concorrente, lease expirado, repetição Cron, `queued` remanescente, worker exceção/timeout, 429/cooldown, stop manual, cancelamento in-flight, 0027 ausente, inconsistência de contagem, Resend aceita + DB falha, resposta ambígua, provider ID divergente, bloqueio de retomar, reconciliação manual documentada, nunca duplicar e-mails.
- **Progresso:** fonte DB, `sent ≠ delivered`, contagem de suprimidos fora da fila, percentuais para 0/1/300/799/3300 destinatários, falhas/retries/pending, ETA sem amostra e pause, heartbeat obsoleto, outras abas, indicadores acessíveis e refresh.
- **Budget:** 0/1/2/4 faixas, OR dentro/AND fora, budget nulo, clear/all, filtros combinados, seleção manual fora da vista, snapshot nos filtros da campanha, valores legados.
- **Histórico:** 0/24/25/26/50/51/100/101/>1000 registros, total, página inválida, sort/id estável, busca Unicode, filtros cruzados e snapshots importados, legado sem correspondência, duplicata de email/homônimo, filtro antes da paginação, acesso não autorizado.
- **Coaches:** paginação, criação e edição em três pontos (aba, rota dedicada, modal Universidade), concorrência JSONB e conflitos, regras de preferência/manual versus unsubscribe, preferência expirada, telefone/role, email alterado, histórico de eventos com provider ID, clique de bot, duplicação entre universidades, performance >3.000 coaches, a11y/mobile.
- **Regressão:** preservar TASK-103/105/106, links de unsubscribe/not a fit/assinatura, Supressões, snapshots HTML/text, idempotência, rate limit, webhooks, métricas e migração 0027.
- **Comandos CI com Bun 1.3.14:** `bun install --frozen-lockfile`; `git diff --exit-code -- package.json bun.lock` quando não autorizado; `bun run typecheck`; `bun run lint`; `bun run test`; `bun run build`; `git diff --check`. Reportar cada resultado e Vercel/Supabase deploy pelo SHA correto. Falha = TASK-107 pendente.

### Critérios de aceite de negócio

1. Campanha segue processando ou recupera automaticamente com navegador fechado (em ambiente com scheduler suportado); operações idempotentes e seguras, sem envios duplicados. Suspensões deliberadas/ambiguidades não são forçadas a retomar.
2. Painel mostra números e estado persistidos, último avanço, motivo/etapa de bloqueio, próxima tentativa, ETA honesto, timeline e comando correto, mesmo após atualizar a página/outro dispositivo.
3. Budget permite qualquer combinação exata de faixas importadas e público confirmado corresponde ao público enfileirado; sem quebra de seleção, supressões ou relatórios.
4. Histórico retorna páginas de 25/50/100 com total e filtros efetivos sobre todos os registros; dados importados históricos não são inventados.
5. Nova aba Coaches em /admin/universities, com paginação, filtros, CRUD compartilhado com o fluxo antigo, preferências adicionáveis/editáveis/encerráveis sob regras de segurança, histórico de envios e interações correto.
6. `/admin/coaches` e cadastro de coaches dentro de Universidade continuam funcionais, sem perda/duplicidade de dados.
7. Sem alteração de campanhas preexistentes, migração de dados em produção ou envio real antes da aprovação e do procedimento de rollout. CI, segurança, governança e documentação em conformidade.

## 8. Riscos, trade-offs e contingência

- **Scheduler:** Supabase Cron oferece subminuto em versões compatíveis, mas não assumir que plano/versão/latência atuais permitem 1 segundo; confirmar. Vercel Cron pode ser insuficiente para throughput da TASK-106. Proteção do worker contra origem não autorizada e duplicação é prioritária.
- **Quarentena:** ausência de reenvio automático em aceitação ambígua protege a reputação e a privacidade dos coaches; fluxo de reconciliação manual é necessário e visível.
- **Migração/integridade:** snapshot de características importadas nos novos logs não pode ser reconstruído com certeza para logs antigos; rótulos claros, contagem estável e nenhuma inferência silenciosa.
- **JSONB concorrente:** mudança do array inteiro de coaches pode sobrescrever edições paralelas; CAS/RPC atômica é requisito.
- **Escala/custos:** consultas paginadas e índices observados são obrigatórios antes de produção; retenção e mascaramento de dados de interação conforme LGPD.
- **Rollback:** feature flag mantém executante único; desligar scheduler e retornar à versão anterior **somente** após verificar estado das reservas/in-flight, sem reapresentar aceites incertos ao Resend. Backup lógico e script de reversão de novas estruturas, nunca drop imediato de histórico.

## 9. Instrução de execução para Google AI Studio

> Leia `AGENTS.md`, `README.md`, `CERNE.md`, `BACKLOGER.md`, `UI&UX.md` e **todo** `think/`. Use este plano TASK-107 como contrato, com especial atenção à TASK-106 e à migration 0027. **Não modifique código até a aprovação explícita do usuário humano deste plano.** Execute diagnóstico read-only, apresente riscos/ADR de worker, e depois implemente as fases do plano com SOLID, server-side authoritative state, idempotência, RLS e UI mobile-first. Não reenvie campanhas antigas nem use coaches reais em testes. Preserve os sistemas existentes e reporte os testes, migrações, rollouts e critérios de aceite por fase.


## 10. Aprovação humana da Fase 1 — 21/10/2026
- **Aprovada explicitamente pelo solicitante neste atendimento:** correção do CI e implantação de resiliência P0, diretamente na `main`, sem PR ou branch.
- **Não autorizados:** disparos reais, alteração de registros de produção ou ativação de infraestrutura (Supabase Cron, Edge Functions, agendadores, migrations de produção). Testes somente com mocks/fakes.
- Execução por etapas documentadas em `CERNE.md` e `BACKLOGER.md`; somente considerar a fase validada após CI Bun 1.3.14 verde e testes de regressão.
