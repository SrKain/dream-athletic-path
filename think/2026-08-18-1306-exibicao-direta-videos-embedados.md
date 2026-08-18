# Exibição Direta de Todos os Vídeos do YouTube no Perfil do Atleta

**Status:** Concluído (Aprovado pelo usuário em 2026-08-18 13:08)

## 1. Contexto e Objetivo

O usuário solicitou que todos os links do YouTube cadastrados no admin para um atleta sejam obrigatoriamente exibidos e reproduzidos na página pública do atleta (`/athlete/$slug`). Como medida direta para validação imediata, deve ser adicionada uma seção ao final da página com todos os vídeos cadastrados incorporados em embeds funcionais e responsivos.

## 2. Escopo e Arquivos Afetados

- **`src/routes/athlete.$slug.tsx`**:
  - Consolidar todas as fontes de vídeo cadastradas (`videos` da tabela `athlete_videos` e `profile.highlight_video_url`).
  - Renderizar uma seção dedicada ao final da página (`Registered Videos / Embedded Film`) com grid responsivo de players embedados (1 coluna em telas móveis, 2 colunas em desktop).
- **`CERNE.md`**: Atualização da documentação viva após aprovação e execução.
- **`BACKLOGER.md`**: Atualização do status da tarefa.

## 3. Etapas de Implementação

1. Coletar e desduplicar todos os vídeos disponíveis para o atleta no loader de `athlete.$slug.tsx`.
2. Adicionar ao final da página (antes do CTA de recrutamento e do WhatsApp FAB) uma seção clara contendo:
   - Título e identificação de cada vídeo (categoria, título cadastrado ou rótulo padrão).
   - Player embedado responsivo (16:9) utilizando `PublicYoutubePlayer` com `allowFullScreen`, `loading="lazy"` e link de contingência "Watch on YouTube".
3. Garantir compatibilidade total com telas mobile (360px–430px) e desktop, respeitando `UI&UX.md`.
4. Executar verificação de lint e compilação (`compile_applet`).

## 4. Impactos, Riscos e Alternativas

- **Performance**: Todos os embeds abaixo da dobra usarão carregamento sob demanda (`lazy`) para não degradar a velocidade da página.
- **Vídeos privados ou bloqueados pelo YouTube**: O fallback com botão "Watch on YouTube" garante acesso mesmo se o proprietário tiver desativado incorporação em sites externos.
- **Remoção futura**: O bloco será modular e isolado, permitindo remoção simples quando a interface definitiva for consolidada.

## 5. Estratégia de Validação

1. Executar `lint_applet` e `compile_applet` para assegurar que não há erros de tipagem ou compilação.
2. Validar que atletas com 1 ou mais vídeos cadastrados exibem os respectivos embeds de forma fluida e sem erros de console.

## 6. Status de Aprovação

- `[PENDENTE DE APROVAÇÃO HUMANA]`
