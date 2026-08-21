# Plano de Solução — Transição Definitiva para 100% Inglês Americano (US English) & Campo 'Course of Interest' (TASK-031)

- **Data / Hora**: 2026-08-21 10:05
- **Autor / Agente**: Gemini (Google AI Studio)
- **Solicitante**: Kauan (Usuário Humano)
- **Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Contexto e Objetivo

Conforme instrução direta do usuário humano, o produto **Sport Scout Hub / Go Team Go** passa por um **pivot definitivo de idioma**:
> **A partir de agora, tudo o que for bilíngue passa a ser unicamente Inglês Americano (US English), sem exceções.**

Não haverá mais campos, pares `_pt`/`_en`, fallbacks em português ou duplicidades na interface, no banco de dados, nos formulários ou nas comunicações. Além disso, incluímos o novo campo essencial para recrutamento universitário americano: **Course of Interest** (curso/área acadêmica de interesse do atleta).

---

## 2. Escopo Arquitetural Completo

### A. Banco de Dados & Migrations SQL (`db/migrations/0013_full_english_pivot_and_course_of_interest.sql`)

1. **`athlete_profiles`**:
   - `DROP COLUMN IF EXISTS bio_pt;`
   - `ADD COLUMN IF NOT EXISTS course_of_interest TEXT;`
   - Comentário explicativo em inglês: `COMMENT ON COLUMN public.athlete_profiles.course_of_interest IS 'Desired college major or field of study in the US (e.g. Business Administration, Kinesiology, Computer Science)';`
2. **`agency_visual_settings`**:
   - `DROP COLUMN IF EXISTS hero_title_pt;`
   - `DROP COLUMN IF EXISTS hero_subtitle_pt;`
   - `DROP COLUMN IF EXISTS catalog_heading_pt;`
3. **`pipeline_stages`**:
   - Garantir que `name_en`, `description_en`, `celebration_message_en`, `portal_message_en` sejam as colunas principais; remover/descontinuar referências a `name_pt`, `description_pt`, `portal_message_pt`.
4. **`checklist_items`**:
   - Manter unicamente `label_en`.
5. **`achievements`**:
   - Manter unicamente `title_en`, `description_en`.
6. **`athlete_media`**:
   - Manter unicamente `caption_en`.
7. **`sports`, `positions`, `countries`**:
   - Manter unicamente `name_en` como fonte oficial de nomenclatura esportiva e geográfica.
8. **`profiles` (Usuários / Auth)**:
   - `locale` passa a ser fixado como `'en'`.

---

### B. Tipos TypeScript (`src/types/db.ts`)

1. **`AthleteProfile`**:
   - Remover `bio_pt: string | null;`
   - Adicionar `course_of_interest: string | null;`
   - Manter `bio_en: string | null;`
2. **`AgencyVisualSettings`**:
   - Remover `hero_title_pt`, `hero_subtitle_pt`, `catalog_heading_pt`.
   - Manter `hero_title_en`, `hero_subtitle_en`, `catalog_heading_en`.
3. **`Position`, `Sport`, `Country`**:
   - Simplificar para `name_en: string;` (e `code`, `flag_emoji`, `slug`, `abbreviation`).
4. **`PipelineStage`**:
   - Manter `name_en`, `description_en`, `portal_message_en`, `celebration_message_en`.
5. **`ChecklistItem`**:
   - Manter `label_en: string;`
6. **`Achievement`**:
   - Manter `title_en: string;`, `description_en: string | null;`
7. **`AthleteMedia`**:
   - Manter `caption_en: string | null;`

---

### C. Telas do Admin (`src/routes/_authenticated/admin/`)

1. **Edição do Atleta (`athletes/$id.tsx`)**:
   - **Remoção de Biografia PT**: remover campo e textarea `bio_pt`.
   - **Biografia EN**: renomear label para `"Athlete Biography"` / `"Biography"` com placeholder em inglês.
   - **Novo Campo "Course of Interest"**:
     ```tsx
     <Field label="Course of Interest (Desired Major / Field of Study)">
       <input
         className={inputClass}
         placeholder="e.g., Business Administration / Computer Science / Kinesiology"
         value={profile.course_of_interest ?? ""}
         onChange={(e) =>
           setProfile({ ...profile, course_of_interest: e.target.value })
         }
       />
     </Field>
     ```
   - **Limpeza de Idioma**: revisar todos os labels e placeholders que possam ter sobrado em português para 100% US English.
2. **Aba Visual (`visual.tsx`)**:
   - Remover os inputs de "Título (PT)", "Subtítulo (PT)" e "Cabeçalho (PT)".
   - Manter campos diretos: `"Hero Title"`, `"Hero Subtitle"`, `"Catalog Section Heading"`.
   - Ordenação de categorias: ordenar por `name_en` em vez de `name_pt`.
   - Labels e mensagens de sucesso/erro padronizados em inglês americano.
