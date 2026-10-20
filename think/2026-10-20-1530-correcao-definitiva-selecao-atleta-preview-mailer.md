# Plano de Solução — Correção Definitiva da Seleção de Atletas e Preview no Mailer (TASK-103)

- **Data:** 2026-10-20 (America/Sao_Paulo)
- **Repositório / Branch:** `SrKain/dream-athletic-path`, `main`
- **Solicitante:** Kauan (Usuário Humano)
- **Autor do Diagnóstico:** Claude / ChatGPT (com base nas evidências de código e reprodução local)
- **Executor:** Codex / AI Studio Build
- **Tarefa no BACKLOGER:** **TASK-103** (complementa e prioriza o P0 da TASK-102)
- **Estado:** **PLANEJAMENTO CONCLUÍDO — AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA PARA EXECUÇÃO**

---

## 1. Contexto e Objetivo

Ao disparar e-mails para atletas diferentes no Mailer (`/admin/mailer`), o sistema não atualiza os blocos internos do card da atleta selecionada e dispara a mensagem sem o card de informações (Quick Facts, View Full Profile, foto e biografia).

O objetivo da TASK-103 é garantir que:
1. Em qualquer seleção de atleta (modo individual ou múltiplo), o preview e o payload enviado contenham exatamente os cards dos atletas selecionados.
2. Seja impossível disparar mensagens sem os cards correspondentes (arquitetura *fail-closed* no cliente e no servidor).
3. Textos e campos editados pelo usuário sejam preservados durante a troca de atletas.
4. Itens pendentes na fila (`mailer_queue`) que estejam sem o card sejam cancelados preventivamente.

---

## 2. Decisões Confirmadas com o Usuário

1. **Escopo dos Campos de Introdução (C7):** Foco estrito no bug do card (C1–C6); a unificação de `customIntroduction`/`customHook` permanece na TASK-102.
2. **Tratamento de Itens Pendentes na Fila:** Cancelamento automático de itens pendentes em `mailer_queue` que estejam sem o card (`QUICK FACTS` ausente no payload).
3. **Aviso de Integridade na UI:** Banner de alerta claro no preview informando a inconsistência e bloqueando o botão de envio.

---

## 3. Arquitetura da Solução

### 3.1 Módulo Puro de Reconciliação (`src/lib/email/email-blocks.ts`)
- Implementar `reconcileEmailBlocks(prev: EmailBlock[], athleteIds: string[]): EmailBlock[]`:
  - Remove blocos do tipo `athlete` cujos IDs não constam em `athleteIds`.
  - Preserva todos os blocos do tipo `text` e a ordem relativa existente.
  - Insere novos cards para IDs que ainda não estão presentes na lista de blocos (imediatamente antes do último bloco de texto de fechamento).
  - Em modo individual: substitui a referência da atleta anterior pela nova preservando posição.
- Implementar `assertEmailIntegrity({ expectedAthleteIds, renderedAthleteIds, html, text })`:
  - Valida se `renderedAthleteIds` é exatamente igual a `expectedAthleteIds`.
  - Verifica se o HTML gerado contém os marcadores do card (`QUICK FACTS` ou `VIEW FULL PROFILE`) para cada atleta.
  - Verifica se o texto plano contém as seções correspondentes.
  - Lança erro impeditivo caso haja divergência.

### 3.2 Correção no Frontend (`src/routes/_authenticated/admin/mailer.tsx`)
- Remover o `useEffect` com condição `if (prev.length > 0) return prev` (linhas 805–816).
- Derivar sincronamente `finalBlocks` via `useMemo` com base em `reconcileEmailBlocks(composerBlocks, activeComposerAthleteIds)`.
- Usar `finalBlocks` em:
  - `composerPreviewBlocks` (renderização do preview).
  - `handleSendMailer` (payload enviado ao servidor).
- Usar `activeComposerAthleteIds` como fonte única dos IDs de envio (`targetAthleteIds`).
- Adicionar banner de alerta no container de preview caso haja divergência de integridade, desabilitando o botão "Send".

### 3.3 Renderers com Integridade Verificável
- Atualizar `renderRecruitEmail` e `renderMultiAthleteRecruitEmail` em `src/lib/email/recruit-email-template.ts` para repassar e expor `expectedAthleteIds`, `renderedAthleteIds` e `missingAthleteIds`.

### 3.4 Servidor *Fail-Closed* e Limpeza de Fila
- Em `src/lib/email/mailer-queue.server.ts` e `src/lib/email/recruit-email.server.ts`:
  - Aplicar `reconcileEmailBlocks(input.blocks, loadedAthleteIds)` no servidor antes de gerar o payload persistido.
  - Executar `assertEmailIntegrity` sobre o HTML e texto gerados.
  - Em caso de falha de integridade: rejeitar a operação retornando `{ success: false, message: ... }` sem gravar nada na fila e sem acionar o Resend.
  - Implementar função de saneamento de itens pendentes na fila (`status in ('pending', 'retry')`) cujo `payload->>'html'` não contenha os cards requeridos, marcando-os como cancelados com motivo explícito.

---

## 4. Testes e Validação
- Testes unitários com Vitest em `src/lib/email/email-blocks.test.ts`.
- Validação de regressão do bug com fixtures de atletas reais e sintéticas.
- Garantia de 0 envios ao Resend e 0 inserts em caso de erro de integridade.
- Verificação completa: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.

---

## 5. Governança
- Nenhuma alteração em `bun.lock` ou `package.json`.
- Atualização viva do `CERNE.md`.
- Registro da conclusão da **TASK-103** no `BACKLOGER.md`.
