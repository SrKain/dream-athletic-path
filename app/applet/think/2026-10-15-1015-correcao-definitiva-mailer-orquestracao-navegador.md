# Planejamento — Correção Definitiva do Mailer: Orquestração pelo Navegador e Desacoplamento de Vercel Cron

- **Data/Hora:** 2026-10-15 10:15 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Architect)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[AGUARDANDO APROVAÇÃO HUMANA]`
- **Modalidade de Entrega:** Entrega Consolidada e Segura (Zero Partial Delivery)
- **Package Manager:** Bun 1.3.14 (exclusivo, bun.lock intocado)
- **Arquivos Críticos Afetados:**
  - `vercel.json` (remoção da propriedade `crons`)
  - `src/server.ts` (remoção dos endpoints legados e desprotegidos de cron)
  - `src/lib/email/mailer-queue.server.ts` (execução em micro-lotes curtos de 2 e-mails, eliminação de loops longos no servidor, eliminação de fallbacks sem lock)
  - `src/lib/email/recruit-email.functions.ts` (nova Server Function autenticada `processMailerMicroBatchServerFn` com `requireAgency`, remoção de gatilhos soltos em background)
  - `src/routes/_authenticated/admin/mailer.tsx` (orquestrador no navegador com loop sequencial de 1s, micro-lotes de 2 e-mails, detecção de visibilidade de aba e alerta discreto, pausa/retomada/cancelamento e recuperação de campanhas)
  - `src/lib/email/mailer-queue.test.ts` e suites de teste relacionadas

---

## 1. Diagnóstico Técnico Atual e Causa Raiz dos Problemas

### 1.1. Bloqueio de Deploy na Vercel (Hobby Tier vs. Vercel Cron)

- **Problema:** A migration e arquitetura anterior introduziram a seção `"crons"` no `vercel.json`:
  ```json
  "crons": [
    {
      "path": "/api/cron/process-mailer-queue",
      "schedule": "* * * * *"
    }
  ]
  ```
- **Causa Raiz:** O plano gratuito da Vercel (Hobby) não permite execuções por minuto (`* * * * *`). O deploy é imediatamente rejeitado pela infraestrutura da Vercel.
- **Decisão:** Remover integralmente a chave `"crons"` do `vercel.json`. Não adotar Vercel Cron, Supabase Cron (pg_cron) ou serviços terceiros pagos/adicionais. O navegador autenticado do administrador assume a orquestração ativa dos disparos enquanto a campanha estiver em execução.

### 1.2. Processamento Monolítico e Risco de Timeout Serverless

- **Problema:** O worker no servidor (`processMailerQueue`) tentava processar até 150 e-mails sequencialmente em uma única invocação HTTP/Serverless.
- **Causa Raiz:** No plano Hobby da Vercel, o tempo limite de execução (timeout) de uma função serverless é de 10 a 15 segundos. Processar 150 e-mails com intervalos de ~400ms levaria mais de 60 segundos, causando o cancelamento forçado da requisição pela Vercel e deixando os itens em estado inconsistente (`processing` órfão).
- **Solução:** O backend processará micro-lotes de estritamente 2 e-mails por requisição. A requisição executa em menos de 1 segundo, eliminando qualquer risco de timeout serverless.

### 1.3. Disparos "Fire-and-Forget" sem Aguardar Conclusão

- **Problema:** Em `enqueueMailerCampaignServerFn` e `resumeMailerCampaignServerFn`, o código executava `processMailerQueue().catch(...)` em segundo plano de forma desvinculada do ciclo de vida da requisição HTTP. Em ambientes serverless (Vercel/Nitro), o processo do Node.js é congelado imediatamente após o término da resposta HTTP, interrompendo a execução em segundo plano de forma imprevisível.
- **Solução:** Eliminar totalmente os disparos soltos em background. O frontend gerencia o ciclo: após enfileirar a campanha ou clicar em "Retomar", o orquestrador do navegador inicia a chamada sequencial dos micro-lotes.

### 1.4. Endpoints de Cron Desprotegidos

- **Problema:** Os caminhos `/api/cron/process-mailer-queue` e `/api/mailer/process-queue` em `src/server.ts` permitiam chamadas diretas sem validação de sessão da agência.
- **Solução:** Remover essas rotas públicas do `src/server.ts`. Todo o processamento passa a ser acionado via Server Function tipada (`processMailerMicroBatchServerFn`), autenticada com o middleware `requireAgency` e protegida por tokens de sessão do Supabase.

### 1.5. Fallback sem Concorrência Segura

- **Problema:** Caso a RPC `claim_mailer_queue_batch` falhasse por qualquer motivo, o código utilizava um fallback com `.select()` e `.update()` sem a cláusula transacional `FOR UPDATE SKIP LOCKED`. Se duas abas estivessem abertas, o mesmo lote poderia ser reservado em duplicidade.
- **Solução:** Preservar estritamente o mecanismo `FOR UPDATE SKIP LOCKED` da RPC. Em caso de falha da RPC, a requisição aborta com erro seguro e controlado, impedindo qualquer risco de envio duplo.

### 1.6. Preservação Integral das Modificações Recentes do Codex (PR #2)

- O repositório já contém as melhorias do PR #2:
  - Assunto customizado nos 3 modos (`single`, `multi`, `catalog`).
  - Saudação personalizada com sobrenome do coach ("Hi Coach [LastName],").
  - Pipeline canônico de blocos (`EmailBlock[]`) em `personal-email-renderer.ts`.
  - Botões do card em inglês com design system ("VIEW FULL PROFILE", "RECRUIT NOW" via WhatsApp/e-mail, "NOT A FIT" com `mailto:contact@goteamgoagency.com?subject=Not a fit: [athlete name]`).
  - Campo "Available" sincronizado com `seeking_opportunities`.
  - Preferências e conflitos de interesse de coaches.
- **Garantia:** Nenhuma dessas implementações será sobrescrita, revertida ou afetada.

---

## 2. Arquitetura da Solução: Fila Controlada pelo Navegador

### 2.1. Fluxo de Execução Orquestrado

```text
[ Administrador no Painel /admin/mailer ]
                   │
                   ▼ (1. Enfileiramento: cria campanha e 100% dos itens na fila)
      [ enqueueMailerCampaignServerFn ]
                   │
                   ▼ (2. Resposta: campaignId retornado para o navegador)
    ┌──────────────────────────────────────────────────────────────┐
    │              LOOP DE ORQUESTRAÇÃO DO NAVEGADOR               │
    │  - Executa a cada ~1.000 ms via setTimeout encadeado        │
    │  - Dispara micro-lote de 2 e-mails por requisição            │
    │  - Aguarda resposta da requisição anterior antes da próxima  │
    │  - Respeita janela de cooldown (60s a cada 150 e-mails)      │
    │  - Monitora document.visibilityState (alerta se aba oculta)  │
    └──────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼ (3. POST autenticado com requireAgency)
              [ processMailerMicroBatchServerFn({ campaignId, batchSize: 2 }) ]
                                   │
                                   ▼
             [ Supabase: claim_mailer_queue_batch (FOR UPDATE SKIP LOCKED) ]
                                   │
                                   ▼ (4. Envio de até 2 itens via Resend)
              [ Resend SDK emails.send(item) com Idempotency Check ]
                                   │
                                   ▼ (5. Persistência atômica dos resultados)
             [ mailer_queue: 'sent'/'retry'/'failed' + recruit_email_logs ]
                                   │
                                   ▼
             [ Resposta do Backend com Progresso Consolidado ]
                                   │
                                   ▼ (6. Atualização instantânea da UI)
              [ Atualiza barra de progresso, contadores e ETA ]
