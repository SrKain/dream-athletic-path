# Planejamento: Redesign de Acessibilidade, UI/UX e Reels Circular na Página do Atleta (`/athlete/$slug`) + Limpeza da Home

**Data:** 2026-08-20 13:24  
**Status:** `[CONCLUÍDO]`  
**Solicitante:** Kauan  
**Executor:** Antigravity AI  

---

## 1. Contexto & Diagnóstico dos Problemas Atuais

A página pública do atleta (`/src/routes/athlete.$slug.tsx`) é a principal vitrine da plataforma **Go Team Go** para técnicos universitários e olheiros internacionais (*coaches*) nos EUA.

Após uma auditoria completa de UI/UX, acessibilidade e mobile-first, foram identificados os seguintes pontos críticos:

1. **Problema de Espaçamento e Alinhamento no Hero da Página do Atleta**:
   - As informações textuais do atleta estavam sem padding interno adequado no grid do Hero, ficando soltas contra o fundo escuro de vídeo/máscara.
   - O contraste de cor dos ícones e textos secundários (`text-primary` sobre `bg-surface` escuro) violava as regras WCAG AA de contraste (verde médio sobre verde escuro profundo).
   - Ausência de um enquadramento visual sólido (cartão/painel com efeito de vidro `glass-dark` e padding generoso) que unifique a foto 4:5 e os dados do atleta.

2. **Miniaturas dos Vídeos de Highlights / Reels (Formato Circular "Bolinha")**:
   - Atualmente, os vídeos de highlights estavam sendo renderizados como grandes retângulos verticais (`aspect-[9/16] w-[72vw]`), ocupando espaço desproporcional e destoando do formato clássico e intuitivo de **Stories / Reels Bubbles ("bolinhas")** do Instagram/TikTok.
   - O objetivo é transformar a listagem de Reels em uma fileira de miniaturas circulares ("bolinhas" com aro de destaque esmeralda/dourado e botão de play centralizado) que, ao serem clicadas, abrem o visualizador vertical imersivo em tela cheia com navegação por teclado e toque.

3. **Navegação Rápida e Intuitiva (Quick Anchors / Sticky Sub-Nav)**:
   - A página possui muito conteúdo relevante (Bio, Vídeos In Court, Apresentação, Ficha de Recrutamento com 11 métricas, O que traz ao time, Conquistas, Fotos e Contato). Sem uma navegação de ancoragem rápida, o usuário precisa rolar excessivamente no mobile.

4. **Acessibilidade e Design System (UI&UX.md / Mobile-First)**:
   - Garantir área de toque mínima de 44px em todos os controles interativos no mobile.
   - Manter 100% de conformidade com US English (unidades imperiais, formatação de datas).
   - Hierarquia tipográfica com contraste nítido, sem quebras de palavras em chips/badges.

5. **Limpeza da Home (Focus Mode)**:
   - Remoção da div de tags residuais `NCAA D1 · D2 · D3`, `NAIA`, `NJCAA` no Hero da Home (`/src/routes/index.tsx`).

---

## 2. Solução Proposta & Execução

### Bloco 1: Reformulação do Hero com Padding e Alto Contraste
- **Container com Glass Dark**: Envolver o bloco de informações e foto em um container com bordas refinadas, padding generoso (`p-6 sm:p-8 md:p-10`), backdrop-blur e elevação visual consistente.
- **Acessibilidade de Cores**:
  - Títulos em branco puro (`text-white`).
  - Subtítulo e bio em tons de alto contraste (`text-emerald-100/90` ou `text-white/80`).
  - Ícones em dourado (`text-[var(--gold)]`) ou esmeralda claro (`text-emerald-300`), garantindo contraste > 4.5:1 sobre o fundo escuro.
- **Chips Biométricos e Acadêmicos**: Agrupamento em pílulas com fundo translúcido e bordas sutis para Height, Weight, Age/Birth Date, GPA e Graduation Class.
- **Botões de Ação**: Botão principal *"Recruit Athlete"* em verde esmeralda líquido (`liquid-button`) e botão secundário *"Watch Film"* com âncora direta.

### Bloco 2: Reels / Highlights em Formato Circular ("Bolinhas de Stories")
- **Novo Componente de Miniaturas Circulares em `src/components/reels-viewer.tsx`**:
  - Fileira horizontal com rolagem suave (`snap-x`, `scrollbar-none`) contendo as bolinhas de stories.
  - Cada bolinha possui:
    - Diâmetro responsivo (72px a 84px).
    - Anel externo com degradê esmeralda/dourado (`ring-2 ring-offset-2 ring-emerald-500` com hover scale).
    - Imagem de capa do vídeo cortada perfeitamente em círculo (`rounded-full object-cover`).
    - Ícone de play translúcido no centro da bolinha.
    - Título do vídeo logo abaixo com largura limitada (truncado com tooltip/aria-label).
  - Ao clicar na bolinha, dispara o `ReelsOverlay` (modal vertical em tela cheia 9:16 com controles ↑/↓, swipe e ESC).

### Bloco 3: Barra de Navegação Rápida entre Seções (Sub-Nav Flutuante/Sticky)
- Inserir barra de atalhos rápidos com âncoras para:
  - 🎬 **Film & Highlights**
  - 📋 **Recruiting Stats**
  - 👤 **About & Strengths**
  - 🏆 **Achievements**
  - 📸 **Gallery**
  - 💬 **Contact**

### Bloco 4: Refatoração das Seções de Vídeo e Ficha Técnica
- **In Court & Presentation Film**: Grid 2 colunas no desktop / 1 coluna no mobile com cards organizados, títulos nítidos e players embutidos com lazy-loading.
- **Key Recruiting Details**: Organização da ficha técnica em 3 blocos lógicos (Athletic Measurements, Academic & Eligibility, Background) para leitura rápida de scouts.
- **Seção "What Brings to the Team"**: Bloco de destaque editorial com bordas refinadas e tipografia acolhedora.
- **Seção de Conquistas e Galeria**: Grid aprimorado com cards acessíveis e tags temporais.

### Bloco 5: Remoção da Div de Tags no Hero da Home (`src/routes/index.tsx`)
- Remoção direta da div selecionada contendo as tags `NCAA D1 · D2 · D3 / NAIA / NJCAA`.

---

## 3. Arquivos Envolvidos

1. `/src/routes/index.tsx` — Remoção da div de tags na Home.
2. `/src/components/reels-viewer.tsx` — Reformulação do layout de lista para formato circular ("bolinhas" de Reels/Stories) com suporte acessível e trigger para o modal de tela cheia.
3. `/src/routes/athlete.$slug.tsx` — Redesign completo do Hero (padding, contraste, layout de dados), inclusão da navegação rápida, reestruturação da ficha técnica e acessibilidade geral.
4. `/think/2026-08-20-1324-redesign-acessibilidade-ux-pagina-atleta.md` — Registro deste plano.
5. `/BACKLOGER.md` — Registro e status da tarefa.
6. `/CERNE.md` — Atualização da documentação viva pós-execução.
