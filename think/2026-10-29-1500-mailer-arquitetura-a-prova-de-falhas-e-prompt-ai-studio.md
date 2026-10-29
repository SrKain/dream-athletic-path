# Plano definitivo — Recruit Mailer confiável para 5 mil+ disparos (free Supabase/Vercel + Resend 20k)

- **Data/hora:** 2026-10-29 15:00 (America/Sao_Paulo).
- **Solicitante:** Kauan — Go Team Go.
- **Planejamento:** Claude. **Implementação:** Google AI Studio (agente), com validação final humana/Codex.
- **Referência:** TASK-115. Consolida e **substitui o escopo executável** do plano `2026-10-29-1417` (TASK-114), que só registrava a intenção. Nada aqui foi implementado.
- **Status:** **[PLANO PRONTO — IMPLEMENTAÇÃO AUTORIZADA SOMENTE QUANDO O HUMANO COLAR O PROMPT DA PARTE 2 NO AI STUDIO]**.

Como usar este arquivo: a **Parte 1** é a justificativa técnica (para você e para revisão). A **Parte 2** é o prompt para colar no AI Studio. O prompt depende da Parte 1, então cole o arquivo inteiro ou commite-o em `think/` antes.

---

# PARTE 1 — Arquitetura e decisões

## 1. O que você pediu (requisitos duros)

1. 5.000+ e-mails em sequência, **sem travar, sem cancelar, sem ficar preso em fila, sem erro no meio**.
2. Supabase e Vercel **continuam no free**; Resend no plano de 20.000 e-mails/mês.
3. **Barra de progresso = progresso real**, sempre.
4. **Relatório final** do disparo com tudo que não pôde ser enviado, e por quê.
5. Sem confusão visual: uma única leitura de verdade na tela.

## 2. Diagnóstico ancorado no código (repo em 29/10, commit `85231e9`)

| Achado | Onde | Consequência |
| --- | --- | --- |
| Motor de envio com ~2.200 linhas e UI com ~3.750 linhas | `mailer-queue.server.ts`, `admin/mailer.tsx` | Estado e regras espalhados; cada correção abre outro furo. |
| **5 relógios** convivendo na UI: `setInterval` (4x), `setTimeout` de tick e um **Web Worker** | `mailer.tsx` (linhas ~330, 560, 588, 780, 852, 893, 923) | Ticks duplicados/perdidos, aba em segundo plano, disputa entre abas. |
| Lease de apenas 30 s e lock de 60 s | `QUEUE_CONFIG` | Lote lento perde o lease e outro controlador reassume no meio. |
| Burst de até 300 e chunks paralelos | `QUEUE_CONFIG`, `processMailerQueue` | Estoura timeout da função e o rate limit da Resend. |
| Preparação em várias operações sem fechamento; dedupe por fatia de 500 | `appendCampaignRecipients` | Campanha `draft` com fila parcial (casos `8a56bef1…`, `f23475af…`). |
| Resultado e log gravados separadamente | `processMailerQueue` + `recruit_email_logs` | 100 itens `sent` sem `provider_message_id` (campanha `2725beda…`). |
| Progresso calculado em vários lugares | UI + `getCampaignQueueProgress` | Barra que não bate com a fila. |

**Causa-raiz:** o motor depende da tela estar aberta e não tem **um único ponto atômico** que decida o que foi aceito, o que falhou e o que é incerto.

## 3. Fatos verificados da Resend (docs oficiais, 29/10)

- Rate limit padrão: **10 req/s por time**, compartilhado entre chaves. 429 traz `retry-after`.
- **Batch aceita `Idempotency-Key`** (1–256 caracteres, válida por **24 h**). Mesma chave + mesmo payload = a Resend não duplica. Mesma chave + payload diferente = `409 invalid_idempotent_request`. Chave ainda em processamento = `409 concurrent_idempotent_requests` (tentar depois).
- Plano pago tem só limite **mensal**; estourar gera `429 monthly_quota_exceeded`. Uma campanha de 5k consome 25% dos 20k do mês.

**Isso resolve o pior problema do plano anterior:** timeout depois de enviar. Dá para **reenviar o mesmo lote com a mesma chave** sem risco de duplicar, durante 24 h. Só depois disso o item vira `unconfirmed` para decisão humana.

## 4. Arquitetura-alvo

