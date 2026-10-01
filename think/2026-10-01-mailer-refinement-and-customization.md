# Plano de Solução — Correção e Refinamento do Mailer (Customização Textual, Identidade Visual Oficial e Highlights Reais)

> **Status:** [CONCLUÍDO] — Implementação Validada e Compilada  
> **Data de Início:** 2026-10-01 06:32  
> **Data de Conclusão:** 2026-10-01 06:41  
> **Solicitante:** Kauan / Usuário Humano  
> **Executor:** Antigravity AI / Gemini Coding Agent  
> **Entrega:** Pacote Único e Cirúrgico  
> **Migração de Banco de Dados:** NENHUMA (0 migrations — aproveitamento integral da infraestrutura existente)

---

## 1. Diagnóstico e Arquitetura Atual

Avaliamos minuciosamente o fluxo de ponta a ponta do Mailer (`src/routes/_authenticated/admin/mailer.tsx`, `src/lib/email/*` e `src/components/send-recruit-email-dialog.tsx`):

1. **Composição e Preview no Admin (`/admin/mailer`)**:
   - Atualmente permite alternar entre `single`, `multi` e `catalog`.
   - No modo `catalog`, já existem campos para `catalogHeadline` e `catalogMessage`, porém os modos `single` e `multi` não expõem campos para edição de saudação (*Greeting*), introdução (*Introduction*) e chamada (*Hook / Take a Look*).
   - O `previewHtml` renderiza via `renderRecruitEmail`, `renderMultiAthleteRecruitEmail` e `renderCatalogEmail`.
2. **Identidade Visual da Agência (`agency_visual_settings`)**:
   - A tabela `agency_visual_settings` armazena oficialmente `logo_url` e `hero_background_url`.
   - O template de e-mail atualmente utilizava fallbacks em `email-brand.ts` (`EMAIL_ASSETS.logoUrl` e `EMAIL_ASSETS.heroBgUrl`).
   - Solução: Injetar `logoUrl` e `heroBackgroundUrl` dinamicamente no `previewHtml` e no envio do backend (`sendMailerEmails`), preservando os fallbacks padrão caso as colunas estejam nulas.
3. **Seção de Modalidades no E-mail de Catálogo**:
   - `recruit-email-catalog-template.ts` continha uma tabela/seção listando múltiplos esportes (Soccer, Basketball, Tennis, Track & Field, Swimming) e no texto puro `KEY PROGRAM DISCIPLINES`.
   - Como a Go Team Go opera exclusivamente com **Volleyball**, essa seção inteira e suas referências textuais serão 100% removidas tanto do HTML quanto da versão `Body.Text` e dos testes.
4. **Resolução de Highlights e Link "Take a Look"**:
   - O produto possui duas fontes de highlight: `athlete_videos` (com `kind = 'highlight'`, ordenado por `sort_order ASC, created_at DESC`) e o fallback `athlete_profiles.highlight_video_url`.
   - No carregamento do Mailer (`loadInitialData`), o select não trazia a URL do vídeo de highlight, e o link na seção introdutória "Take a Look" era apenas texto estático.
   - Solução: Carregar o highlight prioritário no Admin e no backend, vincular o botão `"WATCH HIGHLIGHTS"` diretamente à URL do vídeo (ou ao perfil completo caso o atleta não possua highlight cadastrado, com label adaptado para `"VIEW FULL PROFILE"` sem links vazios/quebrados), e transformar a chamada "Take a look" em um link direto e ativo.

---

## 2. Escopo Detalhado de Alterações

### A. Customização Textual no Admin (`/admin/mailer`)
- Adicionar no painel lateral de configuração do Mailer campos simples e elegantes:
  - **Greeting / Saudação**: ex: `Hi Coach,`, `Hi Dave,`, `Dear Coach,`
  - **Introduction / Mensagem Principal**: texto do parágrafo introdutório.
  - **Callout / Hook / Take a Look**: texto de fechamento da introdução (ex: *"Take a look at our current roster below."* ou personalizado).
  - No modo **Catalog**: manter headline e message + greeting e hook customizáveis.
- O `previewHtml` atualizará em tempo real conforme a digitação.
- Os dados customizados serão enviados no payload do `sendMailerServerFn` e propagados fielmente ao HTML e à versão texto (`Body.Text`) no envio real do Amazon SES.
- Sanitização rigorosa com `escapeHtml` para segurança contra injeção e quebra de layout.

