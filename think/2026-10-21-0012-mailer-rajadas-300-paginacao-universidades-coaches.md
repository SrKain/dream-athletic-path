# TASK-106 — Plano de implementação: Mailer em rajadas e leitura completa de universidades/coaches

- **Data/hora:** 2026-10-21 00:12 (America/Sao_Paulo).
- **Repositório / base:** SrKain/dream-athletic-path, branch main.
- **Solicitante:** usuário humano responsável pelo projeto.
- **Executor planejado:** ChatGPT via GitHub conectado.
- **Status:** [PENDENTE — AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA].
- **Governança:** AGENTS.md, README.md, CERNE.md, BACKLOGER.md, UI&UX.md e os 83 Markdown de think/ foram consultados previamente. Este commit é apenas documental. A execução de código, migrations, testes e mudanças operacionais **não está autorizada nesta fase**.

## 1. Objetivo e evidências do diagnóstico

**Parte 1 — desempenho:** 799 mensagens levaram aproximadamente 1h10. O código de main possui teto de dois itens em mailer-queue.server.ts (~705), recruit-email.functions.ts (~218) e admin/mailer.tsx (~507), DEFAULT_BATCH_SIZE=150, PAUSE_BETWEEN_BATCHES_SEC=60, envio sequencial via Resend emails.send (~1039), persistência individual e consultas repetidas por micro-lote. A RPC definida na migration 0025 tem parâmetro p_batch_size, mas ainda assume default 2; a 0026 remove a assinatura antiga não escopada e restringe as funções privilegiadas a service_role. A sanitização preventiva (~620) é chamada a cada rodada e sua consulta também está sujeita ao limite de paginação.

**Parte 2 — leitura:** dados informados pelo solicitante: 1.332 linhas em public.universities e 3.395 coaches dentro do JSONB universities.coaches. Não é um defeito de importação da planilha. A ausência de paginação leva a resultados truncados pelo limite PostgREST de 1.000. Ocorrências de leituras não paginadas confirmadas: universities.tsx (loadUniversities e allExisting do importador), mailer.tsx, coaches.tsx (universities e tabela legada coaches), send-recruit-email-dialog.tsx e recruit-email.server.ts (universities e busca legada). enqueueCampaignDispatches **recebe destinatários prontos** e não realiza consulta geral de universities; só valida coach_id na tabela coaches por grupos de 100 IDs. Corrigir os carregadores de origem para que receba a coleção inteira. Não reimportar, apagar, corrigir ou atualizar dados reais nesta tarefa sem aprovação específica.

## 2. Parte 1 — arquitetura aprovada após revisão humana

### 2.1 Configuração, contratos e contagem dos lotes

1. Em src/lib/email/mailer-queue.server.ts substituir DEFAULT_MICRO_BATCH_SIZE, DEFAULT_BATCH_SIZE, ITEM_SPACING_MS e PAUSE_BETWEEN_BATCHES_SEC por BURST_SIZE=300 e BURST_PAUSE_MS=1000, resolvidos no servidor por variáveis MAILER_BURST_SIZE (inteiro entre 1 e 300) e MAILER_BURST_PAUSE_MS (inteiro entre 1000 e 60000); inválidos usam valor padrão, com aviso sem vazar segredos. MAX_ATTEMPTS e LOCK_DURATION_SEC permanecem; aumentar reserva e lease de aba para cobrir uma rajada com margem, e renovar/validar ownership quando necessário.
2. Validar novamente no servidor, nunca confiar no batchSize ou clientId recebido do navegador. Expor somente configuração efetiva sem segredos via função autenticada, para que a UI agende o valor real. Atualizar assinaturas de funções, tipos, nomenclatura e indicação de duração/tempo restante, sem acoplar configuração server-only ao bundle do navegador.
3. Uma rajada = um batch executado; 10, 150 e 300 => 1; 301 => 2; 799 => 3 (300+300+199); 3300 => 11. current_batch marca a rajada em curso ou próxima, total_batches ajustado a partir das rajadas executadas e pendências quando o tamanho efetivo cair após 429. Progresso conta estados reais do banco; não somar somente respostas da API para afirmar entrega.
4. Campanha nova grava batch_size e delay_between_batches_sec compatíveis com o schema atual (delay em segundos; 1000ms => 1s). Eliminar crossedBatchMilestone e o cooldown de 60s, mas preservar next_batch_at, o qual deve impedir disparos antes do FIM da rajada anterior + BURST_PAUSE_MS. A espera acontece no navegador, não em sleep serverless.