```
UI (só exibe e dispara ticks)  ┐
pg_cron do Supabase (rede de   ├─► POST /api/mailer/tick ─► runCampaignTick()
segurança, 1x/min, opcional)   ┘        │ (lease único por campanha, orçamento de tempo)
                                        ▼
        claim_mailer_batch (RPC, 100 itens, SKIP LOCKED, cria mailer_batches)
                                        ▼
        Resend POST /emails/batch  + Idempotency-Key estável do lote
                                        ▼
        finalize_mailer_batch (RPC ÚNICA e atômica: itens + lote + contadores + logs)
                                        ▼
        Webhooks Resend ─► email_events ─► mailer_campaign_progress (RPC de leitura)
```

### 4.1 Motor único e idempotente (`runCampaignTick`)
- Uma função de servidor, **chamável por qualquer origem** (navegador ou cron). Quem chama não importa; o lease garante um executor por campanha.
- **Orçamento de tempo** (`MAILER_TICK_BUDGET_MS`, padrão 8000 ms para caber no limite padrão do free): enquanto couber outro lote, processa; ao fim devolve `nextTickInMs`. Se o ambiente permitir `maxDuration` maior, sobe o orçamento por variável, sem mudar código.
- **Lote sequencial de 100** (máximo do batch da Resend), **um por vez**, intervalo mínimo `MAILER_BATCH_GAP_MS` (padrão 1500 ms, bem abaixo dos 10 req/s). Sem paralelismo entre lotes.
- Lease de **90 s**, renovado a cada lote; lote expirado é recuperável (4.4).

### 4.2 Modelo de dados (migration `0031`, idempotente e com pré-checagem)
- `mailer_batches`: `id, campaign_id, seq, item_ids uuid[], idempotency_key, status (claimed|submitting|accepted|partial|failed|ambiguous), attempts, provider_http_status, provider_response jsonb, claimed_at, finished_at`. A chave é `mc:{campaign_id}:b{seq}` e **nunca muda** para o mesmo lote.
- `mailer_queue` (existente): estados **fechados** — `pending, claimed, accepted, failed_retryable, failed_permanent, unconfirmed, cancelled`. O que hoje é `sent` passa a ser `accepted` (aceito pela Resend) e **só é gravado junto com `provider_message_id` na mesma transação**.
- Índices: `(campaign_id, status)`, único `(campaign_id, email_normalized)`, `(provider_message_id)`.
- Exclusões do preflight ficam em `mailer_campaign_exclusions (campaign_id, email, reason)`, para o relatório explicar cada descarte.

### 4.3 Preparação atômica e deduplicação global
1. **Preflight no servidor** (`mailer_preflight`): normaliza e-mail (lowercase, trim), classifica cada seleção com **um motivo primário**: `elegível | duplicado | inválido | suprimido/descadastrado | bloqueado por not-a-fit/pausa`. A UI mostra o resultado do servidor e **nunca recalcula por conta própria**.
2. Invariante exibida: `selecionados = elegíveis + duplicados + inválidos + suprimidos + outros`.
3. **Cota mensal:** o preflight lê quanto já foi aceito no ciclo (`MAILER_MONTHLY_QUOTA=20000`, `MAILER_QUOTA_CYCLE_START_DAY`) e **bloqueia** campanha que estouraria, com aviso a partir de 80%.
4. **Criação:** `create_mailer_campaign(idempotency_key)` cria o cabeçalho em `preparing`; os destinatários entram em fatias de 1.000 com `ON CONFLICT DO NOTHING` (a unicidade vem do banco, não da fatia); `activate_mailer_campaign` só vira `running` se `count(fila) = manifesto` e o fingerprint bate. Clique repetido ou falha no meio reaproveitam a mesma campanha e continuam de onde pararam. **Nunca existe fila ativada incompleta.**

### 4.4 Tratamento de falhas (matriz fechada)

| Situação | Ação |
| --- | --- |
| 200 com ids por item | `finalize_mailer_batch` marca `accepted` + `provider_message_id` (atômico). |
| 200 parcial / erro por item 4xx | item `failed_permanent` com motivo categorizado; demais `accepted`. |
| 429 rate limit | respeita `retry-after`; lote volta a `claimed` e **repete com a mesma chave**. Sem erro visível ao usuário, só “aguardando intervalo”. |
| 429 `monthly_quota_exceeded` / `daily_quota_exceeded` | campanha **pausa por segurança**, sem marcar falha; mensagem clara. |
| 5xx, timeout, queda de rede, função cortada | lote `ambiguous` → **reenvio idêntico com a mesma chave** (seguro por 24 h). Resultado idêntico ao original, sem duplicar. |
| `409 concurrent_idempotent_requests` | aguarda e tenta de novo. |
| `409 invalid_idempotent_request` | **não reenviar**; itens `unconfirmed`, exige decisão humana. |
| Lote ambíguo com mais de 24 h | `unconfirmed` (reconciliação por webhook/ID ou decisão humana). Nunca reenvio cego. |
| 3 tentativas esgotadas em erro retentável | `failed_retryable`, aparece no relatório com botão “reenviar”. |
| Bounce rate alto (guard já existente) | pausa por segurança, mantida e visível. |
| Aba fechada / computador desligado | com cron ativo, a campanha **continua**; sem cron, estado fica salvo e retoma ao reabrir. |

