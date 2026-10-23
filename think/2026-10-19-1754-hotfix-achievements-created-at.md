# Plano — Hotfix achievements.created_at e estados de validação do Mailer

- Data/hora: 2026-10-19 17:54 UTC (14:54 America/Sao_Paulo).
- Solicitante: responsável pelo repositório SrKain/dream-athletic-path.
- Executor: ChatGPT / GitHub conectado.
- Base confirmada: `main` @ `b6b1c80f7ecb32ec0d6d7bf50d3f15f8bd24c2e0`, merge do PR #6.
- Branch: `fix/2026-10-19-mailer-achievements-created-at`.
- Status: planejamento entregue; correções e validações ainda não executadas.
- Autorização: o prompt original autorizou a execução; a instrução mais recente solicita a entrega do planejamento. Esta entrega registra apenas documentação, sem implementar o hotfix.

## 1. Objetivo e diagnóstico confirmado

Restaurar o carregamento dos dados de atletas e liberar envios elegíveis nos canais individual, multi-atleta e fila, mantendo a validação obrigatória de ABOUT HER e WHY SHE COULD FIT YOUR PROGRAM.

Evidências verificadas em 2026-10-19:

1. `src/lib/email/athlete-email-data.server.ts` consulta `achievements` com `.order("created_at", { ascending: false })` e inclui essa relação no bloco de erros fatais.
2. `db/migrations/0001_init.sql` define `achievements` com `achieved_on`, sem `created_at`.
3. Consulta somente leitura no Supabase `teamgoteam` (`ugxoweynkdzzfdbbppnv`) confirmou exatamente: `id, athlete_id, title_en, title_pt, description_en, description_pt, achieved_on, is_public`. As colunas `created_at`, `image_url`, `medal` e `achievement_type` não existem nessa relação no banco consultado.
4. `src/lib/athletes.functions.ts` já ordena conquistas por `achieved_on`.
5. Em `email-layout.ts`, `achievementTitle` é apenas fallback de `highlightNote`; sua ausência já é aceita pelo renderer.
6. Em `admin/mailer.tsx`, painel e toast usam a frase de campos obrigatórios mesmo quando a causa é carregamento ou falha técnica. O efeito de carregamento atual depende apenas da seleção e ainda não possui ação de retry.

Consulta utilizada para conferir o schema real:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'achievements'
order by ordinal_position;
```

Não é necessária migration para este hotfix. Os campos extras do tipo `Achievement` não serão adicionados ao select nem ao banco. Eventual divergência adicional será registrada e comunicada antes de qualquer proposta de migration.

## 2. Escopo e arquivos previstos

| Arquivo                                           | Alteração prevista                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/email/athlete-email-data.server.ts`      | Ordenação válida e estável; conquista opcional; consultas essenciais continuam fatais.               |
| `src/routes/_authenticated/admin/mailer.tsx`      | Estados exclusivos do painel, retry do carregamento e toast coerente com a causa.                    |
| `src/lib/email/athlete-email-quality.ts`          | Pequena função pura de decisão de estado, se necessária para testar a lógica sem novas dependências. |
| `src/lib/email/schema-integrity.test.ts`          | Reaproveitar o teste existente e estender a validação para selects/orders do loader.                 |
| `src/lib/email/athlete-email-data.server.test.ts` | Novo teste do loader com cliente Supabase simulado.                                                  |
| `src/lib/email/athlete-email-quality.test.ts`     | Testes da função de estado e da distinção entre falha técnica e campos faltantes.                    |
| `CERNE.md`, `BACKLOGER.md` e este plano           | Decisões, solicitação, resultados reais e conclusão.                                                 |

Antes de editar código, concluir a leitura integral obrigatória de README.md, CERNE.md, BACKLOGER.md, UI&UX.md, AGENTS.md e planos de `think/`, preservando as decisões históricas aplicáveis.

Restrições: não alterar `bun.lock`, `package.json`, fluxo da fila, idempotência, Reply-To, textos canônicos Recruit/Not a Fit ou layout do card. Preservar histórico Lovable, sem force-push. Alterações em outros arquivos do Mailer só serão incluídas se a auditoria comprovar outra referência a coluna inexistente e a correção for pontual.

