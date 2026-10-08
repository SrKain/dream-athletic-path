# Plano de Solução — Redesign dos 3 E-mails do Mailer: Layout "Recruiting Board" (Poster 2027)

> **Status:** [CONCLUÍDO] — Entrega Única Validada e Compilada  
> **Data de Início:** 2026-10-01 05:51  
> **Data de Conclusão:** 2026-10-01 06:05  
> **Solicitante:** Kauan / Usuário Humano  
> **Executor:** Antigravity AI / Gemini Coding Agent  
> **Entrega:** Pacote Único e Consolidado (Sem Partial Delivery)  
> **Migração de Banco de Dados:** NENHUMA (0 migrations — validado contra `db/migrations/` e `src/types/db.ts`)

---

## 1. Contexto e Objetivo

O Mailer do Go Team Go atualmente envia três formatos de e-mail de recrutamento para coaches universitários americanos:

1. **Unitário** (`renderRecruitEmail`): Focado em 1 atleta específico.
2. **Multi-Atleta** (`renderMultiAthleteRecruitEmail`): Seleção curada de 2 a 8+ atletas empilhados.
3. **Portfólio / Catálogo Geral** (`renderCatalogEmail`): Apresentação institucional da agência e convite ao catálogo completo.

O objetivo desta tarefa é realizar um **redesign completo e rigoroso** dos 3 templates para seguir **com exatidão visual absoluta a imagem de referência ("2027 VOLLEYBALL RECRUITING BOARD")**:

- Mesma ordem de seções, proporções, tipografia, paleta e peso editorial de poster/showcase esportivo americano.
- Eliminação do visual antigo (badges genéricas, cartões em lista simples, cabeçalho antigo).
- Unificação arquitetural: criação de um motor modular de renderização de e-mails HTML (`src/lib/email/email-layout.ts` e `src/lib/email/email-brand.ts`) para garantir coerência visual de 100% entre os 3 templates e o preview no Admin.

---

## 2. Validação Estrita de Banco de Dados (Sem Migrations)

Conforme a regra inegociável §0.4, analisamos todas as colunas necessárias contra `db/migrations/` e `src/types/db.ts`:

| Campo Requerido pelo Layout       | Tabela Existente                      | Coluna / Origem                                             | Status no Schema |
| :-------------------------------- | :------------------------------------ | :---------------------------------------------------------- | :--------------- |
| Nome do Atleta                    | `athletes`                            | `full_name` (text)                                          | ✅ Existente     |
| Slug / URL do Perfil              | `athletes`                            | `slug` (text)                                               | ✅ Existente     |
| Foto do Atleta                    | `athletes`                            | `photo_url` (text)                                          | ✅ Existente     |
| Altura (cm -> ft/in)              | `athletes`                            | `height_cm` (integer)                                       | ✅ Existente     |
| Posição                           | `positions`                           | `name_en` (text via `position_id`)                          | ✅ Existente     |
| Esporte                           | `sports`                              | `name_en` (text via `sport_id`)                             | ✅ Existente     |
| País (Alpha-2 / Nome)             | `countries`                           | `code`, `name_en`, `flag_emoji`                             | ✅ Existente     |
| Ano de Graduação                  | `athlete_profiles`                    | `high_school_graduation` / `graduation_year`                | ✅ Existente     |
| GPA                               | `athlete_profiles`                    | `gpa` (numeric)                                             | ✅ Existente     |
| Linha de Destaque (Hook)          | `athlete_profiles`                    | `highlight_note` (text)                                     | ✅ Existente     |
| Conquista Pública (Fallback Hook) | `achievements`                        | `title_en` (`is_public = true`)                             | ✅ Existente     |
| Situação Financeira (Budget)      | `athlete_profiles`                    | `budget` (text)                                             | ✅ Existente     |
| Status / Transfer                 | `athlete_profiles`                    | `athlete_status` (text)                                     | ✅ Existente     |
| Vídeo de Highlight                | `athlete_videos` / `athlete_profiles` | `youtube_url` (`kind='highlight'`) ou `highlight_video_url` | ✅ Existente     |

**Conclusão Formal:** Todas as informações já existem no banco de dados. **Nenhuma migration SQL será criada ou executada.**

---

## 3. Decisões Consolidadas e Respostas Humanas Aprovadas

### Decisão 1: Linha Financeira do Card (`budget`) — APROVADO: OMITIR SE VAZIO