Regra de ouro: **item só muda de estado dentro de `finalize_mailer_batch`**, e o log (`recruit_email_logs`) é escrito na mesma transação. Falha de log secundário não pode desfazer nem inventar status.

### 4.5 Progresso real (fonte única)
- Uma RPC de leitura, `mailer_campaign_progress(campaign_id)`, devolve em **um** `jsonb` leve (~1 KB): contagens por estado, lote atual/total, `as_of`, contadores de entrega por **mensagem distinta** (a partir de `email_events`) e estimativa de tempo restante baseada na vazão real dos últimos lotes.
- **Barra 1 (principal): processamento** = `(accepted + failed_permanent + failed_retryable + unconfirmed + cancelled) / elegíveis`. Chega a 100% quando **todos têm decisão**, não quando “o contador do React” diz.
- **Barra 2 (secundária): entrega** = `entregues confirmados / aceitos`, com legenda “aguardando confirmação” e carimbo de atualização. Nunca escrever “100% entregue” sem evidência.
- A UI **não tem contadores locais**. Se a soma dos estados ≠ elegíveis, mostra um aviso de inconsistência em vez de uma barra enganosa.
- Polling adaptativo: 2 s rodando, 10 s pausada/aguardando, 0 quando final. Só consulta o agregado, nunca a fila inteira.

### 4.6 Relatório final (parte do produto, não detalhe)
Ao terminar, a campanha ganha um **relatório congelado** + atualização viva de entrega:
- Resumo: elegíveis, aceitos, entregues, bounces, suprimidos pela Resend, falhas, não confirmados, tempo total.
- **Não enviados**, agrupados por motivo: duplicado, inválido, descadastrado/suprimido, endereço rejeitado, erro permanente do provedor, cota, não confirmado. Cada linha: e-mail, universidade/coach, motivo em português e ação sugerida.
- Ações: **Exportar CSV**, **Reenviar somente falhas retentáveis** (mesma campanha, mesmas chaves de lote novas por seq), **Resolver não confirmados**.
- Status final honesto: `Concluída — tudo aceito`, `Concluída com ressalvas (N itens)`, `Pausada por segurança`, `Interrompida — reabra para retomar`.

### 4.7 Um relógio só na UI
- Remover o Web Worker e os `setInterval` de orquestração; ficar com **um agendador** (`useCampaignRunner`) que encadeia um `setTimeout` guiado pelo `nextTickInMs` do servidor, pausa por `visibilitychange` e usa `BroadcastChannel` para evitar duas abas ativas.
- A UI é **visualizadora**: mostrar progresso, pausar, retomar, cancelar. Cancelar só interrompe o que não foi reservado; o que já foi aceito permanece.
- Novos componentes isolados em `src/components/mailer/` (painel de progresso, preflight, relatório). **Sem refatorar o resto de `mailer.tsx`.**

### 4.8 Rede de segurança opcional: pg_cron do Supabase (free)
- Uma migration **separada e manual** (`0032_mailer_cron_optional.sql`) agenda, a cada minuto, `pg_net` chamando `POST /api/mailer/tick` para campanhas `running` com lease expirado, autenticado por segredo (`MAILER_CRON_SECRET`, comparação em tempo constante; URL e segredo no Supabase Vault).
- **Isso reverte a decisão de 16/10** (“fila só no navegador”). É recomendado porque é o único jeito de garantir término com a aba fechada, sem custo e sem nova infraestrutura. O motor é o mesmo, então dá para **ligar ou desligar** sem alterar código (`MAILER_CRON_ENABLED`). Decisão sua; o plano funciona nos dois modos.

## 5. Orçamento do free (campanha de 5.000)

