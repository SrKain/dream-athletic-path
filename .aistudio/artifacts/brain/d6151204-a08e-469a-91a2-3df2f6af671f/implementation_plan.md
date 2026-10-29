# Correção do Fechamento de Rajada do Mailer, Persistência Resiliente e Reconciliação sem Reenvio

Plano de engenharia para eliminar a reversão de rajadas causada por `coach_id` nulo em `recruit_email_logs`, blindar a confirmação de envio da fila contra falhas de auditoria, impedir o reenvio automático de itens em `processing` sem evidência de entrega e adicionar observabilidade contínua no modo navegador.

## User Review & Critical Decisions

As seguintes decisões arquiteturais foram confirmadas para execução:

1. **Persistência do Estado `unconfirmed` (`mailer_queue`)**: A migration `0030` adicionará `'unconfirmed'` diretamente na constraint `mailer_queue_status_check` (junto a `'pending'`, `'processing'`, `'retry'`, `'sent'`, `'failed'`, `'suppressed'`, `'cancelled'`). Isso impede que o RPC `claim_mailer_queue_batch` capture esses itens automaticamente até decisão humana explícita.
2. **Ações da Decisão Humana na Reconciliação**: O modal de reconciliação listará nominalmente os destinatários afetados (`recipient_email`, `recipient_name`, `university_name`) e permitirá escolher entre três ações explícitas:
   - **Marcar como enviados (`sent`)**: Confirma que o lote já seguiu e impede qualquer novo disparo.
   - **Reenviar para a fila (`pending`)**: Reabilita os itens para um novo envio caso o operador verifique no painel do provedor que o lote não saiu.
   - **Cancelar / Marcar como falha (`failed`)**: Descarta o reenvio e encerra os itens com registro de falha auditável.

> **Ordem Crítica de Aplicação em Produção**: A migration `0030_recruit_email_logs_coach_nullable.sql` deve ser executada no SQL Editor do Supabase (e validada com `verify-0030.sql`) **antes** do deploy do código atualizado.

---

## 1. Overview & Core Concept

Em produção, contatos importados do JSONB de universidades não possuem linha na tabela `public.coaches`, resultando em `mailer_queue.coach_id = NULL`. Enquanto a migration `0018` removeu a chave estrangeira `recruit_email_logs_coach_id_fkey` e o `NOT NULL` de `athlete_id`, a coluna `recruit_email_logs.coach_id` permaneceu `NOT NULL` desde a migration `0016`. Quando `complete_mailer_burst` tenta inserir o log de auditoria após o Resend já ter aceitado o lote, a violação de constraint reverte toda a transação SQL — mantendo os itens presos em `processing` e pausando a campanha com `"Provider accepted N messages, but burst persistence failed"`.

A solução atua em quatro camadas complementares:

- **Reconciliação de Schema (`0030`)**: Torna `recruit_email_logs.coach_id` anulável (`DROP NOT NULL`), audita e protege todas as demais colunas `NOT NULL` e `CHECK` de `recruit_email_logs` (`athlete_id`, `subject`, `status`, `email_type`, `athlete_ids`, `sent_at`), adiciona `'unconfirmed'` ao check de `mailer_queue.status` e reforça o gate `mailer_burst_ready()`.
- **Isolamento Transacional no Fechamento de Rajada**: Desacopla a atualização de `public.mailer_queue` (`status = 'sent'`, `provider_message_id`) da inserção em `public.recruit_email_logs`. O `INSERT` no log passa a rodar dentro de um sub-bloco `BEGIN ... EXCEPTION WHEN OTHERS THEN ... END;` em `complete_mailer_burst`: mesmo que o log de auditoria falhe por qualquer motivo futuro, o status `sent` na fila e os contadores da campanha jamais são revertidos.
- **Reconciliação Segura sem Reenvio Automático (`unconfirmed`)**: Itens órfãos em `processing` que não possuam evidência direta (`provider_message_id`, registro em `recruit_email_logs` ou evento em `email_events`) deixam de voltar silenciosamente para `pending`. Eles são transicionados para `status = 'unconfirmed'` (`error_code = 'UNCONFIRMED_DELIVERY'`) e pausam a campanha aguardando resolução humana explícita.
- **Observabilidade Contínua no Navegador**: Adição de polling de leitura independente a cada 7 segundos durante a execução/monitoramento de campanhas no navegador, garantia de retorno do objeto `progress` em todos os caminhos de `processMailerQueue` (incluindo _early returns_) e indicador visual em tempo real `"último tick há Xs"`.

