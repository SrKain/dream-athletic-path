# Catálogo, Perfil Público e Exibição Confiável de Vídeos

**Status:** Implementado em 2026-08-18

## Contexto e objetivo

O último plano audiovisual foi implementado parcialmente no código: a rota
`/athlete/$slug` existe, o catálogo direciona aos perfis, há suporte para
`feature`, `presentation`, `highlight` e `in_court`, e os links do YouTube são
normalizados. Ainda não há garantia de uma experiência confiável de ponta a
ponta para todos os vídeos cadastrados.

O objetivo é entregar definitivamente a tela pública do atleta, acessível a
partir do catálogo, e uma camada de vídeo previsível: cada vídeo público válido
deve aparecer na categoria correta, falhas de banco ou de incorporação devem
ser visíveis e acionáveis, e o catálogo não pode comprometer desempenho ao
carregar players em massa.

## Diagnóstico confirmado

1. A navegação catálogo -> `/athlete/$slug` e a busca pública de vídeos já
   existem. A RLS limita `athlete_videos` a atletas `is_public = true` e não
   arquivados.
2. A migration `0009_visual_settings_media.sql` cria `athlete_videos`; a
   `0010_athlete_profile_fields.sql` cria o tipo `in_court`. Ambas precisam
   estar aplicadas no Supabase externo. Sem isso, a consulta pública retorna
   uma lista vazia após apenas registrar erro no servidor, ocultando a causa.
3. A página atualmente exibe somente o primeiro vídeo `presentation`; embora
   o Admin permita múltiplos registros em outros tipos, a tela não possui uma
   composição única, testada e reutilizável que assegure representação
   consistente de toda a filmografia.
4. Os embeds são criados diretamente em vários componentes, com comportamento
   e permissões distintos. Previews e reels desabilitam interação no iframe;
   quando o YouTube bloqueia um embed, o visitante recebe uma área escura ou
   uma mensagem genérica, sem caminho para abrir o vídeo no YouTube.
5. Os testes existentes cobrem somente a extração do ID do YouTube. Não há
   cobertura para seleção, ordenação, renderização por categoria, fallback ou
   erro da consulta pública.

## Escopo e arquivos afetados

- `src/lib/youtube.ts` e `src/lib/youtube.test.ts`: consolidar validação de
  URLs e gerar URLs de embed e de visualização no YouTube sem aceitar domínios
  indevidos.
- Novo componente reutilizável de player público em `src/components/`: uma
  única implementação para carregamento sob demanda, permissões, estado de
  indisponibilidade e link acessível para assistir no YouTube.
- `src/routes/athlete.$slug.tsx`: normalizar e ordenar vídeos uma única vez;
  renderizar todas as categorias no perfil sem duplicação indevida; preservar
  hero, apresentação, partidas e highlights em layout mobile-first.
- `src/components/reels-viewer.tsx`: reutilizar o player e permitir que cada
  reel seja assistido ou aberto externamente quando o embed não puder tocar.
- `src/components/athlete-video-card-media.tsx`: manter imagem como padrão e
  ativar preview somente por interação/visibilidade, com fallback sem iframe
  inválido.
- `src/lib/athletes.functions.ts`: retornar estado explícito para erro de
  leitura de vídeos, sem mascarar migration ausente ou RLS incorreta como
  “atleta sem vídeos”.
- Testes focados do contrato público e da classificação de vídeos.
- `CERNE.md` e `BACKLOGER.md`: registrar a implementação e seu resultado.

## Etapas de implementação

1. Criar um contrato de vídeo público que valide URL, preserve `sort_order`,
   separe categorias e exponha a melhor escolha de hero sem modificar os dados
   carregados.
2. Corrigir a validação do YouTube para aceitar apenas IDs diretos ou hosts
   oficiais previstos, eliminando o fallback que pode interpretar texto ou
   domínio arbitrário como ID válido.
3. Criar um player acessível e reutilizável com poster, carregamento sob
   demanda, `allowFullScreen`, permissões mínimas necessárias e fallback com
   botão “Watch on YouTube”. Autoplay permanecerá mudo, em linha com as
   políticas dos navegadores.
4. Aplicar o componente à tela do atleta: hero com o vídeo prioritário,
   grade para todas as apresentações e vídeos em quadra, e reels verticais
   navegáveis. Não haverá seção vazia quando uma categoria não existir.
5. Ajustar o catálogo para usar somente prévia leve após hover em desktop ou
   centralização em mobile, mantendo a foto e o link para o perfil sempre
   funcionais.
6. Propagar erro de `athlete_videos` de modo acionável no ambiente
   administrativo/servidor, indicando a necessidade de aplicar as migrations
   `0009` e `0010` quando a tabela ou o enum não existirem.
7. Cobrir parsers, ordenação, categorias, fallback de player e erro de dados
   com testes unitários; executar typecheck, lint focado, testes focados e
   build usando Bun.
8. Atualizar documentação viva e concluir o registro da demanda.

## Impactos, riscos e alternativas consideradas

- Um site não consegue ignorar restrições do proprietário de um vídeo
  (privado, removido, com embedding desativado ou bloqueado por região). O
  fallback para a página do YouTube garante uma saída funcional sem expor
  conteúdo privado.
- A migration é pré-requisito externo obrigatório. O código detectará e
  comunicará a ausência, mas não aplicará SQL automaticamente no Supabase.
- Incorporar todos os vídeos em autoplay simultaneamente degrada a página.
  Players abaixo da dobra serão carregados sob demanda; a reprodução automática
  continuará muda e respeitará `prefers-reduced-motion`.
- Não será alterada a RLS para “resolver” exibição: atletas não publicados ou
  arquivados continuarão sem acesso público.

## Estratégia de validação

1. Testar URLs `watch`, `youtu.be`, `shorts`, `embed`, `live`, ID direto,
   domínio inválido e URL sem ID.
2. Testar classificação e ordenação para os quatro tipos, múltiplos vídeos de
   apresentação/quadra/highlight e fallback do hero.
3. Confirmar em desktop e mobile que o card abre o perfil público e que todos
   os vídeos cadastrados aparecem em sua seção correta, com controles,
   fullscreen e link externo de contingência.
4. Confirmar que vídeo inválido, privado ou não incorporável não quebra o
   layout e apresenta alternativa compreensível.
5. Executar `bun run typecheck`, os testes focados, `bun run lint` e `bun run
   build`.

## Aprovação humana e resultado

O usuário aprovou explicitamente a implementação em 2026-08-18. O contrato de
vídeos, player reutilizável, fallback externo, agrupamento completo por
categoria, diagnóstico de migrations e ajustes de acessibilidade/performance
foram implementados. Typecheck, lint focado e build concluíram. A execução
focada do Vitest foi bloqueada antes de carregar testes por uma limitação do
runner no Windows: `TypeError: File URL path must be an absolute path`.