| Recurso | Consumo estimado | Observação |
| --- | --- | --- |
| Resend | 50 chamadas batch, 5.000 e-mails (25% da cota mensal) | Cota guardada no preflight. |
| Vercel | ~10–40 invocações de tick + ~1 invocação/2 s de polling enquanto a tela estiver aberta | Muito abaixo do limite mensal; duração por tick limitada pelo orçamento. |
| Supabase escrita | ~50 RPCs `claim` + ~50 `finalize` (cada uma grava 100 itens) | Em vez de 5.000 updates avulsos. |
| Supabase egress | polling ≈ 1 KB por consulta; sem HTML por item (snapshot único por campanha) | Foi o ponto que estourou em setembro; fica protegido. |
| Tempo total | ~2–6 minutos para 5k, conforme o orçamento de tempo permitido | Meça no primeiro teste real. |

**Verificar no painel antes do deploy** (o agente não consegue ver): duração máxima de função no projeto Vercel, e se o projeto Supabase free não está perto de pausa por inatividade.

## 6. O que NÃO muda
Preview, filtros, personalização, cards, atletas, descadastro, “not a fit”, webhooks, autenticação, `package.json` e `bun.lock`. Nenhuma troca de provedor. Nenhum reprocessamento de campanhas antigas.

## 7. Legado
- Os **100 itens `sent` sem ID** da campanha `2725beda…` **não são reescritos**: entram como `unconfirmed` com nota “legado”, e a tela de resolução usa os eventos de webhook para fechar cada um. O `draft` de 399 vira `cancelled` com motivo, sem disparo.

## 8. Plano de rollout (humano + agente)
1. Rodar o **script de pré-checagem somente leitura** (`verify-0031-prereqs.sql`) no Supabase e colar o resultado. Se faltar coluna/tabela, a migration **aborta com mensagem clara** (evita repetir o erro `profiles.role`).
2. Aplicar `0031`, rodar `verify-0031.sql`, só então publicar o código.
3. Campanha real de **20 contatos próprios** (caixas de teste, nunca coaches): conferir UI × Supabase × Resend × webhooks.
4. **500** contatos reais, medindo duração de tick, 429 e egress.
5. **5.000**, com cron ligado, observando os eventos reais.
6. Rollback: variável `MAILER_ENGINE=legacy` mantém o caminho antigo até a etapa 5 passar (removido depois).

## 9. Critérios de aceite
- Simulação (Resend/Supabase falsos) de **5.000** com 429 intermitentes, 5xx, timeout pós-aceite, função morta no meio, duas abas e lease vencido: **zero duplicados, zero item sem decisão, zero linha `accepted` sem `provider_message_id`**.
- Invariantes sempre fechando: `selecionados = elegíveis + exclusões` e `elegíveis = soma dos estados`.
- A barra só chega a 100% quando todos os elegíveis têm decisão; a segunda barra nunca passa de 100% dos aceitos.
- Relatório final lista cada não enviado com motivo e exporta CSV.
- Gate AGENTS.md (regra 7) com saídas reais anexadas ao `BACKLOGER.md`. Teste verde **não** substitui a campanha de 20 e a de 500.

---

# PARTE 2 — Prompt para o Google AI Studio

> Copie daqui até o fim do arquivo.

