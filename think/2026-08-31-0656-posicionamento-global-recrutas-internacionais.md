# Planejamento — Posicionamento Global e Neutro da Agência (Recrutas Internacionais)

- **Data/Hora:** 2026-08-31T06:56:00-07:00
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity / Gemini Agent
- **Status do Plano:** Aguardando Aprovação Humana Prévia

---

## 1. Contexto & Diagnóstico

A **Go Team Go Agency** assessora e recruta atletas do mundo inteiro (América Latina, Europa, América do Norte, Ásia, etc.) para ligas universitárias nos Estados Unidos (NCAA, NAIA, NJCAA). 
Atualmente, diversas partes da copy pública, metadados SEO e fallbacks de código ainda trazem menções enviesadas ou hardcoded a *"Brazilian athletes/recruits"*, o que compromete o posicionamento institucional internacional da agência perante treinadores e universidades americanas.

---

## 2. Escopo Mapeado & Modificações Planejadas

### A. `src/routes/index.tsx` (Página Inicial & Catálogo Público)
1. **SEO Head & Meta Tags**:
   - `pageTitle`: Substituir `"Brazilian Volleyball Recruits & College Athletes Catalog | Go Team Go Agency"` por `"International Volleyball Recruits & College Athletes Catalog | Go Team Go Agency"`.
   - `pageDescription`: Substituir `"Explore [N] verified Brazilian volleyball recruits..."` e `"Explore top Brazilian volleyball recruits..."` por `"Explore [N] verified international volleyball recruits ready to compete and study in the USA. Verified academic credentials, game film, and athletic metrics."`.
   - Schema JSON-LD `SportsOrganization`: Atualizar `description` de `"Connecting elite Brazilian student-athletes..."` para `"Connecting elite student-athletes worldwide with university athletic programs and scholarships across the USA."`.
   - Schema JSON-LD `ItemList`: Atualizar `description` de `"Recruitment portfolio of Brazilian student-athletes..."` para `"Recruitment portfolio of international student-athletes seeking US college opportunities."`.
2. **Hero Subtitle Fallback** (linha 248):
   - Atualizar de `"...discover top Brazilian recruits with verified academic and athletic credentials."` para `"...discover top international recruits with verified academic and athletic credentials."`.

### B. `src/i18n/messages.ts` (Dicionário de Textos & Feeds)
1. Atualizar a chave `"feed.subtitle"`:
   - De: `"Hand-picked Brazilian athletes, verified and presented to coaches nationwide."`
   - Para: `"Hand-picked athletes from around the world, verified and presented to coaches nationwide."`.

### C. `src/routes/athlete.$slug.tsx` (Página Pública de Perfil do Atleta)
1. **Remoção do Fallback Enviesado de Nacionalidade** (linha 59):
   - Substituir `const countryName = athlete.country?.name_en || "Brazilian";` por `const countryName = athlete.country?.name_en || "";`.
   - Ajustar o título (`pageTitle`) e descrição SEO (`pageDescription`) para omitir a nacionalidade de forma fluida e elegante quando o atleta não tiver país preenchido, em vez de rotulá-lo falsamente como brasileiro.
   - Preservar a exibição da nacionalidade e bandeira na UI (`countryLabel`) caso o atleta possua país cadastrado.

### D. `src/routes/__root.tsx` (Metadados Globais da Raiz)
1. Atualizar a meta tag de descrição padrão da aplicação:
   - De: `"Catalog and tracking platform for Brazilian athletes pursuing opportunities in the United States."`
   - Para: `"Catalog and tracking platform for international student-athletes pursuing collegiate athletic opportunities in the United States."`.

### E. `src/routes/_authenticated/admin/visual.tsx` (Painel Administrativo)
1. Atualizar os placeholders e previews de fallback do subtítulo do Hero para refletir `"top international recruits"` em vez de `"top Brazilian recruits"`.

### F. Auditoria de `src/lib/catalog.ts` (Filtros e Ordenação)
- Verificado: O dicionário de sinônimos/parsing (`COUNTRY_PT_TO_EN`) mapeia variações para `"Brazil"` apenas para normalização correta de dados preenchidos. Não há nenhum peso, prioridade ou viés privilegiando atletas brasileiros sobre outros países na busca, prateleiras, filtros ou ordenação.

---

## 3. Plano de Testes & Validação
1. Executar suíte de testes unitários (`vitest run`).
2. Executar validação de linter (`lint_applet`).
3. Executar compilação de produção (`compile_applet`).
4. Atualizar os registros vivos em `CERNE.md` e `BACKLOGER.md` conforme o protocolo `AGENTS.md`.

---

## 4. Solicitação de Aprovação
Este plano detalhado está pronto. Nenhuma alteração de código foi realizada ainda. Aguardo sua aprovação explícita para prosseguir com a implementação.
