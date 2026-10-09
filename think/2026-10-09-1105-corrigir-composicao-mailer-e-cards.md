# Plano — Corrigir composição do Mailer e atualizar cards de atletas

- **Data/Hora:** 2026-10-09 11:05 (America/Sao_Paulo)
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Codex
- **Status:** `[IMPLEMENTADO — TYPECHECK/BUILD NÃO EXECUTADOS: BUN E DEPENDÊNCIAS AUSENTES]`
- **Escopo:** Mailer Individual e Multi; o modo Catálogo fica fora desta alteração.

## 1. Objetivo

Corrigir o Mailer para que os textos editados sejam refletidos no preview e no e-mail realmente enviado, mantendo a composição sempre nesta ordem:

1. Saudação editável.
2. Corpo inicial editável.
3. Cards de atletas, em sequência reordenável pelo usuário e sempre agrupados nesta posição.
4. Fechamento editável.
5. Assinatura e rodapé que já existem.

Atualizar o visual dos cards conforme a referência visual anexada pelo usuário (`WhatsApp Image 2026-10-08 at 7.32.14 AM.jpeg`). Os dados e o nome exibidos nessa arte são exemplos visuais, não conteúdo fixo. Cada card terá três ações em inglês: `VIEW FULL PROFILE` em destaque, `RECRUIT NOW` e `NOT A FIT` com menor destaque.

## 2. Diagnóstico existente

- `src/lib/email/personal-email-renderer.ts` já contém renderer compartilhado de preview/envio, escape de texto do usuário, assinatura obrigatória e renderização de cards conforme os blocos recebidos.
- `buildDefaultEmailBlocks()` atualmente combina saudação e corpo no primeiro bloco, coloca os cards entre blocos de texto e fecha com outro bloco. O modelo é genérico e permite que texto e atleta sejam intercalados.
- `src/routes/_authenticated/admin/mailer.tsx` mantém `composerBlocks` e envia blocos, mas ainda mostra os campos legados de saudação, hook e introdução. Isso pode fazer o preview/envio priorizar os blocos padrão e ignorar o que foi editado nos campos.
- `src/lib/email/recruit-email-template.ts` usa `data.blocks` antes dos campos legados em `resolveLegacyBodyBlocks()`. Portanto, corrigir somente os campos não garante que o conteúdo editado chegue ao render final.
- O servidor recebe `blocks` em `src/lib/email/recruit-email.server.ts`; preview e envio precisam usar o mesmo modelo de composição para evitar divergência.
- `src/lib/email/recruit-email.ts` contém o renderer atual de card; o formato novo depende da referência visual que ainda será anexada.

## 3. Solução proposta

### Compositor com regiões fixas

- Substituir a ambiguidade do composer genérico por um modelo explícito: `greeting`, `introduction`, `athleteIds[]` ordenados e `closing`.
- Manter campos separados e editáveis para saudação, corpo inicial e fechamento.
- Permitir reordenar os cards entre si com controles simples de subir/descer (ou interação equivalente já compatível com os componentes existentes). Os cards não poderão ser movidos para fora da região entre corpo e fechamento.
- Ao alterar a seleção de atletas, atualizar somente a lista ordenada de cards; preservar os textos digitados e a ordem relativa dos atletas que continuarem selecionados.
- Renderizar preview a partir desse modelo e enviar o mesmo payload ao servidor. Sanitizar/validar o payload no servidor; escapar os textos editáveis como texto, sem interpretar HTML.
- Manter a assinatura, ações e rodapé já existentes. Confirmar se `NOT A FIT` do card deve preservar o destino/fluxo de feedback já implementado.
- Não alterar a composição do modo Catálogo.

### Novo card conforme a imagem recebida