---

## 2. User Experience & Visual Design

Seguindo o padrão **Dark Premium** do Go Team Go (`Space Grotesk` para títulos e métricas tabulares, `Quicksand` para leitura operacional, superfícies em `slate-950/900` e acentos semânticos em esmeralda, âmbar e dourado):

- **Monitor de Campanha Ativa (Modo Navegador)**:
  - **Indicador de Tick em Tempo Real**: Ao lado do badge de status da orquestração no navegador, exibe um contador tabular `"Último tick há Xs"` atualizado a cada segundo, permitindo distinguir imediatamente se o loop local está ativo, em _cooldown_ ou aguardando resposta.
  - **Polling Independente de Progresso**: Um ciclo de leitura leve (`getCampaignQueueProgressServerFn`) roda a cada 7 segundos de forma desacoplada dos disparos de rajada, garantindo que a barra de progresso, a contagem de restantes e a detecção de conclusão (`completed`) reflitam o estado real do banco mesmo durante janelas de _cooldown_, _rate limit_ ou _lease conflict_.
  - **Badge e Filtro `Unconfirmed`**: A grade de destinatários da fila e os cartões de resumo passam a exibir a contagem de itens `unconfirmed` (em destaque âmbar de alerta) quando houver destinatários aguardando decisão humana.
- **Modal de Reconciliação com Lista de Destinatários Afetados**:
  - Quando a campanha entra em `reconciliation_required` (seja por falha ambígua do provedor ou por itens `unconfirmed` detectados ao destravar a fila), o modal de reconciliação apresenta:
    1. **Lista rolável dos destinatários afetados** (`recipient_name`, `recipient_email`, `university_name` e código do incidente).
    2. **Três opções claras de decisão humana**:
       - **Marcar como Enviados (`sent`)** — preserva a segurança anti-duplicação.
       - **Reenviar para a Fila (`pending`)** — recoloca na fila apenas após verificação humana.
       - **Cancelar / Marcar como Falha (`failed`)** — encerra os itens sem reenvio.

---

## 3. Key Product Decisions & Trade-Offs

- **Subtransação PL/pgSQL (`EXCEPTION WHEN OTHERS`) vs. Duas Chamadas RPC Separadas**:
  - _Decisão_: Manter uma única chamada RPC (`complete_mailer_burst`), mas separar o `UPDATE public.mailer_queue` da inserção em `public.recruit_email_logs` usando um bloco `BEGIN ... EXCEPTION WHEN OTHERS THEN v_log_error := SQLERRM; END;` interno ao PL/pgSQL, além de um fallback de segurança no servidor TypeScript caso a própria RPC falhe inesperadamente.
  - _Racional_: Preserva a baixa latência de 1 round-trip ao banco e garante, no nível do PostgreSQL (via _savepoint_ implícito do bloco `BEGIN...EXCEPTION`), que o `UPDATE` em `mailer_queue` e em `mailer_campaigns` seja comitado mesmo se `recruit_email_logs` lançar qualquer erro de constraint ou trigger.
- **Bloqueio de Reenvio em `reconcileStaleProcessingQueueItems` e no Botão "Destravar Fila"**:
  - _Decisão_: Quando um item em `processing` expira seu lease sem `provider_message_id` e sem rastro em `recruit_email_logs` ou `email_events`, ele nunca vai para `pending` sozinho; vai para `unconfirmed`.
  - _Racional_: O caso real de produção provou que um item pode ficar em `processing` sem `provider_message_id` justamente porque o lote foi aceito pelo Resend e o banco reverteu a persistência no milissegundo seguinte. Voltar automaticamente para `pending` causaria envio duplicado para treinadores universitários.
