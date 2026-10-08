# Correção da build + Reestruturação do Mailer (Individual e Multi-Athlete)

## Parte 1: correção da build (prioridade)

**O que aconteceu:** o envio automático "Update plan" (commit `7fc4994`) mesclou o seu último commit `eeee6a0` com uma versão antiga do projeto e manteve o lado antigo. Com isso, mais de 100 arquivos foram apagados ou revertidos, entre eles:
- a aba Mailer e a tela de coaches;
- o envio de recrutamento, o webhook do Resend e as métricas;
- unsubscribe e feedback;
- as migrações 0016 a 0023;
- os assets de e-mail;
- o `package.json` e o `bun.lock`;
- o `CERNE.md`, o `BACKLOGER.md`, o `README.md` e os planos do `think/`.

**Causa confirmada pelo log da Vercel:** o commit `645726c` instala `@tanstack/react-start@1.168.48`, que tem a vulnerabilidade CVE-2026-102989, e a Vercel bloqueia o deploy. Isso aconteceu porque a mescla trouxe de volta o `package.json` antigo (`^1.168.26`). No `eeee6a0`, o `package.json` já está corrigido: `react-start ^1.168.60`, `react-router ^1.170.41` e `router-plugin ^1.168.42`.

**Correção:**
1. Restaurar todos os arquivos exatamente como estão em `eeee6a0`, inclusive o `package.json` e o `bun.lock` corrigidos. A exceção é o `.lovable/plan.md`, que é mantido.
2. Reinstalar as dependências com `bun install` e confirmar que a versão instalada é a `react-start` 1.168.60 ou mais nova.
3. Validar com `bun run validate`, `bun run typecheck`, `bun run lint`, `bun run test` e `bun run build`.

Nada de código novo entra antes de a build estar verde.

## Parte 2: Mailer como e-mail pessoal

### Análise do código atual (em `eeee6a0`)
| Item | Onde está |
|---|---|
| Tela Mailer + composer + preview (iframe `srcDoc`) | `src/routes/_authenticated/admin/mailer.tsx` |
| Diálogo de envio individual | `src/components/send-recruit-email-dialog.tsx` |
| Templates Individual e Multi | `recruit-email-template.ts` → `renderSingleAthleteRecruitEmail` / `renderMultiAthleteRecruitEmail` em `recruit-email.ts` |
| Template Catalog | `recruit-email-catalog-template.ts` → `renderCatalogRecruitEmail` (**não será tocado**) |
| Peças HTML (header, hero, card, assinatura, feedback, barra, legal) | `email-layout.ts` e `recruit-email.ts` |
| Assinatura da Fabiana | `renderSignature` + `EMAIL_SIGNATURE` (`email-brand.ts`) |
| Unsubscribe | `renderLegalFooter` → rota `/unsubscribe` + `unsubscribeEmailAddress` (supressão) |
| Not the right fit | `buildNotAFitUrl` / `renderFeedbackBlock` → rota `/feedback` + `recordCoachInterestSignal` |
| Catálogo | `EMAIL_BASE_URL = https://portfolio.goteamgoagency.com` com UTM via `appendMailerUtmParams` |
| Envio, campanhas e tracking | `recruit-email.server.ts` (`sendMailerEmails`, `mailer_campaigns`, `recruit_email_logs`), webhook do Resend e métricas |
| IA | **Nenhum provedor configurado no projeto** |

O preview já usa o mesmo renderer do envio. Esse comportamento será mantido.

### Novo modelo de composição
```text
type EmailBlock =
  | { type: "text"; content: string }
  | { type: "athlete"; athleteId: string }
```
Os campos `customGreeting`, `customIntroduction` e `customHook` são substituídos por `blocks: EmailBlock[]` nos modos Individual e Multi. O modo Catalog continua com os campos atuais.

### Novo renderer: `src/lib/email/personal-email-renderer.ts`
- Função pura e determinística: `renderPersonalEmail({ blocks, athletesById, recipient, campaignId })` → `{ subject, preheader, html, text }`.
- **Texto do usuário:** sempre escapado com `escapeHtml`. Parágrafos são separados por linha em branco e quebras simples viram `<br>`. Nenhum HTML do usuário é interpretado.
- **Card:** HTML confiável, em tabelas com estilos inline, montado a partir dos dados reais já usados hoje (`mapEmailDataToAthlete`). Os links do card mantêm o UTM e o tracking atuais.
- **Atleta inexistente ou removida:** o bloco é ignorado com segurança e gera um aviso no composer. Referências inválidas nunca quebram o HTML.
- **Rodapé obrigatório,** sempre anexado pelo renderer e fora do controle do usuário:
  - a assinatura atual da Fabiana (`renderSignature`);
  - as ações `Unsubscribe` (URL real de `/unsubscribe`), `Not the right fit` (URL real de `/feedback`, via `buildNotAFitUrl`) e `Go to catalog` (`EMAIL_BASE_URL` com UTM).