### 2.2 Migration 0027 e barreiras de segurança

1. Criar db/migrations/0027_mailer_burst_claim_and_persistence.sql, sem modificar 0025/0026. Atualizar public.claim_mailer_queue_batch(text,integer,integer,uuid) mantendo escopo **obrigatório** por p_campaign_id, status da campanha, ordenação determinística, FOR UPDATE SKIP LOCKED, retry elegível, tentativas, reservation_expires_at e limite SQL GREATEST(1, LEAST(300, COALESCE(p_batch_size,300))). Rejeitar campanha nula; não recriar a assinatura sem escopo.
2. Preservar explicitamente SECURITY DEFINER com search_path seguro e **REVOKE ALL FROM PUBLIC, anon, authenticated / GRANT EXECUTE TO service_role** para todas as RPCs privilegiadas alteradas/criadas, alinhado à migration 0026. Considerar autorização de campanha/lease no claim e vincular worker/controller para evitar uma segunda aba ou sessão de furar o lease. Não usar entradas SQL de usuários sem validação.
3. Introduzir RPC idempotente de finalização por rajada, restrita a service_role, recebendo campanha, worker/lease e um JSONB limitado de resultados com id da fila, estado, provider_message_id, instante e eventual erro. Fazer um UPDATE em conjunto sobre mailer_queue e **um INSERT em conjunto** de recruit_email_logs com as transições realmente novas, incluindo provider_id, campaign_id, atleta(s), coach_id verificado, e-mail e tipo; atualizar contadores/status de mailer_campaigns na mesma transação SQL. Retornar resumo compacto ou executar exatamente uma chamada à RPC de progresso após a transação. Nenhuma linha sent deve perder provider_message_id. Aplicar condição em status/reserved_by para impedir gravação ou double count concorrente.
4. Exceção de consistência: caso haja confirmação do Resend seguida de falha/timeout de persistência, pausar/colocar em quarentena a campanha, conservar IDs e contexto para reconciliação manual e bloquear reenvio cego. Não aceitar conclusão positiva se logs, atualização de fila ou contagens críticas falharem. Não manter itens já aceitos elegíveis a retry automático sem verificar confirmação.
5. Sanitizar itens pendentes sem QUICK FACTS/VIEW FULL PROFILE **uma vez** no enfileiramento ou início da campanha (inclusive campanhas legadas). O scanner deve percorrer toda a fila com paginação/keyset sem pular linhas ao modificar status. Falha de leitura/validação é fail-closed. Independente do scanner, validar cada payload **em memória antes de qualquer chamada ao provedor**, preservando exceção para catalog_general.

### 2.3 Entrega de mensagens e resiliência

