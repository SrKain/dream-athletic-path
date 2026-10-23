# Planejamento — Correção Definitiva do Mailer: Orquestração Segura pelo Navegador, Reserva Escopada e Redução de Carga no Backend

- **Data/Hora:** 2026-10-16 07:35 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Architect)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[APROVADO PELO USUÁRIO NO PROMPT]`
- **Modalidade:** Entrega Consolidada, Idempotente e Conforme com a Governança
- **Package Manager:** Bun 1.3.14 (exclusivo, `bun.lock` mantido 100% inalterado)

---

## 1. Contexto e Diagnóstico dos Problemas Identificados

1. **Reserva Não Escopada na RPC (`claim_mailer_queue_batch`)**:
   - A RPC em `0024_mailer_queue_and_rate_limiting.sql` reservava itens de qualquer campanha em estado `running`.
   - O código TypeScript filtrava a campanha em memória somente após a reserva (`claimedItems = rpcClaimed.filter(item => item.campaign_id === options.campaignId)`).
   - _Impacto:_ Se duas campanhas existissem ou houvesse sobras de campanhas anteriores, itens de outra campanha eram reservados indevidamente e ficavam órfãos em estado `processing`.
   - _Correção:_ Migration 0025 atualiza `claim_mailer_queue_batch` para aceitar `p_campaign_id uuid default null`. Se fornecido, a query SQL filtra restritivamente `q.campaign_id = p_campaign_id` dentro da transação `FOR UPDATE SKIP LOCKED`.

2. **Carga no Banco e Consulta Integral de Linhas (`getCampaignQueueProgress`)**:
   - O método atual realizava `select('status')` de todas as linhas de `mailer_queue` para contar uma a uma em JavaScript. Em campanhas com milhares de destinatários, causava sobrecarga de I/O, lentidão e estourava o limite padrão de linhas da API do Supabase (1.000 registros).
   - _Correção:_ Nova RPC `get_mailer_campaign_progress_summary(p_campaign_id uuid)` no PostgreSQL com agregação `COUNT(*) FILTER (...)` compacta em O(1), além de contagens com `{ count: 'exact', head: true }` como fallback. A resposta do micro-lote já retorna o progresso consolidado, eliminando polling redundante simultâneo. A contagem regressiva de cooldown é decrementada localmente no frontend.

3. **Orquestração e Ciclo de Vida do Executor no Navegador**:
   - A orquestração pelo navegador em `mailer.tsx` apresentava vulnerabilidades de concorrência: desmontar o componente, pausar ou cancelar não abortava chamadas assíncronas já em curso que retornavam posteriormente.
   - Faltava trava de lease no servidor para impedir que múltiplas abas ou sessões disparassem contra a mesma campanha simultaneamente.
   - _Correção:_ Adicionado `BroadcastChannel` local entre abas e colunas `controller_id` e `controller_lease_expires_at` em `mailer_campaigns`, validadas pela RPC `acquire_mailer_campaign_lease`. Trava estrita com `isUnmountedRef` e `isOrchestratorActiveRef` que cancela sumariamente qualquer novo tick após desmonte ou interrupção.

4. **Idempotência, Falhas de Persistência e Cabeçalhos Resend**:
   - O envio utilizava apenas `X-Entity-Ref-ID`.
   - _Correção:_ Implementação de `Idempotency-Key` e `X-Entity-Ref-ID` com hash SHA-256 estável (`${campaignId}:${recipientEmail}`).
   - _Tratamento de Falha Parcial:_ Se o Resend aceitar o e-mail (retornando `provider_message_id`), mas a persistência do log falhar, o status do item é gravado como `sent` com o `provider_message_id` salvo, impedindo categoricamente reenvios cegos em duplicidade.

5. **Ritmo, Limites Globais e Eliminação de Bypass**:
   - O cliente podia enviar `ignoreCooldown: true` ou acionar `triggerProcessMailerQueueServerFn`.
   - _Correção:_ Remoção de `ignoreCooldown` no backend e no frontend; remoção da Server Function desprotegida de disparo forçado; validação estrita no servidor que limita o micro-lote a no máximo 2 e-mails (`Math.min(2, Math.max(1, batchSize))`); remoção de esperas artificiais dentro da função serverless da Vercel (o intervalo de 1s ocorre estritamente no navegador).

6. **Deduplicação de Destinatários e Validação de IDs**:
   - No enfileiramento, destinatários com o mesmo e-mail normalizado (`email.toLowerCase().trim()`) agora são deduplicados.
   - IDs de coaches que não sejam UUIDs válidos são tratados como `null` no campo `coach_id` da fila, evitando erro de tipagem no Postgres.

7. **Preservação dos Textos e Destinos das Respostas dos Coaches**:
   - Garantida a preservação integral dos helpers `buildInterestedMailtoUrl` e `buildNotAFitUrl` com os textos canônicos:
     - `RECRUIT NOW` com assunto `[Interested] [Athlete Name] ([Position])`, destino `fabiana@goteamgoagency.com`.
     - `NOT A FIT` com assunto `Not a fit: [Athlete Name]`, destino `contact@goteamgoagency.com`.
     - Omissão de parênteses se a atleta não tiver posição cadastrada.
     - Preservação do `Reply-To: contact@goteamgoagency.com` em todos os envios enfileirados.
     - Preservação da saudação dinâmica `Hi Coach [last_name],` (ou `Hi Coach,`) e do assunto customizado.

---

## 2. Arquitetura da Solução

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   ADMIN BROWSER (/admin/mailer)                        │
│                                                                        │
│  [ BroadcastChannel / Tab Lease ] ──► Impede concorrência entre abas   │
│  [ Enqueue Campaign ] ──► Deduplica e gera fila no Supabase            │
│  [ Chained setTimeout Loop (~1.0s) ]                                   │
│       │                                                                │
│       ├──► POST /api/functions/processMailerMicroBatchServerFn         │
│       │    (campaignId, batchSize: 2, clientId)                        │
│       │                                                                │
│       ├──► Recebe resultado e progresso consolidado na mesma resposta   │
│       ├──► Atualiza UI sem polling adicional                           │
│       ├──► Cooldown de 60s: contagem regressiva local no cliente       │
│       └──► Pausar / Cancelar / Desmontar: aborta ticks imediatamente   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP POST (requireAgency)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   VERCEL SERVERLESS FUNCTION                           │
│                                                                        │
│  1. Autenticação e autorização via requireAgency                       │
│  2. Valida campaignId obrigatório e batchSize <= 2                     │
│  3. Lease do controller (acquire_mailer_campaign_lease)                │
│  4. RPC claim_mailer_queue_batch (FOR UPDATE SKIP LOCKED escopada)     │
│  5. Envio imediato do micro-lote de até 2 e-mails via Resend           │
│     - Reply-To: contact@goteamgoagency.com                             │
│     - Idempotency-Key + X-Entity-Ref-ID                                │
│  6. Tratamento de erro seguro com retentativa exponencial e 429 lock   │
│  7. Agregação SQL compacta (get_mailer_campaign_progress_summary)      │
│  8. Retorna progresso consolidado na resposta                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Arquivos Envolvidos e Plano de Modificações

1. **`db/migrations/0025_mailer_campaign_scoped_queue_and_metrics.sql`**:
   - Evolução de `mailer_campaigns` (`controller_id`, `controller_lease_expires_at`).
   - RPC `claim_mailer_queue_batch` com suporte a `p_campaign_id uuid`.
   - RPC `acquire_mailer_campaign_lease(p_campaign_id, p_controller_id, p_lease_seconds)`.
   - RPC `get_mailer_campaign_progress_summary(p_campaign_id)`.
   - Permissões concedidas a `authenticated` e `service_role`.

2. **`src/types/db.ts`**:
   - Adição dos campos `controller_id` e `controller_lease_expires_at` em `MailerCampaign`.
   - Tipagem do resultado de progresso consolidado.

3. **`src/lib/email/mailer-queue.server.ts`**:
   - `enqueueCampaignDispatches`: Deduplicação por e-mail e higienização de UUIDs de coaches.
   - `processMailerQueue`:
     - Exigência estrita de `campaignId`.
     - Limitação de `maxBatchSize` a 2.
     - Validação de lease de controle por sessão/aba.
     - Chamada à RPC `claim_mailer_queue_batch` com `p_campaign_id`.
     - Inclusão de `replyTo: EMAIL_SIGNATURE.email` e cabeçalho `Idempotency-Key`.
     - Remoção de sleeps artificiais na serverless function.
     - Atualização atômica de logs e status da fila com proteção contra reenvio em falha de log.
   - `getCampaignQueueProgress`: Agregação SQL via RPC `get_mailer_campaign_progress_summary` (ou queries de contagem HEAD compactas como fallback).
   - Cálculo de ETA realista baseado no ritmo observado e pausas restantes.

4. **`src/lib/email/recruit-email.functions.ts`**:
   - Atualização de `processMailerMicroBatchServerFn` com validação estrita de `campaignId` e trava de `batchSize <= 2`.
   - Remoção de `ignoreCooldown` e remoção de `triggerProcessMailerQueueServerFn`.

5. **`src/routes/_authenticated/admin/mailer.tsx`**:
   - Orquestrador reativo com ciclo de vida seguro (abort controller / flags de desmonte).
   - Coordenação de concorrência com `BroadcastChannel` e lease de sessão.
   - Contagem regressiva local de cooldown.
   - Monitor de campanha ao vivo com estados refinados:
     - Preparando, Enviando, Aguardando Intervalo (com contagem regressiva), Pausado, Concluído, Concluído com Falhas, Cancelado, Outra Sessão Ativa, Sem Conexão.
   - Atualização da UI diretamente pelo retorno de cada micro-lote.

6. **Testes Unitários (`src/lib/email/mailer-queue.test.ts` e suítes correlatas)**:
   - Cobertura de micro-lotes de 2 e-mails, reserva escopada por campanha, deduplicação de destinatários, concorrência, idempotência e cálculos de progresso.

---

## 4. Estratégia de Validação

1. Executar suíte completa de testes com Vitest (`npx vitest run`).
2. Executar linter (`npm run lint` / `bun run lint`) e corrigir problemas de formatação.
3. Executar compilação com `compile_applet`.
4. Atualizar documentação viva em `CERNE.md` e o diário em `BACKLOGER.md`.
