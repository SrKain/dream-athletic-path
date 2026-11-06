# Mailer — fila sem executor, feedback infiel e rede de segurança por cron

- **Data/hora:** 2026-11-06 09:45 (America/Sao_Paulo).
- **Solicitante:** Kauan — Go Team Go. **Planejamento:** Claude. **Implementação:** ChatGPT/Codex (substitui Google AI Studio por autorização de Kauan em 06/11).
- **Base:** `main` no commit `d464a51` (30/10) + consultas somente leitura rodadas no Supabase em 06/11.
- **Decisão do solicitante (06/11):** opção **A** — ligar o cron do Supabase como rede de segurança. Isso **revisa** a decisão de 16/10 ("fila só no navegador"); o navegador continua podendo dirigir a fila, mas deixa de ser o único executor.
- **Status:** PLANO PRONTO. Implementação aprovada explicitamente por Kauan em 06/11 nesta conversa: “Não vai ser o ai studio, vai ser vc”. A Parte 2 passa a ser executada por ChatGPT/Codex (Regra 2 do AGENTS.md).

Execução atual: ChatGPT/Codex implementa a **Parte 2**, conforme autorização posterior de Kauan. A Parte 1 é a justificativa. Aplicação em produção segue o procedimento humano em `docs/mailer/TASK-116-deploy.md`.

---

# PARTE 1 — Diagnóstico e decisões

## 1. Evidência (produção)

Campanha `205ab475…` (565 elegíveis, 6 lotes), horários em Brasília:

| Lote | Saiu em | Observação |
| ---- | ------- | ---------- |
| 1 a 4 | 05/11 16:11:51 → 16:12:11 | ritmo normal (~5 s entre lotes) |
| 5 | 05/11 16:12:42 | 31 s depois do lote 4 (aba em segundo plano) |
| 6 (65 itens) | **06/11 09:02:04** | ~16h50 depois; coincide com a reabertura da tela |

- As 5 campanhas mais recentes terminaram com **100% aceitos**: zero `failed_*`, zero `unconfirmed`, zero pausa de segurança, nenhum lote com nova tentativa.
- Campanhas menores (127 a 274) concluíram em 9 a 17 s com a tela aberta (~16 e-mails/s). O motor é rápido quando alguém o dirige.
- `email_suppressions` tem 34 linhas (o corte de 1000 do cliente Supabase ainda não afeta).
- `cron.job` não existe: **pg_cron não está habilitado**; a migration 0032 nunca foi aplicada.

**Conclusão:** o problema real é **ausência de executor**. A fila só anda com uma aba aberta e visível, e a tela continua dizendo `running` sem nenhuma prova de atividade.

## 2. Achados no código (confirmados por leitura)

1. `src/hooks/use-campaign-runner.ts`: ao receber `leaseHeldByOther`, `setIsAnotherTabActive(true)` re-renderiza, troca a identidade de `executeTick`, o efeito de orquestração chama `clearTimers()` e cai no ramo "só ler progresso". Nada volta esse estado a `false` sozinho. Travamento permanente até clique manual.
2. Mesmo hook: com aba oculta ou offline, só lê progresso (não envia tick). O `catch` do tick reagenda a cada 3 s em silêncio e a mensagem "Enviando lote…" fica na tela.
3. `finalize_mailer_batch` (migration 0031): 3 respostas 429/409 no mesmo lote → 100 itens viram `failed_retryable`; 3 timeouts/5xx → `unconfirmed`, embora o replay com a mesma `Idempotency-Key` seja seguro por 24 h.
4. Bounce Guard (`mailer_campaign_bounce_stats`, 0029): dispara com `sent_count >= 20` e taxa > 3%. Amostra mínima baixa. O `resumeCampaign` (código legado em `mailer-queue.server.ts`) não limpa `safety_pause_reason` nem `last_error`, então o guarda dispara de novo no tick seguinte.
5. `pauseCampaign`/`resumeCampaign`/`cancelCampaign`/`getLatestActiveCampaign`/`triggerCampaignWorkerServerFn` ainda são do motor antigo. Cancelar só toca `pending|retry|processing` (o v2 usa `claimed`). "Destravar Fila" reconcilia `processing`, status que o v2 não usa, e zera `serverOrchestration`.
6. `mailer-engine-v2.server.ts`: o retorno de `finalize_mailer_batch` não tem o `error` verificado; falha vira lote reenviado sem mensagem ao usuário.
7. `getCampaignProgressV2`: se a RPC falha, cai num fallback silencioso que lê `mailer_queue` sem paginação (corte de 1000 linhas) e perde os dados de entrega.
8. A barra "processados" soma falhas e não confirmados; barra de entrega fica em 0% se o webhook não trouxer eventos, sem explicar.
9. `getSuppressedEmailSet()` lê a tabela inteira a cada lote (cliente, corte de 1000).
10. Tick de 8 s vs `timeoutMs = 10_000` do provedor. Limite de duração da função na Vercel **não é verificável pelo código**.