1. Após claim de até 300 itens, separar bloqueados, itens com provider_message_id já conhecido e payloads inválidos. Dividir os elegíveis em chunks de no máximo 100, ordenados estavelmente pela idempotency_key; enviar até três chunks via resend.batch.send em Promise.allSettled, respeitando a capacidade conhecida do provedor. Enviar de cada item from, to, subject, html/text, replyTo=EMAIL_SIGNATURE.email, tags e headers de correlação (X-Entity-Ref-ID). Chave de idempotência por chunk: SHA-256 de namespace de campanha + lista **ordenada** de idempotency_keys do chunk; passar como opção oficial do SDK. Conferir quantidade e correspondência posicional dos IDs devolvidos: resposta incompleta/ambígua não significa sucesso.
2. Quando a API rejeitar categoricamente o chunk por motivo não-429 e sem chance de aceitação, realizar fallback de seus itens com resend.emails.send(..., { idempotencyKey: item.idempotency_key }) e os mesmos metadados/headers; limitar concorrência desse fallback para não gerar nova rajada de 100 requisições. Se houver timeout, 5xx ambíguo ou perda da resposta após possível aceitação, **não** migrar imediatamente para chaves individuais, porque a idempotência do batch é diferente: tentar reconsultar/repetir o mesmo batch com mesma chave e mesmo payload dentro da janela de 24h ou pausar para reconciliação. Testar ausência de duplicidade.
3. Em 429, ler Retry-After e, quando disponíveis, ratelimit-reset/limit/remaining (segundos ou data HTTP), clamp de espera com fallback conservador se SDK não expuser headers; gravar global mailer_rate_limits.locked_until de forma segura, retornar itens não aceitos a retry sem perda, e reduzir pela metade o tamanho efetivo seguinte (300→150→75, mínimo seguro). Manter o tamanho reduzido em estado persistido na campanha, não só em memória serverless; UI exibe novo tamanho e motivo. Não executar fallback imediato sobre 429. Limitar chamadas simultâneas futuras à quota real observada e admitir throughput inferior ao nominal.
4. Checar estado e lease antes da rajada, antes de enviar fallback e ao final; pausa/cancelamento bloqueiam novas rajadas. Envios já aceitos/in-flight não podem ser desfeitos: reconciliar seu resultado sem ressuscitar campanha cancelada nem marcar sent como cancelled. Recuperação de stale reservations só mediante expiração e evitando reenvio de aceites incertos. Preservar supressões, deduplicação por e-mail, tags dos webhooks e conteúdo atual dos cards.
5. Reduzir roundtrips: pré-sanitização única; lease/lock/claim necessários; depois finalização agrupada transacional + uma leitura resumida. Eliminar UPDATE e INSERT por destinatário no caminho feliz e contagens HEAD redundantes.

### 2.4 Orquestração/UI, Vercel e desempenho

1. src/routes/_authenticated/admin/mailer.tsx carrega BURST_SIZE e BURST_PAUSE_MS efetivos do backend, envia batchSize do servidor e agenda próximo tick **após** o término da resposta anterior com o atraso configurado, respeitando cooldown informado e next_batch_at autoritativo. Preservar BroadcastChannel, tabId, lock de tick, pausa/cancelamento, ocultação e restauração.
2. Exibir enviados/total, taxa efetiva em e-mails/s com janela temporal, tempo restante estimado realista (média móvel das últimas rajadas + espera), total de batches, tamanho atual e badge textual neutra para limite de provedor. Evitar contagem enganosa na presença de retry/supressão/erro. Ajustar linguagem 'micro-lote' para 'rajada' nas telas.
3. vercel.json atual **não declara maxDuration**. Verificar a duração efetiva do runtime TanStack/Nitro deployado e do plano Vercel, e comparar P95 observado de 300 envios + fallback + transação com limite da função, com folga de segurança. Ajustar função apropriada em vercel.json (somente após aprovação) quando suportado; senão reduzir chunking/concurrency ou limite efetivo. Não aplicar config genérica que não corresponda à função real.
4. Resultado esperado **com quota suficiente**: 799 = 3 rajadas, apenas duas pausas de 1s entre respostas, além de latência do provedor e banco. Meta é tempo de **aceitação pela API**, não entrega na caixa de entrada, nem garantia de 799 envios em 2s.

## 3. Parte 2 — paginação de leitura e importador robusto

### 3.1 Helper reutilizável