- **Sem** header, hero, banner, fundo geral, bloco institucional, "Verified Standards" ou CTA genérico. A estrutura é um container branco simples, com 600px de largura máxima, mobile-first, compatível com Gmail, Outlook e Apple Mail, e sem JavaScript.
- O assunto continua sendo gerado como hoje, a partir dos dados das atletas.

`renderRecruitEmail` e `renderMultiAthleteRecruitEmail` passam a delegar ao novo renderer. `renderCatalogRecruitEmail` e as peças que ele usa ficam sem alteração. Antes de mexer em qualquer função compartilhada, listo todos os consumidores dela.

### Athlete card fiel à referência
A imagem de referência será o *source of truth* visual. **Preciso que você envie essa imagem.** O card será implementado em `renderPersonalAthleteCard`, separado do card atual, que continua disponível para o catálogo e para quem mais o use.

### Composer (UI)
- Lista de blocos simples, sem editor rich text: cada bloco de texto é um `textarea` com altura automática.
- Botão **+ Add Athlete Card** em cada ponto de inserção (entre blocos, no início e no fim):
  - **Individual:** insere o card da atleta selecionada;
  - **Multi:** abre um popover com as atletas selecionadas para escolher qual inserir.
- O bloco de card aparece no editor com miniatura, nome e posição, além dos botões subir, descer e remover. A reordenação usa as setas, sem nova dependência de drag and drop.
- Um modelo inicial editável vem pronto ("Hi Coach,", card, "Let me know what you think."), que o usuário pode alterar ou apagar.
- No modo Multi, o aviso "atleta selecionada sem card no e-mail" é apenas informativo e não impede o envio.
- O preview em iframe é atualizado pelo mesmo renderer, com alternância entre desktop e mobile.
- O layout continua responsivo e alinhado ao `UI&UX.md`.

### Sugestão de texto com IA (opcional)
- Botão **Suggest email**. A sugestão aparece em um painel separado com as ações **Insert**, **Replace text**, **Try again** e **Dismiss**. Nunca sobrescreve o texto sem confirmação.
- **Provedor:** Google Gemini, no plano gratuito (`gemini-2.5-flash`), com a chave `GEMINI_API_KEY` guardada só no servidor (Vercel). Motivo: o app roda na Vercel e não há provedor de IA no projeto hoje. Sem a chave, o botão fica desativado com uma explicação.
- O contexto enviado traz nome, posição, altura, ano de formatura, país e status de cada atleta selecionada. O prompt pede um texto curto, humano, sem jargão de marketing, em inglês dos EUA. A IA devolve apenas os textos; os cards continuam sob controle do usuário.
- Erro ou timeout da IA mostra um aviso, e o envio nunca é bloqueado.

### Persistência
**Sem migração.** Os blocos são gravados em `mailer_campaigns.filters.blocks`, coluna jsonb que já existe, para manter o histórico. Tracking, logs, métricas, webhook e supressão continuam como estão.

### Testes (Vitest)
- **Individual:** texto simples; card no início, no meio e no fim; texto antes e depois do card; rodapé obrigatório; URLs dos 3 botões; atleta inexistente; referência inválida.
- **Multi:** 2 e 3 cards; ordem dos cards; texto entre cards; remoção; atleta removida; rodapé.
- **Segurança:** `<script>`, `<img onerror>`, aspas, `&`, `javascript:` e links digitados pelo usuário saem escapados e não alteram o rodapé nem o tracking.
- **Regressão do Catalog:** snapshot do HTML de `renderCatalogEmail`, gerado antes da mudança, deve continuar idêntico.
- O renderer é determinístico: a mesma entrada gera o mesmo HTML.

### Documentação
Atualizar o `CERNE.md` com a arquitetura, o renderer, o composer, os cards, o rodapé, o preview e a IA. Registrar a solicitação no `BACKLOGER.md` e salvar este plano em `think/2026-10-08-1810-reestruturacao-mailer-individual-multi.md`.

## Fora de escopo
Template Catalog, autenticação, schema do banco, deploy, arquitetura do Resend, estrutura de métricas e as demais áreas do Admin.

## Pendências suas
1. **A imagem de referência do athlete card.**
2. Confirmar o uso do Gemini, no plano gratuito, para a sugestão de texto.

## Status
Aguardando aprovação humana.