## 3. Decisões de projeto (padrões assumidos; ajuste se quiser)

- Alerta de fila parada: `running` sem tick há mais de **45 s**.
- Fim de tick libera o lease para **15 s** (em vez de 90 s) para o cron/aba assumirem rápido.
- Bounce Guard: exige **≥ 200 aceitos** e **≥ 5 hard bounces** e taxa > **3%**; "Continuar mesmo assim" permitido, com teto rígido de **8%**.
- Rate limit 429/409: sem limite de tentativas; limitado pela janela de **23 h** da chave, com backoff até 5 min.
- Ambíguo (5xx/timeout): até **8** replays com a mesma chave antes de `unconfirmed`.

---

# PARTE 2 — Instruções de implementação para ChatGPT/Codex

Você é o executor desta tarefa no repositório `SrKain/dream-athletic-path` (branch `main`). Entregue **tudo de uma vez**, sem entrega parcial.

## 0. Antes de qualquer coisa

1. Leia `README.md`, `AGENTS.md`, `CERNE.md`, `BACKLOGER.md`, `UI&UX.md` e todos os planos de `think/`. Este arquivo é o plano aprovado.
2. **Não altere `package.json` nem `bun.lock`.** Não adicione dependências. Hashes canônicos atuais: `git hash-object bun.lock package.json` deve imprimir `11e32ea0199fd8ea03742194d7e92136aa0ed513` e `868f6434b581f681611b76689623de2ee9a2b9b1`.
3. Mantenha o motor v2, o provedor Resend, preview, cards, personalização, descadastro, "not a fit" e webhooks como estão. Sem reprocessar campanhas antigas.
4. Migrations: arquivos **pequenos o bastante para colar no SQL Editor do Supabase** (máximo ~250 linhas cada; divida em `0033a`, `0033b` se preciso), idempotentes, com bloco de pré-checagem que aborta com lista clara do que falta. Nunca referencie `profiles.role`; use `public.is_agency_admin()`. Padrão de segurança da 0026/0031: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role`. Entregue também `db/migrations/verify-0033.sql` somente leitura.
5. Antes de escrever SQL, liste as colunas que você vai usar de `mailer_campaigns`, `mailer_queue` e `mailer_batches` e confirme que existem nas migrations 0018–0032. Se algo não existir, diga antes de codar.

## Objetivo

Uma campanha de 5.000+ e-mails deve **terminar sem ninguém com a tela aberta**, e a tela deve **mostrar a verdade** (inclusive "parada").

## Bloco A — Executor em segundo plano (cron do Supabase)

A1. Revise `db/migrations/0032_mailer_cron_optional.sql` e o endpoint `POST /api/mailer/tick` em `src/server.ts`. O cron deve processar campanhas `running` com lease expirado **ou nulo**. Use agendamento por segundos (ex.: 15 s) **somente se** a versão do `pg_cron` suportar; caso contrário 1 minuto. Documente como detectar.
A2. Crie a RPC `mailer_release_lease(p_campaign_id uuid, p_controller_id text, p_keep_seconds int default 15)`; chame-a ao fim de todo tick normal em `runCampaignTick` para reduzir o lease (hoje `finalize_mailer_batch` deixa +90 s).
A3. Crie `mailer_cron_status()` (SECURITY DEFINER) que só consulta `cron.job` se o schema `cron` existir (SQL dinâmico dentro de bloco seguro) e retorna `{enabled, schedule, active}`. Exponha por server function e mostre no painel o selo **"Rede de segurança: ativa/inativa"**. Se inativa, aviso permanente: "Fechar a aba pausa o envio".
A4. Na resposta final e no `BACKLOGER.md`, escreva o **passo a passo humano** do cron (você não executa nada disso): habilitar extensões `pg_cron`, `pg_net`, `supabase_vault`; criar os secrets no Vault; definir `MAILER_CRON_ENABLED=true` e `MAILER_CRON_SECRET` na Vercel; aplicar a 0032; rodar o verify; como testar com campanha pequena fechando a aba.
A5. Registre no `CERNE.md`/`BACKLOGER.md` que a decisão de 16/10 foi revista em 06/11 a pedido do solicitante.

## Bloco B — Navegador (`src/hooks/use-campaign-runner.ts`)

B1. **Remova a trava permanente** de `isAnotherTabActive`. Torne `executeTick` estável (use refs; nada de `useState` no caminho de decisão do tick). Ao receber `leaseHeldByOther`, continue agendando tick com `nextTickInMs` (≥ 5 s) e mostre "Outro executor ativo (aba ou cron) — acompanhando". Quando o lease expirar, esta aba assume.
B2. **Aba oculta continua enviando ticks** (o navegador os atrasa, mas funcionam); mantenha a guarda só para offline.
B3. **Não engula erro de tick:** conte falhas consecutivas, mostre o erro real (HTTP/401 → "sessão expirada, entre de novo"), backoff 3 s → 30 s, e nunca mantenha "Enviando lote…" após falha.
B4. Opcional: `navigator.wakeLock` enquanto `running` e visível, com fallback silencioso.

## Bloco C — Feedback fiel

C1. Migration `0033`: colunas `last_tick_at timestamptz`, `last_tick_by text`, `last_tick_message text` em `mailer_campaigns`; RPC `mailer_record_tick(campaign_id, controller_id, message)` chamada ao fim de cada tick (navegador ou cron). `mailer_campaign_progress` passa a devolver `lastTickAt`, `lastTickBy`, `controllerId`, `controllerLeaseExpiresAt`, `staleSeconds`, `health`; mapeie tudo isso em `getCampaignProgressV2` e em `CampaignProgress` (`src/types/db.ts`).
C2. **`health` derivado**: `sending`, `waiting_provider` (cooldown por 429), `stalled` (running + último tick > 45 s + sem lease ativo), `paused_manual`, `paused_safety`, `needs_reconciliation`, `completed`, `completed_with_issues`. O badge e a linha de status do `MailerProgressPanel` usam `health`, **nunca só `status`**. Em `stalled`: banner âmbar "Fila parada há X — nenhum executor ativo", botão **"Retomar agora"** e aviso se o cron estiver inativo.
C3. **Barras:** principal = aceitos / elegíveis, com falhas e não confirmados como segmentos separados; rótulo "aceitos pela Resend" (não "processados"); nunca mostrar "concluído" com pendências. Barra de entrega: se `accepted > 0` e **nenhum** evento de webhook após 2 min, mostrar "Sem eventos de webhook — verifique a integração" em vez de 0%.
C4. Em `getCampaignProgressV2`, **remova o fallback sem paginação**: use contagens `count: exact, head: true` por status; marque `degraded: true` e mostre "números aproximados"; registre o erro da RPC em vez de engolir.
C5. `getLatestActiveCampaignServerFn` e a restauração ao abrir a página passam a usar o progresso **v2**, não o legado (`get_mailer_campaign_progress_summary`, que só conta `sent|failed|processing`).

## Bloco D — Motor e SQL

D1. Verifique `error` em **todas** as RPCs de `runCampaignTick` (`claim_mailer_batch`, `finalize_mailer_batch`, `mailer_campaign_bounce_stats`). Se `finalize` falhar depois da aceitação do provedor, encerre o tick com mensagem explícita, grave em `last_error` e **não continue o loop** (o replay com a mesma chave é seguro).
D2. **Política de tentativas** em `finalize_mailer_batch`: 429 e 409-concurrent **não consomem** o limite de 3; limite por janela de 23 h da chave, com backoff exponencial em `next_batch_at` (respeita `retry-after`, máx. 5 min). `ambiguous` repete até 8 vezes com a mesma chave antes de `unconfirmed`. Constantes nomeadas e testadas.
D3. **Bounce Guard:** exigir `accepted ≥ 200` **e** `hard_bounces ≥ 5` **e** taxa > 3%. Crie `mailer_override_bounce_guard(campaign_id, note)` com auditoria (`bounce_guard_override_at/by/note`); com override o guarda só trava acima de **8%**. A mensagem de pausa deve trazer taxa atual, mínimos e o botão "Continuar mesmo assim" (com confirmação).
D4. **Pausar/retomar/cancelar em v2**, substituindo `pauseCampaign`, `resumeCampaign`, `cancelCampaign` legados:
  - pausar: `paused`, libera lease, preserva lote aberto;
  - retomar: só de `paused`; **limpa `safety_pause_reason` e `last_error`** quando a causa foi tratada; nunca usa `reconcileStaleProcessingQueueItems`; `next_batch_at = now()`;
  - cancelar: `pending` → `cancelled`; itens `claimed` de lote aberto → `unconfirmed` com motivo `CANCELLED_IN_FLIGHT` e lote fechado como `failed`; **nunca** deixar `claimed` órfão.
D5. `triggerCampaignWorkerServerFn` ("Sincronizar Agora"/"Destravar Fila") em v2: sem reconciliação legada e sem `serverOrchestration=false`. Se o lease estiver expirado, limpa e roda tick; se ativo, informa quem o detém e até quando.
D6. **Supressão por lote:** troque `getSuppressedEmailSet()` no tick por `filter_suppressed_emails(text[])` (RPC da 0028) com os e-mails do lote; o fallback JS deve paginar.
D7. **Orçamento de tempo:** o `timeoutMs` do provedor passa a ser `min(10 s, orçamento restante do tick − margem)`; o resultado do tick inclui `durationMs`. Documente `MAILER_TICK_BUDGET_MS`. Diga ao humano que **ele deve conferir no painel da Vercel a duração máxima de função** (você não consegue ver).
D8. **Autocura de órfãos:** detecte itens `claimed` sem lote aberto (`claimed|submitting|ambiguous`) e mova-os para `unconfirmed` (**nunca** para `pending` nem `accepted`), com motivo claro.

## Bloco E — Testes (Vitest)

Cobrir: (1) regressão da trava: `leaseHeldByOther` continua agendando ticks; (2) 5 respostas 429 seguidas não geram `failed_retryable`; (3) 8 ambíguos antes de `unconfirmed`; (4) Bounce Guard com amostra mínima, com override e com teto de 8%; (5) pausar/retomar/cancelar v2 incluindo cancelar com lote aberto; (6) progresso acima de 1.000 itens sem o fallback truncado; (7) derivação de `health`, incluindo `stalled` após 45 s; (8) **simulação de 5.000 destinatários com nenhum tick de navegador por N minutos**, concluída só pelo executor do cron; (9) cron + navegador simultâneos sem lote duplicado.

## Bloco F — Entrega

1. SQL na ordem de aplicação, antes do deploy do código.
2. **Portão anti-build-quebrada (Regra 7):** cole no `BACKLOGER.md` a **saída real** de `git hash-object bun.lock package.json`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` e `bun run validate`. Se falhar e você não puder corrigir sem violar as regras, **pare e reporte**.
3. `CERNE.md` atualizado; **TASK-116** no `BACKLOGER.md` (solicitante: Kauan; executor atual: ChatGPT/Codex; status).
4. Resposta final com: arquivos alterados, SQL na ordem, passo a passo humano do cron, e checklist de verificação pós-deploy (campanha pequena em dry run, fechar a aba, conferir que termina e que o selo do cron aparece ativo).


## Atualização de execução — 06/11/2026

Kauan transferiu a implementação integral para ChatGPT/Codex. O escopo técnico das Partes 1 e 2 foi mantido. A exceção anterior de build valeu somente para o commit documental; a implementação executará integralmente o portão da Regra 7. SQL e configuração de cron em produção continuam manuais.
