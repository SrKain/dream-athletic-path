# Reconciliação do Schema do Mailer (0029), Snapshot FK/Colunas, Parse de Bounce Stats e Orquestração pelo Navegador

Reconciliação definitiva do schema do Mailer através da migration autossuficiente `0029_mailer_schema_reconcile.sql`, correção da ordem de inserção da campanha/snapshot e colunas reais, parse defensivo do objeto de métricas de bounce e preservação da orquestração guiada pelo navegador (browser-driven) com Web Worker e lotes de 100 via Resend.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Ordem de Implantação e Verificação no Supabase Externo**:
>
> 1. Executar `db/migrations/0029_mailer_schema_reconcile.sql` no Supabase SQL Editor.
> 2. Executar `db/migrations/verify-0029.sql` no Supabase SQL Editor e certificar-se de que todas as 5 checagens retornam `true`.
> 3. Subir o deploy do código da aplicação na branch `main` com `bun.lock` e `package.json` intactos.
> 4. Testar em modo seguro via toggle **"Modo Ensaio (Dry-Run)"** no painel de `/admin/mailer` antes de qualquer envio de produção.

- **Autossuficiência da Migration 0029**: A migration 0029 não depende da 0028 e substitui integralmente suas definições. Não há blocos com `EXCEPTION WHEN OTHERS THEN NULL` que engulam erros.
- **Ordem de Inserção**: O snapshot referencia `mailer_campaigns(id)` como chave estrangeira. A campanha (status `"draft"`) é inserida primeiro e o snapshot depois, com rollback automático caso o snapshot falhe.
- **Parse do Bounce Stats**: O RPC `mailer_campaign_bounce_stats` retorna um objeto `jsonb` (não array) contendo `bounce_guard_triggered: boolean`. O código cliente e servidor trata o retorno como objeto, mapeando `permanent_bounces` e `complaints` para a interface da UI.
- **Orquestração pelo Navegador**: Permanece 100% controlada pelo navegador via Web Worker inline (Blob), Screen Wake Lock API, lease de 30s em `sessionStorage` e micro-lotes de 100 por tick (1 chamada `resend.batch.send` por tick). `serverOrchestration` permanece desligado por padrão.

---

## 1. Overview & Core Concept

- **O que faz**: Restaura o envio confiável de e-mails em massa pelo Mailer para até milhares de destinatários sem falhas de banco ou travamentos de fila, garantindo que o navegador realize os ticks de disparo de forma resiliente e que o banco de dados Supabase persista os resultados atomicamente através da RPC `complete_mailer_burst`.
- **Público-alvo**: Administradores da agência esportiva (perfil `agency_admin`) que realizam disparos em massa de recrutamento para técnicos universitários americanos (NCAA, NAIA, NJCAA).
- **Valor central**: Eliminação de erros 500 no PostgREST, integridade estrita de chave estrangeira, proteção de reputação com semáforo de bounce ao vivo e prevenção de regressões por testes automatizados de contrato de schema.

---

## 2. User Experience & Visual Design

- **Composição & Enfileiramento**:
  - Na tela `/admin/mailer`, a agência seleciona atletas e filtros de universidades.
  - Ao clicar em "Disparar Mailer", a UI valida os dados e aciona o enfileiramento em 3 fases (`createCampaignDraft` → `appendCampaignRecipients` → `activateCampaign`).
  - O rascunho temporário (`draft`) nunca polui a interface de monitoramento nem a lista de campanhas recentes até ser ativado.
- **Monitor ao Vivo no Navegador**:
  - Ao iniciar os disparos (`status = 'running'`), o Web Worker assume os ticks a cada 1.2s.
  - O painel exibe barra de progresso percentual, contadores dinâmicos (Total, Enviados, Falhas, Na Fila), ritmo medido (e-mails/s) e indicador de tempo restante estimado (ETA).
  - Badge visual `DRY RUN` em âmbar caso o modo de ensaio esteja ativo.
- **Semáforo de Reputação & Bounce Guard**:
  - Cartão de saúde em tempo real:
    - **Verde (< 2.0%)**: Reputação saudável.
    - **Amarelo (2.0% – 3.0%)**: Alerta de atenção.
    - **Vermelho (> 3.0% com mínimo de 20 envios)**: Interrupção automática da campanha para preservar o domínio contra bloqueios no Resend.
  - Se a consulta do bounce falhar por instabilidade transitória, o sistema opera em fail-open com aviso no console, exceto quando a guarda estiver explicitamente acionada.
- **Ações de Controle da Fila**:
  - Botão de ação "Pausar", "Retomar", "Cancelar" e o botão "Destravar Fila / Sincronizar Navegador" que reconcilia reservas `processing` órfãs com segurança.

