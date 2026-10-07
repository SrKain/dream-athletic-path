# Planejamento — Correção de Build na Vercel (Parte A) e Restauração da Identidade Visual Oficial dos E-mails (Parte B)

- **Data/Hora:** 2026-10-07 11:50 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** [AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]
- **Tarefa Associada:** TASK-084 no `BACKLOGER.md` (e correção de escopo do TASK-083)

---

## 1. Contexto, Diagnóstico e Objetivos

### 1.1. PARTE A — Diagnóstico do Build Vercel (CVE TanStack Start & bun.lock)

- **Sintoma:** Deploy na Vercel rejeitado com erro:
  `@tanstack/react-start@1.168.48 contains a known cross-site scripting vulnerability (CVE-2026-102989). Update to 1.168.60 or later and redeploy.`
- **Causa Raiz:** O commit `c9b4d19` introduziu um `bun.lock` divergente do `package.json`, travando `@tanstack/react-start@1.168.48` e dependências `@aws-sdk/*` que já haviam sido removidas na migração Resend (TASK-076).
- **Estado Atual Verificado:**
  - `package.json` declara `@tanstack/react-start: ^1.168.60`, `@tanstack/react-router: ^1.170.41`, `@tanstack/router-plugin: ^1.168.42`.
  - O `bun.lock` do workspace atual já resolve para `@tanstack/react-start@1.168.60`, `react-router@1.170.41` e `router-plugin@1.168.42`.
  - `bun install --frozen-lockfile` (Bun 1.4.2/1.3.14) roda com sucesso sem alterações.
  - Não existem referências ou imports de `@aws-sdk/*` em `src/`, `package.json` ou `bun.lock`.
  - Não existem `package-lock.json`, `yarn.lock` ou `pnpm-lock.yaml`.

### 1.2. PARTE B — Diagnóstico da Identidade Visual dos E-mails

- **Problema:** A TASK-083 implementou com sucesso a ordem orientada à leitura rápida ("5 segundos") com atletas no topo, ficha resumida e 4 botões de ação (`WATCH FILM`, `I'M INTERESTED`, `FULL PROFILE`, `NOT A FIT`). No entanto, a implementação criou um motor paralelo em `src/lib/email/recruit-email.ts` que:
  1. Abandonou a paleta oficial verde/dourada (`EMAIL_COLORS`), introduzindo cores Tailwind isoladas (`#059669`, `#0f172a`, `#f1f5f9`, `#e2e8f0`, `#fde68a`, etc.) via um objeto `EMAIL_BRAND` separado.
  2. Duplicou funções auxiliares (`escapeHtml`, `getBaseAppUrl`).
  3. Ignorou os blocos estruturais do `email-layout.ts` (`renderEmailShell`, `renderEmailHeader`, `renderSignature`, `renderFeedbackBlock`, `renderBottomBar`, `renderLegalFooter`).
  4. Deixou artefatos duplicados e desatualizados em `docs/email-previews/` (`preview-*.html` concorrendo com `single-athlete.html`, etc.).

### 1.3. Objetivos Desta Tarefa (TASK-084)

1. **Governança de Build:** Registrar regra definitiva de travamento do `bun.lock` em `CERNE.md` e `AGENTS.md`.
2. **Unificação do Motor de E-mails:** Consolidar toda a renderização sob a base única de `email-layout.ts` e `email-brand.ts`.
3. **Identidade Visual Oficial Estrita:** Aplicar 100% da paleta verde/dourada oficial (`EMAIL_COLORS`), tipografia oficial (`Space Grotesk` para títulos, `Arial/Helvetica` para corpo), ícones oficiais (`EMAIL_ASSETS.icons.*`), bandeiras circulares (`EMAIL_ASSETS.flagUrl`), assinatura de Fabiana Andrade e barra bicolor 2/3 + 1/3.
4. **Preservação Funcional:** Manter 100% dos ganhos de UX da TASK-083 (atletas primeiro, linha de specs, mailto pré-preenchido para interesse, `NOT A FIT` com `athleteId`, subject/preheader com specs, plain-text alinhado).
5. **Auditoria e Wiring Completo:** Garantir que `recruit-email.server.ts` e `send-recruit-email-dialog.tsx` enviem e visualizem os dados novos corretamente.
6. **Bateria de Testes Automatizados:** Testes garantindo que nenhum HTML contenha cores fora da paleta oficial e que não existam imports de AWS SDK.

---

## 2. Decisões Arquiteturais e Estratégia de Consolidação

### 2.1. Arquitetura do Motor de E-mails (Single Source of Truth)

