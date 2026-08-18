# Experiência Audiovisual do Perfil Público do Atleta

**Status:** Implementado — validação automatizada bloqueada no ambiente local

## Contexto e objetivo

Reformar a página pública do atleta para que o vídeo seja um elemento central
da narrativa de recrutamento, não apenas uma prévia opcional. Links do YouTube
cadastrados no Admin devem ser apresentados em todos os formatos de tela, com
um vídeo funcional no hero e blocos próprios para apresentação, desempenho em
quadra e highlights/reels.

## Diagnóstico

- O Admin salva o link em `athlete_videos` por
  `src/routes/_authenticated/admin/athletes/$id.tsx`.
- A rota pública já busca esses registros por `getPublicAthlete()` e usa o
  cliente anônimo do Supabase.
- A RLS de `athlete_videos` somente expõe registros cujo atleta esteja com
  `is_public = true` e `deleted_at IS NULL`.
- O hero atual usa o vídeo como textura de fundo com desfoque e
  `pointer-events: none`; ele não é um player assistível nem uma apresentação
  audiovisual clara do atleta.
- A UI fragmenta a exibição por tipo: `feature`, `presentation` e `in_court`
  possuem embeds próprios; `highlight` é exclusivo do visualizador de reels.
  Não há uma composição única que deixe toda a filmografia imediatamente
  compreensível em mobile e desktop.

## Escopo e arquivos afetados

- `src/routes/athlete.$slug.tsx`: reformar o hero e organizar a narrativa
  audiovisual responsiva do perfil.
- `src/components/reels-viewer.tsx`: assegurar uma experiência de reels
  navegável e utilizável por toque, teclado e desktop.
- Componentes de vídeo reutilizáveis, se necessários, para manter os embeds,
  carregamento sob demanda e fallbacks consistentes.
- `src/components/athlete-video-card-media.tsx`: preservar a prévia leve no
  catálogo, sem tentar carregar todos os iframes simultaneamente.
- `src/lib/athletes.functions.ts`: reforçar o contrato de leitura pública e
  registrar falhas de consulta de forma acionável.
- Testes focados em `src/lib/athletes.functions.test.ts` e
  `src/lib/youtube.test.ts`.
- `CERNE.md` e `BACKLOGER.md`: documentar a implementação e concluir a tarefa.

## Etapas de implementação

1. Normalizar os vídeos retornados pela página pública, aceitando apenas URLs
   que gerem um embed válido e preservando a ordenação do Admin.
2. Transformar o hero em uma composição audiovisual: player de vídeo de
   destaque interativo, com controles e legenda acessível, ao lado ou abaixo
   das informações do atleta conforme o viewport. No mobile, o player terá
   prioridade visual em fluxo vertical; no desktop, integrará a composição
   editorial sem ficar oculto como plano de fundo.
3. Criar a seção `Athlete Presentation`, com o vídeo de apresentação como
   conteúdo principal e os vídeos `in_court` integrados na mesma narrativa,
   usando grid de um item no mobile e duas colunas em telas médias ou maiores.
4. Apresentar highlights como reels: miniaturas claras, player de tela cheia
   com navegação por swipe, teclado e controles visíveis, funcional tanto em
   telas touch quanto em desktop.
5. Garantir que cada categoria cadastrada tenha uma representação visível:
   `feature` no hero, `presentation` e `in_court` na apresentação do atleta,
   e `highlight` nos reels. Quando uma categoria estiver ausente, a página
   permanece coesa sem espaço vazio.
6. Ajustar a prévia dos cards do catálogo para manter foto de fallback e
   ativar vídeo apenas por interação, protegendo a performance da listagem.
7. Cobrir a normalização de URLs, a seleção por categoria e o contrato de
   dados públicos com testes.
8. Atualizar a documentação viva e marcar a tarefa como concluída.

## Impactos, riscos e alternativas consideradas

A solução mantém autoplay limitado aos cards sob interação para evitar múltiplos
iframes simultâneos no catálogo. No perfil individual, players diretos são
adequados porque há apenas um atleta por página. O hero só terá reprodução
automática quando estiver sem som e respeitar `prefers-reduced-motion`; o
usuário sempre terá um controle explícito para assistir ao vídeo com áudio.
Vídeos não públicos, atletas arquivados ou URLs inválidas continuarão ocultos
por segurança e consistência. O usuário aprovou a reprodução automática de
todos os vídeos públicos; os embeds usarão autoplay sem som, pois navegadores
bloqueiam a inicialização automática com áudio.

A condição de publicação do atleta continuará sendo obrigatória: a RLS não
deve ser flexibilizada para expor vídeos de atletas privados.

## Estratégia de validação

1. Testar URLs `watch`, `youtu.be`, `shorts`, `embed` e ID direto.
2. Confirmar em viewport mobile e desktop que `feature` aparece e reproduz no
   hero, `presentation` e `in_court` aparecem na seção de apresentação, e
   `highlight` abre no visualizador de reels.
3. Confirmar que o catálogo mantém foto de fallback e preview em interação.
4. Verificar navegação por teclado, toque e preferências de redução de
   movimento.
5. Executar os testes unitários focados e a checagem de tipos.

## Aprovação humana e resultado

O usuário aprovou a implementação em 2026-08-18, incluindo autoplay para todos
os vídeos públicos. O hero agora possui player funcional, a apresentação reúne
os vídeos de apresentação e in-court, e os reels exibem players verticais em
autoplay. A validação automatizada exige Bun e dependências locais, indisponíveis
neste ambiente.