3. **Configurações & Pipeline (`settings.tsx`, `pipeline.tsx`, `documents.tsx`, `notifications.tsx`)**:
   - Exibir e editar exclusivamente os nomes e descrições em inglês (`name_en`, `description_en`, `portal_message_en`, `label_en`).

---

### D. Perfil Público & Catálogo (`src/routes/athlete.$slug.tsx` & `src/lib/catalog.ts`)

1. **Perfil do Atleta (`athlete.$slug.tsx`)**:
   - **Key Recruiting Details**:
     - No bloco **Academic & Eligibility**, adicionar o card `"Course of Interest"` (com ícone `BookOpen`), renderizado apenas quando preenchido.
     - Posicionamento e labels dos dados em inglês (`Position`, `Height`, `Date of Birth`, `Current School`, `High School Graduation`, `Country`, `Seeking Opportunities`, `TOEFL / Duolingo Score`, `Current GPA`, `Seasons of Eligibility Left`, `Course of Interest`).
   - **Bio Column**: Renderizar estritamente `profile?.bio_en` (sem fallbacks em PT).
   - **Achievements & Media**: Usar estritamente `title_en`, `description_en`, `caption_en`.
2. **Catálogo Público (`src/lib/catalog.ts`, `src/lib/athletes.functions.ts`)**:
   - Queries ao Supabase selecionando `name_en` em `positions`, `sports` e `countries`.
   - Agrupamento e filtros no catálogo baseados em `name_en`.

---

### E. Portal do Atleta & Sistema de E-mails

1. **Portal (`src/routes/_authenticated/portal/`)**:
   - `index.tsx`, `pipeline.tsx`, `documents.tsx`: renderizar `stage.name_en`, `definition.label_en`.
   - `useStageAnnouncement`: utilizar estritamente `stage.portal_message_en`, `stage.name_en`, `previous.name_en`.
2. **E-mails Transacionais (`src/lib/email/stage-change.server.ts`)**:
   - Seleção de `name_en` para etapas anteriores e atuais nos placeholders de notificação.

---

### F. Internacionalização (`src/i18n/`) & Testes

1. **`src/i18n/i18n-provider.tsx` / `messages.ts`**:
   - Fixar o locale da aplicação em `"en"` (US English).
2. **Testes Unitários (`*.test.ts`)**:
   - Atualizar mocks de teste para refletir o schema 100% US English (`name_en`, `label_en`, `title_en`, `course_of_interest`).
   - Rodar suíte completa do Vitest (`bun run test`).

---

## 3. Lista Completa de Arquivos a Serem Modificados

1. `db/migrations/0013_full_english_pivot_and_course_of_interest.sql` — **[NOVO]** Migration SQL definitiva.
2. `db/demo_seed.sql` — Remoção de campos `*_pt` e adição de `course_of_interest`.
3. `src/types/db.ts` — Remoção de campos `*_pt` e adição de `course_of_interest`.
4. `src/routes/_authenticated/admin/athletes/$id.tsx` — Remoção de `bio_pt`, adição de `course_of_interest`, label `Athlete Biography`.
5. `src/routes/_authenticated/admin/visual.tsx` — Remoção dos campos PT de Hero e Catálogo, ordenação por `name_en`.
6. `src/routes/_authenticated/admin/settings.tsx` — Exibição e inputs focados em `name_en`, `label_en`, `portal_message_en`.
7. `src/routes/athlete.$slug.tsx` — Remoção de fallbacks PT, adição do card `Course of Interest` com `BookOpen`.
8. `src/lib/athletes.functions.ts` — Queries focadas em `name_en`.
9. `src/lib/catalog.ts` — Agrupamento e filtros focados em `name_en`.
10. `src/lib/email/stage-change.server.ts` — Placeholders de etapas focados em `name_en`.
11. `src/hooks/use-stage-announcement.ts` — Mensagens de celebração focadas em `portal_message_en` e `name_en`.
12. `src/routes/_authenticated/portal/documents.tsx`, `index.tsx`, `pipeline.tsx` — Rótulos focados em `name_en` e `label_en`.
13. `src/lib/pipeline.helpers.test.ts`, `src/lib/catalog.test.ts` — Atualização de fixtures e mocks.
14. `CERNE.md` — Registro da documentação viva das alterações.
15. `BACKLOGER.md` — Registro da TASK-031 (`[CONCLUÍDO]` após aprovação e execução).

---

## 4. Estratégia de Validação e Critérios de Aceite

1. **`bun run typecheck` / `tsc --noEmit`**: 0 erros de tipo.
2. **`bun run lint` / `eslint .`**: 0 erros de linting.
3. **`bun run test`**: 100% dos testes unitários passando.
4. **`bun run build`**: build de produção validado sem falhas.
5. **Grep Global**: zero referências ativas a `bio_pt` e remoção limpa de redundâncias `_pt`.
6. **Inspeção Visual**: Card "Course of Interest" renderizado elegante e condicionalmente na ficha pública do atleta; formulário de administração limpo e em inglês americano.

---

## 5. Próximos Passos

Aguardando a sua **aprovação explícita** para iniciar a execução de todas as alterações acima.
