# Planejamento — Padronização dos CTAs de Contato para E-mail

- **Data/Hora:** 2026-09-02 11:10 (Horário Local)
- **Autor/Executor:** Antigravity / Gemini Agent
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** [APROVADO PELO USUÁRIO HUMANO] — Em Execução

---

## 1. Contexto

O projeto **Dream Athletic Path / Go Team Go** é uma plataforma voltada para apresentação e recrutamento de atletas de voleibol e modalidades esportivas internacionais para universidades nos EUA. Atualmente, os pontos de contato do site público utilizam links diretos para o WhatsApp da agência (`https://wa.me/5511999239490`) através de helpers em `src/lib/contact.ts`.

A estratégia de contato foi revista: **todos os pontos de contato da agência devem passar a direcionar para e-mail (`mailto:`) com assuntos e corpos contextuais**, exceto o **botão flutuante do WhatsApp (`WhatsappFab`)**, que deve permanecer estritamente inalterado e funcional.

---

## 2. Problema

1. Vários pontos de contato espalhados na aplicação (catálogo público, perfil público do atleta, modal de highlights) estão apontando para o WhatsApp em vez de e-mail.
2. O catálogo inicial (Hero) e os rodapés (Footers) não possuem CTAs de e-mail padronizados com as mensagens institucionais requisitadas.
3. Não havia uma abstração centralizada para construção e sanitização de URLs `mailto:` contextuais, o que poderia levar à duplicação de lógica, caracteres especiais mal codificados ou inconsistências de parâmetros (`subject`, `body`, destinatário).

---

## 3. Análise dos CTAs Existentes & Mapeamento de Ocorrências

Após varredura completa no código-fonte, foram identificados os seguintes pontos de contato:

| Localização | Elemento / Componente | Comportamento Atual | Comportamento Proposto |
| :--- | :--- | :--- | :--- |
| **Página Inicial — Hero** (`src/routes/index.tsx`) | Seção Hero | Não possui botão de contato atualmente | Adicionar CTA **"Talk to our team"** abrindo e-mail contextual com subject: `I'm interested in working with Go Team Go` e body inicial de apresentação. |
| **Página Inicial — Catálogo / Seção Final** (`src/routes/index.tsx`) | Seção "Looking for talent?" / Botão "Talk to Go Team Go" | Link WhatsApp (`https://wa.me/5511999239490?text=...`) | Migrar para CTA de recrutamento com e-mail, subject: `Athlete recruitment inquiry` e body informando que o contato iniciou pelo catálogo. |
| **Página Inicial — Footer** (`src/routes/index.tsx`) | Rodapé público | Apenas logo, texto de copyright e assinatura | Adicionar link/CTA **"Get in touch"** abrindo e-mail com subject: `Contact through website`. |
| **Perfil do Atleta — Hero** (`src/routes/athlete.$slug.tsx`) | Botão "Recruit Athlete" | Link WhatsApp via `buildRecruitWhatsappUrl(athlete.full_name)` | Migrar para e-mail contextual do atleta: subject: `Interest in [Nome do Atleta]`, body com nome, URL do perfil e contexto de recrutamento. Ícone `Mail`. |
| **Perfil do Atleta — Nav Sticky** (`src/routes/athlete.$slug.tsx`) | Botão "Recruit" na barra de navegação rápida | Scroll âncora para `#recruit-cta` | Manter navegação fluida para a seção de recrutamento `#recruit-cta`, com ícone `Mail`. |
| **Perfil do Atleta — Seção Final** (`src/routes/athlete.$slug.tsx`) | Seção "Direct Scout Access" / Botão "Recruit [FirstName] on WhatsApp" | Link WhatsApp via `buildRecruitWhatsappUrl` e texto mencionando WhatsApp | Migrar para e-mail: botão "Recruit [FirstName] via Email", subject: `Interest in [Nome do Atleta]`, body detalhado e texto da seção ajustado para contato via e-mail. |
| **Perfil do Atleta — Footer** (`src/routes/athlete.$slug.tsx`) | Rodapé do perfil | Apenas logo, copyright e assinatura | Adicionar link/CTA **"Get in touch"** com subject: `Contact through website`. |
| **Global Highlights Viewer** (`src/components/global-highlights-viewer.tsx`) | Botão lateral "Recruit" no player de reels | Link WhatsApp via `buildRecruitWhatsappUrl(currentItem.athleteName)` | Migrar para e-mail contextual: subject: `Interest in [currentItem.athleteName]`, body com menção ao highlight e perfil. Ícone `Mail`. |
| **Botão Flutuante** (`src/components/whatsapp-fab.tsx`) | FAB fixo no canto inferior direito | WhatsApp (`https://wa.me/...`) | **PRESERVADO INTACTO (EXCEÇÃO MANDATÓRIA)**. Nenhuma alteração visual ou funcional. |

