# UI&UX.md — Guia de Design System, Identidade Visual & Diretrizes de Interface (Go Team Go / Sport Scout Hub)

> **AVISO OBRIGATÓRIO PARA INTELIGÊNCIAS ARTIFICIAIS (IAs)**:
> Este arquivo é o **guia oficial e vivo de UI/UX e Design System** do projeto **Go Team Go**.
> Toda e qualquer interface visual, componente, tela, e-mail HTML ou elemento gráfico criado, alterado ou evoluído **DEVE SEGUIR ESTAS DIRETRIZES SEM EXCEÇÕES**.

---

## 1. Princípios de Design & Filosofia Visual

A identidade visual do **Go Team Go / Sport Scout Hub** combina o dinamismo do **jornalismo esportivo de alta performance** com a elegância de **plataformas de streaming premium** (estilo Netflix/Spotify/Apple TV).

### Os 4 Pilares Inegociáveis:
1. **Mobile-First por Padrão**: Todas as telas são pensadas primeiramente para o viewport de smartphones (360px a 430px). A experiência em dispositivos móveis deve ser rápida, fluida e natural ao toque.
2. **Visual Premium & Impactante**: Cores ricas em formato OKLCH, contrastes fortes sem cansar a vista, efeitos de vidro temperado (*glassmorphism*) e botões com brilho líquido (*liquid-button*).
3. **Clareza Editorial Esportiva**: Uso estratégico de sobretítulos em caixa alta (`.eyebrow`), números de estatísticas em destaque e cartões bem delimitados com bordas finas de 1px.
4. **Acessibilidade (a11y) & Performance**: Respeito a temas de alto contraste, indicação clara de estados de foco (`--color-ring`), suporte a `prefers-reduced-motion` e taxa de contraste mínima 4.5:1.

---

## 2. Paleta de Cores e Tokens do Tema (`src/styles.css`)

O projeto utiliza **Tailwind CSS v4** com variáveis baseadas no espaço de cor **OKLCH**, garantindo transições de cores puras e consistentes entre temas claro e escuro.

| Token / Variável | Valor OKLCH / Cor | Uso Recomendado |
| :--- | :--- | :--- |
| `--background` | `oklch(0.968 0.018 102)` | Fundo da aplicação (Off-white editorial suave e acolhedor). |
| `--foreground` | `oklch(0.22 0.045 162)` | Texto principal (Carvão profundo esportivo). |
| `--primary` | `oklch(0.46 0.11 162)` | **Verde Esmeralda Go Team Go**: Botões primários, badges de destaque e CTAs principais. |
| `--primary-foreground` | `oklch(0.985 0.012 100)` | Texto em cima de botões primários. |
| `--gold` | `oklch(0.75 0.12 85)` | **Dourado Medalha**: Conquistas, troféus, atletas em destaque e momentos comemorativos. |
| `--sidebar` / `--surface` | `oklch(0.19 0.05 162)` | Barras laterais, cabeçalhos escuros e fundos de painéis de alto contraste. |
| `--card` / `--popover` | `oklch(0.99 0.009 100)` | Superfície de cartões, modais, popovers e formulários. |
| `--border` / `--input` | `oklch(0.84 0.018 105)` | Linhas de divisão e bordas de inputs finas e elegantes. |
| `--destructive` | `oklch(0.62 0.22 25)` | Alertas de erro, reprovações e exclusões. |

---

## 3. Tipografia & Hierarquia de Texto

As fontes oficiais carregadas no projeto atendem a propósitos específicos:

- **Fonte de Exibição / Títulos (`Space Grotesk`)**:
  - Classe Tailwind: `font-display`
  - Uso: Títulos principais de páginas (`h1`, `h2`), numerais de estatísticas, marcas e nomes de atletas em destaque.
  - Estilo: Caixa alta ou semi-bold com espaçamento entre letras marcante.

- **Fonte do Corpo & Interfaces (`Inter`)**:
  - Classe Tailwind: `font-sans` (padrão do `body`)
  - Uso: Textos corridos, parágrafos, formulários, botões, tabelas e menus.
  - Estilo: Regular (400) e Medium (500) para máxima legibilidade no celular.

- **Sobretítulos (`.eyebrow`)**:
  - Classe CSS: `@utility eyebrow`
  - Propriedades: `font-size: 0.7rem`, `font-weight: 700`, `letter-spacing: 0.14em`, `text-transform: uppercase`.
  - Uso: Rótulos acima de títulos (ex: `ESTÁGIO ATUAL`, `ESTATÍSTICAS DO ATLETA`, `PROPOSTA ACEITA`).

---

## 4. Utilitários e Efeitos Especiais (`src/styles.css`)

Toda nova interface deve utilizar as utilidades pré-definidas em vez de inventar estilos ad-hoc:

1. **Vidro Claro (`.glass-panel`)**:
   - Painéis com fundo translúcido, blur de 22px e sombra suave. Ideal para modais e cards flutuantes no tema claro.
2. **Vidro Escuro (`.glass-dark`)**:
   - Fundo escuro translúcido com blur de 24px e brilho sutil na borda superior. Ideal para overlays, headers e cards estilo streaming.
3. **Botão Líquido (`.liquid-button`)**:
   - Degradê esmeralda com brilho interno e sombra orgânica. Usado nos botões de ação principal (ex: *"Aprovar Atleta"*, *"Enviar Proposta"*, *"Aceitar Oferta"*).
4. **Borda do Container (`.container-edge`)**:
   - `width: min(100% - 2rem, 80rem); margin-inline: auto;` — garante alinhamento de margens laterais perfeitas em mobile e desktop.
5. **Ocultar Scrollbar (`.scrollbar-none`)**:
   - Remove a barra de rolagem nativa mantendo a funcionalidade de scroll horizontal em carrosséis de cards.

---

## 5. Regras de Componentes & Layouts

### Cards de Atletas & Mídias
- Aspect ratio padronizado para fotos (4:5 em perfis, 16:9 para vídeos de destaques).
- Badges informativas sobrepostas na imagem com fundo escuro translúcido (`bg-black/60 backdrop-blur-md`).
- Efeito de hover suave com escala discreta (`hover:scale-[1.02] transition-transform duration-300`).

### Formulários & Modais
- Labels sempre acima dos inputs (`text-sm font-medium text-foreground mb-1`).
- Inputs com altura mínima de toque no mobile (`min-h-[44px]` ou `py-2.5 px-3.5`).
- Mensagens de validação claras em vermelho destrutivo com ícones indicadores.

### Tabelas & Quadros Kanban
- Em telas mobile, tabelas administrativas grandes devem se transformar em cartões expansíveis ou possuir scroll horizontal com indicação visual.
- Colunas do Kanban com largura ajustada para visualização em telas pequenas (suporte a deslizamento horizontal suave).

---

## 6. E-mails e Notificações Externas

Todos os e-mails transacionais (via Resend) e alertas externos devem seguir a mesma identidade visual:
- **Layout Mobile-First**: Largura máxima de 560px, margens internas generosas (32px), texto legível em smartphones.
- **Tema Dark Premium**: Fundo `#0b0b0c`, container `#141416`, texto `#f5f5f4` e acentos na cor esmeralda (`#c6f24e`).
- **Botões CTA**: Botões grandes de no mínimo 44px de altura com cantos arredondados e texto em negrito.