### B. Remoção Integral da Seção de Múltiplos Esportes no Catálogo
- Em `src/lib/email/recruit-email-catalog-template.ts`:
  - Remover o bloco `rosterDisciplinesHtml` (Soccer, Basketball, Tennis, Track & Field, Swimming).
  - Substituir o espaço por um banner institucional focado em Volleyball e convite direto com botão destacado *"EXPLORE FULL VOLLEYBALL ROSTER & HIGHLIGHTS →"*.
  - No `generateCatalogPlainText`, remover a lista de múltiplos esportes, mantendo apenas Volleyball.
  - Atualizar os testes unitários para validar a ausência total dos termos esportivos alheios.

### C. Logo e Background Oficiais da Agência (`agency_visual_settings`)
- Em `src/routes/_authenticated/admin/mailer.tsx`:
  - Carregar `agency_visual_settings` no `loadInitialData` e armazenar no estado do componente.
  - Repassar `logoUrl: visual?.logo_url` e `heroBackgroundUrl: visual?.hero_background_url` para a geração do preview.
- Em `src/lib/email/recruit-email.server.ts`:
  - Consultar `agency_visual_settings` no backend durante o envio e repassar `logoUrl` e `heroBackgroundUrl` para os templates.
- Em `src/lib/email/email-layout.ts`:
  - `renderEmailHeader`: aceitar `logoUrl?: string | null` e utilizá-lo como prioridade sobre o fallback.
  - `renderEmailHero`: aceitar `heroBackgroundUrl?: string | null` e utilizá-lo no background CSS e no VML do Outlook, com fallback para o degradê esmeralda `#05301a`.

### D. Correção do Link de Highlight ("Take a Look" e Botões dos Cards)
- Prioridade de highlight:
  1. `athlete_videos` com `kind = 'highlight'` (primeiro registro ordenado por `sort_order ASC, created_at DESC`).
  2. `athlete_profiles.highlight_video_url`.
- Se o atleta tiver highlight:
  - O botão do card `"WATCH HIGHLIGHTS →"` aponta diretamente para o link de vídeo (convertido em URL válida do YouTube via `youtubeWatchUrl` ou URL direta).
  - Na seção "Take a Look" (modo single), o texto pode conter link clicável direto para o highlight do atleta.
- Se o atleta **NÃO** tiver highlight cadastrado:
  - O botão do card aponta com segurança para o perfil público `/athlete/{slug}` com o label `"VIEW FULL PROFILE →"`.
  - Nunca emitir `href=""` nem link quebrado.

---

## 3. Mapeamento de Arquivos Afetados

1. `src/lib/email/email-layout.ts`: Suporte a `logoUrl`, `heroBackgroundUrl`, `customGreeting`, `customParagraph`, `customHook`, `highlightUrl` e fallback inteligente do botão do card de atleta.
2. `src/lib/email/recruit-email-template.ts`: Parâmetros de customização textual e branding nos templates Single e Multi (`renderRecruitEmail`, `renderMultiAthleteRecruitEmail`, `generateRecruitEmailPlainText`, `generateMultiAthletePlainText`).
3. `src/lib/email/recruit-email-catalog-template.ts`: Remoção de modalidades (Soccer, Basketball, etc.) e suporte a customização e branding.
4. `src/lib/email/recruit-email.server.ts`: Obtenção de `agency_visual_settings` e highlights enriquecidos no disparo real via SES.
5. `src/routes/_authenticated/admin/mailer.tsx`: Campos de input para Greeting, Introduction e Hook; carregamento de `agency_visual_settings` e `athlete_videos`; sincronização 100% fiel entre preview e envio.
6. `src/components/send-recruit-email-dialog.tsx`: Carregamento do highlight oficial e sincronização do preview do modal unitário.
7. `src/lib/email/recruit-email-multi.test.ts`: Testes unitários para personalização de texto, branding dinâmico, ausência de modalidades no catálogo e validação de links de highlight.

---

## 4. Plano de Testes e Validação

- **Testes Unitários (`vitest`)**:
  - Testar saudação e textos customizados no Single, Multi e Catalog.
  - Validar ausência de Soccer, Basketball, Tennis, Track & Field e Swimming no Catalog (HTML e texto puro).
  - Validar renderização de `logo_url` e `hero_background_url` customizados.
  - Validar link de highlight correto e fallback gracioso quando inexistente.
- **Validação de Tipagem e Linter**:
  - `npm run lint` (0 erros).
  - `compile_applet` (build de produção 100% validado).
- **Documentação**:
  - Atualização do `CERNE.md` e do `BACKLOGER.md` (TASK-075).
