# Plano de Implementação: TASK-066 — Correção do Select de Agency Visual Settings, Logging de Erros e Migração 0019

- **ID da Tarefa:** TASK-066
- **Data/Hora:** 2026-09-15 20:05
- **Solicitante:** Kauan / Usuário Humano
- **Executor:** Antigravity AI / Gemini Coding Agent
- **Status:** [CONCLUÍDO]

---

## 1. Visão Geral & Contexto

A Home pública (`/`) e a página individual do perfil de atleta (`/athlete/$slug`) perderam a renderização da logo da agência, imagem de fundo do hero e o favicon dinâmico na aba do navegador.

### Causa Raiz Diagnosticada
Em `src/lib/athletes.functions.ts`, a projeção `AGENCY_VISUAL_PUBLIC_SELECT` continha as colunas `hero_title_pt`, `hero_subtitle_pt` e `catalog_heading_pt`. Essas colunas foram removidas do banco de dados na migração `db/migrations/0013_full_english_pivot_and_course_of_interest.sql` durante a transição 100% US English.

Quando o PostgREST / Supabase recebe uma query `.select(...)` com qualquer coluna inexistente na tabela, ele rejeita a consulta inteira com erro `400 / 42703 (undefined_column)`. Como as chamadas `getAgencyVisual`, `listPublicAthletes` e `getPublicAthlete` não verificavam o campo `error` retornado pelo Supabase para `agency_visual_settings`, a consulta falhava silenciosamente e o payload `visual` retornava como `null`.

Além disso, a migração `db/migrations/0019_fix_universities_rls_role_reference.sql`, citada na TASK-063 como histórico de hotfix de RLS, estava ausente do diretório físico de migrations.

---

## 2. Escopo & Arquivos Afetados

1. **`src/lib/athletes.functions.ts`**:
   - Ajustar `AGENCY_VISUAL_PUBLIC_SELECT` para conter exclusivamente colunas existentes: `agency_id, hero_title_en, hero_subtitle_en, catalog_heading_en, logo_url, hero_background_url`.
   - Adicionar tratamento e log explícito de erro (`console.error`) em `getAgencyVisual`, `listPublicAthletes` e `getPublicAthlete` caso a consulta a `agency_visual_settings` falhe.
2. **`src/types/db.ts`**:
   - Atualizar a interface `AgencyVisualSettings` removendo os campos mortos `hero_title_pt`, `hero_subtitle_pt` e `catalog_heading_pt`.
3. **`src/routes/index.tsx`**:
   - Limpar acessos residuais aos campos `_pt` em `visual` no componente da Home.
4. **`src/lib/athletes.functions.test.ts`**:
   - Adicionar teste unitário de projeção para `AGENCY_VISUAL_PUBLIC_SELECT` garantindo que nenhuma coluna `_pt` ou inexistente seja selecionada.
5. **`db/migrations/0019_fix_universities_rls_role_reference.sql`**:
   - Criar arquivo de migração declarando as RLS policies para `universities` e `email_suppressions` usando `public.is_agency_admin()`.
6. **Documentação Viva e Registro**:
   - Atualizar `CERNE.md` e `BACKLOGER.md` com a TASK-066.

---

## 3. Etapas de Execução

1. Atualizar `src/lib/athletes.functions.ts` com a nova constante e logging de erro nas 3 funções consumidoras.
2. Atualizar a tipagem em `src/types/db.ts`.
3. Atualizar `src/routes/index.tsx`.
4. Criar `db/migrations/0019_fix_universities_rls_role_reference.sql`.
5. Atualizar e rodar os testes unitários (`vitest`) e linter (`eslint`).
6. Atualizar a documentação viva `CERNE.md` e o diário de bordo `BACKLOGER.md`.

---

## 4. Impactos, Riscos e Alternativas

- **Impactos:** A restauração do select correto faz com que o PostgREST retorne os dados salvos em `agency_visual_settings` com sucesso (logo, hero image e títulos em inglês), restaurando o favicon na raiz, o logo no header e o hero no catálogo e perfil do atleta.
- **Riscos:** Zero risco de regressão, pois as colunas `_pt` já não existiam no schema do PostgreSQL.
- **Alternativas consideradas:** Usar `select("*")` foi descartado para manter consistência de projeção segura e leve para clientes públicos anônimos.

---

## 5. Estratégia de Validação

- Executar `npm test` (Vitest) com suite ampliada para validar projeções.
- Executar `npm run lint` (ESLint) para garantir conformidade de tipagem e ausência de avisos/erros.
- Compilar via `compile_applet` para certificar integridade do build de produção.