- Se `athlete_profiles.budget` estiver preenchido, renderizar a linha com ícone de cifrão: `"Financial: " + budget`.
- Se estiver vazio/nulo, **omitir a linha completamente**, conforme determinação explícita do usuário.

### Decisão 2: Título do Hero no E-mail Unitário — APROVADO

- No e-mail unitário (1 único atleta):
  - Ano: `{GraduationYear}` em dourado (ex: `2027`)
  - Título: `{SPORT}` e `ATHLETE SPOTLIGHT` em branco, caixa alta, 2 linhas
  - Subtítulo: `OFFICIAL SCOUTING REPORT · AVAILABLE NOW`
  - Intro adaptada: `"I'd like to introduce {Nome}..."`
  - Card centralizado com largura de 50%.

### Decisão 3: E-mail de Portfólio Geral (`renderCatalogEmail`) — APROVADO: SEM ATLETAS INDIVIDUAIS

- **Negado o uso de 4 atletas individuais** para não transparecer favoritismo ou preferência por determinados atletas no disparo institucional geral.
- O e-mail de portfólio completo utilizará o mesmo envelope, tipografia e blocos da referência:
  - Header idêntico com logo Go Team Go e lema.
  - Hero estilizado `"RECRUITING BOARD"` + `"COLLEGIATE PORTFOLIO"` com subtítulo `"INTERNATIONAL ATHLETES AVAILABLE NOW"`.
  - Intro em 2 colunas adaptada para o catálogo global com os 4 pilares de validação da agência.
  - Bloco de disciplinas ativas e convite à exploração do elenco completo.
  - Barra de CTA com botão dourado de destaque `"EXPLORE FULL PORTFOLIO →"` apontando para `https://portfolio.goteamgoagency.com` e botão mailto para pedidos específicos.
  - Assinatura oficial, botão de feedback e barra inferior com descadastro legal.

### Decisão 4: Bandeiras e Código Alpha-3 dos Países

- Mapeamento estático type-safe `ALPHA2_TO_ALPHA3` no código.
- Bandeiras PNG em `public/email/flags/`.

### Decisão 5: Botão "Recrutar" dentro do Card

- O botão dentro do card é exclusivamente `"WATCH HIGHLIGHTS →"`.
- Solicitação de contato e recrutamento concentrada na CTA Bar `"REQUEST MORE ATHLETES →"`.

### Decisão 6: Link do Botão "WATCH HIGHLIGHTS"

- Prioridade:
  1. Primeiro vídeo de highlight cadastrado em `athlete_videos` (`kind = 'highlight'`) convertido para URL direta do YouTube (`youtubeWatchUrl`).
  2. Fallback 1: `athlete_profiles.highlight_video_url`.
  3. Fallback 2: URL pública do perfil do atleta (`https://portfolio.goteamgoagency.com/athlete/{slug}`).

---

## 4. Arquitetura Modular dos Novos E-mails

Criaremos uma arquitetura robusta de 2 novos arquivos em `src/lib/email/`:

```
src/lib/email/
├── email-brand.ts              # Constantes de marca, URLs absolutas de assets, cores, assinatura
├── email-layout.ts             # Motor de blocos HTML modulares baseados em tabelas compatíveis
├── recruit-email-template.ts   # Composição do unitário (renderRecruitEmail) e multi (renderMultiAthleteRecruitEmail)
├── recruit-email-catalog-template.ts # Composição do portfólio (renderCatalogEmail)
├── email.server.ts             # Envio SES geral + injeção de Body.Text (plain text)
└── recruit-email.server.ts     # Envio SES mailer + injeção de Body.Text (plain text)
```

### 4.1. `email-brand.ts`

- Cores institucionais:
  - Dark Green Primário: `#084323` / `#05301a` / `#032812`
  - Dourado / Accent: `#f69e00` / `#f0a500`
  - Fundo Card: `#f3f6f1`
  - Borda Card: `#e3e9dc`
  - Fundo Geral: `#ffffff` (container), `#f8faf5` (envelope)
  - CTA Bar: `#eef3ec`
