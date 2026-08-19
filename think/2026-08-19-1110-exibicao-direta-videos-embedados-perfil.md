# Planejamento: Incorporação e Exibição Direta dos Vídeos do YouTube no Perfil Público do Atleta

- **Data / Hora:** 2026-08-19 11:10 (UTC)
- **Solicitante:** Kauan (Usuário Humano)
- **Agente:** Antigravity AI (AI Studio)
- **Status:** Proposta formulada para aprovação prévia humana

---

## 1. Diagnóstico do Motivo pelo qual os Vídeos não Parecem Embedados

Com a confirmação de que as migrações já foram executadas com sucesso no banco de dados e os dados estão salvos, identificamos exatamente a razão estrutural e de UX pela qual os vídeos não estão sendo exibidos como players incorporados diretos no perfil do atleta:

### A. Padrão "Facade" (Thumbnail estática) no lugar do Iframe Imediato
Atualmente, o componente `PublicYoutubePlayer` (`src/components/public-youtube-player.tsx`) utiliza um padrão de "lazy loading facade":
1. Por padrão, ele **não renderiza a tag `<iframe>` do YouTube**.
2. Em vez disso, ele renderiza uma imagem estática `<img src="thumbnail" />` com um ícone de play sobreposto e uma barra inferior *"Watch on YouTube"*.
3. O `<iframe>` só é montado se o usuário clicar exatamente no botão de play da miniatura.
4. Isso passa a percepção visual de que o vídeo é apenas uma foto/link externo e não um vídeo real incorporado diretamente na página.

### B. Segmentação Oculta / Dispersão dos Vídeos por Categoria
1. Na estrutura atual de `src/routes/athlete.$slug.tsx`:
   - Vídeos de **Highlight** são colocados na barra superior de Reels (`ReelsRow`), que também exibe apenas miniaturas verticais em cards fechados.
   - O vídeo de **Apresentação** é colocado como um background mudo sem controles atrás do Hero, sob uma máscara esmeralda pesada de 95% de opacidade (`opacity-45` com `backdrop-blur`).
   - Apenas vídeos de **In Court** ou secundários aparecem na seção About, ainda assim dentro da thumbnail estática (Facade).
2. Se a agência cadastrou vídeos como *Highlight* ou *Apresentação*, eles não aparecem como players de vídeo tradicionais abertos na página.

---

## 2. Solução Proposta para Incorporação Direta dos Vídeos

Propomos reformular a exibição para que **todos os vídeos cadastrados no Admin sejam incorporados diretamente (Direct Embeds) com player nativo do YouTube** no perfil público do atleta:

### 1. Embed Imediato e Direto (`PublicYoutubePlayer` / `AthleteVideoEmbed`)
- Renderizar diretamente a tag `<iframe>` do YouTube nativa (com `loading="lazy"`, `allowFullScreen`, controles completos de reprodução, som e tela cheia).
- Manter aspecto responsivo 16:9 profissional com bordas arredondadas e acabamento refinado do design system.
- Eliminar a barreira de clique duplo/thumbnail estática para que o visitante veja imediatamente o player pronto para dar play com som e controles.

### 2. Seção Dedicada de Vídeos & Match Film no Perfil do Atleta
- Criar uma seção proeminente e clara **"Videos & Match Film"** no perfil do atleta (`/athlete/$slug`).
- Exibir todos os vídeos cadastrados em um grid responsivo limpo (1 coluna em mobile, 2 colunas em desktop/tablet) com seus respectivos títulos e badges da categoria (*Presentation*, *In Court / Match Play*, *Feature Film*, *Highlights*).
- Se houver múltiplos vídeos, permitir visualização direta de todos eles lado a lado.

### 3. Preservação do Hero & Destaque
- O vídeo principal de apresentação continua podendo gerar a ambientação no Hero, mas agora com garantia de que o mesmo vídeo também terá seu player completo incorporado com áudio e controles na seção de vídeos do perfil.

---

## 3. Arquivos Envolvidos na Implementação

1. `src/components/public-youtube-player.tsx`: Atualizar para renderizar o `<iframe>` direto e responsivo com controles completos do YouTube.
2. `src/routes/athlete.$slug.tsx`: Reestruturar a seção de vídeos para exibir todos os vídeos cadastrados (`presentation`, `in_court`, `feature`, `highlight`) com embed direto e badges descritivas.
3. `CERNE.md`: Atualizar documentação viva do sistema após implementação.
4. `BACKLOGER.md`: Marcar TASK-028 como concluída após aprovação e entrega.