---

## 4. Destinatário Oficial da Agência

### Análise de Configurações Existentes:
1. **Banco / Supabase (`agencies`, `agency_visual_settings`):** Não possuem colunas de e-mail de contato público.
2. **Variáveis de Ambiente (`.env.example`):** Possui `EMAIL_FROM` (usado pelo Resend para disparos de sistema, fallback `"Go Team Go <onboarding@resend.dev>"`).
3. **Domínio Oficial da Aplicação:** `goteamgoagency.com` / `portfolio.goteamgoagency.com` (presente em `sitemap.ts`, `indexnow.ts`, meta tags e schemas).
4. **Arquivo Centralizador:** `src/lib/contact.ts` já centraliza a configuração do canal de contato (`RECRUIT_WHATSAPP_NUMBER`).

### Estratégia Proposta para o Destinatário:
Centralizar a configuração do e-mail oficial em `src/lib/contact.ts`:
- Constante: `AGENCY_CONTACT_EMAIL`
- Suporte a override por variável de ambiente pública `import.meta.env.VITE_AGENCY_CONTACT_EMAIL`
- Fallback padrão oficial: `contact@goteamgoagency.com` (ou `kauan.iasin02@gmail.com` caso o usuário prefira o e-mail cadastrado na conta).
- O usuário humano poderá validar/indicar na aprovação se deseja outro e-mail específico.

---

## 5. Arquitetura da Solução

### 5.1. Centralização em `src/lib/contact.ts`
Criar tipos e helpers reutilizáveis em `src/lib/contact.ts`:

```typescript
export const AGENCY_CONTACT_EMAIL =
  (import.meta.env.VITE_AGENCY_CONTACT_EMAIL as string | undefined) ||
  "contact@goteamgoagency.com";

export type ContactEmailContext =
  | { type: "hero" }
  | { type: "catalog" }
  | { type: "athlete"; athleteName: string; athleteSlug?: string }
  | { type: "footer" }
  | { type: "general"; note?: string };

export interface MailtoParams {
  to?: string;
  subject: string;
  body: string;
}

export function buildMailtoUrl({ to = AGENCY_CONTACT_EMAIL, subject, body }: MailtoParams): string;

export function buildContactEmailUrl(context: ContactEmailContext): string;
```

### 5.2. Especificação dos Assuntos e Corpos:
1. **Hero (`type: "hero"`):**
   - **Subject:** `I'm interested in working with Go Team Go`
   - **Body:** `Hello Go Team Go Team,\n\nI am contacting you through your website and would like to learn more about your recruitment agency and how we can work together.\n\nBest regards,`
2. **Catálogo (`type: "catalog"`):**
   - **Subject:** `Athlete recruitment inquiry`
   - **Body:** `Hello Go Team Go Team,\n\nI am browsing your public athlete catalog and would like to inquire about recruitment opportunities and prospect availability.\n\nBest regards,`
3. **Página Individual do Atleta (`type: "athlete"`):**
   - **Subject:** `Interest in ${athleteName}`
   - **Body:** `Hello Go Team Go Team,\n\nI am interested in recruiting ${athleteName} and am reaching out directly from her profile page (${profileUrl}).\n\nI would like to request full match film, academic transcripts, and discuss scholarship availability.\n\nBest regards,`
4. **Footer (`type: "footer"`):**
   - **Subject:** `Contact through website`
   - **Body:** `Hello Go Team Go Team,\n\nI am getting in touch through the website footer to discuss...`
5. **Geral (`type: "general"`):**
   - **Subject:** `General inquiry`
   - **Body:** `Hello Go Team Go Team,\n\nI am contacting you through your website regarding...`

### 5.3. Segurança e Robustez Técnica do `mailto:`:
- Codificação estrita via `encodeURIComponent` de todos os parâmetros.
- Tratamento adequado de quebras de linha (`\r\n` / `\n`).
- Preservação de caracteres acentuados nos nomes de atletas (ex: "João Silva", "Beatriz Gonçalves").
- Codificação de URLs limpas sem quebras.

---

## 6. Arquivos que Serão Modificados e Arquivos que NÃO Serão Modificados

