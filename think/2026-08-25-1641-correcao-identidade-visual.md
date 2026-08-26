# Planejamento — Correção de Identidade Visual (Cores e Tipografia) Go Team Go

- **Data/Hora:** 2026-08-25 16:41
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity AI
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Objetivos

O usuário solicitou o alinhamento visual completo do catálogo público (`/` - Home) e da página pública de perfil do atleta (`/athlete/$slug`) com a identidade visual e branding oficial da **Go Team Go**, substituindo todas as cores divergentes e tipografias legadas por tokens centralizados e padronizados.

### Diretrizes de Cores Oficiais
- **Primária 1 (Destaque/Ação):** `#f69e00` (Laranja Go Team Go) — para botões de ação, CTAs, links ativos, badges de destaque e anéis de foco.
- **Primária 2 (Base/Sobriedade):** `#032812` (Verde Escuro Nobre) — para textos escuros, fundos sóbrios, hero backgrounds e containers escuros.
- **Apoio (Vermelho):** `#ff1616` — uso pontual/moderado (alertas, tags de urgência, indicadores específicos).
- **Apoio (Azul):** `#114f8f` — uso pontual/moderado (indicações secundárias, links institucionais pontuais).
- **Apoio (Verde):** `#084323` — uso pontual/moderado (variações de badges/status de sucesso, cartões secundários).

### Diretrizes de Tipografia Oficial
- **Títulos e Headings (h1, h2, h3, nomes de destaque, badges):** Fonte **Tan St. Canard** (display condensada/bold com estilo esportivo e de impacto).
  - *Documentação de Licença:* A fonte Tan St. Canard foi desenhada pela TanType (Novia Jonatan). É disponibilizada para uso pessoal/não-comercial gratuitamente e requer licença comercial para uso em marcas/produtos da TanType ou plataformas como Creative Market.
  - *Estratégia de Integração:* Declarada na pilha de `@theme` e `--font-display` com suporte a `@font-face` local e fontes de reserva/fallback atléticas de alto impacto (`'Tan St. Canard', 'Bebas Neue', 'Teko', 'Impact', sans-serif`).
- **Textos Gerais (Corpo, parágrafos, labels, botões, fichas):** **Quicksand** (peso 600/700 - Bold).
  - *Carregamento:* Importada via Google Fonts no `src/styles.css` e `src/routes/__root.tsx` (`family=Quicksand:wght@500;600;700`).

---

## 2. Diagnóstico do Estado Atual (Auditoria de Cores e Fontes)

1. **`src/styles.css`:**
   - Possui variáveis legadas como `Space Grotesk` para display e `Inter` para sans.
   - Variáveis de cor primária em OKLCH apontando para tons esmeralda desatualizados (`oklch(0.68 0.16 155)` / `#30b884`).
   - Cores hardcoded antigas como `#dfff1f` (verde neon/limão), `#061b13`, e gradientes esmeralda dispersos.
2. **`src/routes/index.tsx` (Catálogo / Home):**
   - Hero com background em `#061b13` (precisa migrar para `#032812`).
   - Textos secundários em `#b9c4bc` e botões com referências legadas.
   - Badge "TRANSFER" e chips de filtro utilizando tons esmeralda em vez da nova paleta.
   - Seção de CTA final com gradiente em `#082319` em vez da paleta oficial.
3. **`src/routes/athlete.$slug.tsx` (Perfil do Atleta):**
   - Hero com fundo `#061b13` e destaque em `#dfff1f` (limão/amarelo) nos acentos e GPA.
   - Sub-navegação com badges e anéis em esmeralda.
   - Botões "Watch Film" e "Fact Sheet" com detalhes em `#dfff1f`.
   - Cards de estatísticas e dossier com acentos esmeralda.
4. **Componentes Auxiliares:**
   - `ReadingProgressBar`: gradiente esmeralda/dourado a ser alinhado com `#f69e00` e `#084323`.
   - `WhatsappFab`: ação com cor primária laranja oficial `#f69e00` e contraste acessível.

---

## 3. Plano de Implementação Detalhado

### Fase 1: Atualização do Design System em `src/styles.css`
1. **Google Fonts & Tipografia:**
   - Inserir importação oficial de `Quicksand:wght@500;600;700` e display fallbacks (`Bebas Neue:wght@400;700`).
   - Declarar `--font-display: "Tan St. Canard", "Bebas Neue", "Teko", "Impact", -apple-system, sans-serif;`.
   - Declarar `--font-sans: "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;` com `font-weight: 600/700` nos botões e labels.