- **Eliminação de `EMAIL_BRAND`:** `EMAIL_BRAND` será completamente removido de `email-brand.ts`. `EMAIL_COLORS` é a única fonte da verdade de cores.
- **Estrutura dos Módulos:**
  - `src/lib/email/email-brand.ts`: Contém `EMAIL_COLORS`, `EMAIL_ASSETS`, `EMAIL_SIGNATURE`, `ALPHA2_TO_ALPHA3`, `getCountryAlpha3`, `EMAIL_BASE_URL`, `getBaseAppUrl`.
  - `src/lib/email/email-layout.ts`: Motor principal de renderização. Contém `escapeHtml`, `renderEmailShell`, `renderEmailHeader`, `renderAthleteCard` (atualizado para o layout de 4 botões e specs), `renderAthleteGrid` / lista vertical, `renderRequestCtaBar`, `renderSignature`, `renderFeedbackBlock`, `renderBottomBar`, `renderLegalFooter` e o bloco institucional compacto.
  - `src/lib/email/recruit-email.ts`: Orquestrador dos 3 modos (`renderSingleAthleteRecruitEmail`, `renderMultiAthleteRecruitEmail`, `renderCatalogRecruitEmail`) e geradores de plain-text (`generateRecruitEmailPlainText`, `generateMultiAthletePlainText`). Ele **importará e usará diretamente** os componentes e tokens de `email-layout.ts` e `email-brand.ts`, sem duplicar HTML nem CSS inline.
  - `src/lib/email/recruit-email-template.ts` e `src/lib/email/recruit-email-catalog-template.ts`: Módulos de interface e compatibilidade que delegam para o motor unificado.

### 2.2. Mapeamento Estrito da Paleta Oficial (`EMAIL_COLORS`)

| Elemento Visual        | Cor Oficial (`EMAIL_COLORS`)                           | Valor Hex                                                                        | Justificativa / Comportamento                                            |
| :--------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| Fundo Externo (Body)   | `bodyBg`                                               | `#f8faf5`                                                                        | Off-white esverdeado oficial de fundo                                    |
| Container do E-mail    | `white` / `cardBorder`                                 | `#ffffff` / `#e3e9dc`                                                            | Borda sutil de 1px e fundo branco puro                                   |
| Header da Agência      | `darkGreenPrimary` / `goldPrimary`                     | `#084323` / `#f69e00`                                                            | Logo oficial à esquerda e lema em caixa alta com traço dourado à direita |
| Card da Atleta         | `cardBg` / `cardBorder`                                | `#f3f6f1` / `#e3e9dc`                                                            | Card com cantos de 12px e padding de respiro                             |
| Nome da Atleta         | `darkGreenDeep` / `darkGreenPrimary`                   | `#032812` / `#084323`                                                            | Tipografia em caixa alta semi-bold                                       |
| Linha de Specs         | `textDark` / `textMuted`                               | `#032812` / `#4b6353`                                                            | Posição, altura imperial/métrica, ano e GPA legíveis                     |
| Badge `TRANSFER`       | `goldLight` / `darkGreenPrimary`                       | `#f0a500` / `#084323` (ou fundo `#fef3c7` com borda `#f69e00` e texto `#084323`) | Destaque dourado com tipografia verde escura da marca                    |
| Botão `WATCH FILM`     | `darkGreenPrimary` + texto `white`                     | `#084323` + `#ffffff` (com detalhe em seta `goldPrimary` `#f69e00`)              | Botão primário pill oficial com ícone de play e seta dourada             |
| Botão `I'M INTERESTED` | Contorno `darkGreenPrimary` + texto `darkGreenPrimary` | Fundo `white`, borda `1.5px solid #084323`, texto `#084323`                      | Ação de alto valor com visual refinado                                   |
| Botão `FULL PROFILE`   | Secundário `ctaBg` / `cardBorder`                      | Fundo `#eef3ec`, borda `1px solid #e3e9dc`, texto `#032812`                      | Ação de consulta detalhada                                               |
| Botão `NOT A FIT`      | `textMuted`                                            | `#4b6353`                                                                        | Link sutil sublinhado com área de toque mínima de 44px                   |
| Bloco Institucional    | `darkGreenHero` / `cardBg`                             | `#05301a` / `#f3f6f1`                                                            | Bloco compacto ao final, tipografia Space Grotesk/Arial                  |
| Assinatura             | `renderSignature` oficial                              | `#084323`, `#4b6353`, `#f69e00`                                                  | Fabiana Andrade, ícones oficiais e frase manuscrita                      |
| Bottom Bar             | `renderBottomBar` oficial                              | 2/3 `#08311c` + 1/3 `#f0a500`                                                    | Faixa clássica institucional da marca                                    |
| Rodapé Legal           | `renderLegalFooter` oficial                            | `#4b6353`, `#084323`                                                             | Unsubscribe e compliance em 2 níveis                                     |

---

## 3. Escopo Detalhado de Alterações

### 3.1. Arquivos de Marca e Layout de E-mail

