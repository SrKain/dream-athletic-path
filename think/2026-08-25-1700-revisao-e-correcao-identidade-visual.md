# Planejamento: Revisão Detalhada e Correção da Identidade Visual e Tipografia

- **Data/Hora:** 2026-08-25 17:00
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity AI
- **Status:** `[CONCLUÍDO]`

---

## 1. Diagnóstico do Problema ("O que quebrou?")

Após uma auditoria minuciosa do código e da renderização após as últimas alterações, identificamos os seguintes pontos que causaram quebra estética/tipográfica ou comportamental no design:

1. **Problema do Fallback da Fonte "Tan St. Canard" (Bebas Neue All-Caps)**:
   - A fonte *Tan St. Canard* não é nativa da web e, ao usar *Bebas Neue* como fallback direto no `@layer base h1, h2, h3, h4, h5, h6`, todos os títulos da aplicação foram forçados para **LETRAS MAIÚSCULAS CONDENSADAS (ALL-CAPS)**.
   - Textos mistos e frases como *"Discover Our Available Athletes for 2027"*, *"Let's find your next athlete."*, nomes de atletas e seções acadêmicas perderam a caixa baixa e ficaram distorcidos.
   - **Correção**: Configurar o stack de fontes display com *Oswald* e *Barlow Semi Condensed* / *Space Grotesk* (que possuem suporte completo a caixa alta e baixa, estética esportiva de alto impacto) mantendo a referência a *Tan St. Canard*, e remover a regra forçada de all-caps nos headings.

2. **Sobrecarga de Peso Global (`font-weight: 600` e `700`)**:
   - Foi aplicada a regra `body { font-weight: 600; }` e `button, input, select, textarea { font-weight: 700; }` no `@layer base`. Isso deixou **todo** o texto da interface (inclusive descrições longas, placeholders de inputs, tabelas e parágrafos) em negrito excessivo, prejudicando a legibilidade e a hierarquia visual.
   - **Correção**: Ajustar a tipografia do corpo com *Quicksand* permitindo a escala natural de pesos (500 para textos regulares/parágrafos garantindo alta legibilidade e 600/700 para labels, botões, destaques e badges).

3. **Posicionamento de `@import url(...)` no CSS e Integração no `<head>`**:
   - O `@import` do Google Fonts no `src/styles.css` estava posicionado após declarações do Tailwind, o que pode gerar inconsistências de carregamento em alguns navegadores.
   - **Correção**: Incluir o carregamento direto das fontes (*Quicksand*, *Oswald*, *Barlow Condensed*, *Space Grotesk*) de forma otimizada via `<link rel="preconnect">` e `<link rel="stylesheet">` no `<head>` em `src/routes/__root.tsx` e no topo absoluto de `src/styles.css`.

4. **Compatibilidade dos Tokens Tailwind CSS v4 (`@theme inline`)**:
   - As variáveis `--font-display` e `--font-sans` não estavam explicitamente mapeadas dentro do bloco `@theme inline`, fazendo com que as classes utilitárias `font-display` e `font-sans` pudessem ter comportamento inconsistente.
   - **Correção**: Mapear formalmente `--font-display: var(--font-display);` e `--font-sans: var(--font-sans);` dentro de `@theme inline`.

5. **Harmonia dos Elementos com a Paleta Oficial**:
   - Garantir que o Laranja `#f69e00` seja o ponto de luz nos botões de ação e badges de destaque, o Verde Escuro `#032812` seja o fundo elegante e profundo do Hero, o Verde Apoio `#084323` fique nas tags esportivas ("TRANSFER", "Match Play"), o Azul Apoio `#114f8f` nas tags "Introduction" e o Vermelho Apoio `#ff1616` exclusivo para alertas, com contraste WCAG AA perfeito.

---

## 2. Plano de Ação Passo a Passo

1. **`src/styles.css`**:
   - Corrigir a declaração `@theme inline` incluindo tokens de fontes e cores.
   - Ajustar `--font-display: "Tan St. Canard", "Oswald", "Barlow Semi Condensed", "Space Grotesk", sans-serif;`.
   - Ajustar `--font-sans: "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;`.
   - Remover os estilos globais agressivos de `@layer base` que forçavam `font-weight: 600` no `body` e `font-weight: 700` em todos os inputs.
   - Ajustar a classe `eyebrow` para manter espaçamento elegante sem quebrar maiúsculas.
   - Manter a classe `liquid-button` com o gradiente dourado/laranja oficial (`#f69e00` -> `#e08f00`), texto escuro `#032812` legível e transição refinada.

2. **`src/routes/__root.tsx`**:
   - Inserir links de pré-conexão e stylesheet do Google Fonts no `<head>` para carregamento imediato sem FOUT (Flash of Unstyled Text).

3. **`src/routes/index.tsx` (Catálogo Público)**:
   - Revisar títulos de seções, Hero, cards e badges garantindo que o texto misto mantenha a caixa correta, com hierarquia limpa e botões destacados em `#f69e00`.

4. **`src/routes/athlete.$slug.tsx` (Perfil do Atleta)**:
   - Revisar o Hero do atleta, portrait ring em `#f69e00`, tags de posição e dados biográficos para máxima nitidez e harmonia visual.

5. **Validação**:
   - Executar suíte de testes completa (`npm test` / Vitest).
   - Executar linter (`lint_applet`).
   - Executar compilação de produção (`compile_applet`).
   - Atualizar `CERNE.md` e registrar em `BACKLOGER.md`.

---

## 3. Solicitação de Aprovação

Aguardando a aprovação do usuário humano para executar este plano de correção e refinamento.