```

### 2.2. Responsabilidades do Frontend

1. **Loop Sequencial Seguro:**
   - Implementado com `useRef` e `setTimeout` encadeado ao término de cada resposta (evitando o drift e o acúmulo de requisições de `setInterval`).
   - Bloqueia novas chamadas enquanto a anterior estiver pendente (`isProcessingTickRef = true`).
2. **Controle de Vazão e Cooldown:**
   - Quando o backend indicar que 150 e-mails foram enviados na janela atual, ele retorna `cooldownRemainingSec` (60 segundos). O navegador exibe a contagem regressiva e pausa as chamadas até o término da janela.
3. **Visibilidade da Aba (`document.visibilityState`):**
   - Conforme escolha do usuário, os disparos continuam normalmente em segundo plano se o navegador permitir a execução de timers;
   - Uma mensagem informativa discreta e persistente é exibida na tela:
     _"Aba do navegador deve permanecer aberta durante o envio da campanha. Minimizar ou suspender o navegador pausará temporariamente os disparos."_
4. **Resiliência a Quedas e Fechamento:**
   - Se o navegador for fechado ou cair a conexão, os e-mails restantes permanecem salvos em `mailer_queue` como `pending`.
   - Ao reabrir `/admin/mailer`, o sistema detecta a campanha ativa através de `getLatestActiveCampaignServerFn` e permite retomar com um clique, sem duplicações.
5. **Ações de Controle:**
   - Botões de **Pausar**, **Retomar** e **Cancelar** alteram o status no Supabase e interrompem imediatamente o loop do navegador.

### 2.3. Responsabilidades do Backend

1. **Autenticação:** Toda requisição passa por `requireAgency`, garantindo que apenas administradores autenticados operem a fila.
2. **Reserva Atômica Concorrente:**
   - Utiliza exclusivamente `claim_mailer_queue_batch(p_worker_id, p_batch_size, p_lock_duration_sec)`.
   - `FOR UPDATE SKIP LOCKED` impede conflito entre abas ou administradores simultâneos.
3. **Idempotência no Envio:**
   - Cada item da fila possui `idempotency_key` única (`${campaignId}:${recipientEmail}`).
   - Antes de enviar ao Resend, verifica se já existe `provider_message_id`. Se existir, pula o envio e apenas confirma o estado.
   - Trata erros de rede com retentativa segura e backoff exponencial com jitter.
4. **Respeito aos Limites Globais:**
   - Valida `mailer_rate_limits` (`locked_until`). Em caso de HTTP 429 recebido do Resend, ativa `locked_until` por 60 segundos e sinaliza ao navegador para aguardar.

---

## 3. Plano de Implementação Detalhado

### Etapa 1: Correção do Deploy da Vercel (`vercel.json` e `src/server.ts`)

- Remover a chave `"crons"` de `vercel.json`, mantendo `buildCommand`, `installCommand`, `framework` e `outputDirectory`.
- Remover as rotas `/api/cron/process-mailer-queue` e `/api/mailer/process-queue` de `src/server.ts`.

### Etapa 2: Refatoração do Motor de Fila no Backend (`src/lib/email/mailer-queue.server.ts`)

- Configurar o tamanho de micro-lote padrão para **2 e-mails** (`DEFAULT_MICRO_BATCH_SIZE = 2`).
- Adaptar `processMailerQueue` para aceitar `campaignId` e `batchSize` (default 2).
- Remover o fallback de reserva sem lock (garantia estrita de concorrência com `SKIP LOCKED`).
- Retornar objeto detalhado de controle de taxa: `{ processed, sent, failed, retried, rateLimited, cooldownRemainingSec, campaignCompleted, status, percentComplete, ... }`.
- Garantir que `enqueueCampaignDispatches` e `resumeCampaign` NÃO disparem chamadas soltas em background.

### Etapa 3: Criação de Server Function Protegida (`src/lib/email/recruit-email.functions.ts`)

- Adicionar `processMailerMicroBatchServerFn`:
  - Protegida com `.middleware([requireAgency])`.
  - Valida parâmetros (`campaignId`, `batchSize?: number`).
  - Executa `processMailerQueue({ campaignId, maxBatchSize: batchSize || 2 })`.
  - Retorna o progresso atualizado e estado do cooldown.

### Etapa 4: Orquestrador no Frontend (`src/routes/_authenticated/admin/mailer.tsx`)

- Implementar o orquestrador reativo com `useRef`:
  - `isOrchestratorActiveRef`: flag de ativação.
  - `isProcessingTickRef`: trava de concorrência local (uma requisição por vez).
  - `tickTimeoutRef`: timer encadeado com cadência nominal de 1.000 ms.
- Conectar `handleSendMailer`: após `enqueueMailerCampaignServerFn`, ativa imediatamente o orquestrador.
- Conectar `handleResumeCampaign`: após `resumeMailerCampaignServerFn`, reativa o orquestrador.
- Conectar `handlePauseCampaign` e `handleCancelCampaign`: param o orquestrador imediatamente.
- Adicionar monitoramento de `document.visibilityState`: se oculto, exibe banner de aviso de continuidade.
- Exibir aviso sutil e permanente no painel da fila:
  _"Mantenha esta aba aberta durante o disparo. O progresso é salvo continuamente e pode ser pausado ou retomado a qualquer momento."_
- Otimizar consumo de banco: utilizar a resposta de cada micro-lote para atualizar o progresso na UI, reduzindo o polling auxiliar.

### Etapa 5: Ajuste de Testes e Validação Completa

- Ajustar os testes unitários em `src/lib/email/mailer-queue.test.ts` para testar os micro-lotes de 2 e-mails, o cooldown de 150 e a recuperação de campanhas.
- Corrigir os 5 testes que falharam na suite por mocks desatualizados:
  - `recruit-email-send.test.ts`: adicionar mock do método `.in()` para `athlete_videos`.
  - `recruit-email-multi.test.ts`: atualizar asserções de botões para os novos textos do Codex ("VIEW FULL PROFILE", "RECRUIT NOW", "NOT A FIT").
- Executar e validar:
  - `bun run typecheck`
  - `bun run test`
  - `bun run lint`
  - `bun run build`
- Atualizar `CERNE.md` e `BACKLOGER.md`.

---

## 4. Avaliação de Riscos e Mitigações

| Risco                                        | Impacto                                  | Mitigação Arquitetural                                                                                                                  |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Fechamento acidental da aba**              | Envio é interrompido no meio da campanha | Itens restantes permanecem `pending` no Supabase. Campanha é reidentificada na reabertura com botão "Retomar" imediato.                 |
| **Timeout serverless na Vercel**             | Requisição abortada pelo provedor        | Cada micro-lote envia apenas 2 e-mails (~500ms), muito abaixo do limite de 10-15s do plano Hobby.                                       |
| **Esgotamento de cota / HTTP 429**           | Falhas temporárias na API do Resend      | Backend captura o 429, trava globalmente por 60s em `mailer_rate_limits` e o frontend respeita a janela com contagem regressiva visual. |
| **Múltiplas abas do mesmo admin**            | Possibilidade de disparo duplo           | RPC com `FOR UPDATE SKIP LOCKED` e `idempotency_key` única por destinatário impedem reserva e envio duplicado.                          |
| **Conflito com alterações do Codex (PR #2)** | Perda de personalização recente          | Nenhuma das funções de renderização (`EmailBlock[]`, saudações por sobrenome, assuntos customizados, CTAs) será alterada.               |

---

## 5. Próximo Passo

Aguardar aprovação humana explícita deste plano para iniciar a implementação no código.