1. Criar src/lib/universities-fetch.ts (+ testes). Helper paginado parametrizado por cliente, tabela autorizada ('universities' | 'coaches'), select explícito por consumidor, ordem estável 'name' e 'id', limitando cada página a range(from,from+999). Loop até página com menos de 1000 registros; propagar erro com tabela, offset e contexto; zero linhas retorna []. A ordem por id desempata nomes repetidos. Proteger contra resultado inesperado, duplicidade por id entre páginas e leitura parcial. Atenção a alterações concorrentes durante offset pagination: revalidar total/id se necessário, e abortar importação em inconsistência em vez de criar duplicata.
2. Universidades completas para formulário: colunas usadas em exibição/edição (id, name, city, state, league, source_url, is_hbcu, budget_level, toefl_level, coaches, history, datas se relevantes); importador: id,name,state,coaches; Mailer/modal/legacy: id,name,coaches e campos de filtro efetivamente usados; coaches legados: colunas utilizadas no formulário. Evitar select('*') em tabelas grandes e não transferir JSON history onde desnecessário.
3. Substituir TODAS as consultas gerais sem paginação a universities/coaches nas telas universities.tsx, coaches.tsx, mailer.tsx, send-recruit-email-dialog.tsx e recrutamento legado recruit-email.server.ts. Consultas por ID único, update/delete/insert ou .in('id', lista explicitamente limitada <=100 podem permanecer pontuais; confirmar a busca final no src antes de fechar. fetch do enfileiramento usa recipientes da UI, portanto verificar deduplicação e contagem de todo o conjunto.
4. Contadores: 'Mostrando X de Y universidades', Y obtido da coleção completa; coaches exibidos como total de entradas universities.coaches (3.395 na fotografia comunicada), distinguindo quantidades elegíveis/endereços únicos para envio e contatos legados. Filtros, pesquisa e seleção devem percorrer a coleção completa; mostrar erro/retry de leitura parcial, nunca exibir apenas primeiros 1.000 como sucesso.

### 3.2 Importador sem alteração de dados existentes nesta fase

1. Extrair parsing/normalização/deduplicação e preparação de operações para funções puras testáveis. Nome+estado: trim, normalização de espaços, comparação case-insensitive; e-mail dos coaches: lower-case+trim, removendo repetidos dentro do arquivo e contra JSON existente. Não regenerar IDs dos coaches já cadastrados nem substituir coaches antigos.
2. Estado vazio ou inválido **não** se transforma em CA. Registrar linha invalid/warning com motivo e origem (índice/valor); pular a linha problemática. CA só se originada explicitamente de entrada válida. Exibir motivo na prévia e no resumo final.
3. Buscar TODAS as universidades antes de escrever; se falhar qualquer página abortar importação inteira. Verificar resultado de **cada** update no Promise.all (cada objeto { error }) e sucesso real de cada chunk de INSERT. Relatar falhas por chunk/ID e não contar operação mal-sucedida como atualizada. Não encerrar modal apagando relatório se houver erro parcial; manter resumo exportável/copíavel.
4. Gerar relatório: linhas lidas, válidas, puladas por motivo, universidades criadas/atualizadas, coaches efetivamente adicionados, coaches duplicados ignorados, erros por chunk. Para reimportação idêntica, não efetuar updates sem mudanças nem criar novas universidades/coaches. Para duplicatas **preexistentes** de nome+estado, não escolher arbitrariamente um ID: sinalizar ambiguidade e pular para revisão manual. Concorrência de dois importadores é risco residual sem índice único; não criar índice sobre dados potencialmente duplicados nesta tarefa.
5. Corrigir interface em universidades.tsx com relatório persistente após conclusão, indicação de falha parcial e acessibilidade responsiva conforme UI&UX.md; separar operações puras para testes Vitest.

### 3.3 SQL de auditoria — SOMENTE LEITURA

Executar manualmente no SQL Editor quando desejado; não modifica registros:

~~~sql
SELECT
  lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) AS nome_normalizado,
  upper(btrim(state)) AS estado_normalizado,
  count(*) AS quantidade,
  array_agg(id ORDER BY name, id) AS ids,
  array_agg(name ORDER BY name, id) AS nomes
FROM public.universities
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY quantidade DESC, nome_normalizado, estado_normalizado;
~~~

## 4. Validação, critérios de aceite e segurança

