# Plano de Ajustes na Página Pública Individual do Atleta

- **Data/Hora:** 2026-08-22 20:05
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Contexto e Objetivos

Este plano detalha as melhorias e correções na página pública individual do atleta (`/athlete/$slug`) e no painel administrativo (`/admin/athletes/$id`), alinhado ao padrão 100% US English e ao design system de *Quiet Luxury* / mobile-first (`UI&UX.md`):

1. **Hero — Remoção do Subtítulo Editorial**:
   - Remover a renderização do parágrafo de subtítulo do hero (`profile?.subtitle`) na página pública do atleta, mantendo o campo no banco para compatibilidade e sem quebras de dados.
2. **Hero — Renomeação de Labels e Formatação do GPA**:
   - Renomear **"Class:"** → **"HIGH SCHOOL GRAD.:"**.
   - Renomear **"GPA:"** → **"Current GPA:"**.
   - Criar helper `formatGpa(gpa: number | null | undefined): string | null` em `src/lib/units.ts` garantindo sempre no mínimo 1 casa decimal (ex.: `4.0`, `3.0`, preservando valores como `3.85` e `3.75`), aplicando-o tanto no Hero quanto na Fact Sheet.
3. **Botão(ões) "Watch Film" — Links Diretos e Suporte a Múltiplos Vídeos**:
   - Transformar os botões de "Watch Film" no Hero em links diretos que abrem o vídeo do YouTube em nova aba (`target="_blank"`, `rel="noopener noreferrer"`), utilizando `youtubeWatchUrl()`.
   - Permitir que a agência cadastre múltiplos vídeos do kind `"highlight"` (ou scouting film) com títulos customizáveis (ex.: `"Highlights 2025"`, `"Game Film vs. Regional Champs"`), gerando um botão de ação com ícone de Play para cada vídeo no Hero. Se houver 1 vídeo sem título, utilizar o fallback padrão `"Watch Film"`.
   - Manter o link `"Fact Sheet"` (`#fact-sheet`) com rolagem suave interna inalterado.
4. **Fact Sheet — Atualização de Campos Acadêmicos & Elegibilidade**:
   - Renomear **"High School Class"** → **"High School Graduation"**.
   - Aplicar `formatGpa` no card **"Current GPA"**.
   - **Remover completamente** o card **"Seasons Eligibility Left"** (`profile.seasons_eligibility`) da Fact Sheet e retirar o campo do formulário do admin.
   - **Novos Campos**:
     - **Athlete Status** (Select com opções: `High School`, `Freshman`, `Sophomore`, `Junior`, `Senior`, `Graduate Transfer`).
     - **College Start Date** (Formato `Fall/Spring + Ano`, ex.: `Fall 2024`, `Spring 2025`, `Fall 2025`, `Spring 2026`, etc.).
     - Nova migration `0014_athlete_status_college_start.sql` adicionando `athlete_status TEXT` e `college_start_date TEXT` em `athlete_profiles`.
     - Atualização de tipagens em `src/types/db.ts` (`AthleteProfile` e `AthleteStatus`).
     - Inclusão dos campos no formulário do admin (`/admin/athletes/$id`) e na Fact Sheet pública no bloco "Academic & Eligibility".
5. **Highlight Reels — Remoção da Página Individual & Registro de Ideia Futura**:
   - Remover a renderização de `<ReelsRow videos={highlights} ... />` da página pública do atleta (`athlete.$slug.tsx`).
   - Remover `"highlights"` do hook `useActiveSection` (`sectionIds`) e da barra de navegação rápida com scroll-spy (`data-nav-id="highlights"`).
   - Preservar os dados e registros de vídeos do tipo `"highlight"` no banco de dados intactos.
   - Registrar no `BACKLOGER.md` a tarefa futura com status `[PENDENTE]` para o feed global de reels em subdomínio dedicado (`reels.goteamgoagency.com`).

---

## 2. Decisões Técnicas

### 2.1. Formatação de GPA (`src/lib/units.ts`)
Para garantir clareza e fidelidade aos padrões universitários norte-americanos:
- Se `gpa` for um número inteiro (ex.: `4`, `3`, `2`), formatar com 1 casa decimal fixa via `gpa.toFixed(1)` (`"4.0"`, `"3.0"`).
- Se `gpa` já possuir casas decimais (ex.: `3.85`, `3.7`), retornar como string preservando a precisão original (`"3.85"`, `"3.7"`).
- Helper implementado:
  ```ts
  export function formatGpa(gpa: number | null | undefined): string | null {
    if (gpa == null || Number.isNaN(gpa)) return null;
    return Number.isInteger(gpa) ? gpa.toFixed(1) : String(gpa);
  }
  ```