## 3. Etapas de implementação

### A. Corrigir a consulta de conquistas

Manter o select mínimo atual e os filtros existentes:

```ts
admin
  .from("achievements")
  .select("athlete_id, title_en")
  .in("athlete_id", ids)
  .eq("is_public", true)
  .order("achieved_on", { ascending: false, nullsFirst: false })
  .order("id", { ascending: true });
```

O desempate por UUID ascendente torna a escolha reproduzível. Conquistas sem data ficam após as datadas; a primeira conquista por atleta será usada como fallback. Ordenar por uma coluna não exige incluí-la no select.

### B. Tornar apenas conquistas não fatais

- Retirar `achievements` do bloco de validação fatal.
- Em erro Supabase, registrar `console.error` estruturado com evento, relação `achievements` e mensagem; incluir código do erro quando disponível, sem registrar fichas ou payloads pessoais.
- Ignorar eventuais dados parciais retornados junto com erro e usar lista vazia de conquistas. O mapeamento existente produzirá `achievementTitle: null`.
- Se a consulta opcional rejeitar a promise em vez de devolver `error`, limitar o tratamento à própria consulta de conquistas, para não derrubar o `Promise.all` nem absorver falhas de outras consultas.
- Manter fatais `athletes`, `athlete_profiles`, `athlete_videos`, `sports`, `positions` e `countries`.
- Manter a exigência de `bio_en` e `team_contribution_en` na UI e no servidor.

Decisão: conquista é enriquecimento opcional. Falhar de forma tolerante nesse dado é compatível com o renderer e preserva a segurança das informações essenciais. Nenhuma alteração será feita no renderer ou no layout do card.

### C. Separar os estados do painel e do envio

Usar uma única decisão de estado para banner, bloqueio do botão e `handleSendMailer`, evitando mensagens divergentes.

1. **Carregando:** mostrar somente “Carregando e validando fichas completas...”, com semântica de status. Envio permanece bloqueado.
2. **Erro:** título “Não foi possível carregar os dados das atletas”; explicação principal em português; detalhe técnico em trecho recolhível com contraste adequado; botão “Tentar novamente”. Não mostrar a frase de campos obrigatórios.
3. **Campos faltando:** somente após carregamento válido, mostrar a frase de obrigatoriedade e a lista atual de atletas/campos com links para edição.
4. **Pronto:** nenhuma mensagem de bloqueio por ficha; continuar respeitando as demais condições existentes de seleção e destinatários.

O modo catálogo manterá seu comportamento atual. Ausência de seleção deve produzir orientação para selecionar atleta, sem simular falha técnica ou carregamento infinito. Resposta incompleta para IDs solicitados não deve habilitar envio.

Implementar retry da consulta autenticada existente para os IDs atualmente selecionados, por gatilho de recarregamento ou função reutilizável. Ao tentar novamente: limpar erro anterior, marcar carregamento, bloquear envio e ignorar respostas antigas após troca de seleção/desmontagem. Desabilitar retry enquanto a consulta estiver ativa.

No toast: carregamento pede para aguardar; falha técnica informa que não foi possível carregar e orienta tentar novamente; campos faltantes orientam completar a ficha. Nome cru de coluna não aparece na mensagem principal.

### D. Testes de regressão

**Integridade do schema:**

- Ler migrations numeradas em ordem, reconhecer `CREATE TABLE` e `ALTER TABLE ... ADD COLUMN` e montar o conjunto de colunas de cada relação.
- Estender o parser já existente sem alterar os testes de webhook.
- Extrair chamadas `select(...)` e `order(...)` vinculadas ao `from(...)` correspondente no loader, incluindo strings multilinha e múltiplas chamadas de ordenação.
- Cobrir explicitamente `achievements`, `athlete_profiles`, `athlete_videos`, `athletes`, `sports`, `positions` e `countries`. Asserções devem falhar se alguma consulta esperada não for reconhecida.
- Evitar falsos positivos do parser com comentários, constraints, referências e vírgulas de tipos/expressões SQL.
- Provar o teste com fixture negativa: `achievements.created_at` deve falhar; `achieved_on` e `id` devem passar.