1. `src/lib/email/email-brand.ts`:
   - Remover `EMAIL_BRAND`, `escapeHtml` e `getBaseAppUrl` duplicados.
   - Garantir que `EMAIL_COLORS`, `EMAIL_ASSETS`, `EMAIL_SIGNATURE`, `ALPHA2_TO_ALPHA3` e `getCountryAlpha3` sejam os únicos exports de tokens.
2. `src/lib/email/email-layout.ts`:
   - Centralizar `escapeHtml` e `getBaseAppUrl`.
   - Atualizar `renderAthleteCard` para suportar o design de 4 botões e specs em conformidade estrita com `EMAIL_COLORS`.
   - Garantir renderização compatível com Outlook (VML) e mobile (375px+).
3. `src/lib/email/recruit-email.ts`:
   - Importar `renderEmailShell`, `renderEmailHeader`, `renderSignature`, `renderFeedbackBlock`, `renderBottomBar`, `renderLegalFooter` de `email-layout.ts`.
   - Eliminar qualquer CSS inline ou cor hex fora de `EMAIL_COLORS`.
4. `src/lib/email/recruit-email-template.ts` e `src/lib/email/recruit-email-catalog-template.ts`:
   - Adaptar para chamar o layout unificado com os novos botões e hierarquia.

### 3.2. Integração Administrativa e Dialogs

1. `src/routes/_authenticated/admin/mailer.tsx`:
   - Garantir sincronização dos previews WYSIWYG reativos em tempo real para Single, Multi e Catalog.
2. `src/components/send-recruit-email-dialog.tsx`:
   - Confirmar passagem de todos os parâmetros (`logoUrl`, `heroBackgroundUrl`, `athleteId`, highlight).

### 3.3. Previews e Testes

1. `scripts/preview-emails.ts`:
   - Atualizar o gerador de artefatos estáticos.
   - Limpar arquivos antigos e duplicados em `docs/email-previews/`: remover `preview-single.html`, `preview-multi.html`, `preview-catalog.html`, mantendo apenas `single-athlete.html`, `multi-athlete-1.html`, `multi-athlete-4.html`, `multi-athlete-8.html` e `catalog.html`.
2. `src/lib/email/recruit-email-multi.test.ts` e novos testes:
   - Adicionar teste automatizado de validação de cores: inspeciona todo o HTML gerado e falha se houver hexadecimais fora de `EMAIL_COLORS`, `#ffffff` ou `transparent`.
   - Adicionar teste automatizado garantindo que não há imports de `@aws-sdk`.
   - Testar parâmetros de `mailto:`, links de `NOT A FIT`, badges `TRANSFER` e responsividade.

### 3.4. Governança e Documentação

1. `CERNE.md`:
   - Seção **Build System & Package Manager**: adicionar regra mandatória de que `bun.lock` só pode ser alterado via Bun 1.3.14 / `package.json` oficial.
   - Seção **E-mails**: atualizar a documentação viva da arquitetura unificada de e-mails.
2. `AGENTS.md`:
   - Adicionar a regra explícita sobre manipulação proibida de lockfiles por ferramentas não compatíveis.
3. `BACKLOGER.md`:
   - Corrigir a descrição da TASK-083 (ajustando o histórico para refletir o estado real).
   - Registrar a TASK-084 como `[CONCLUÍDO]` ao término.

---

## 4. Plano de Execução Passo a Passo

1. **Passo 1 (Build & Lockfile Check):**
   - Confirmar `bun.lock` limpo, sem `@aws-sdk`, com TanStack Start `^1.168.60`.
2. **Passo 2 (Refatoração de Marca e Layout):**
   - Limpar `src/lib/email/email-brand.ts`.
   - Atualizar `src/lib/email/email-layout.ts` e `src/lib/email/recruit-email.ts` para usar 100% a identidade oficial.
3. **Passo 3 (Templates e Componentes de Envio):**
   - Atualizar `recruit-email-template.ts`, `recruit-email-catalog-template.ts`, `send-recruit-email-dialog.tsx` e `mailer.tsx`.
4. **Passo 4 (Limpeza de Previews e Script):**
   - Remover previews duplicados em `docs/email-previews/` e gerar novos previews 100% atualizados.
5. **Passo 5 (Testes Automatizados de Cores e Integridade):**
   - Atualizar suite de testes e rodar `npx vitest run`.
6. **Passo 6 (Validação Completa & Build):**
   - Executar `bun run validate` (lint, typecheck, tests, build) e `compile_applet`.
7. **Passo 7 (Governança e Documentação):**
   - Atualizar `CERNE.md`, `AGENTS.md` e `BACKLOGER.md`.

---

## 5. Status de Aprovação

- **Status:** [AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]
- Nenhuma alteração de código foi realizada nesta etapa. O plano está pronto para revisão e aprovação do usuário.