2. **Variáveis de Tema CSS (Tokens Oficiais):**
   - `--color-brand-orange: #f69e00;` (Destaque/Ação)
   - `--color-brand-darkgreen: #032812;` (Base)
   - `--color-brand-red: #ff1616;` (Apoio)
   - `--color-brand-blue: #114f8f;` (Apoio)
   - `--color-brand-green: #084323;` (Apoio)
   - Atualizar `--primary: #f69e00;` e `--primary-foreground: #032812;` (ou `#ffffff` onde necessário conforme WCAG AA).
   - Atualizar `.liquid-button` com o gradiente e sombra laranja oficiais da Go Team Go (`from-[#f69e00] to-[#e08f00]` com hover e brilho elegantes).

### Fase 2: Refatoração Visual do Catálogo (`src/routes/index.tsx`)
1. **Hero & Topo:**
   - Fundo do Hero atualizado para `#032812` com overlays gradientes suaves para `#032812`.
   - Títulos em tipografia `font-display` (Tan St. Canard).
2. **Filtros e Chips:**
   - Chips ativos destacados com borda e fundo em tom da cor de ação `#f69e00` (`bg-[#f69e00]/15 border-[#f69e00]/50 text-[#f69e00]`).
   - Campo de busca com foco em `focus-within:ring-[#f69e00]/30 focus-within:border-[#f69e00]`.
3. **Cards de Atletas:**
   - Badge "TRANSFER" padronizada com cores de apoio e primária (ex: fundo `#084323`, borda `#084323` e texto contrastante).
   - Títulos e nomes com tipografia oficial e hierarquia nítida.
4. **Seção de CTA Final:**
   - Background nobre em `#032812` com iluminação laranja sutil (`bg-[#f69e00]/15 blur-3xl`).
   - Botão "Talk to Go Team Go" estilizado com a classe `.liquid-button` em laranja oficial.

### Fase 3: Refatoração Visual do Perfil do Atleta (`src/routes/athlete.$slug.tsx`)
1. **Hero Editorial (Quiet Luxury):**
   - Background em `#032812` com máscaras e gradientes perfeitamente calibrados.
   - Nome do atleta em tipografia Tan St. Canard (`font-display`).
   - Badge de posição sobre a foto com fundo `#032812`/80 e texto em `#f69e00`.
   - Substituição de todas as menções a `#dfff1f` (limão) pelo laranja oficial `#f69e00` (GPA, ícones dos botões de vídeo, acentos).
   - Botão "Recruit Athlete" com a nova estética `.liquid-button` laranja.
2. **Sub-Navegação com Scroll-Spy:**
   - Itens ativos com `bg-[#f69e00]/10 text-[#f69e00] border-[#f69e00]/30`.
   - Botão "Recruit" na subnav em `.liquid-button` laranja.
3. **Dossier / Fact Sheet / About:**
   - Ícones e eyebrows utilizando a primária `#f69e00`.
   - Bloco "What Brings to the Team" com fundo `#f69e00]/5` e borda `#f69e00]/25`.
   - Badges de categorias de vídeo (Introduction, Match Play, Featured) harmonizadas com as cores oficiais (Apoio Azul `#114f8f`, Apoio Verde `#084323` e Ação Laranja `#f69e00`).
4. **Seção de Contato e Next Prospect:**
   - Botão de contato em destaque laranja `#f69e00`.
   - Card Next Prospect com hover em `#f69e00`.

### Fase 4: Componentes Globais e Acessibilidade (WCAG AA)
1. `ReadingProgressBar`: gradiente elegante do verde base `#032812` ao laranja ação `#f69e00`.
2. `WhatsappFab`: cor de fundo oficial `#f69e00` com texto e ícone contrastantes em `#032812` ou `#ffffff` (validado com relação de contraste > 4.5:1).
3. Verificação de contraste em todos os textos e fundos:
   - Texto claro `#f4f7e9` sobre fundo `#032812` (Contraste ~ 14:1 — WCAG AAA).
   - Laranja `#f69e00` com texto escuro `#032812` (Contraste ~ 7.2:1 — WCAG AAA).
4. Sem alterações na lógica funcional de componentes (apenas estilo e tipografia).

### Fase 5: Validação e Documentação
1. Execução de validação sintática e de compilação via `compile_applet`.
2. Registro formal da tarefa no `BACKLOGER.md` (TASK-048).
3. Atualização da documentação viva do sistema em `CERNE.md`.

---

## 4. Próximo Passo

Aguardar aprovação expressa do usuário humano para iniciar a execução das alterações no código.