**Loader com Supabase simulado:**

- Erro de `achievements` não impede retorno; `achievementTitle` é `null` e há log estruturado.
- Erro de `athlete_profiles` continua lançando; parametrizar outras consultas essenciais quando viável.
- Verificar argumentos exatos das ordenações `achieved_on` e `id`.
- Garantir ordenação e seleção determinísticas quando há empate ou datas nulas.
- Cobrir a rejeição da consulta opcional se implementado o tratamento correspondente.

**Estado do painel:**

- Testar carregamento, falha técnica com retry, campos faltantes com links/dados de edição e estado pronto.
- Confirmar que falha técnica não resulta em mensagem de campos obrigatórios e que dados antigos não liberam o envio durante novo carregamento.
- Testar retorno ao estado de carregamento após retry e sucesso posterior; preservar modo catálogo.
- Reutilizar Vitest e dependências existentes, sem adicionar pacotes.

### E. Auditoria rápida de referências a colunas

Executar:

```sh
rg 'order\("created_at"|created_at' src/lib/email src/routes/_authenticated/admin/mailer.tsx
```

Conferir as tabelas de cada ocorrência contra migrations e, havendo dúvida, metadados do banco. Revisar também selects, filtros e ordenações em `mailer-queue.server.ts`, `recruit-email.server.ts`, `mailer-metrics.server.ts` e `recruit-email.functions.ts`.

Não substituir `created_at` globalmente: a coluna existe em várias tabelas. Corrigir apenas incompatibilidades comprovadas, com registro de relação/coluna/arquivo. Esta auditoria ainda está pendente; além de `achievements.created_at`, não se afirma outro erro confirmado no Mailer.

## 4. Validação e critérios de aceite

Usar exatamente Bun 1.3.14. Executar e registrar separadamente exit code e resultado de cada comando:

```sh
bun --version
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
```

- Confirmar que `bun.lock` e `package.json` permanecem sem diff.
- Comprovar que o teste de integridade detectaria a consulta antiga.
- Se o executor local continuar sem acesso ao proxy/registry ou sem Bun, usar o workflow GitHub Actions existente com Bun 1.3.14, conferindo logs e SHA exato. Não alegar que os comandos rodaram localmente nem que passaram sem evidência.
- Nenhum resultado dos comandos acima está disponível nesta entrega de planejamento.

Aceitação manual em ambiente autenticado e controlado, sem envio real para coaches:

1. Atleta com bio e contribuição preenchidas: preview carrega e envio fica habilitado quando os demais requisitos existentes estão atendidos.
2. Atleta com um campo obrigatório ausente: mostrar apenas a validação de campos, com nome e link de edição.
3. Falha simulada de consulta essencial: mostrar estado de erro, mensagem amigável e “Tentar novamente”; retry recupera o preview após remover a falha.
4. Falha simulada apenas de conquistas: manter ficha utilizável e campos obrigatórios válidos; omitir fallback de conquista e registrar erro no servidor.
5. Conferir individual e multi; na fila, validar o uso do mesmo loader sem mudar sua orquestração ou enviar para a base real.

Registrar testes manuais como executados somente se houver ambiente e evidência; do contrário, marcar pendência explícita.

## 5. Riscos e controle de escopo

- A tolerância pode ocultar indisponibilidade de conquistas: o log estruturado preserva diagnóstico; somente esse enriquecimento é opcional.
- Parser SQL simplificado pode dar falsa segurança: validar extração, cobertura das sete relações e fixture negativa. Migrations não provam isoladamente o estado real de produção.
- Retry pode usar resposta antiga: preservar cancelamento existente e vincular cada resposta à seleção vigente.
- Tipos `Achievement` contêm campos não presentes no banco consultado: não expandir este hotfix para correção global de tipos ou novas colunas; documentar a divergência.
- Qualquer migration adicional dependeria de aviso prévio, conforme solicitado.

## 6. Documentação e entrega única

