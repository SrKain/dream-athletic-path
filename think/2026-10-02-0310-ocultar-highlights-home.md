# 2026-10-02-0310-ocultar-highlights-home

## Contexto e objetivo

Ocultar a sessão de Highlights da home do portfólio sem removê-la do código, preservando a estrutura, os dados e a possibilidade de reativação futura. A intenção é deixar a interface visual limpa e sem o bloco de stories/reels da home, mas sem apagar o componente ou os mecanismos associados.

## Escopo e arquivos afetados

- `src/routes/index.tsx`: ponto principal de renderização da seção de Highlights na home.
- `src/components/home-highlights-story-bar.tsx`: componente responsável pela barra horizontal de stories de atletas.
- `src/components/global-highlights-viewer.tsx`: visualizador modal usado ao clicar nos cards de Highlights (mantido apenas em estado oculto/inalterado).
- `src/lib/athletes.functions.ts`: lógica de montagem do feed de highlights para a home, que pode continuar executando sem impactar a UI visible.

## Etapas de implementação

1. Confirmar o local exato da seção de Highlights na home (`HomeHighlightsStoryBar` dentro de `src/routes/index.tsx`).
2. Introduzir uma guarda condicional simples e explícita, por exemplo `const SHOW_HOME_HIGHLIGHTS = false`, para bloquear a renderização do bloco sem remover o código.
3. Manter o restante do catálogo da home intacto, garantindo que filtros, lista de atletas e hero continuam funcionando normalmente.
4. Não remover os dados nem os componentes, apenas desativar a UI da seção de Highlights em produção.
5. Deixar a solução pronta para reversão futura com uma troca de flag, mantendo rastreabilidade e sem afetar o restante do portfólio.

## Impactos, riscos e alternativas consideradas

- Impacto esperado: a home fica mais enxuta e sem a trilha/bolinhas de Highlights.
- Risco principal: afetar outros trechos do fluxo de vídeos se o componente for removido de forma definitiva.
- Alternativa considerada: apagar o trecho e todas as referências do código; descartada porque o pedido exige ocultar, não apagar.
- Alternativa preferida: feature flag/condicional de renderização, que mantém tudo no repositório e permite reativação em um passo simples.

## Estratégia de validação

- Revisar a renderização da rota `src/routes/index.tsx` com a flag desligada.
- Confirmar que a sessão de Highlights não aparece na home.
- Validar que o restante do catálogo continua carregando normalmente.
- Garantir que a reversão seja trivial apenas trocando o valor da flag.

## Status da aprovação humana e resultado

- Status: `[PENDENTE]` aguardando confirmação do usuário.
- Resultado esperado: a home oculta a sessão de Highlights, mantendo o trecho disponível no código para reativação futura sem exclusão.