- **Auditoria Completa das Colunas de `recruit_email_logs` (Migrations 0001–0029)**:
  - Cruzando todas as migrations de `0001` a `0029`, o schema acumulado de `public.recruit_email_logs` possui as seguintes restrições `NOT NULL` e `CHECK`:
    - `id uuid NOT NULL DEFAULT gen_random_uuid()` (`0016`)
    - `athlete_id uuid NULL` (`NOT NULL` em `0016`, removido em `0018` — será reforçado com `DROP NOT NULL` idempotente na `0030`)
    - `coach_id uuid NOT NULL` (`0016`; FK removida em `0018`, mas `NOT NULL` permaneceu — **causa raiz do bug**, receberá `DROP NOT NULL` na `0030`)
    - `subject text NOT NULL` (`0016` — protegido com `DEFAULT ''` e `COALESCE(NULLIF(btrim(u.subject), ''), 'Go Team Go Recruiting')` no RPC)
    - `status text NOT NULL CHECK (status IN ('sent', 'failed'))` (`0016` — ampliado na `0030` para `CHECK (status IN ('sent', 'failed', 'suppressed'))` para alinhar também com o log de suprimidos de `appendCampaignRecipients`, e protegido com `COALESCE`)
    - `sent_at timestamptz NOT NULL DEFAULT timezone('utc', now())` (`0016` — protegido com `COALESCE(v_now, timezone('utc', now()))`)
    - `email_type text NOT NULL DEFAULT 'athlete_teaser'` (`0018` — protegido com `COALESCE(NULLIF(btrim(u.email_type), ''), 'athlete_teaser')`)
    - `athlete_ids uuid[] NOT NULL DEFAULT '{}'` (`0022` — protegido com `COALESCE(..., '{}'::uuid[])`)

---

## 4. Technical Architecture & Data Strategy

### Fluxo de Persistência Resiliente e Reconciliação (`0030` + Servidor + UI)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. DISPARO DO LOTE (Resend Batch API / Dry-Run Provider)                     │
│    Provedor aceita N mensagens e retorna provider_message_id por item        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. RPC complete_mailer_burst (Migration 0030)                                │
│  ├─ Passo A (Prioritário): UPDATE public.mailer_queue                        │
│  │    SET status = 'sent', provider_message_id = ..., sent_at = v_now        │
│  ├─ Passo B (Subtransação Isolada):                                          │
│  │    BEGIN                                                                  │
│  │      INSERT INTO public.recruit_email_logs (coach_id nullable + COALESCE) │
│  │    EXCEPTION WHEN OTHERS THEN                                             │
│  │      v_log_error := SQLERRM; -- NÃO reverte Passo A nem Passo C!          │
│  │    END;                                                                   │
│  └─ Passo C: Recalcula contadores reais da fila e atualiza mailer_campaigns  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3. RECONCILIAÇÃO DE ITENS ÓRFÃOS EM 'processing'                             │
│  ├─ Com evidência (provider_message_id / recruit_email_logs / email_events): │
│  │    ► Promove automaticamente para status = 'sent'                         │
│  └─ Sem evidência de entrega:                                                │
│       ► Marca status = 'unconfirmed', error_code = 'UNCONFIRMED_DELIVERY'    │
│       ► Pausa campanha em 'reconciliation_required' e exibe destinatários    │
│       ► Operador escolhe: [Marcar Sent] | [Voltar p/ Pending] | [Falhar]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Detalhamento das Entregas Técnicas

1. **Banco de Dados (`0030_recruit_email_logs_coach_nullable.sql` e `verify-0030.sql`)**:
   - `ALTER TABLE public.recruit_email_logs ALTER COLUMN coach_id DROP NOT NULL;` e `ALTER COLUMN athlete_id DROP NOT NULL;` (idempotentes).
   - Atualização da constraint `recruit_email_logs_status_check` para aceitar `('sent', 'failed', 'suppressed')` e garantia de `DEFAULT` seguro em `subject`, `email_type`, `athlete_ids` e `sent_at`.
   - Atualização da constraint `mailer_queue_status_check` em `public.mailer_queue` incluindo `'unconfirmed'`.
   - Reescrita de `public.complete_mailer_burst` separando o `UPDATE` de `public.mailer_queue` do bloco `BEGIN ... EXCEPTION WHEN OTHERS ... END` que insere em `public.recruit_email_logs`, aplicando `COALESCE` em todas as colunas `NOT NULL` e retornando `log_error` no JSONB de resposta caso ocorra qualquer anomalia no log.
   - Atualização de `public.get_mailer_campaign_progress_summary` para retornar `unconfirmed_count` e considerar itens `unconfirmed` no cálculo de estado da campanha.
   - Atualização de `public.mailer_burst_ready()` para validar também que `recruit_email_logs.coach_id` está com `is_nullable = 'YES'` em `information_schema.columns`.
   - Criação do script somente-leitura `verify-0030.sql` inspecionando `is_nullable` de todas as colunas de `recruit_email_logs`, constraints de `mailer_queue`, definição de `complete_mailer_burst` e resultado de `mailer_burst_ready()`.

