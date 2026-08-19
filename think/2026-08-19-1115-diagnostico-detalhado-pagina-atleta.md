# Diagnóstico Detalhado: Página do Atleta (/athlete/:slug) e Incorporação Direta de Vídeos

- **Data / Hora:** 2026-08-19 11:15 (UTC)
- **Solicitante:** Kauan
- **Agente:** Antigravity AI

---

## Análise da Página do Atleta (`/athlete/$slug`)

Examinando linha a linha o que acontece quando alguém acessa `/athlete/:name` (por exemplo, `/athlete/lucas-silva`):

### 1. Ausência de Iframe Direto (Problema do componente `PublicYoutubePlayer`)
Na linha 33 de `src/components/public-youtube-player.tsx`, o componente tem a condição:
`{isLoaded ? (<iframe ... />) : (<img src={thumbnailUrl} /> <button>Play</button>)}`
Como `autoPlay` é `false` por padrão e `isLoaded` começa como `false`:
- O navegador **não insere o `<iframe>` do YouTube**.
- O visitante vê uma imagem estática (thumbnail JPG da CDN do YouTube) com um botão de play cinza/verde em cima e uma barra escrita *"Watch on YouTube"*.
- Não há os controles nativos do YouTube, o botão vermelho característico do YouTube, a barra de progresso nem o player carregado até que haja uma interação de clique.
- Para quem visualiza a página, isso parece apenas uma imagem estática com link externo e não um vídeo incorporado (embed).

### 2. Omissão de Vídeos Salvos no Perfil (`highlight_video_url`)
Se o link do YouTube foi adicionado no campo *"Vídeo de destaque (URL)"* do perfil (`athlete_profiles.highlight_video_url`):
- O helper `groupPublicVideos` (`src/lib/public-videos.ts`) usa esse link apenas como `fallbackHighlight` para o fundo escuro do Hero.
- Ele **não cria nenhum card de vídeo** na lista de vídeos da página! Portanto, o vídeo não aparece em lugar nenhum da página pública como player.

### 3. Vídeos de "Highlight" Separados em Reels em vez de Players
- Se o vídeo foi cadastrado no Admin com o tipo `highlight`, ele é enviado apenas para o componente `ReelsRow` (cards verticais 9:16 com thumbnail que abrem um modal), não aparecendo na lista principal de vídeos da página.

---

## Solução Direta e Imediata

1. **Transformar o `PublicYoutubePlayer` em Embed Direto (`<iframe>` Nativo)**:
   - Renderizar o `<iframe>` real do YouTube diretamente no DOM com `src="https://www.youtube.com/embed/ID"`, `loading="lazy"`, `allowFullScreen`, controles completos e som.
   - O visitante que abrir `/athlete/:slug` verá imediatamente o player do YouTube incorporado, pronto para tocar com um clique diretamente no player oficial.

2. **Garantir que TODOS os Vídeos Apareçam Incorporados na Página**:
   - Exibir na seção de vídeos do perfil todos os vídeos cadastrados (`presentation`, `in_court`, `feature`, `highlight` e o `highlight_video_url` do perfil como fallback).
   - Cada vídeo terá seu player 16:9 real incorporado com título e categoria.