### 2.2. Estrutura e Fonte dos Botões "Watch Film"
- A tabela `athlete_videos` já suporta o kind `"highlight"` com campos `youtube_url` e `title` customizável.
- Agrupamos os vídeos de filme/destaque (`highlights`, e fallback para `profile.highlight_video_url` se não houver vídeos cadastrados em `athlete_videos`).
- No Hero, geramos uma lista dinâmica de botões:
  - Se houver múltiplos vídeos: cada botão recebe o rótulo do seu `title` (ex.: `"Highlights 2025"`, `"Game Film 2024"`) ou `"Watch Film 1"`, `"Watch Film 2"`.
  - Se houver 1 vídeo: recebe o `title` cadastrado ou `"Watch Film"` como fallback.
  - Cada botão possui:
    ```tsx
    <a
      key={video.id}
      href={youtubeWatchUrl(video.youtube_url) ?? video.youtube_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-white/20 bg-white/5 px-6 text-xs font-semibold uppercase tracking-wider text-[#f4f7e9] backdrop-blur-md transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Play className="h-3.5 w-3.5 fill-current text-[#dfff1f]" />
      {video.title?.trim() || "Watch Film"}
    </a>
    ```
  - No Admin (`/admin/athletes/$id`), a seção de vídeos `Highlights` será claramente sinalizada como os botões de Watch Film do Hero da página pública.

### 2.3. Banco de Dados e Migração (`db/migrations/0014_athlete_status_college_start.sql`)
```sql
-- Migration: 0014_athlete_status_college_start.sql
-- Description: Add athlete_status and college_start_date to athlete_profiles

alter table if exists public.athlete_profiles
  add column if not exists athlete_status text,
  add column if not exists college_start_date text;

comment on column public.athlete_profiles.athlete_status is
  'Current academic / athletic status (High School, Freshman, Sophomore, Junior, Senior, Graduate Transfer)';

comment on column public.athlete_profiles.college_start_date is
  'Term and year of college entrance (e.g. Fall 2024, Spring 2025, Fall 2025, Spring 2026)';
```

### 2.4. Formulário do Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`)
- **Athlete Status**: `<select>` com as opções:
  - `High School`
  - `Freshman`
  - `Sophomore`
  - `Junior`
  - `Senior`
  - `Graduate Transfer`
- **College Start Date**: Input com datalist / select de sugestões nos padrões `Fall 2024`, `Spring 2025`, `Fall 2025`, `Spring 2026`, `Fall 2026`, `Spring 2027`, permitindo edição livre e garantindo facilidade no preenchimento.
- **Seasons of Eligibility**: Campo removido do formulário para evitar poluição visual e inconsistências com as novas diretrizes da agência.

### 2.5. Correção de Teste do Catálogo (`src/lib/catalog.test.ts`)
- Ajustar os mocks de posições no arquivo de teste do catálogo (`Setter`, `Outside Hitter`, `Libero`) para passar 100% verde com a ordenação canônica em inglês.

---

## 3. Arquivos Afetados

1. `db/migrations/0014_athlete_status_college_start.sql` — Nova migration com as colunas `athlete_status` e `college_start_date`.
2. `src/types/db.ts` — Inclusão de `AthleteStatus`, adição dos novos campos em `AthleteProfile`.
3. `src/lib/units.ts` — Criação do helper `formatGpa`.
4. `src/lib/units.test.ts` — Adição de testes unitários para `formatGpa`.
5. `src/routes/athlete.$slug.tsx`:
   - Remoção do subtítulo do Hero.
   - Renomeação dos labels para `"HIGH SCHOOL GRAD.:"` e `"Current GPA:"`.
   - Aplicação de `formatGpa` no Hero e na Fact Sheet.
   - Renderização dos botões dinâmicos de "Watch Film" com abertura direta do YouTube.
   - Remoção da seção e sub-nav de Reels/Stories.
   - Renomeação de "High School Class" para "High School Graduation".
   - Remoção de "Seasons Eligibility Left".
   - Inclusão dos cards "Athlete Status" e "College Start Date" na Fact Sheet.
6. `src/routes/_authenticated/admin/athletes/$id.tsx`:
   - Adição dos campos `Athlete Status` e `College Start Date`.
   - Remoção do campo `Seasons of Eligibility Left`.
   - Ajuste textual da descrição dos vídeos de Highlight para refletir os botões "Watch Film" do Hero.
7. `src/lib/catalog.test.ts` — Atualização dos mocks do teste unitário de posições.
8. `CERNE.md` & `BACKLOGER.md` — Atualizações de documentação viva e registro da tarefa.

---

## 4. Plano de Validação

- `npm test` / `vitest run` — Todos os testes passando (100% de cobertura nos helpers afetados).
- `npm run lint` — Zero erros de linter e formatação.
- `npm run build` — Compilação limpa do Vite e TanStack Router.
- Verificação visual da página pública do atleta e do painel admin.

---

## 5. Solicitação de Aprovação

Conforme o protocolo de governança (Regra 2 de AI Governance em `AGENTS.md` e `README.md`), este plano detalhado está submetido para **aprovação prévia e explícita do usuário humano**. Nenhuma alteração no código será realizada antes da sua confirmação.