2. **Backend de Fila e Runner (`mailer-queue.server.ts`, `mailer-runner.server.ts`, `recruit-email.functions.ts`, `mailer-health.ts`)**:
   - **Progresso Garantido em Todos os Retornos**: Criar helper interno em `processMailerQueue` para anexar `progress: await getCampaignQueueProgress(campaignId, admin)` em **todos** os caminhos de retorno (incluindo _early returns_ de readiness gate, campanha não encontrada/finalizada, _lease conflict_, _cooldown_, lote vazio, erro de persistência e conciliação).
   - **Fallback de Persistência na Aplicação**: Se a RPC `complete_mailer_burst` retornar `log_error`, registrar aviso estruturado (`console.warn`) sem pausar a campanha nem reverter os itens `sent`. Caso a própria chamada RPC falhe inesperadamente após o envio, aplicar fallback direto via ` UPDATE public.mailer_queue SET status = 'sent', provider_message_id = ...` por item para garantir que nenhum e-mail aceito pelo provedor fique sem registro de `sent`.
   - **Reconciliação sem Reenvio (`unconfirmed`)**:
     - Em `reconcileStaleProcessingQueueItems`, substituir a transição automática para `pending` pela transição para `status = 'unconfirmed'`, `error_code = 'UNCONFIRMED_DELIVERY'`, retornando `unconfirmedCount` e a lista de destinatários afetados (`unconfirmedRecipients`).
     - No destravamento manual (`triggerCampaignWorkerServerFn`) e na reconciliação (`reconcileCampaignIncident`), nunca mover itens sem evidência para `pending` automaticamente; exibir os destinatários afetados e permitir que o operador aplique `MARKED_SENT`, `REQUEUE_PENDING` ou `MARKED_FAILED`.

3. **Interface Administrativa (`src/routes/_authenticated/admin/mailer.tsx`)**:
   - **Polling Independente (7s)**: `useEffect` dedicado no modo navegador que consulta `getCampaignQueueProgressServerFn` a cada 7 segundos enquanto houver uma campanha selecionada ativa (`running`, `queued`, `paused` ou com itens `unconfirmed`), atualizando `campaignProgress` e detectando transição para `completed` mesmo entre ticks.
   - **Telemetria `"Último tick há Xs"`**: Estado de relógio de 1 segundo que calcula o tempo decorrido desde o último tick concluído no navegador (`lastTickAt`) e exibe no cabeçalho do monitor de execução.
   - **Modal de Decisão Humana para `unconfirmed`**: Listagem dos destinatários em estado `unconfirmed` / `PROVIDER_AMBIGUOUS` com botões para **Marcar como Enviados**, **Reenviar para `pending`** ou **Cancelar / Marcar como Falha**.

4. **Suíte de Testes Automatizados e Validação**:
   - Teste unitário simulando `coach_id = null` e falha forçada na inserção de `recruit_email_logs`, comprovando que `mailer_queue` permanece `sent` com `provider_message_id` preenchido e a campanha avança normalmente.
   - Teste unitário de `reconcileStaleProcessingQueueItems` verificando que itens em `processing` sem evidência vão para `unconfirmed` (e nunca para `pending`) e testando as 3 resoluções humanas (`MARKED_SENT`, `REQUEUE_PENDING`, `MARKED_FAILED`).
   - Teste verificando que todos os _early returns_ de `processMailerQueue` retornam `progress` populado e validando um ciclo _dry-run_ completo de ponta a ponta sem nenhum envio real.