```
Você vai implementar, em UMA ÚNICA ENTREGA COMPLETA, a reestruturação de confiabilidade do Recruit Mailer do repositório SrKain/dream-athletic-path (branch main). NÃO entregue parcialmente, NÃO faça microversões e NÃO pare para pedir confirmação de cada fase.

APROVAÇÃO HUMANA: o solicitante (Kauan) aprova explicitamente este plano e a alteração de código e de migrations descritas aqui. Isso vale somente para o escopo abaixo.

LEITURA OBRIGATÓRIA ANTES DE QUALQUER EDIÇÃO: README.md, AGENTS.md, CERNE.md, BACKLOGER.md, UI&UX.md e TODOS os planos em think/, principalmente think/2026-10-29-1500-mailer-arquitetura-a-prova-de-falhas-e-prompt-ai-studio.md (Parte 1 = especificação; ela manda) e think/2026-10-29-1417-*.md. Em conflito entre documentos, vale a Parte 1 do plano de 15:00.

OBJETIVO: o mailer deve disparar 5.000+ e-mails seguidos sem travar, sem cancelar, sem fila presa e sem erro no meio, com progresso REAL e relatório final correto, mantendo Supabase e Vercel no plano free e a Resend como único motor de envio (plano de 20.000/mês). Não troque de provedor nem adicione infraestrutura paga.

ESCOPO (implementar tudo):
1. Motor único `runCampaignTick(campaignId)` no servidor, idempotente, com orçamento de tempo (MAILER_TICK_BUDGET_MS, padrão 8000), lotes SEQUENCIAIS de até 100 e-mails com intervalo mínimo MAILER_BATCH_GAP_MS (padrão 1500), sem paralelismo entre lotes, lease de 90 s renovado a cada lote, devolvendo `nextTickInMs`. Endpoint autenticado /api/mailer/tick (sessão agency_admin OU segredo MAILER_CRON_SECRET em comparação de tempo constante).
2. Migration db/migrations/0031_mailer_reliability.sql, IDEMPOTENTE, com BLOCO DE PRÉ-CHECAGEM no início que verifica por information_schema/pg_proc cada tabela, coluna e função de que depende e ABORTA com mensagem listando exatamente o que falta. Crie também db/migrations/verify-0031-prereqs.sql (somente leitura) e verify-0031.sql. ANTES de escrever SQL, leia todas as migrations 0001–0030 e use apenas colunas que existem de fato (já houve erro "profiles.role does not exist"). Conteúdo: tabela mailer_batches; estados fechados de mailer_queue (pending, claimed, accepted, failed_retryable, failed_permanent, unconfirmed, cancelled) com migração segura dos valores antigos; tabela mailer_campaign_exclusions; índices (campaign_id,status), único (campaign_id,email_normalized), (provider_message_id); RPCs mailer_preflight, create_mailer_campaign (com idempotency_key), activate_mailer_campaign (só ativa se contagem da fila = manifesto e fingerprint confere), claim_mailer_batch (FOR UPDATE SKIP LOCKED, cria o lote e a chave `mc:{campaign_id}:b{seq}` imutável), finalize_mailer_batch (TRANSAÇÃO ÚNICA: itens + lote + contadores + recruit_email_logs), mailer_campaign_progress (jsonb leve). RLS/segurança no padrão da migration 0026. Não aplique nada em produção; o humano aplica depois da pré-checagem.
3. Envio via Resend Batch API com cabeçalho Idempotency-Key estável por lote. Matriz de falhas EXATAMENTE como na seção 4.4 do plano: 429 respeita retry-after e repete com a MESMA chave; quota mensal/diária pausa a campanha por segurança sem marcar falha; 5xx/timeout/função cortada marca o lote ambiguous e REENVIA O PAYLOAD IDÊNTICO com a mesma chave (a renderização do payload deve ser determinística: sem timestamps ou valores aleatórios no corpo); 409 invalid_idempotent_request NUNCA reenvia (itens unconfirmed); 409 concurrent_idempotent_requests espera e tenta de novo; lote ambíguo com mais de 24 h vira unconfirmed. NUNCA reenvie às cegas um item de resultado incerto. Mantenha o bounce guard existente.
4. Preparação atômica e deduplicação GLOBAL por e-mail normalizado feita no servidor (a UI exibe o resultado do servidor e não recalcula). Fatias de 1.000 com ON CONFLICT DO NOTHING; retry/clique repetido reaproveita a mesma campanha. Nunca deixar fila ativada incompleta. Preflight com invariante selecionados = elegíveis + duplicados + inválidos + suprimidos + outros (um motivo primário por seleção) e bloqueio por cota mensal (MAILER_MONTHLY_QUOTA=20000, MAILER_QUOTA_CYCLE_START_DAY), com aviso a partir de 80%.
5. UI: um único agendador `useCampaignRunner` (setTimeout encadeado guiado por nextTickInMs, pausa por visibilitychange, BroadcastChannel contra duas abas). REMOVA o Web Worker e os setInterval de orquestração do mailer.tsx. Novos componentes isolados em src/components/mailer/: painel de progresso, preflight e relatório final. NÃO refatore o resto de mailer.tsx.
6. Progresso real: a UI só lê mailer_campaign_progress (sem contadores locais). Barra 1 = decididos/elegíveis (decididos = accepted + failed_permanent + failed_retryable + unconfirmed + cancelled). Barra 2 = entregues confirmados/aceitos, com legenda "aguardando confirmação" e horário da última atualização. Polling adaptativo (2 s rodando, 10 s pausada, 0 no final). Se a soma dos estados ≠ elegíveis, mostrar aviso de inconsistência em vez de barra enganosa. Nunca escrever "100% entregue" sem eventos. Mostrar tempo restante estimado pela vazão real, mensagens como "Próximo lote em X s", "Resend pediu pausa; retomada programada", "Pausada por segurança".
7. Relatório final: resumo + lista de NÃO enviados agrupada por motivo em português (duplicado, inválido, descadastrado/suprimido, rejeitado pelo provedor, cota, não confirmado), cada linha com e-mail, universidade/coach, motivo e ação sugerida; Exportar CSV; "Reenviar somente falhas retentáveis"; "Resolver não confirmados". Status final honesto: Concluída — tudo aceito / Concluída com ressalvas (N) / Pausada por segurança / Interrompida — reabra para retomar.
8. Legado: não reescrever nem reprocessar campanhas antigas. Os 100 itens "sent" sem provider_message_id da campanha 2725beda… entram como unconfirmed com nota "legado"; o rascunho de 399 destinatários (8a56bef1…) vira cancelled com motivo. Isso é feito por rotina de reconciliação no SQL/servidor, sem inventar dados.
9. Opcional, em arquivo SEPARADO: db/migrations/0032_mailer_cron_optional.sql com pg_cron + pg_net chamando /api/mailer/tick a cada minuto para campanhas running com lease expirado (URL e segredo via Supabase Vault), protegido por MAILER_CRON_ENABLED. Documente o passo a passo manual. O código deve funcionar com e sem cron.
10. Flag de rollback MAILER_ENGINE=legacy|v2 mantendo o caminho antigo até a validação humana.

PROIBIDO: alterar package.json ou bun.lock (se o ambiente os modificar, desfaça antes de entregar); usar flags perigosas contra vulnerabilidades; trocar Resend; criar Redis/Cloudflare/brokers; alterar preview, filtros, personalização, cards, atletas, descadastro, "not a fit", webhooks (exceto o necessário para gravar eventos por mensagem), autenticação ou outros módulos; remover, pular ou relaxar src/lib/lockfile-sync.test.ts; testes que dependam de rede (mocke Resend, Supabase e node:dns); declarar "verde" sem executar.

TESTES OBRIGATÓRIOS (Resend/Supabase falsos, sem rede): simulações de 100, 500, 800, 1.500 e 5.000 destinatários em todos os modos (individual, multi-atleta, catálogo) cobrindo: duplicatas dentro e entre fatias; inválidos e supressão entre preflight e envio; falha no meio da preparação e clique repetido; sucesso/erro misto em batch; 429 com retry-after; quota mensal; timeout após aceite com reenvio idêntico e mesma chave; 409 de payload diferente; processo morto no meio com lease vencido; duas abas; webhook duplicado, tardio e fora de ordem; invariantes (selecionados = elegíveis + exclusões; elegíveis = soma dos estados); nenhuma linha accepted sem provider_message_id; barra nunca incoerente. Inclua teste de contrato de cada RPC nova e atualize TODOS os chamadores de contratos alterados (grep -rn do nome, incluindo src/server.ts).

PORTÃO ANTI-BUILD-QUEBRADA (AGENTS.md regra 7), cole a SAÍDA REAL de cada comando no BACKLOGER.md: 1) bun install --frozen-lockfile; 2) git diff --exit-code -- package.json bun.lock; 3) bun run validate (lint + typecheck + test + build, todos com código 0). Se o seu ambiente não conseguir executar algum comando, diga EXATAMENTE qual e por quê no BACKLOGER.md e marque como [PENDENTE DE VALIDAÇÃO HUMANA]; nunca simule saída. Se alguma etapa falhar sem solução dentro das regras, PARE e reporte em vez de entregar código quebrado. Commits de documentação não carregam código.

DOCUMENTAÇÃO: atualizar CERNE.md (arquitetura nova do mailer, estados, RPCs, variáveis de ambiente), registrar TASK-115 no BACKLOGER.md (pedido, data/hora, solicitante Kauan, executor, status) e criar think/ apenas se precisar registrar desvio do plano, explicando o motivo.

ENTREGA FINAL (um relatório consolidado, curto): (a) lista de arquivos criados/alterados; (b) migrations a aplicar e ordem, com o passo da pré-checagem; (c) variáveis de ambiente novas com valor padrão; (d) resultado real do portão e dos testes; (e) tabela de consumo estimado para 5.000 (chamadas Resend, invocações Vercel, escritas e egress Supabase); (f) checklist de rollout (20 contatos próprios → 500 → 5.000) e de rollback; (g) riscos que dependem de verificação humana nos painéis (duração máxima de função na Vercel; limites da Resend). Não prometa entrega de 100%: o contrato é processar todos os elegíveis e explicar todos os demais.
```