---

## 3. Key Product Decisions & Trade-Offs

- **Substituição da Migration 0028 pela 0029**:
  - _Abordagem_: Criar `0029_mailer_schema_reconcile.sql` consolidando todas as estruturas da 0028 de forma corrigida e limpa, e manter o arquivo da 0028 apenas com comentário de depreciação.
  - _Motivo_: A 0028 nunca foi aplicada com sucesso em produção devido a erros em cascata mascarados por blocos de exceção. A 0029 é autossuficiente e roda diretamente em qualquer banco que esteja na versão 0027.
- **Ordem de Inserção e Rollback Manual**:
  - _Abordagem_: Em `createCampaignDraft`, inserir a campanha antes do snapshot. Caso o snapshot falhe, executar `DELETE FROM mailer_campaigns WHERE id = campaignId`.
  - _Motivo_: Respeita a integridade referencial da FK `mailer_campaign_snapshots_campaign_id_fkey` sem necessidade de remover a constraint de chave estrangeira, mantendo a consistência do modelo de dados.
- **Leitura de Snapshot O(1) sem Ordenação Fantasma**:
  - _Abordagem_: Como `campaign_id` é a Primary Key de `mailer_campaign_snapshots`, existe no máximo 1 snapshot por campanha. Consultar diretamente `.select("snapshot").eq("campaign_id", campaignId).maybeSingle()`.
  - _Motivo_: Elimina o erro PostgreSQL `column "version" does not exist` e `column "snapshot_data" does not exist`.
- **Assinatura e Gate de Segurança em `mailer_burst_ready`**:
  - _Abordagem_: O gate `mailer_burst_ready()` não aceita mais apenas o nome da função no `information_schema.routines`, mas confere especificamente `pg_proc.pronargs = 7` para `complete_mailer_burst` e inspeciona se a constraint de status contém `'draft'`.
  - _Motivo_: Impede que a versão antiga 0027 dê permissão falsa de disparo para o worker.

---

## 4. Technical Architecture & Data Strategy

### Diagrama de Orquestração e Persistência

```
┌────────────────────────────────────────────────────────────────────────┐
│                   NAVEGADOR DO USUÁRIO (Admin UI)                      │
│                                                                        │
│  [UI State: mailer.tsx]                                                │
│         │                                                              │
│         ├── (1) Enfileiramento 3 Fases: createDraft -> append -> activate  │
│         │                                                              │
│         ├── (2) Web Worker (Blob) + Screen Wake Lock + beforeunload    │
│         │                                                              │
│         └── (3) Ticks periódicos: processMailerMicroBatchServerFn(100) │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTP / Server Function (TanStack Start)
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       BACKEND SERVERLESS                               │
│                                                                        │
│  [mailer-queue.server.ts]                                              │
│         │                                                              │
│         ├── Gate 1: mailer_burst_ready() == true? (0029 verificado)     │
│         ├── Gate 2: claim_mailer_queue_batch(worker_id, 100, camp_id)  │
│         ├── Gate 3: Render sob demanda ('at_send' via snapshot)        │
│         │                                                              │
│         ├── Despacho:                                                  │
│         │     • Se dry-run: FakeMailProvider (IDs 'dry_<uuid>')        │
│         │     • Se real: ResendMailProvider (resend.batch.send)        │
│         │                                                              │
│         └── Persistência Atômica: complete_mailer_burst (7 argumentos)  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ SQL RPC via Supabase JS
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   SUPABASE POSTGRESQL (Produção)                       │
│                                                                        │
│  • public.mailer_campaigns (status: 'draft', 'running', ...)          │
│  • public.mailer_campaign_snapshots (FK: campaign_id, snapshot jsonb)  │
│  • public.mailer_queue (FOR UPDATE SKIP LOCKED, purga html/text)       │
│  • public.recruit_email_logs (audit log - ignorado em dry-run)         │
│  • public.email_suppressions (pré-filtragem via RPC filter_suppressed) │
│  • public.email_events (cálculo de bounce stats em tempo real)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Plano de Entrega por Módulos

### Bloco A — Migration `0029_mailer_schema_reconcile.sql` e Script de Verificação

- Criar `db/migrations/0029_mailer_schema_reconcile.sql`:
  - Recriar `mailer_campaigns_status_check` com: `draft`, `preparing`, `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.
  - `CREATE TABLE IF NOT EXISTS public.mailer_campaign_snapshots` (`campaign_id` PK/FK ON DELETE CASCADE, `schema_version`, `snapshot`, `created_at`).
  - `CREATE TABLE IF NOT EXISTS public.mailer_domain_checks` (`domain` PK, `has_mx`, `checked_at`).
  - RLS e Grants para ambas as tabelas (restritas a `is_agency_admin()`, grants a `authenticated, service_role`).
  - RPC `filter_suppressed_emails(p_emails text[])` retornando `TABLE(suppressed_email text, reason text, suppression_type text)`.
  - RPC `mailer_campaign_bounce_stats(p_campaign_id uuid)` retornando jsonb com `bounce_guard_triggered` (`v_sent_count >= 20 AND v_bounce_rate > 3.0`).
  - RPC `complete_mailer_burst` com 7 argumentos (com `p_dry_run`) e sobrecarga de 6 argumentos.
  - RPC `mailer_burst_ready()` validando tabelas, RPCs, pronargs=7 e constraint de status.
  - Atualizar comentário no topo de `0028_mailer_high_volume_snapshot_and_bounce_guard.sql` apontando que ela foi substituída pela 0029.
