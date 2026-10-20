# Mailer — Correção Definitiva da Seleção de Atletas, Preview e Envio (TASK-103)

Garante que a seleção de qualquer atleta no Mailer (individual ou múltiplo) reflita instantaneamente no preview e no e-mail disparado através de reconciliação síncrona de blocos, validação *fail-closed* no cliente e servidor, e cancelamento de itens pendentes sem card.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> As seguintes decisões foram confirmadas diretamente pelo usuário e orientam a implementação:

- **Decisão 1 (Escopo dos Campos de Introdução - C7):** Confirmado foco exclusivo na correção do card e integridade (C1–C6). A unificação de `customIntroduction`/`customHook` permanece alocada na **TASK-102** para evitar sobreposição de escopo.
- **Decisão 2 (Fila Existente de Disparos):** Confirmado que itens atualmente pendentes ou em retry na tabela `mailer_queue` cujo snapshot HTML não contenha o card da atleta (`QUICK FACTS`) serão cancelados preventivamente com status explicativo (`cancelled_missing_card`).
- **Decisão 3 (Aviso de Integridade na Interface):** Confirmado banner de alerta visível no container de preview caso haja qualquer inconsistência entre atletas selecionadas e cards renderizados, desabilitando o botão de envio.

---

### 1. Overview & Core Concept

- **O que faz:** Elimina o bug onde a troca de atleta no Mailer preservava internamente os blocos da primeira atleta carregada, provocando disparos sem o card de perfil. Implementa reconciliação de blocos determinística, paridade estrita entre preview e envio, e proteção de ponta a ponta (*fail-closed*).
- **Público-alvo:** Administradores da agência de intercâmbio esportivo ao criar campanhas personalizadas para coaches universitários.
- **Valor entregue:** Segurança absoluta de que o coach receberá as estatísticas, foto, ficha de recrutamento (`Quick Facts`) e link do perfil da atleta selecionada, sem risco de disparos com e-mails vazios.

---

### 2. User Experience & Visual Design

#### Fluxo do Usuário
1. O administrador acessa `/admin/mailer` e seleciona uma atleta no modo individual (ou múltiplas atletas no modo multi).
2. O editor do Mailer e o painel de preview atualizam instantaneamente, exibindo os dados e o card completo da(s) atleta(s) selecionada(s).
3. Qualquer edição feita pelo usuário nos blocos de texto (introdução, fechamento, saudações) é preservada intacta durante a troca de atletas.
4. Se por qualquer anomalia houver divergência entre a seleção e o conteúdo renderizado, um banner de alerta surge no topo do preview informando a pendência e travando a confirmação de envio.
5. No modal de confirmação, o administrador revisa os atletas confirmados e o assunto final antes de disparar.

#### Identidade Visual & Diretrizes (UI&UX.md e SaaS Dashboard)
- **Banner de Integridade no Preview:** Container discreto com borda hairline suave (`border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200`), ícone semafórico de aviso e texto explicativo, sem pills decorativas ou cantos exagerados.
- **Botão de Envio:** Estado desabilitado com cursor `not-allowed`, mantendo contraste e acessibilidade legível.
- **Tipografia:** Números e métricas de atletas usando algarismos tabulares (`tabular-nums font-mono`), títulos concisos e textos explicativos em tom institucional.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Reconciliação Pura (`reconcileEmailBlocks`) vs. Recriação do Zero:**
  - *Abordagem escolhida:* Reconciliação funcional pura. Mantém todos os blocos de texto editados e apenas sincroniza os blocos do tipo `athlete`.
  - *Motivo:* Permite que o usuário troque de atleta sem perder textos personalizados que digitou.
- **Decisão 2: Servidor Autoritativo (*Fail-Closed*) vs. Confiança no Navegador:**
  - *Abordagem escolhida:* O servidor em `mailer-queue.server.ts` e `recruit-email.server.ts` reexecuta a reconciliação e valida com `assertEmailIntegrity` antes de persistir na fila.
  - *Motivo:* Mesmo que o cliente envie blocos corrompidos ou desatualizados, o servidor impede a gravação e bloqueia o acionamento do Resend.
- **Decisão 3: Saneamento Preventivo da Fila:**
  - *Abordagem escolhida:* Identificar e cancelar itens pendentes que não possuem o card (`QUICK FACTS`).
  - *Motivo:* Impede que disparos incompletos previamente agendados atinjam os coaches.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Admin Mailer (/admin/mailer)                    │
│                                                                        │
│   ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│   │ activeComposerAthleteIds  │      │   composerBlocks (textos)    │  │
│   └─────────────┬─────────────┘      └──────────────┬───────────────┘  │
│                 │                                   │                  │
│                 ▼                                   ▼                  │
│            ┌─────────────────────────────────────────────┐             │
│            │   reconcileEmailBlocks(blocks, athleteIds)  │             │
│            └──────────────────────┬──────────────────────┘             │
│                                   │                                    │
│                                   ▼                                    │
│                             finalBlocks                                │
│                     ┌─────────────┴─────────────┐                      │
│                     ▼                           ▼                      │
│            ┌─────────────────┐         ┌───────────────────┐           │
│            │ Preview Display │         │  handleSendMailer │           │
│            └─────────────────┘         └─────────┬─────────┘           │
└──────────────────────────────────────────────────┼─────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                Backend Fail-Closed (mailer-queue.server.ts)            │
│                                                                        │
│   1. reconcileEmailBlocks(input.blocks, loadedAthleteIds)              │
│   2. renderPersonalEmail(...)                                          │
│   3. assertEmailIntegrity({ expected, rendered, html, text })          │
│                                                                        │
│         │                                        │                     │
│    [Integridade OK]                        [Inconsistência]            │
│         │                                        │                     │
│         ▼                                        ▼                     │
│   mailer_queue INSERT                      Abortar (0 inserts,         │
│   Status: pending                          0 chamadas Resend)          │
└────────────────────────────────────────────────────────────────────────┘
```

#### Módulos e Componentes Envolvidos:
1. `src/lib/email/email-blocks.ts` (novo módulo):
   - `reconcileEmailBlocks(prev: EmailBlock[], athleteIds: string[]): EmailBlock[]`
   - `assertEmailIntegrity(options: EmailIntegrityOptions): void`
2. `src/routes/_authenticated/admin/mailer.tsx`:
   - Remoção do `useEffect` com guarda `prev.length > 0`.
   - Derivação síncrona de `finalBlocks` via `useMemo`.
   - Banner de integridade no preview e validação pré-envio.
3. `src/lib/email/recruit-email-template.ts`:
   - Exposição dos metadados de integridade (`expectedAthleteIds`, `renderedAthleteIds`, `missingAthleteIds`).
4. `src/lib/email/mailer-queue.server.ts` & `src/lib/email/recruit-email.server.ts`:
   - Validação autoritativa *fail-closed* antes de persistir ou disparar.
   - Rotina de cancelamento para itens pendentes sem card (`QUICK FACTS`).
5. `src/lib/email/email-blocks.test.ts` (novo conjunto de testes):
   - Teste de regressão do bug, alternância A→B, multi-atleta, textos preservados e validação *fail-closed*.
