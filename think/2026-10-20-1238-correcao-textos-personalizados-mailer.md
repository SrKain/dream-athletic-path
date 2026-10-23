# Plano de Solução — Correção de Textos Personalizados no Mailer (TASK-105)

- **Data:** 2026-10-20 12:38 (America/Sao_Paulo)
- **Repositório / Branch:** `SrKain/dream-athletic-path`, `main`
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Codex / AI Studio Build
- **Tarefa no BACKLOGER:** **TASK-105** (Correção de textos personalizados no Mailer: preview, enfileiramento e catálogo)
- **Estado:** **IMPLEMENTAÇÃO CONCLUÍDA — CI VERDE; SMOKE MANUAL CONTROLADO PENDENTE**

---

## 1. Contexto e Diagnóstico

Na tela do Mailer (`/admin/mailer`), ao digitar textos nos campos de personalização ("Chamada / Hook", "Texto Institucional", "Título Principal / Headline" e "Mensagem"), os textos digitados não aparecem no preview e não são enviados no e-mail real.

### Causas Raiz Confirmadas:

1. **Ignoramento de campos quando `blocks` existe:** `mailer.tsx` gera e envia sempre `finalBlocks`. No backend e no template (`resolveLegacyBodyBlocks` em `recruit-email-template.ts`), a verificação `if (data.blocks?.length) return data.blocks;` descarta imediatamente `customHook` e `customIntroduction`.
2. **Campos da UI desconectados dos blocos:** Os blocos de texto gerados no composer inicializam com textos estáticos padrão ("Hi Coach...", "Let me know what you think."). Os campos de input `customHook` e `customIntroduction` atualizam apenas estados locais que nunca atualizavam `composerBlocks` nem `finalBlocks`.
3. **Inversão semântica nos rótulos legados:** "Chamada / Hook" estava sendo colocado no fechamento (`closing`) e "Texto Institucional" na introdução (`introduction`), em desacordo com a ordem visual esperada da tela.
4. **Modo Catálogo desprovido de renderização de campos:** Em `recruit-email-catalog-template.ts`, `customHeadline` só servia de fallback do assunto (nunca renderizado no HTML/texto), `customHook` era recebido e ignorado, e `customIntroduction` vazava de outros modos sobrepondo `customMessage`.

---

## 2. Contrato Canônico de Apresentação e Envio

### Modos Individual e Multi (Ordem Visual do E-mail):

1. **Saudação Automática:** `buildCoachGreeting(lastName)` ("Hi Coach [Sobrenome],").
2. **Abertura (Slot Superior):** `customHook.trim()` se preenchido; se vazio, texto padrão de abertura ("I hope you're doing well...").
3. **Cards das Atletas:** Cards selecionados e validados pela TASK-103.
4. **Fechamento (Slot Inferior):** `customIntroduction.trim()` se preenchido; se vazio, "Let me know what you think.".
5. **Assinatura e Ações Obrigatórias:** GTG Signature, Unsubscribe, Not a Fit, Go to Catalog (inalterados).

### Modo Catálogo:

1. **Título Principal (Headline):** Visível no HTML e texto (e fallback do assunto).
2. **Chamada / Hook:** Linha destacada logo abaixo da headline.
3. **Mensagem Institucional:** Parágrafo institucional GTG.
4. **Isolamento:** `customIntroduction` completamente removido deste modo (evita vazamento de estado).

---

## 3. Arquitetura da Implementação

### 3.1 Módulo Puro `src/lib/email/email-blocks.ts`

- Implementar `composeEmailBlocks(options: { opening?: string | null; closing?: string | null; athleteIds: string[]; cardOrder?: string[] }): EmailBlock[]`:
  - Gera deterministamente a estrutura `[saudação, abertura, ...cards, fechamento]`.
  - Se `opening` estiver vazio, usa o fallback padrão (individual ou multi).
  - Se `closing` estiver vazio, usa "Let me know what you think.".
  - Aplica `buildFixedEmailBlocks` e `reconcileEmailBlocks` garantindo ordem e ausência de duplicatas.
- Atualizar `assertEmailIntegrity`:
  - Adicionar validações para `expectedOpeningText` e `expectedClosingText`: quando textos personalizados são fornecidos, assegura que eles estejam presentes tanto no HTML quanto no texto plano.
  - Para o catálogo: validar presença de `customHeadline`, `customHook` e `customMessage` (se informados).
  - Bloqueio estrito (_fail-closed_): qualquer ausência lança exceção e impede enfileiramento / envio.