- Criar `db/migrations/verify-0029.sql`:
  - Script somente leitura que valida tabelas, colunas de snapshot, pronargs de `complete_mailer_burst`, CHECK constraint e testa `mailer_burst_ready()`.

### Bloco B — Código TypeScript (`src/lib/email/...`, `src/types/db.ts`)

- `src/types/db.ts`:
  - Adicionar `"draft"` e `"preparing"` ao tipo `MailerCampaignStatus`.
  - Adicionar `MailerCampaignSnapshotRow`.
- `src/lib/email/mailer-queue.server.ts`:
  - Em `createCampaignDraft`: criar a campanha primeiro com status `"draft"`, inserir o snapshot depois com `{ campaign_id, schema_version: 1, snapshot, created_at }`. Em caso de erro na inserção do snapshot, deletar a campanha recém-criada e lançar erro claro.
  - Em `appendCampaignRecipients`: ler o snapshot por `campaign_id` (coluna `snapshot`, sem `.order("version")`); mapear `row.suppressed_email || row.email` no retorno de `filter_suppressed_emails`.
  - Em `activateCampaign`: aplicar parse defensivo ao retorno de `mailer_campaign_bounce_stats`; fail-open com aviso no console caso a RPC falhe por instabilidade externa, exceto se `bounce_guard_triggered` for verdadeiro.
  - Em `processMailerQueue`: ler o snapshot por `campaign_id` na coluna `snapshot`; mapear `suppressed_email` no RPC; mensagem explícita da falta da migration 0029 quando `mailer_burst_ready` retornar falso; parse defensivo de bounce stats.
- `src/lib/email/recruit-email.functions.ts`:
  - Em `getCampaignBounceStatsServerFn`: parse defensivo do jsonb (objeto ou array), mapeando `permanent_bounces` e `complaints` para a UI.
- `src/lib/email/mailer-runner.server.ts`:
  - Em `getRecentMailerCampaigns`: filtrar para excluir campanhas com status `"draft"` e `"preparing"`.

### Bloco C — Orquestração no Navegador

- Preservar sem alterações o fluxo testado de ticks via navegador em `src/routes/_authenticated/admin/mailer.tsx`.
- Garantir que campanhas em rascunho (`draft`) nunca sejam carregadas como ativas pelo monitor.

### Bloco D — Testes Automatizados

- `src/lib/email/schema-integrity.test.ts`:
  - Testar todas as colunas referenciadas em `.insert()`, `.update()`, `.select()` e `.order()` para `mailer_campaigns`, `mailer_campaign_snapshots` e `mailer_queue` contra as migrations 0001–0029.
  - Validar que todos os status literais usados no código de produção existem no CHECK da migration 0029.
  - Validar a declaração de todas as tabelas e RPCs da 0029.
- `src/lib/email/mailer-queue.test.ts`:
  - Teste de ordem e rollback: campanha criada antes de snapshot; exclusão de campanha se snapshot falhar.
  - Teste do parse de bounce stats como objeto jsonb.
  - Teste de ciclo de vida completo com `FakeMailProvider` (dry-run): `createCampaignDraft` → `appendCampaignRecipients` → `activateCampaign` → `processMailerQueue` → `completed`.

---

## 6. Validação e Critérios de Aceite (Regra 7 do AGENTS.md)

1. `bun install --frozen-lockfile` passa com saída 0 sem alterar nada.
2. `git diff --exit-code -- package.json bun.lock` confirma que ambos estão intactos.
3. `bun run validate` passa 100% verde (ESLint com 0 erros, TypeScript com 0 erros, Vitest com 100% dos testes aprovados, compilação de build com código 0).
4. `CERNE.md` atualizado com o detalhamento vivo da arquitetura e das mudanças.
5. `BACKLOGER.md` atualizado com o registro completo da TASK-111 e evidências reais coladas.
