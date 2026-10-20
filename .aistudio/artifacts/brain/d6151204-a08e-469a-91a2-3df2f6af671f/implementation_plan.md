# Plano de Solução — Correção de Textos Personalizados no Mailer (TASK-105)

## 1. Contexto e Objetivo
Corrigir definitivamente o defeito onde textos personalizados preenchidos no Mailer ("Chamada / Hook", "Texto Institucional", "Headline" e "Mensagem") são ignorados no preview e no envio real de e-mails em todos os modos (individual, múltiplo e catálogo).

---

## 2. Diagnóstico & Causa Raiz
1. **Descarte de campos quando `blocks` existe:** `mailer.tsx` envia sempre `finalBlocks`. No backend e no template (`resolveLegacyBodyBlocks`), `if (data.blocks?.length) return data.blocks;` ignora silenciosamente `customHook` e `customIntroduction`.
2. **Campos desconectados do composer:** Os blocos de texto no composer usavam textos estáticos e não sincronizavam com os inputs de personalização.
3. **Inversão semântica de rótulos:** "Chamada / Hook" era inserido como fechamento e "Texto Institucional" como introdução.
4. **Omissão e vazamento no catálogo:** `customHeadline` só servia de fallback de assunto, `customHook` era ignorado, e `customIntroduction` de outros modos sobrepunha `customMessage`.

---

## 3. Contrato Unificado de Apresentação e Envio

### Individual e Multi (ordem visual de cima para baixo):
1. **Saudação automática:** `buildCoachGreeting(lastName)` ("Hi Coach [Sobrenome],");
2. **Abertura:** `customHook.trim()` se preenchido; se vazio, fallback padrão ("I hope you're doing well...");
3. **Cards das atletas:** Renderizados de forma determinística e validados pela TASK-103;
4. **Fechamento:** `customIntroduction.trim()` se preenchido; se vazio, fallback padrão ("Let me know what you think.");
5. **Assinatura e Ações Obrigatórias:** GTG Signature, Unsubscribe, Not a Fit, Go to Catalog.

### Catálogo:
1. **Headline:** Título principal visível no HTML e texto (e fallback do assunto);
2. **Hook:** Linha de destaque logo abaixo do título;
3. **Mensagem Institucional:** Parágrafo institucional GTG;
4. **Isolamento:** `customIntroduction` completamente removido do catálogo para impedir vazamento entre abas.

---

## 4. Etapas de Implementação

### Passo 1 — Módulo Puro `src/lib/email/email-blocks.ts`
- Implementar `composeEmailBlocks({ opening, closing, athleteIds, cardOrder })` utilizando `buildFixedEmailBlocks` e `reconcileEmailBlocks`.
- Atualizar `assertEmailIntegrity` para verificar a presença efetiva dos textos de abertura/fechamento (e headline/hook/message no catálogo) tanto no HTML quanto no plain text (*fail-closed*).

### Passo 2 — Interface do Mailer (`src/routes/_authenticated/admin/mailer.tsx`)
- Derivar `finalBlocks` via `useMemo` a partir de `composeEmailBlocks({ opening: customHook, closing: customIntroduction, athleteIds: activeComposerAthleteIds })`.
- Utilizar `finalBlocks` no preview e no envio (`handleSendMailer`).
- Adicionar textos de ajuda explicativos sob cada campo de personalização conforme diretrizes mobile-first do `UI&UX.md`.
- Desativar com segurança funções inertes de bloco não utilizadas no JSX.

### Passo 3 — Servidor & Fila (`mailer-queue.server.ts` e `recruit-email.server.ts`)
- Reconstruir os blocos no servidor com `composeEmailBlocks` a partir dos campos recebidos e atletas carregados (não confiar cegamente em blocos de texto do cliente).
- Validar integridade via `assertEmailIntegrity` antes de persistir na fila ou chamar o provedor.

### Passo 4 — Templates e Catálogo (`recruit-email-template.ts` e `recruit-email-catalog-template.ts`)
- Ajustar `resolveLegacyBodyBlocks` para preencher os slots de abertura e fechamento caso existam campos personalizados.
- Atualizar `renderCatalogRecruitEmail` e `generateCatalogPlainText` para renderizar `headline`, `hook` e `message` no HTML e no plain text.

### Passo 5 — Bateria de Testes Vitest
- Cobrir os 8 cenários obrigatórios (regressão de marcadores únicos, ordem visual, paridade preview ≡ envio, assunto, catálogo, troca de atletas/modos, fail-closed e segurança de escaping).

---

## 5. Governança e Verificação
- Manter intocados `bun.lock`, `package.json` e migrations.
- Executar `bun run typecheck`, `bun run lint`, `bun run test` e `bun run build`.
- Atualizar documentação viva `CERNE.md`.
- Registrar a conclusão da `TASK-105` no `BACKLOGER.md`.