### 3.2 Frontend `src/routes/_authenticated/admin/mailer.tsx`

- Fazer `finalBlocks` ser derivado de `composeEmailBlocks({ opening: customHook, closing: customIntroduction, athleteIds: activeComposerAthleteIds })`.
- Utilizar `finalBlocks` uniformemente tanto no preview (`composerPreviewBlocks`) quanto no `handleSendMailer` (`customOptions.blocks`).
- Documentar e desativar com segurança as funções legadas de manipulação de blocos não utilizadas no JSX (`addComposerTextBlock`, `updateComposerTextBlock`, etc.).
- Atualizar os rótulos e textos de ajuda abaixo dos inputs (mobile-first, conforme `UI&UX.md`):
  - "Chamada / Hook": texto de ajuda _"Aparece logo após a saudação, antes dos cards."_
  - "Texto Institucional": texto de ajuda _"Aparece depois dos cards, antes da assinatura."_

### 3.3 Servidor e Enfileiramento (`mailer-queue.server.ts` e `recruit-email.server.ts`)

- Reconstruir os blocos com `composeEmailBlocks` a partir de `customOptions.hook`, `customOptions.introduction` e dos IDs dos atletas carregados.
- Nunca confiar cegamente em blocos de texto transmitidos pelo cliente.
- Executar `assertEmailIntegrity` com validação de presença dos textos personalizados no HTML e no plain text.
- Se falhar: 0 inserts no `mailer_queue` e 0 chamadas ao Resend.

### 3.4 Template Legado e Catálogo (`recruit-email-template.ts` e `recruit-email-catalog-template.ts`)

- Em `resolveLegacyBodyBlocks`: quando `blocks` e campos personalizados forem passados, os campos substituem os textos de abertura/fechamento, não sendo mais descartados.
- Em `renderCatalogRecruitEmail` / `renderCatalogEmail` e `generateCatalogPlainText`: renderizar `customHeadline`, `customHook` e `customMessage` nos locais dedicados no HTML e no texto plano. Eliminar leitura de `customIntroduction` no catálogo.

---

## 4. Matriz de Testes Automatizados (Vitest)

Criar/estender testes cobrindo os 8 cenários obrigatórios:

1. **Regressão do bug:** Single e Multi com campos preenchidos contêm os marcadores únicos em `html` e `text`; slots vazios geram os padrões.
2. **Ordem dos elementos:** Abertura após saudação e antes do primeiro card; fechamento após último card e antes da assinatura.
3. **Paridade Preview ≡ Envio:** Mesmos parâmetros produzem strings `html` e `text` idênticas.
4. **Assunto:** `customSubject` respeitado; se vazio, fallback automático.
5. **Catálogo:** Headline, hook e message visíveis no HTML e texto; sem vazamento de `customIntroduction`.
6. **Trocas de modo e atleta:** Preservação de textos digitados ao alternar entre atletas ou modos; preservação da integridade de cards (TASK-103).
7. **Fail-Closed:** Se o texto efetivo não constar no output gerado, `assertEmailIntegrity` lança erro impeditivo.
8. **Segurança & Escaping:** Caracteres como `<`, `>`, `&`, `"` devidamente escapados nos blocos de texto; links obrigatórios preservados.

---

## 5. Governança e Critérios de Aceite

- Nenhuma alteração em `bun.lock`, `package.json` ou migrations.
- Validação completa com Bun 1.3.14: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.
- Atualização imediata do `CERNE.md` com os novos contratos e funções.
- Registro da conclusão da **TASK-105** no `BACKLOGER.md`.

## Aprovação e execução (20/10/2026)

O usuário autorizou explicitamente a execução da TASK-105. Implantação como commit de avanço na `main`, sem reescrever histórico. O escopo mantém os mecanismos de fila intactos. Reversão exclusivamente do `bun.lock` ao blob da TASK-104 para reparar a falha `--frozen-lockfile` herdada do commit `95aa1c7`; não há atualização nem instalação de dependências no source. O status de conclusão dependerá do CI.

### Aceite automatizado

Bun 1.3.14: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run test` (253/253) e `bun run build` aprovados no commit `353d952431f2984ea127023a8c416472b9a28146`. Nenhum envio real foi realizado. CI restaurado às regras originais, workflow temporário removido.
