# Plano de Solução: Seção Highlights na Home do Catálogo Público & Reels Viewer Global

**Data e Hora**: 2026-08-25 17:25  
**Solicitante**: Kauan  
**Agente**: Antigravity AI  
**Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Contexto e Objetivo

Implementar a seção interativa de **Highlights** na Home do catálogo público (`/` — `src/routes/index.tsx`), permitindo que técnicos internacionais (Coaches) e visitantes descubram jogadas e lances de atletas em formato imersivo vertical de Reels/Stories, sem fricção de navegação.

### Diretrizes de Negócio e Dados
1. **Reaproveitamento de Dados**: Utilizar os vídeos do tipo `highlight` já presentes e cadastráveis no banco de dados (`athlete_videos` com `kind = 'highlight'`).
2. **Trilha de Bolinhas (Home)**: Barra horizontal de Stories posicionada logo abaixo do Hero e antes dos filtros/pesquisa, exibindo avatar da atleta com anel fixo na cor primária laranja da marca (`#f69e00`) e nome em tipografia oficial (`Quicksand Bold`), ordenada pela atleta com highlight mais recente.
3. **Viewer em Tela Cheia (Global Feed)**: Experiência imersiva estilo TikTok/Stories com scroll vertical infinito percorrendo todos os highlights de todas as atletas (ordenados cronologicamente do mais recente para o mais antigo), sem bloqueio ou agrupamento rígido por atleta.
4. **Interações do Viewer**:
   - **Autoplay & Áudio**: Vídeo em autoplay com início mudo por padrão e botão de toggle de áudio (Mute/Unmute).
   - **Progresso**: Barra segmentada no topo acompanhando a reprodução.
   - **Overlay**: Nome e posição da atleta no canto inferior.
   - **Ações**:
     - *Recrutar*: Dispara WhatsApp com mensagem padrão parametrizada de `src/lib/contact.ts`.
     - *Compartilhar*: Web Share API nativa com fallback para área de transferência (Clipboard).
     - *Curtir*: Ícone de estrela (`Star`), com gravação persistente de likes reais no Supabase, atualização otimista instantânea e bloqueio contra spam/múltiplos cliques.
     - *Perfil*: Navegação direta para a rota pública da atleta (`/athlete/$slug`).
5. **Restrição Mandatória**: Os highlights existem **exclusivamente na Home** e **NÃO** devem ser renderizados nem exibidos na página de perfil individual da atleta (`/athlete/$slug`).
6. **Design System & Acessibilidade**: Cores oficiais (Laranja `#f69e00`, Verde Escuro `#032812`, apoios `#084323`, `#114f8f`), tipografia oficial (Tan St. Canard / Quicksand Bold), suporte a teclado (ESC, setas ↑/↓) e touch swipe.

---

## 2. Escopo e Arquivos Afetados

| Arquivo | Ação | Responsabilidade |
| :--- | :---: | :--- |
| `db/migrations/0015_highlight_likes.sql` | **Criação** | Criação da tabela `athlete_video_likes` e coluna `likes_count` para contabilização de sinais de interesse nos vídeos. |
| `src/types/db.ts` | **Edição** | Adição das interfaces de payload de Highlights (`HighlightStoryItem`, `HighlightFeedVideo`, `HighlightLikePayload`). |
| `src/lib/athletes.functions.ts` | **Edição** | Extensão de `listPublicAthletes` e criação da Server Function `likeHighlightVideoServerFn` para registro e retorno de curtidas com segurança. |
| `src/components/home-highlights-story-bar.tsx` | **Criação** | Componente da trilha horizontal de bolinhas de Stories na Home com anel laranja `#f69e00`, snap scroll, avatar e trigger para o viewer. |
| `src/components/global-highlights-viewer.tsx` | **Criação** | Componente do Viewer em tela cheia com feed vertical unificado, player 9:16, indicador de progresso, botões de ação (Recruit, Share, Star Like, Profile) e toggle de áudio. |
| `src/routes/index.tsx` | **Edição** | Integração da trilha de bolinhas e do viewer na Home, posicionados exatamente entre o Hero e a barra de busca/filtros. |
| `CERNE.md` & `BACKLOGER.md` | **Edição** | Atualização da documentação viva e registro da tarefa conforme protocolo de governança. |

---

## 3. Etapas Detalhadas de Implementação

### Etapa 1: Estrutura de Banco de Dados e Types
1. Criar migration `0015_highlight_likes.sql` com:
   - Tabela `public.athlete_video_likes` com RLS e permissões para `anon` e `authenticated`.
   - Coluna auxiliar `likes_count` com fallback seguro.
2. Definir tipos em `src/types/db.ts`:
   - `HighlightStoryAthlete`: `{ athleteId, athleteName, athleteSlug, photoUrl, positionEn, latestHighlightDate, highlightsCount, firstHighlightIndex }`
   - `HighlightFeedItem`: `{ id, athleteId, athleteName, athleteSlug, athletePhoto, positionEn, countryEn, youtubeUrl, title, createdAt, likesCount }`

