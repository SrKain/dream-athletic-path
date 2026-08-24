# Plano: Reordenar Informações dos Cards e Simplificação de Filtros do Catálogo Público (Home)

- **Data/Hora:** 2026-08-24 15:05
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Objetivos

Esta evolução na Home do Catálogo Público (`/`) e no Card de Atleta atende aos seguintes requisitos:
1. **Reordenar Informações dos Cards da Home**:
   - **Linha 1:** `Nome` (ex.: "Laura Savassa")
   - **Linha 2:** `Altura · Posição · Nacionalidade` (ex.: "5'10\" · Setter · Brazil")
2. **Tradução 100% US English de Posições e Nacionalidades**:
   - Criação de dicionários e helpers de normalização (`POSITION_PT_TO_EN`, `COUNTRY_PT_TO_EN`) para garantir que todas as posições (ex.: "Levantadora" → "Setter", "Ponteira" → "Outside Hitter", "Central" → "Middle Blocker", etc.) e nacionalidades (ex.: "Brasil" / "BR" → "Brazil") sejam renderizadas exclusivamente em inglês na camada de exibição.
3. **Simplificação e Reordenação dos Filtros da Home**:
   - Remoção completa do filtro de **idade** ("Age Range" / "Age") da interface e de toda a lógica de estado, contagem ativa e limpeza associadas.
   - Manter visíveis apenas 4 filtros, exatamente nesta ordem:
     1. **Position** (chips de posições em inglês)
     2. **High School Graduation Year** (chips com anos de formatura no ensino médio: 2024, 2025, 2026, 2027, 2028, etc.)
     3. **Country** (chips com países em inglês)
     4. **Student Status** (chips com status acadêmico/atlético: High School, Freshman, Sophomore, Junior, Senior, Graduate Transfer)
   - Padronização visual em chips clicáveis horizontais responsivos (Mobile-First) para os 4 filtros.

---

## 2. Detalhamento Técnico das Alterações

### 2.1. Normalização e Dicionário de Tradução (`src/lib/catalog.ts` ou `src/lib/units.ts`)
- Criar dicionário exaustivo `POSITION_PT_TO_EN` com mapeamentos para vôlei, futebol, basquete e atletismo (incluindo variações de gênero como Levantador/Levantadora, Ponteiro/Ponteira, etc.).
- Criar dicionário exaustivo `COUNTRY_PT_TO_EN` e mapa ISO para converter nomes e códigos de países para inglês americano canônico.
- Exportar funções auxiliares:
  - `translatePositionToEn(position?: string | null): string`
  - `translateCountryToEn(country?: string | null): string`
  - `getAthletePositionEn(athlete: AthleteCard): string`
  - `getAthleteCountryEn(athlete: AthleteCard): string`
  - `getAthleteGradYear(athlete: AthleteCard): string | null`
  - `getAthleteStatus(athlete: AthleteCard): string | null`

### 2.2. Atualização dos Dados Públicos (`src/lib/athletes.functions.ts`)
- No `listPublicAthletes()`, garantir que a query de `athlete_profiles` carregue `high_school_graduation`, `graduation_year` e `athlete_status` e vincule ao objeto `athlete.profile` de cada `AthleteCard`.
- Atualizar a interface `AthleteCard` em `src/types/db.ts` para incluir a propriedade opcional `profile?: Pick<AthleteProfile, "high_school_graduation" | "graduation_year" | "athlete_status"> | null`.

### 2.3. Reordenação do Card de Atleta (`src/routes/index.tsx` & `src/routes/athlete.$slug.tsx`)
- No `AthleteCardItem` da Home:
  - Linha 1: `{athlete.full_name}`
  - Linha 2: `[heightImperial, positionEn, countryEn].filter(Boolean).join(" · ")`
- No card "Next Prospect" em `src/routes/athlete.$slug.tsx`:
  - Aplicar a mesma ordem e os mesmos helpers de tradução em inglês.

### 2.4. Refatoração dos Filtros da Home (`src/routes/index.tsx`)
- Remover estados e handlers de `ageRange`.
- Implementar estados para os 4 filtros:
  - `selectedPositions: string[]`
  - `selectedGradYears: string[]`
  - `selectedCountries: string[]`
  - `selectedStatuses: string[]`
- Renderizar as 4 seções de chips na ordem estrita:
  1. Position
  2. High School Graduation Year
  3. Country
  4. Student Status
- Atualizar a lógica `filterAthletes()` em `src/lib/catalog.ts` para filtrar por estes 4 critérios e busca textual.
- Atualizar `hasActiveFilters` e `clearAllFilters`.

---

## 3. Arquivos Afetados

1. `src/types/db.ts` — Inclusão do campo `profile` em `AthleteCard`.
2. `src/lib/catalog.ts` — Dicionários de tradução para EN, extração de filtros e lógica atualizada de `filterAthletes` (sem age, com gradYear e studentStatus).
3. `src/lib/catalog.test.ts` — Atualização dos testes unitários de filtros.
4. `src/lib/athletes.functions.ts` — Inclusão de `high_school_graduation`, `graduation_year` e `athlete_status` em `listPublicAthletes()`.
5. `src/routes/index.tsx` — Reordenação do Card (`Nome` linha 1, `Altura · Posição · País` linha 2) e reestruturação dos 4 filtros em chips.
6. `src/routes/athlete.$slug.tsx` — Alinhamento da ordem no card "Next Prospect".
7. `CERNE.md` — Atualização da documentação viva do sistema.
8. `BACKLOGER.md` — Registro da tarefa TASK-041 e status.

---

## 4. Plano de Validação

1. `npm run typecheck` — Validação estrita de tipos TypeScript.
2. `npm run lint` — ESLint sem nenhum erro ou warning pendente.
3. `npm run test` — Execução completa da suite Vitest garantindo 100% de aprovação.
4. `npm run build` — Compilação de produção com Vite / Nitro.

---

## 5. Solicitação de Aprovação

Conforme o protocolo obrigatório de governança de IA (`AGENTS.md` e `README.md`), este plano foi registrado na pasta `think/` e é apresentado a seguir para **aprovação prévia e explícita** antes de qualquer alteração em arquivos de código.
