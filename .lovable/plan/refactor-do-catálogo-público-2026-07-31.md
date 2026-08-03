# Refactor do catálogo público

## O problema dos "3 atletas, 1 exibido"

A página do catálogo filtra o feed para mostrar **apenas atletas de vôlei** (`isVolleyball` em `src/routes/index.tsx`). Os atletas publicados que não são de vôlei ficam invisíveis. Confirmado no código; não pude consultar o banco a partir do preview (o ambiente local está sem credenciais Supabase e mostra a tela "Configuração necessária"), então o primeiro passo da implementação é validar contra os dados reais que os 3 atletas publicados chegam ao loader e que só o filtro de esporte os esconde. Se a contagem vier menor que 3 já na resposta do Supabase, a causa é RLS/`is_public` e eu corrijo aí.

## O que muda no catálogo

- Remover o filtro fixo de vôlei: o feed passa a refletir exatamente o que está publicado no Admin, de qualquer esporte.
- Agrupar por **esporte → posição** em vez de assumir posições de vôlei. Esportes sem posição cadastrada entram numa prateleira do próprio esporte.
- Remover o bloco com ícone de sparkle "N perfis publicados" e o CTA "Ver atletas" do hero. O hero fica com título, subtítulo e nada mais — a contagem passa a viver discretamente junto do cabeçalho da grade.
- Adicionar um contador simples e sóbrio ("3 atletas publicados") acima dos filtros.

## Layout e proporção das fotos

- Trocar os cards altos `4/5` de largura mínima 15–18rem por uma **grade responsiva** (2 colunas no mobile, 3–4 no desktop) com imagens em proporção de **capa 3/4**, tamanho consistente e `object-cover` com foco no topo (enquadramento de rosto).
- Reduzir a escala tipográfica dentro do card (nome em vez de display gigante), remover o "Ver perfil →" com seta e o gradiente pesado; ficar com legenda discreta de posição · país.
- Hero: imagem lateral menor e em proporção mais larga, sem o retrato gigante atual.
- Manter as prateleiras horizontais apenas para "Destaques"; o restante do catálogo vira grade — mais próximo de um catálogo real e menos de landing gerada.

## Página do atleta

- Adicionar CTA primário **RECRUTAR** no hero (e repetido ao final da página), abrindo `https://wa.me/5511996699094` em nova aba, com mensagem pré-preenchida citando o nome do atleta.
- Ajustar a foto do hero para a mesma proporção de capa usada no catálogo.

## Detalhes técnicos

- `src/lib/catalog.ts`: `buildAthleteShelves` passa a agrupar por esporte + posição, com fallback genérico; testes em `catalog.test.ts` atualizados.
- `src/routes/index.tsx`: remove `isVolleyball`, remove `Sparkles`/CTA do hero, substitui as prateleiras por grade e novos cards.
- `src/routes/athlete.$slug.tsx`: novo componente de CTA de WhatsApp.
- Número do WhatsApp centralizado numa constante em `src/lib/contact.ts`.
- Sem mudanças de banco, RLS ou server functions (salvo se a validação apontar problema de dados).