- **Faixa superior dourada:** nome da atleta em destaque; abaixo, posição, altura em pés/polegadas e centímetros, e país.
- **Bloco principal em duas colunas no desktop:** foto da atleta à esquerda; à direita, linha de status (por exemplo, Transfer), disponibilidade e GPA, seguida de uma tabela “QUICK FACTS” com posição, altura, GPA, escola atual, status de transferência, disponibilidade, curso pretendido e país/bandeira.
- **SEASON STATS:** até duas temporadas com ano/nível, escola, nota descritiva e estatísticas disponíveis. Não exibir valores inventados nem linhas sem dados.
- **WATCH HER IN ACTION:** até dois vídeos, com thumbnail clicável, ano/temporada e link/ação para assistir quando houver URL válida.
- **WHY SHE COULD FIT YOUR PROGRAM:** até quatro motivos curtos derivados de dados já disponíveis; omitir a seção se não houver conteúdo confiável.
- **Ações no card:** `VIEW FULL PROFILE` deve ser o CTA visualmente mais destacado; `RECRUIT NOW` permanece em inglês e abre o contato já configurado; `NOT A FIT` permanece em inglês e usa o fluxo de feedback já implementado com destaque secundário.
- **Responsividade e clientes de e-mail:** reproduzir a pilha de colunas em telas estreitas e usar estrutura de tabelas/estilos inline apropriada para e-mail. Reaproveitar cores e assets existentes sempre que possível.
- Preservar URLs, tracking/UTM e fluxo de feedback existentes, salvo incompatibilidade demonstrada com o modelo anexado.
- A arte orienta hierarquia e aparência; nomes, escolas, temporadas, estatísticas e números do exemplo não serão hardcoded. Seções sem dados devem ser omitidas.

## 4. Arquivos previstos

- `src/routes/_authenticated/admin/mailer.tsx` — campos separados, ordenação dos cards e preview.
- `src/lib/email/personal-email-renderer.ts` — modelo fixo das regiões e renderização compartilhada.
- `src/lib/email/recruit-email-template.ts` — adaptação das interfaces/compatibilidade para usar a nova composição sem sobrepor texto editado.
- `src/lib/email/recruit-email.ts` — visual dos cards e ações conforme o anexo.
- `src/lib/email/recruit-email.server.ts` — validação do payload e paridade com preview.
- `src/components/send-recruit-email-dialog.tsx` — somente se compartilhar o fluxo/componente afetado; avaliar antes de incluir no escopo.
- `CERNE.md` e `BACKLOGER.md` — registrar a implementação após aprovação e conclusão.

Nenhuma migration, alteração de banco ou dependência está prevista.

## 5. Proteção da build da Vercel

- Não editar `package.json`, `bun.lock`, `vercel.json`, versões, overrides ou configuração de deploy nesta tarefa.
- Não rodar instalação de dependências nem regenerar lockfile.
- Manter a correção isolada aos arquivos do Mailer/renderização e documentação necessária.
- Antes de concluir, revisar o diff para confirmar que nenhuma alteração incidental atingiu configuração de build/deploy.

## 6. Etapas

1. Usar a referência visual já recebida para fechar a hierarquia do card antes de implementar o visual.
2. Ajustar a composição do Mailer para os quatro campos/regiões fixas e cards reordenáveis somente entre corpo e fechamento.
3. Conectar preview, payload e renderização server-side à mesma composição e confirmar que os textos são preservados e enviados.
4. Implementar o card conforme o anexo e manter as ações com os destinos seguros existentes.
5. Atualizar a documentação viva e o status desta tarefa no backlog depois da implementação aprovada.
6. Revisar escopo e diff para garantir que build/deploy, lockfile, Catálogo, Resend, métricas, webhooks e banco não foram alterados.

## 7. Estratégia de validação

- Conferir o preview para a ordem saudação → corpo → cards ordenados → fechamento → assinatura.
- Conferir que reordenar mais de um card altera apenas a ordem dos cards.
- Conferir que editar cada texto altera o preview e que o mesmo conteúdo está no payload de envio e no HTML/texto produzido no servidor.
- Conferir escape de texto editável, assinatura preservada e links dos três botões.
- Conferir visual do card com base no anexo e revisar o diff para confirmar ausência de mudanças em arquivos de build/deploy.

## 8. Aprovação

O usuário aprovou este plano em 2026-10-09. Implementação concluída; typecheck/build não foram executados porque Bun e `node_modules` não estavam disponíveis. `git diff --check` passou e os arquivos de configuração de build/deploy permaneceram inalterados.