### Arquivos a Modificar:
1. `src/lib/contact.ts` — Adicionar `AGENCY_CONTACT_EMAIL`, `buildMailtoUrl`, `buildContactEmailUrl` e manter `RECRUIT_WHATSAPP_NUMBER` / `buildRecruitWhatsappUrl`.
2. `src/routes/index.tsx` —
   - Adicionar CTA "Talk to our team" no Hero.
   - Atualizar CTA de recrutamento da seção final para e-mail (`Athlete recruitment inquiry`).
   - Adicionar link "Get in touch" no footer.
3. `src/routes/athlete.$slug.tsx` —
   - Atualizar CTA do Hero do atleta para e-mail (`Interest in [Nome]`).
   - Atualizar texto e CTA da seção `#recruit-cta` ("Recruit [FirstName] via Email").
   - Adicionar link "Get in touch" no footer do atleta.
4. `src/components/global-highlights-viewer.tsx` —
   - Atualizar botão de recrutamento no visualizador de vídeos para e-mail contextual (`Interest in [athleteName]`), com ícone `Mail`.
5. `src/lib/contact.test.ts` (Novo teste unitário) — Cobertura completa de testes para `buildMailtoUrl`, `buildContactEmailUrl`, codificação de URLs, caracteres especiais e todos os contextos.
6. `src/lib/catalog.test.ts` — Correção pontual da tipagem TypeScript na linha 104 (`name_en: "Outside Hitter"` em vez de `null`), garantindo `bun run typecheck` 100% limpo.

### Arquivos que NÃO Serão Modificados:
1. `src/components/whatsapp-fab.tsx` — **ESTRITAMENTE PRESERVADO**. Continua funcionando exatamente como hoje.
2. `src/styles.css` / Configuração de Tailwind — Nenhuma alteração visual ou de tema.
3. `src/server.ts`, `src/lib/supabase/*`, `src/types/db.ts` — Estrutura de backend e banco inalteradas.

---

## 7. Estratégia de Testes e Validação

1. **Testes Unitários Automatizados:**
   - Criar `src/lib/contact.test.ts` testando:
     - Formato do link `mailto:` gerado para cada contexto.
     - Codificação de caracteres especiais (acentos, espaços, pontuação, URLs).
     - Comportamento com e sem slug do atleta.
     - Preservação da função existente `buildRecruitWhatsappUrl`.
2. **Execução dos Comandos de Validação com Bun:**
   - `bun run typecheck` (deve passar sem erros)
   - `bun run lint` (deve passar sem erros)
   - `bun run test` (todos os testes devem passar)
   - `bun run build` (build do Vite deve completar com sucesso)
3. **Validação Manual dos Links e Experiência do Usuário:**
   - Teste do clique em cada CTA abrindo o client de e-mail com os campos pré-preenchidos.
   - Verificação do botão flutuante do WhatsApp em desktop e mobile.

---

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Caracteres especiais em nomes de atletas quebrarem a URL `mailto:` | Médio | Uso rigoroso de `encodeURIComponent` com testes unitários cobrindo acentuação e caracteres especiais. |
| Quebra de layout no Hero ou Footer ao adicionar novos botões | Baixo | Reutilização estrita de classes do design system (`liquid-button`, `text-xs text-muted-foreground hover:text-foreground`) respeitando `UI&UX.md` e mobile-first. |
| Usuário não ter cliente de e-mail padrão configurado no SO | Baixo | Comportamento padrão da web para links `mailto:`; o botão flutuante de WhatsApp continua presente como canal direto alternativo. |

---

## 9. Critérios de Aceitação

- [ ] Todos os CTAs de contato identificados foram mapeados no plano.
- [ ] O botão flutuante do WhatsApp permanece 100% intacto e funcional.
- [ ] Centralização em `src/lib/contact.ts` sem duplicação de lógica `mailto:`.
- [ ] Assuntos e corpos contextuais implementados conforme especificação.
- [ ] Perfil do atleta injeta dinamicamente o nome e link do atleta.
- [ ] Codificação segura de URL com `encodeURIComponent`.
- [ ] Testes unitários cobrindo todos os cenários em `src/lib/contact.test.ts`.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` aprovados.
- [ ] Governança respeitada: `CERNE.md` e `BACKLOGER.md` atualizados após implementação.

---

## 10. Status de Aprovação

- **Status atual:** [AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]
- **Ação:** Apresentar este plano ao usuário humano e aguardar autorização antes de iniciar as alterações no código.