- **Somente testes com mocks/fakes:** nenhuma suíte, script ou CI pode enviar e-mail real. Mockar getResendClient, batch.send, emails.send, tempo, Retry-After, lock global, RPCs e Supabase. Nenhum smoke real está autorizado nesta tarefa.
- mailer-queue.test.ts: remover mock do claim limitado a 2; testar fronteiras 10, 150, 300, 301, 799 e 3300 e-mails (1/1/1/2/3/11 batches), idempotência determinística de chunk, 3 chunks concorrentes de 100, fallback individual restrito, 429+Retry-After+redução de burst, persitência agrupada, falha de persistência com pause/quarentena, lease concorrente, supressão, cancelamento/pause, snapshots inválidos, correção das contagens e ausência de duplicidade. Ajustar recruit-email-send.test.ts e testes da UI quando necessários.
- universities-fetch.test.ts: 0, 999, 1000, 1001, 1332 e 3300 linhas; páginas com nomes iguais e id diferente; erro de página intermediária; query com select explícito; precisão de filtros. Testes do importador: falha em update do Promise.all, erro em insert por chunk, estado vazio/inválido, e-mail duplicado (na planilha e no banco), idempotência da segunda importação, universidade duplicada preexistente. Dados dos testes gerados em memória, não reimportar planilha real.
- Após aprovação: Bun **1.3.14**, bun install --frozen-lockfile (sem modificar lock), bun run typecheck, bun run lint, bun run test, bun run build; validar diff para assegurar que package.json e bun.lock permanecem byte a byte intactos, migração e grants, ausência de scripts com envio externo.
- Inspeção final da aplicação: componentes carregam as **1.332 universidades e 3.395 coaches** comunicados (dados reais sujeitos a alterações), mailer enfileira o conjunto elegível correto, registro de retry/429 e métricas são consistentes. CI verde e deploy dependem de serviço externo; não declarar validação não executada.
- Após implementação autorizada atualizar CERNE.md com contratos de lote, schema, UI e paginação; atualizar a TASK-106 em BACKLOGER.md para [CONCLUÍDO] apenas se a entrega for validada. Manter documentação e commit separados do código quando necessário para rastreabilidade.

## 5. Dependências externas, trade-offs e riscos

- A proposta de 300/segundo significa **300 mensagens aceitas em uma rajada**, não 300 requisições HTTP/segundo. O Resend aceita até 100 e-mails por chamada; 300 requerem 3 chamadas. O limite real de requisições, quota diária/mensal e reputação de envio dependem da **conta do provedor**. O solicitante apontou cerca de 2 req/s no Resend; consultar a quota efetiva da conta (dashboard ou Usage API) e solicitar aumento quando necessário. Três chamadas paralelas podem gerar 429 nesse teto; o código deve reduzir automaticamente cadência/tamanho sem perdas. AWS SES, se usado futuramente, exige conta fora de sandbox e aumento de cota de envio. **A taxa nominal de poucos segundos não pode ser garantida** sem quota compatível.
- Idempotência do Resend tem janela aproximada de 24h e é vinculada ao payload; um fallback individual com chave diferente do batch não é seguro se a aceitação do batch for incerta. Priorizar reconciliação e ausência de duplicidade acima de velocidade nesse caso.
- Com lote em voo, o botão cancelar/pausar não revoga e-mails que o provedor já aceitou; impede os ainda não enviados. O lease deve sobreviver ao maior tempo de resposta; se expirar inesperadamente, interromper a próxima emissão e reconciliar em vez de despachar em paralelo.
- Paginação por offset com ordenação id estabiliza páginas em dados estáticos, mas não produz snapshot transacional sob edição concorrente. O importador deve falhar de forma segura se detectar inconsistência. Uma solução futura mais escalável é RPC de leitura agregada ou keyset; não é necessária para 1.332 linhas.
- Nenhum ajuste de dependências, bibliotecas, package.json ou bun.lock. Não executar migrations em produção, não enviar e-mails reais e não reimportar a planilha como validação.

## 6. Critério de parada e aprovação

**Nesta etapa:** salvar este plano em think/ e registrar TASK-106 como [PENDENTE] no BACKLOGER.md. Nenhuma alteração de código ou banco. **Aguardar resposta expressa 'Aprovado' do usuário** antes de executar ambas as partes. A aprovação cobre a implementação técnica descrita, não uma autorização para envio real, importação real ou alteração direta de dados de universidades.
