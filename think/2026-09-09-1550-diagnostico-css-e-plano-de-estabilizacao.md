# Planejamento & Diagnóstico: Auditoria Completa do CSS da Aplicação e Causas de Quebra

- **ID da Tarefa:** TASK-065
- **Data/Hora:** 2026-09-09 15:50
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity AI
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto & Diagnóstico ("O que aconteceu e por que o CSS quebrou?")

Realizamos uma auditoria minuciosa em todo o ecossistema de estilos da aplicação (`src/styles.css`, `@tailwindcss/vite` v4, LightningCSS, TanStack Start, `src/routes/__root.tsx` e componentes shadcn/Radix).

Identificamos a **história e a causa raiz técnica de cada motivo pelo qual o CSS quebrou ou apresentou instabilidades**, bem como pontos preventivos de estabilização:

### Causa 1: Conflito de Regras `@import` com o Parser LightningCSS (Erro Fatal de Build)

- **O que aconteceu:** O LightningCSS gerava o erro crítico de compilação:
  `[lightningcss] @import rules must precede all rules aside from @charset and @layer statements in /src/styles.css`.
- **Por que quebrou:** Quando a importação externa do Google Fonts (`@import url("https://fonts.googleapis.com/...");`) foi colocada abaixo de `@source "../src";` ou entre diretivas do Tailwind no `src/styles.css`, o parser do LightningCSS (usado no pipeline do Vite/Tailwind v4) rejeitou o arquivo CSS por violar a especificação estrita da W3C.
- **Como foi estabilizado:** O carregamento do Google Fonts foi movido para tags `<link rel="preconnect">` e `<link rel="stylesheet">` injetadas no `<head>` em `src/routes/__root.tsx`, e no CSS foi mantida apenas a ordem estrita de `@import "tailwindcss"` e `@import "tw-animate-css"`.

### Causa 2: Fallback Bebas Neue All-Caps e Excesso de Negrito Global (Quebra Visual/Tipográfica)

- **O que aconteceu:** Títulos, cabeçalhos, nomes de atletas, cards e textos editoriais ficaram permanentemente travados em **LETRAS MAIÚSCULAS CONDENSADAS (ALL-CAPS)** e com peso excessivo (`font-weight: 600/700`) em todo o corpo da página e formulários.
- **Por que quebrou:** A fonte _Tan St. Canard_ não é nativa da web. Ao definir o fallback direto para _Bebas Neue_ (que não possui glifos minúsculos) no `@layer base h1, h2, h3, h4, h5, h6`, qualquer navegador sem a fonte local aplicou _Bebas Neue_, forçando todo o texto para caixa alta. Além disso, regras globais de `font-weight: 600` no `body` destruíram a hierarquia visual.
- **Como foi estabilizado:** A pilha de fallback display foi rebalanceada com fontes que suportam caixa alta e baixa (_Oswald_, _Barlow Semi Condensed_, _Space Grotesk_), e a fonte do corpo foi padronizada em _Quicksand_ com pesos naturais (500 regular, 600/700 para botões e ênfase).

### Causa 3: Diretiva `@source "../src"` com `source(none)` no Tailwind CSS v4

- **O que aconteceu:** No topo de `src/styles.css` consta:
  ```css
  @import "tailwindcss" source(none);
  @import "tw-animate-css";
  @source "../src";
  ```
- **Por que pode causar quebra/instabilidade:**
  1. A sintaxe `source(none)` desativa a auto-descoberta inteligente de arquivos do Tailwind v4.
  2. O caminho `@source "../src"` é relativo à localização de `src/styles.css`. Se resolvido a partir do root do Vite (`/`) em vez do diretório de `src/`, pode falhar ou ignorar templates.
  3. No Tailwind v4 padrão com `@tailwindcss/vite`, o recomendado é utilizar `@import "tailwindcss";` (sem `source(none)`) ou `@source "./";` / `@source "../src";` de forma explícita e testada, garantindo que 100% das classes em `src/**/*.{ts,tsx}` sejam escaneadas tanto no build do cliente quanto no SSR do Nitro.

### Causa 4: Pseudo-classes `.liquid-button:hover` e `.liquid-button:active` fora de `@utility`

- **O que aconteceu:** No `src/styles.css`, o `@utility liquid-button` está declarado em um bloco, mas `.liquid-button:hover` e `.liquid-button:active` estão declarados fora dele como classes CSS comuns.
- **Por que pode causar quebra/especificidade:** No Tailwind v4, utilitários gerados por `@utility` devem conter suas variações de hover/active aninhadas com `&:hover` e `&:active` para que o Tailwind gerencie a camada de especificidade correta e evite conflitos de sobrescrita.

### Causa 5: Alinhamento de Tokens de Cor com a Identidade Visual Oficial

- **O que aconteceu:** Resquícios de cores antigas (tons esmeralda legados `#30b884`, verde neon `#dfff1f`, e escuros `#061b13`) conviviam com os novos tokens oficiais da Go Team Go (`#f69e00`, `#032812`, `#084323`, `#114f8f`, `#ff1616`).
- **Como foi estabilizado:** Centralização dos tokens em `@theme inline` no `src/styles.css`, garantindo suporte nativo a utilitários como `bg-brand-orange`, `text-brand-darkgreen`, `bg-primary`, `text-foreground`, etc.

---

## 2. Plano de Ação Proposto para Estabilização Definitiva

1. **Refinamento e blindagem de `src/styles.css`**:
   - Ajustar as diretivas `@import` e `@source` para máxima robustez no Tailwind v4.
   - Consolidar `@utility liquid-button` com aninhamento moderno `&:hover` e `&:active`.
   - Garantir que todos os tokens de cor, raio e tipografia em `@theme inline` e `:root` estejam em perfeita sintonia com o guia oficial [`UI&UX.md`](UI&UX.md).

2. **Verificação de Consistência nos Componentes Principais**:
   - Inspecionar `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/athlete.$slug.tsx` e `src/components/ui/` para assegurar que todas as classes Tailwind estão compilando sem avisos ou estilos órfãos.

3. **Validação & Testes**:
   - Executar `npm test` (98 testes unitários passando).
   - Executar `lint_applet` (ESLint sem erros).
   - Executar `compile_applet` (Build Vite/Nitro de produção 100% verde).

4. **Governança & Registro**:
   - Registrar a solicitação em `BACKLOGER.md`.
   - Atualizar a documentação viva em `CERNE.md`.

---

## 3. Solicitação de Aprovação Prévia

Conforme o protocolo obrigatório de governança no `README.md` e `AGENTS.md`, **nenhuma linha de código foi modificada**. Este plano detalhado foi previamente salvo em `think/` e submetido para sua análise.

Por favor, confirme se aprova a execução deste plano de estabilização do CSS.
