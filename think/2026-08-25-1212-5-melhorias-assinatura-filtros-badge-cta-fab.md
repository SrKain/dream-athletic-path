# Planejamento: 5 Melhorias de UI/UX, Assinatura Animada, Filtros e CTA

- **Data/Hora:** 2026-08-25 12:12
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[PENDENTE]` — Aguardando aprovação explícita do usuário humano

---

## 1. Contexto e Objetivos

O solicitante solicitou a implementação de 5 itens cruciais para a experiência visual, responsiva e de conversão do projeto:

1. **Efeito de traço (stroke draw) na assinatura "Powered by iasin."**:
   - Extrair a assinatura para um componente reutilizável `src/components/powered-by-iasin-signature.tsx`.
   - Implementar linha SVG com animação de traçado (`stroke-dasharray` / `stroke-dashoffset` ou transição CSS) simulando desenho da esquerda para a direita.
   - Disparar a animação ao entrar na viewport (IntersectionObserver single-shot) e re-executar no hover.
   - Respeitar `prefers-reduced-motion`.
   - Utilizar o componente tanto em `src/routes/index.tsx` quanto em `src/routes/athlete.$slug.tsx`.

2. **Filtros da Home ocultos por padrão até haver interação/pesquisa**:
   - Ocultar visualmente os chips de filtros (Position, High School Graduation Year, Country, Student Status) por padrão.
   - Revelar com animação suave de altura/opacidade (`grid-template-rows` / transition) quando:
     - O campo de busca receber foco (`isSearchFocused`), OU
     - Houver texto digitado (`search`), OU
     - Qualquer filtro estiver ativo (`hasActiveFilters`).
   - Recolher suavemente quando perder foco e estiver vazio/sem filtros, sem resetar estados selecionados.

3. **Badge "FRESHMAN" no card do atleta na Home**:
   - No `AthleteCardItem` em `src/routes/index.tsx`, usar `getAthleteStatus(athlete)` de `src/lib/catalog.ts`.
   - Exibir badge com texto "FRESHMAN" sempre que `athlete_status` existir e for diferente de `"Junior"`.
   - Quando o status for exatamente `"Junior"`, a badge NÃO é renderizada.
   - Posicionamento no topo do card com alto contraste e alinhado ao design system (verde esmeralda / escuro / dourado, uppercase, tracking-wide).
   - Manter a página de perfil individual (`src/routes/athlete.$slug.tsx`) inalterada, exibindo o status real cadastrado.

4. **Seção de CTA final no catálogo público antes do rodapé**:
   - Adicionar seção de CTA em `src/routes/index.tsx` entre o final das estantes de atletas e o `<footer>`.
   - Kicker: "Looking for talent?"
   - Título: "Let's find your next athlete."
   - Botão: "Talk to Go Team Go" com link para WhatsApp geral de recrutamento.
   - Estilização moderna com glassmorphism/fundo esmeralda e padding generoso.

5. **Ajuste no botão flutuante do WhatsApp (`WhatsappFab`)**:
   - No componente `src/components/whatsapp-fab.tsx`, adicionar `IntersectionObserver` que detecta a visibilidade do elemento `<footer>`.
   - Quando o rodapé estiver visível no viewport, aplicar transição suave de opacidade e escala (`opacity-0 scale-90 translate-y-6`) e desativar eventos com `pointer-events-none` e `aria-hidden={true}` / `tabIndex={-1}`.
   - Quando o rodapé sai de vista, o botão retorna suavemente.

---

## 2. Arquivos Envolvidos

1. `src/components/powered-by-iasin-signature.tsx` (Novo componente reutilizável de assinatura animada)
2. `src/components/whatsapp-fab.tsx` (IntersectionObserver para ocultar sobre o footer)
3. `src/routes/index.tsx` (Filtros expansíveis, CTA final, Badge Freshman, Assinatura reutilizável)
4. `src/routes/athlete.$slug.tsx` (Assinatura reutilizável no rodapé)
5. `CERNE.md` (Atualização da documentação viva)
6. `BACKLOGER.md` (Registro da tarefa `TASK-046`)

---

## 3. Detalhamento Técnico da Implementação

### 3.1. Assinatura Reutilizável com Traço Animado (`PoweredByIasinSignature`)
- Criar `src/components/powered-by-iasin-signature.tsx`.
- Utilizar `useRef` + `IntersectionObserver` para disparar o traço uma vez ao entrar em tela.
- Permitir replay do traço no `onMouseEnter`.
- Linha SVG com `vector-effect="non-scaling-stroke"`, `strokeDasharray: 120`, controlando `strokeDashoffset` de 120 até 0.
- `@media (prefers-reduced-motion: reduce)` para desabilitar animações.

### 3.2. Filtros Expansíveis na Home
- Estado: `const [isSearchFocused, setIsSearchFocused] = useState(false);`
- Flag de visibilidade: `const showFilters = isSearchFocused || Boolean(search.trim()) || hasActiveFilters;`
- Container com transição suave CSS:
  `grid transition-all duration-300 ease-out ${showFilters ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"}`
  com container interno `overflow-hidden`.

### 3.3. Badge "FRESHMAN" no Card da Home
- `const rawStatus = getAthleteStatus(athlete);`
- `const showFreshmanBadge = Boolean(rawStatus && rawStatus.trim().toLowerCase() !== "junior");`
- Exibir badge estilizada sobre a mídia do card:
  ```tsx
  {showFreshmanBadge && (
    <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
      <span className="inline-flex items-center rounded bg-emerald-950/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase shadow-xs border border-emerald-500/30 backdrop-blur-xs">
        Freshman
      </span>
    </div>
  )}
  ```

### 3.4. CTA Final na Home
- Bloco posicionado logo após a seção do catálogo e antes do `<footer>`.
- Link do botão WhatsApp utilizando `RECRUIT_WHATSAPP_NUMBER` e mensagem apropriada em inglês.

### 3.5. `WhatsappFab` Inteligente com Detecção de Rodapé
- Observer observando `document.querySelector("footer")`.
- Transição com classes Tailwind `transition-all duration-300 ease-out`, garantindo total acessibilidade.

---

## 4. Plano de Validação
1. Execução de testes unitários com Vitest (`npm run test`).
2. Validação com ESLint (`npm run lint`).
3. Compilação de produção (`compile_applet`).
4. Atualização de `CERNE.md` e `BACKLOGER.md`.