### Etapa 2: Server Functions e Carregamento Otimizado de Dados
1. Em `src/lib/athletes.functions.ts`:
   - Na função `listPublicAthletes()`, carregar vídeos com `kind = 'highlight'` associados a atletas públicos.
   - Montar a lista agregada de `storyAthletes` (uma bolinha por atleta com highlight, ordenada pela data do highlight mais recente) e o `globalHighlightFeed` (todos os highlights ordenados cronologicamente).
   - Criar `likeHighlightVideoServerFn` para persistência de likes com proteção de spam e fallback seguro caso a tabela esteja em processo de sincronização.

### Etapa 3: Trilha de Bolinhas de Stories (`HomeHighlightsStoryBar`)
1. Implementar container com scroll horizontal suave (`overflow-x-auto`, `scrollbar-none`, `snap-x`).
2. Renderizar cada bolinha:
   - Avatar com anel de borda fixa laranja `#f69e00` (sem efeito de visto/não visto).
   - Efeito de hover suave com escala e micro-elevação.
   - Nome do atleta logo abaixo com tipografia `font-sans font-bold text-xs` (`Quicksand`), truncado elegantemente.
   - Badge discreta indicando quantidade de clipes se houver mais de 1.
3. Ao clicar, disparar o callback `onSelectAthlete(athleteId)` para abrir o viewer no primeiro highlight correspondente.

### Etapa 4: Viewer em Tela Cheia (`GlobalHighlightsViewer`)
1. Modal / Dialog em tela cheia (`fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl`).
2. Scroll vertical / Gestos:
   - Suporte a swipe vertical no mobile (touch events), setas laterais no desktop, teclas ↑ / ↓ / j / k e tecla ESC para fechar.
   - Feed global contínuo: ao passar pelos vídeos de uma atleta, desliza diretamente para o próximo highlight da lista global.
3. Player de Vídeo e Áudio:
   - Visualização vertical 9:16 centralizada.
   - Autoplay com áudio desativado por padrão (mudo) e botão flutuante de som (Mute / Unmute) visível e acessível.
   - Barra de progresso segmentada no topo indicando o clipe atual.
4. Overlay e Ações:
   - Canto inferior: Nome da atleta (`font-sans font-bold text-lg text-white`) e Posição formatada em US English com badge.
   - Coluna de Ações à direita / inferior:
     - **Curtir (Estrela)**: Ícone `Star` que preenche em dourado/laranja com animação de escala (`scale-125`), contador de likes atualizado instantaneamente de forma otimista e persistência local para evitar cliques duplicados.
     - **Recrutar**: Botão com ícone WhatsApp chamando `getRecruitWhatsAppUrl(...)`.
     - **Compartilhar**: Botão chamando `navigator.share(...)` com cópia de URL para o clipboard como fallback.
     - **Perfil**: Botão com ícone de usuário/link levando para `/athlete/$slug`.

### Etapa 5: Integração na Home (`src/routes/index.tsx`)
1. Inserir `<HomeHighlightsStoryBar />` logo após o `</section>` do Hero e antes da `div` da barra de busca e filtros.
2. Gerenciar estado do modal ativo (`activeHighlightIndex: number | null`).
3. Manter a integridade de performance sem causar re-renderizações desnecessárias na grade do catálogo.

---

## 4. Impactos, Riscos e Alternativas Consideradas

- **Impacto em Perfil do Atleta**: Zero impacto — a restrição explícita do usuário foi respeitada; nenhuma alteração será feita em `src/routes/athlete.$slug.tsx`.
- **Performance de Vídeos**: Como são múltiplos highlights no feed, o player renderiza com lazy load apenas o highlight ativo (e pré-carrega o próximo), evitando sobrecarga de múltiplos iframes em segundo plano.
- **Resiliência a Migrations**: Se a migration de curtidas (`0015`) ainda não tiver sido executada no Supabase externo, a função de curtir armazena no `localStorage` do navegador e atualiza o estado otimista da UI, garantindo que o usuário nunca encontre erros de interface.

---

## 5. Estratégia de Validação

1. **Linting**: Execução do ESLint em todo o projeto com `npm run lint`.
2. **Typecheck & Build**: Compilação TypeScript e Vite via `compile_applet` garantindo zero erros de tipagem.
3. **Testes Unitários**: Execução dos testes Vitest pré-existentes.
4. **Verificação de Responsividade & Acessibilidade**: Teste de navegação touch (mobile swipe) e desktop (teclado / botões).

---

## 6. Status da Aprovação

- **Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`
- **Ação do Agente**: Aguardar confirmação explícita do usuário antes de realizar alterações no código.