- URLs absolutas de assets (`https://portfolio.goteamgoagency.com/email/...`):
  - `LOGO_URL`: `/email/logo-gtg.png` (PNG oficial de alta resolução com tagline)
  - `HERO_BG_URL`: `/email/hero-email.jpg` (Atleta P&B com degradê verde esmeralda integrado)
  - `HANDWRITTEN_MORE_THAN_A_GAME`: `/email/handwritten-more-than-a-game.png`
  - `HANDWRITTEN_DIFFERENT_ATHLETES`: `/email/handwritten-different-athletes.png`
  - `ICONS`: `/email/icons/grad-cap.png`, `play-square.png`, `users-group.png`, `globe.png`, `height.png`, `stats-bars.png`, `star.png`, `dollar.png`, `email.png`, `instagram.png`, etc.
  - `FLAGS`: `/email/flags/{code}.png` (com fallback elegante)
- Dados de Assinatura:
  - Nome: `Fabiana Andrade`
  - Cargo: `Founder | Go Team Go Agency`
  - Email: `fabiana@goteamgoagency.com`
  - Instagram: `@goteamgoagency`
  - Site: `www.goteamgoagency.com`

### 4.2. `email-layout.ts` (Blocos Reutilizáveis)

1. `escapeHtml(str)`: Sanitização estrita contra XSS para todas as strings interpoladas.
2. `renderEmailShell({ title, preheader, bodyHtml })`: Envelope de tabela 680px, meta tags `color-scheme: light only`, CSS inline para clientes móveis e Outlook.
3. `renderEmailHeader()`: Logo Go Team Go à esquerda + texto em caixa alta "INTERNATIONAL ATHLETES. / REAL OPPORTUNITIES." à direita com traço dourado.
4. `renderEmailHero({ year, sport, titleLine2, subtitle })`: Faixa de 280px com foto de fundo, gradiente verde, tipografia escalonada e arte manuscrita "more than a game".
5. `renderEmailIntro({ coachFirstName, sport, year, customParagraph })`:
   - Coluna esquerda (65%): Saudação personalizada e texto institucional.
   - Divisor dourado vertical.
   - Coluna direita (35%): 4 pilares com ícones oficiais (Verified academics, Highlights + match film, Direct communication, Full support).
6. `renderFeaturedHeader({ title, badgeRight })`: "FEATURED ATHLETES" com linha dourada e "MORE ATHLETES AVAILABLE UPON REQUEST".
7. `renderAthleteCard(athlete, index, totalAthletes)`:
   - Card com número sequencial ("01"), código alpha-3 ("BRA") e bandeira PNG.
   - Foto proporção 1.22:1 com cantos arredondados e transformação Supabase otimizada.
   - Etiqueta de posição colada na base da foto com verde `#084323`.
   - Nome em bold caixa alta `#084323`.
   - 5 linhas de atributos com ícones PNG (altura, graduação, GPA formatado com 1 decimal, destaque/conquista, financeiro).
   - Botão pill largo com ícone play, "WATCH HIGHLIGHTS" e seta dourada "→".
   - Badge "TRANSFER" discreta no topo superior se aplicável.
8. `renderAthleteGrid(cardsHtmlArray)`: Grid com tabelas de 4 colunas (25% cada) e empilhamento responsivo via media query para mobile. Quando houver 1 a 3 cards, centralizar mantendo a largura de 25% (ou 50% no caso unitário).
9. `renderRequestCtaBar({ subjectLine })`: Barra `#eef3ec` com ícone de grupo, chamada "LOOKING FOR A SPECIFIC PROFILE?" e botão dourado "REQUEST MORE ATHLETES →" com mailto.
10. `renderSignature()`: Logo, divisor dourado, dados da fundadora Fabiana Andrade (email, insta, site) e manuscrito "Different Athletes Brighter Futures".
11. `renderFeedbackBlock({ feedbackUrl })`: Botão com contorno "Not the right fit? Tell us why →" conectado a `/feedback`.
12. `renderBottomBar()`: Barra 2/3 verde `#08311c` ("COLLEGE RECRUITING · ACADEMIC SUCCESS · GLOBAL OPPORTUNITIES") e 1/3 dourado `#f0a500` ("GO FURTHER. TOGETHER.").
13. `renderLegalFooter({ unsubscribeUrl })`: Linha com link de descadastro obrigatório `/unsubscribe?email=...`.

---

## 5. Geração de Assets Físicos em `public/email/`

Para não depender de links externos instáveis ou SVGs (bloqueados no Gmail e Outlook), geraremos os assets em PNG 2x nítidos diretamente no repositório:

