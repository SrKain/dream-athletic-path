# Refatoração do Fluxo de Cadastro e Exibição de Vídeos do YouTube (Admin ↔ Catálogo Público)

**Status:** Aguardando Aprovação Humana

## 1. Contexto e Objetivo

O usuário solicitou uma reformulação completa do fluxo de vídeos do YouTube entre o painel de administração e o catálogo público do atleta:

1. **No Admin (`/_authenticated/admin/athletes/$id`)**: Fornecer um fluxo intuitivo e objetivo para cadastrar e categorizar os links do YouTube (Vídeo de Apresentação, Sobre/Trajetória, Em Quadra/In Court e Highlights/Reels).
2. **No Perfil Público (`/athlete/$slug`)**:
   - **Fundo do Hero**: O vídeo de apresentação rodará no fundo da seção Hero com uma **máscara verde** (overlay verde esmeralda / primary da paleta com transparência e gradientes) para gerar atmosfera imersiva sem comprometer a legibilidade das informações do atleta.
   - **Abaixo do Texto de Apresentação**: Os vídeos de **In Court (em quadra)** e **Sobre (trajetória/apresentação detalhada)** serão exibidos logo abaixo do texto de bio/apresentação em embeds 16:9 (`PublicYoutubePlayer`).
   - A listagem genérica temporária adicionada anteriormente ao final da página será substituída por essa estrutura integrada e harmônica.

## 2. Escopo e Arquivos Afetados

- **`src/routes/_authenticated/admin/athletes/$id.tsx`**:
  - Simplificação e aprimoramento da seção de vídeos na aba "Perfil & mídia", com botões/campos claros para adicionar links do YouTube para cada finalidade (Apresentação, Sobre, Em Quadra, Highlights).
  - Prévia imediata da thumbnail, validação em tempo real e persistência imediata na tabela `athlete_videos`.
- **`src/lib/public-videos.ts`**:
  - Normalização dos tipos de vídeo para suportar explicitamente `presentation` (Apresentação / Hero), `about` (Sobre o Atleta), `in_court` (Em Quadra) e `highlight` (Reels).
- **`src/routes/athlete.$slug.tsx`**:
  - Renderização do vídeo de apresentação no fundo do Hero com máscara verde (`bg-emerald-950/80` com gradiente radial/linear e backdrop suave) + botão opcional para assistir com áudio em modal ou player.
  - Inserção dos vídeos de "In Court" e "Sobre" diretamente abaixo do texto de apresentação do atleta na seção About.
  - Manutenção do carrossel/visualizador de Reels para highlights verticais.
- **`CERNE.md`**: Atualização da documentação viva após a execução do plano aprovado.
- **`BACKLOGER.md`**: Registro da tarefa TASK-027.

## 3. Etapas de Implementação

1. **Ajustar Tipos e Helpers de Vídeo (`public-videos.ts` & `db.ts`)**:
   - Assegurar que os tipos contemplem `presentation`, `about`, `in_court` e `highlight`.
   - Garantir que a função `groupPublicVideos` separe com precisão o vídeo do Hero (fundo com máscara verde), os vídeos da seção Sobre (In Court + Sobre) e os reels de Highlights.
2. **Refatorar Seção de Vídeos no Admin (`$id.tsx`)**:
   - Organizar a área de vídeos em cards dedicados com seletor direto de finalidade e atalhos rápidos ("+ Vídeo de Apresentação", "+ Vídeo em Quadra", "+ Vídeo Sobre", "+ Highlight").
   - Validação imediata de URLs do YouTube (`isValidYoutubeUrl`) e feedback visual de thumbnail.
3. **Reformular o Hero no Perfil Público (`athlete.$slug.tsx`)**:
   - Inserir container de vídeo no fundo do Hero (`pointer-events-none` com `iframe` em loop, mudo e autoplay sem som) coberto por máscara verde esmeralda translúcida e gradientes suaves.
   - Preservar a foto, dados do atleta, tags e botões de ação em primeiro plano com contraste e acessibilidade garantidos.
4. **Inserir Vídeos In Court & Sobre Logo Abaixo do Texto de Apresentação (`athlete.$slug.tsx`)**:
   - Na seção "About [Nome]", logo após o texto descritivo da bio, renderizar uma grade responsiva (1 coluna no mobile, 2 colunas em telas maiores) com os players embedados 16:9 dos vídeos de quadra e sobre.
   - Remover a seção temporária redundante do final da página.
5. **Verificação de Qualidade**:
   - Executar `lint_applet` e `compile_applet` para assegurar que não haja erros de tipagem, lint ou compilação.

## 4. Impactos, Riscos e Alternativas

- **Mobile-first**: O vídeo de fundo no hero terá fallback suave caso o dispositivo móvel bloqueie iframes em background ou esteja em modo de economia de dados/pouca bateria.
- **Acessibilidade**: A máscara verde manterá contraste superior a 4.5:1 (WCAG AA) para todos os textos brancos/claros do Hero.
- **Performance**: Todos os iframes abaixo da dobra utilizarão `loading="lazy"`.

## 5. Estratégia de Validação

1. Validação de formulários no Admin com URLs reais do YouTube (formatos `watch?v=`, `youtu.be/`, `shorts/`).
2. Validação visual da máscara verde no Hero e dos embeds abaixo do texto de apresentação.
3. Validação de compilação e tipagem com `compile_applet`.

## 6. Status de Aprovação

- `[PENDENTE DE APROVAÇÃO HUMANA]`
