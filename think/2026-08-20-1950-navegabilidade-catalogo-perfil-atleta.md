# Planejamento: Navegabilidade, Scroll-Spy, Reading Progress, Next Athlete, Chips Filters e Skeletons

**Data:** 2026-08-20 19:50  
**Status:** `[AGUARDANDO APROVAÇÃO]`  
**Solicitante:** Kauan  
**Executor:** Antigravity AI

---

## 1. Contexto & Diagnóstico

O objetivo desta tarefa é elevar significativamente a navegabilidade, a percepção de qualidade técnica e a experiência do usuário (UX/UI) tanto no catálogo público quanto, principalmente, na página pública de perfil do atleta (`/athlete/$slug`).

### Diagnósticos levantados:

1. **Sub-nav estática**: A barra de atalhos rápidos sticky na página do atleta (`#athlete-film`, `#highlights`, `#fact-sheet`, etc.) não indica a seção em que o olheiro/coach está navegando no momento, dificultando a orientação em perfis extensos.
2. **Ausência de barra de progresso**: Em perfis com muita mídia e dados de recrutamento, o visitante não tem feedback visual imediato do progresso de leitura da página.
3. **Fim de página sem continuidade ("Next Prospect")**: Ao chegar ao final do perfil, o coach encontra o CTA de recrutamento e o rodapé, sem um atalho convidativo para continuar explorando o próximo atleta elegível.
4. **Filtros por `<select>` nativos**: Os seletores nativos do catálogo possuem baixa interatividade tátil no mobile e não oferecem visualização direta de filtros ativos com remoção rápida.
5. **Estado vazio estático**: Quando uma busca não encontra atletas, não há ação direta ("Clear filters") para restaurar a listagem.
6. **Ausência de Skeleton / Pending State**: As rotas públicas (`/` e `/athlete/$slug`) ainda não aproveitam o `pendingComponent` nativo do TanStack Router para transições suaves com esqueletos animados.

---

## 2. Solução Proposta & Detalhamento dos Blocos

### Item 2 — Sub-nav com Indicação de Seção Ativa (Scroll-Spy)

- **Novo Hook**: `src/hooks/use-active-section.ts`
  - Utiliza `IntersectionObserver` nos elementos de seção (`#athlete-film`, `#highlights`, `#fact-sheet`, `#about-athlete`, `#achievements`, `#gallery`, `#recruit-cta`).
  - Configuração de `rootMargin` ajustada para considerar a altura combinada do header sticky (`64px`) + sub-nav sticky (`48px`).
  - Estado imediato ao clicar no link (sem delay de scroll) e sincronizado com o scroll natural.
- **Visual & Acessibilidade**:
  - Item ativo: `bg-primary/10 text-primary font-bold border border-primary/20` com `aria-current="true"`.
  - Mobile: rolagem horizontal automática suave no container com `scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" })` ao mudar de seção ativa.

### Item 3 — Barra de Progresso de Leitura (`ReadingProgressBar`)

- **Novo Componente**: `src/components/reading-progress-bar.tsx`
  - Barra de 3–4px de altura fixa no topo absoluto (`fixed top-0 left-0 right-0 z-50 pointer-events-none`).
  - Gradiente esmeralda para dourado do design system (`from-primary to-[var(--gold)]`).
  - Atualização por `requestAnimationFrame` no evento de scroll (`scrollY / (scrollHeight - clientHeight)`).
  - Suporte a `prefers-reduced-motion` (atualização direta da largura sem transições pesadas de CSS).
  - Renderizada exclusivamente na página do atleta (`src/routes/athlete.$slug.tsx`).

### Item 4 — Navegação "Próximo Atleta" (Next Prospect) no Rodapé

- **Lógica de Dados (`src/lib/athletes.functions.ts`)**:
  - Atualização da função `getPublicAthlete` e tipo `PublicAthletePayload` para incluir `nextAthlete: { id, slug, full_name, photo_url, height_cm, position, country } | null`.
  - Busca inteligente: primeiro busca outro atleta publicado na mesma posição (`position_id`), ou o próximo atleta publicado ordenado por data de criação / slug.