- `public/email/hero-email.jpg`: Banner de alta qualidade com atleta de vôlei e degradê verde-escuro (#05301a -> transparente).
- `public/email/logo-gtg.png`: Logo oficial em PNG 2x com a tagline "PEOPLE · OPPORTUNITIES · A BRIGHTER TOMORROW".
- `public/email/handwritten-more-than-a-game.png`: Assinatura manuscrita em PNG transparente com traço dourado.
- `public/email/handwritten-different-athletes.png`: Assinatura manuscrita institucional com traço dourado.
- `public/email/icons/`:
  - `academic.png` (capelo)
  - `film.png` (play quadrado)
  - `users.png` (grupo de pessoas)
  - `globe.png` (globo de suporte)
  - `height.png` (figura humana)
  - `stats.png` (barras de GPA)
  - `star.png` (estrela de conquista)
  - `dollar.png` (cifrão financeiro)
  - `play-circle.png` (play do botão)
  - `email.png` / `instagram.png` / `website.png`
- `public/email/flags/`:
  - `bra.png`, `usa.png`, `can.png`, `col.png`, `arg.png`, `dom.png`, `pri.png`, `ita.png`, `esp.png`, `deu.png`, etc.

---

## 6. Versão Texto Puro (`Body.Text`) para SES

Em conformidade com as melhores práticas de entregabilidade contra caixas de spam e filtros institucionais de universidades (.edu):

- Criaremos geradores de texto puro para os 3 e-mails contendo:
  - Título, saudação e texto introdutório
  - Lista textual dos atletas (Nome, Posição, Altura, Graduação, GPA, Conquista, Link do Perfil / Highlights)
  - Contato e mailto para solicitação de perfis adicionais
  - Assinatura completa de Fabiana Andrade
  - Link de feedback de recrutamento
  - Link de descadastro em conformidade com CAN-SPAM Act

No ponto de envio do SES (`recruit-email.server.ts` e `email.server.ts`), o payload incluirá simultaneamente:

```typescript
Body: {
  Html: { Data: html, Charset: "UTF-8" },
  Text: { Data: text, Charset: "UTF-8" },
}
```

---

## 7. Estratégia de Testes e Validação

1. **Testes Unitários Automatizados (`src/lib/email/recruit-email-multi.test.ts`)**:
   - Cenários de 1, 2, 4, 5 e 8 atletas no grid.
   - Tratamento de campos ausentes (sem foto, sem GPA, sem budget, sem highlight_note, sem país).
   - Sanitização de XSS em `escapeHtml` (testando `<`, `>`, `"`, `&`).
   - Verificação de presença obrigatória de links `/feedback` e `/unsubscribe` nos 3 templates.
   - Ausência de emojis de bandeira, SVGs inline e base64 no HTML final.
   - Validação de peso do HTML: `< 100 KB` mesmo com 8 atletas (prevenindo corte do Gmail).
   - Saudação personalizada (`Hi Coach Smith,` e fallback `Hi Coach,`).
2. **Preview Estático Local**:
   - Criação de script `scripts/preview-emails.ts` para renderizar os 3 templates em arquivos de teste temporários para inspeção visual em 680px (desktop) e 375px (mobile).
3. **Validação de Código e Build**:
   - `npm run lint` (0 erros)
   - `npm run test` (todos os testes verdes)
   - `compile_applet` (build de produção TanStack Start / Vite validado com sucesso)

---

## 8. Arquivos Afetados no Projeto

- `src/lib/email/email-brand.ts` _(Novo)_
- `src/lib/email/email-layout.ts` _(Novo)_
- `src/lib/email/recruit-email-template.ts` _(Refatoração completa)_
- `src/lib/email/recruit-email-catalog-template.ts` _(Refatoração completa)_
- `src/lib/email/recruit-email.server.ts` _(Adição de Text body + consulta enriquecida de destaques)_
- `src/lib/email/email.server.ts` _(Adição de suporte a Text body)_
- `src/components/send-recruit-email-dialog.tsx` _(Ajuste de preview)_
- `src/routes/_authenticated/admin/mailer.tsx` _(Ajuste de preview)_
- `src/lib/email/recruit-email-multi.test.ts` _(Testes expandidos)_
- `public/email/...` _(Novos assets visuais em PNG/JPG)_
- `CERNE.md` e `BACKLOGER.md` _(Atualização de documentação viva e registro da TASK-074)_

---

## 9. Status da Aprovação

Aguardando aprovação humana explícita do plano acima para iniciar a geração de assets e a codificação da entrega única.