- Registrar a solicitação no BACKLOGER.md com solicitante, executor, data/hora e status pendente até a implementação e validação.
- Atualizar CERNE.md na implementação, documentando ordenação real, natureza opcional de conquistas, consultas essenciais fatais e comportamento dos estados/retry.
- Atualizar este plano com arquivos efetivamente alterados, outras incompatibilidades comprovadas e resultados de cada comando/teste.
- Publicar commits claros na branch solicitada e apresentar uma única entrega com causa, correção, resultados e limitações verificadas.
- Esta etapa entrega apenas o plano. Não alterar `main`, implementar código ou publicar deployment como parte da solicitação atual de planejamento.

## 7. Execução após aprovação

- O usuário aprovou explicitamente este plano com “Aprovado” em 2026-10-19. A restrição anterior a planejamento foi substituída por autorização de implementação.
- Correções e testes implementados conforme escopo; auditoria não encontrou outra coluna inexistente nas consultas do Mailer.
- O workflow existente regenerava bun.lock e formatava/commitava arquivos da fila em qualquer push fix/**. As etapas mutantes foram restringidas à branch antiga fix/2026-10-16-vercel-mailer-reliability, garantindo que o hotfix não altere esses arquivos.
- Sem Bun disponível localmente e com proxy local inacessível, validação será executada no GitHub Actions com versão exata 1.3.14. A primeira execução disponibiliza diff de formatação para aplicar com o Prettier do próprio projeto; o commit final será validado sem essa etapa auxiliar.
- Status atual: em validação. Testes manuais de navegador não foram realizados. Nenhum envio real e nenhuma migration aplicados.

## 8. Resultado de implementação e validação

- Correções implementadas nos arquivos previstos: loader, qualidade/estado, painel, integridade do schema e dois arquivos novos de teste. CERNE.md/BACKLOGER.md atualizados. Workflow recebeu proteção pontual para preservar o lockfile e fontes da fila.
- A auditoria com rg e conferência das projeções/filtros/ordenações contra migrations e information_schema não identificou outra coluna inexistente no escopo do Mailer. Não há substituição global de created_at.
- Consulta SQL equivalente corrigida executou com sucesso no Supabase usando WHERE false, sem leitura de dados pessoais.
- GitHub Actions: https://github.com/SrKain/dream-athletic-path/actions/runs/39300420381 (Bun 1.3.14; sucesso).

| Comando                       | Resultado comprovado                                |
| ----------------------------- | --------------------------------------------------- |
| bun install --frozen-lockfile | Sucesso, 528 pacotes, manifesto e lockfile sem diff |
| bun run typecheck             | Sucesso                                             |
| bun run lint                  | Sucesso, 0 erros e 11 avisos preexistentes          |
| bun run test                  | Sucesso, 217/217 testes em 27 arquivos              |
| bun run build                 | Sucesso                                             |

O primeiro CI usou Prettier apenas sobre os arquivos do hotfix e disponibilizou seu diff. Esse diff foi aplicado às fontes versionadas, sem executar novamente o gerador de lockfile. A etapa auxiliar foi removida; o commit final será validado pelo workflow normal sem formatação ou commits automáticos.

### Aceitação manual: procedimento e limite

Não houve sessão de navegador autenticada disponível neste executor. Os casos abaixo são o roteiro manual, não uma alegação de execução:

1. Selecionar atleta com bio_en e team_contribution_en preenchidos e destinatário ativo: preview e botão de envio devem ficar disponíveis. Repetir em individual e multi.
2. Selecionar atleta sem um campo: deve aparecer apenas o bloqueio por campo faltante, com nome/link de edição.
3. Simular falha no carregamento essencial: deve aparecer o título de erro amigável, detalhe recolhível e Tentar novamente. Remover a falha e clicar no botão: loading seguido de recuperação.

A lógica desses estados, erro opcional, rejeição de promise, ordenação, erro essencial e regressão da coluna antiga foi coberta automaticamente. Nenhum teste disparou mensagens reais a coaches. PR: https://github.com/SrKain/dream-athletic-path/pull/7.