- **Card no Perfil (`src/routes/athlete.$slug.tsx`)**:
  - Posicionado após a seção `#recruit-cta` e antes do `WhatsappFab`.
  - Card editorial refinado com imagem (aspect 4:5 ou 16:9), eyebrow _"Next Prospect"_, nome, posição e país.
  - Utilização de `<Link to="/athlete/$slug" params={{ slug: nextAthlete.slug }} preload="intent">` do TanStack Router para prefetch instantâneo no hover/touch.
  - Se for o único atleta ou não houver próximo, nada é renderizado.

### Item 5 — Filtros do Catálogo como Chips Clicáveis

- **Módulo de Catálogo (`src/lib/catalog.ts`)**:
  - Ajuste de `filterAthletes` para suportar seleção múltipla ou unitária nos campos `position` e `country` (compatibilidade retroativa).
- **Interface no Catálogo (`src/routes/index.tsx`)**:
  - Substituição dos três `<select>` por grupos de chips/pills interativos com `<button type="button" aria-pressed={...}>`.
  - Estilo: pílula com borda suave, `bg-card/60 hover:bg-card`, ativo em `bg-primary/10 border-primary/40 text-primary font-semibold` com botão "×" individual.
  - Botão _"Clear all"_ exibido quando qualquer filtro estiver ativo.
  - No mobile: container com scroll horizontal (`overflow-x-auto scrollbar-none flex gap-2`) sem quebras desordenadas.

### Item 6 — Estado Vazio de Busca com Ação

- **Arquivo**: `src/routes/index.tsx`
  - Ao lado de _"No athletes found matching your search."_, inclusão do botão _"Clear filters"_ com estilo secundário do design system, que limpa `search`, `position`, `country` e `ageRange`.

### Item 7 — `pendingComponent` (Skeletons) nas Rotas Públicas

- **Novos Componentes**:
  - `src/components/skeletons/catalog-skeleton.tsx`: Esqueleto com header, hero simplificado, barra de filtros cinza e grid de cards (proporção 3:4) com `animate-pulse` (respeitando `prefers-reduced-motion`).
  - `src/components/skeletons/athlete-profile-skeleton.tsx`: Esqueleto com header, silhueta do hero 4:5, linhas editoriais e blocos da ficha técnica.
- **Configuração no TanStack Router**:
  - Inserção de `pendingComponent` e `pendingMs: 200` em `Route` de `src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`.

---

## 3. Arquivos Envolvidos

1. `src/hooks/use-active-section.ts` _(Novo)_ — Hook de detecção de seção com `IntersectionObserver` e auto-scroll.
2. `src/components/reading-progress-bar.tsx` _(Novo)_ — Componente da barra de progresso no topo.
3. `src/components/skeletons/catalog-skeleton.tsx` _(Novo)_ — Skeleton do catálogo público.
4. `src/components/skeletons/athlete-profile-skeleton.tsx` _(Novo)_ — Skeleton do perfil do atleta.
5. `src/lib/athletes.functions.ts` — Inclusão do payload `nextAthlete` em `getPublicAthlete` e tipagem `PublicAthletePayload`.
6. `src/lib/catalog.ts` — Suporte a multi-seleção de filtros em `filterAthletes`.
7. `src/routes/index.tsx` — Chips clicáveis de filtro, botão "Clear filters" no estado vazio e `pendingComponent`.
8. `src/routes/athlete.$slug.tsx` — Sub-nav ativa (scroll-spy), `ReadingProgressBar`, card "Next Prospect" e `pendingComponent`.
9. `CERNE.md` — Atualização da documentação viva pós-implementação.
10. `BACKLOGER.md` — Registro da tarefa.

---

## 4. Estratégia de Validação

1. **Linting & Typecheck**: `bun run typecheck` / `bun run lint` garantindo zero erros de tipagem.
2. **Build de Produção**: `compile_applet` para validação de compilação do Vite + TanStack Start.
3. **Comportamento Mobile-First**: Validação de áreas de toque (min 44px), scroll horizontal nos chips/sub-nav e responsividade em 360–430px.
4. **Acessibilidade**: Validação de contraste WCAG AA, tags `aria-pressed`, `aria-current` e respeito a `prefers-reduced-motion`.

---

## 5. Status da Aprovação

- [x] Plano salvo em `think/2026-08-20-1950-navegabilidade-catalogo-perfil-atleta.md`
- [ ] **Aguardando aprovação humana explícita para iniciar a implementação no código.**
