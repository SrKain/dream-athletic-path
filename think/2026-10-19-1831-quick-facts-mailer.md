# Plano — Quick Facts do Mailer conforme referência aprovada

- Data: 2026-10-19 18:31 UTC.
- Solicitante: responsável pelo repositório SrKain/dream-athletic-path.
- Executor: ChatGPT / GitHub conectado.
- Base confirmada: main @ 8a6c315ed98522040313b3bf33aed58a09b052d8 (merge PR #7).
- Branch: fix/2026-10-19-mailer-quick-facts.
- Aprovação: execução explicitamente autorizada no prompt; plano registrado antes das alterações de código.
- Status: concluído; aprovação explícita reiterada pelo solicitante e execução finalizada no PR #8.

## 1. Diagnóstico e objetivo

O renderQuickFacts atual remove Position/Height/From, inclui graduação/início de faculdade e arredonda GPA para uma casa. O personal-email-renderer também emite posição e Available fora de uma tabela de fatos compartilhada. Existem dois renderizadores legados exportados como renderAthleteCard em recruit-email.ts e email-layout.ts; eles ainda geram layouts diferentes.

Restaurar oito linhas opcionais, nesta ordem exata: POSITION, HEIGHT, GPA, CURRENT SCHOOL, STATUS, AVAILABLE, INTENDED MAJOR, FROM. HTML e texto puro terão a mesma fonte de definição e de formatação.

A referência utilizável neste pedido é a especificação textual e os valores fornecidos para ANA CAROLINA MARTINS; não houve novo arquivo de imagem anexado nesta mensagem.

## 2. Arquivos e solução

1. Criar módulo puro athlete-quick-facts.ts com QUICK_FACTS_ROWS ordenado, normalização do GPA (Number, finito, formatGpa sem toFixed(1)), altura e extração dos fatos. Reutilizar os resultados no card HTML e em todos os geradores de texto. Manter os tipos e o loader com highSchoolGraduation/collegeStartDate disponíveis.
2. Alterar apenas renderQuickFacts em athlete-board-card.ts: ícones star/height/gradCap/academic/arrowGold/film/academic/globe; bandeira como emoji na célula do ícone de FROM quando disponível. Labels 12px; omitir dados vazios; escapar valores. Manter barra verde, boardPanel, divisórias e mobile-stack. Cabeçalho, chip TRANSFER, seções e ações atuais permanecerão intactos.
3. Normalizar GPA em runtime sem ampliar o tipo público desnecessariamente: valores numéricos em string são aceitos pelo formatador de fatos, NaN/Infinity/vazio são omitidos. 3.31 permanece 3.31 e 4 vira 4.0.
4. Atualizar personal-email-renderer.ts e os geradores de texto de recruit-email.ts para usar o mesmo bloco QUICK FACTS, removendo Specs/Available duplicados. Preservar textos das outras seções e ações.
5. Substituir os dois corpos legados de renderAthleteCard por adaptadores para renderAthleteBoardCard, preservando assinaturas e campos. O catálogo institucional não renderiza atletas e continuará separado. Auditar usos via rg e busca no GitHub.
6. Atualizar athlete-board-card.test.ts, recruit-email-multi.test.ts, recruit-email-send.test.ts e mailer-queue.test.ts. Usar fixture comum de Ana Carolina para comparar HTML/texto e os canais. Código de fila e serviços de envio não será modificado.
7. Gerar exemplo HTML/texto sem envio real e comparação linha a linha, com script reproduzível usando o renderer real. Quando necessário, gerar a prévia em GitHub Actions, sem alterar dependências. Publicar exemplo durável em docs/email-previews e artefato de revisão.
8. Atualizar CERNE.md, BACKLOGER.md e este plano com resultados e limitações.

## 3. Contraste

Cálculo WCAG sRGB dos tokens atuais:

- textMuted = #4b6353;
- boardPanel = #f6f7f3;
- contraste = 6.0823:1.

O contraste já supera 4.5:1. Manter os tokens para não alterar outras seções; elevar somente o tamanho do rótulo Quick Facts de 11px para 12px. Adicionar verificação de contraste no teste relacionado.

## 4. Testes e validação

- Exatamente oito rótulos na ordem especificada e respectivos ícones/valores da Ana Carolina.
- Sem High School Graduation/College Start Date em HTML/texto dos fatos; tipos e loader preservados.
- TRANSFER para Sophomore e nunca Graduate Transfer, sem chips GPA/AVAILABLE.
- GPA 3.31, 4, string numérica, NaN e vazio.
- Omissão de escola ausente; bandeira em FROM e fallback globe; escape de script.
- Mesmo bloco de fatos no individual, multi, preview pessoal, adaptadores legados e payload enfileirado.
- Preservar testes de About Her, estatísticas, vídeos, fit e ações.

Com Bun exatamente 1.3.14, executar e registrar:

1. bun install --frozen-lockfile
2. bun run typecheck
3. bun run lint
4. bun run test
5. bun run build

O ambiente local não possui Bun e seu proxy estava inacessível na tarefa anterior. Usar o GitHub Actions existente para os cinco comandos se essa condição persistir. Nenhum resultado será alegado sem logs. Formatação auxiliar de arquivos e geração de exemplo poderão ser executadas no CI sem commits automáticos; o commit final será validado sem reescrita de fontes.

## 5. Riscos e compatibilidade

- Adaptadores legados terão a nova anatomia do card canônico; funções de helper preservam suas APIs. Testes de layouts antigos devem passar a afirmar o layout aprovado.
- Imports circulares já existentes entre os módulos de e-mail exigem cuidado: usar declarações de funções e módulo de fatos com imports de tipos, sem chamar renderizadores no carregamento do módulo.
- Somente o bloco de fatos será centralizado; nenhuma mudança na semântica das seções corretas ou dos botões.
- Não alterar bun.lock, package.json, loader, fila, idempotência, Reply-To ou textos canônicos. Sem migration ou envio real.

## 6. Cache, fila e entrega

O preview atual é calculado a partir da seleção/dados atuais; novo carregamento usa o renderer atualizado. A fila persiste snapshots HTML/texto em mailer_queue.payload: itens já enfileirados manterão o conteúdo antigo, inclusive após este deploy. Envios realizados não serão alterados e não haverá reprocessamento automático. Para novo layout, criar nova campanha após publicar a correção.

Entregar branch/PR com commits claros, HTML de exemplo, comparação das oito linhas, resultados individuais dos comandos e registro dos adaptadores legados encontrados. Manter catálogo institucional separado, pois não possui card de atleta.

## 7. Resultado da execução

- Oito fatos compartilhados entre HTML e texto; GPA sem arredondamento; rótulos 12px e contraste 6.08:1.
- Dois adaptadores legados unificados; catálogo sem atletas permanece separado. `renderAthleteGrid` é um contêiner sem uso nos canais auditados.
- Campos futuros preservados no loader/tipos. Diff confirma nenhuma alteração em fila, idempotência, Reply-To, dependências ou funções das outras seções/ações do card canônico.
- Testes antigos do card compacto foram ajustados ao card completo: oito fichas aparecem uma vez cada, crescimento linear; aviso de peso no Mailer preservado (90 KiB, possível corte do Gmail perto de 102 KiB).
- Bun 1.3.14, CI 39307599456 / 39307568704: frozen install PASS; typecheck PASS; lint PASS (0 erros, 11 avisos preexistentes); test PASS (232/232 em 27 arquivos); build PASS.
- HTML/texto gerados pelo script puro; capturas desktop/mobile reais revisadas. A comparação linha a linha está em docs/email-previews/README.md; referência textual do pedido, pois não foi anexado print. Escola quebra em duas linhas no mobile, sem corte dos fatos.
- Etapas auxiliares temporárias de formatação/captura removidas do workflow antes da entrega; workflow final igual à base. Nenhum envio real, alteração de snapshot existente ou reprocessamento.
