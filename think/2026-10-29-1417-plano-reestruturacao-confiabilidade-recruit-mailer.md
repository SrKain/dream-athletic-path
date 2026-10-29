# Plano técnico — Reestruturação de confiabilidade, transparência e custo do Recruit Mailer

- **Data/hora:** 2026-10-29 14:17 (America/Sao_Paulo).
- **Solicitante:** Kauan — Go Team Go.
- **Executor do planejamento:** ChatGPT (análise de arquitetura e evidências do repositório e do Supabase).
- **Executor da implementação:** agente de desenvolvimento/Codex, após aprovação explícita.
- **Referência:** TASK-114 — registro deste plano; implementação futura ainda não autorizada.
- **Status:** **[PLANO REGISTRADO — AGUARDANDO APROVAÇÃO HUMANA PARA IMPLEMENTAÇÃO]**.
- **Escopo da presente entrega:** documentação somente. Nenhum código, migration, configuração, dado de produção ou disparo real foi alterado/executado.
- **Branch de referência:** `main` — `SrKain/dream-athletic-path`.

---

## 1. Intenção do produto e critérios inegociáveis

O Recruit Mailer deve se comportar como uma **ferramenta de e-mail marketing simples, sob demanda, verificável e econômica** — não apenas como um mecanismo de filas. O operador deve selecionar atleta(s), personalizar o conteúdo e conferir o preview, escolher os contatos, confirmar a campanha e acompanhar seu processamento por lotes com os intervalos de respiro já adotados.

O sistema deve ser capaz de explicar, por destinatário, **por que enviou, por que não enviou ou por que ainda não há confirmação**. Não deve afirmar que houve entrega quando há apenas aceitação da API.

**Stack obrigatória (não substituir):**

- **Resend:** motor exclusivo de envio e origem dos eventos de entrega.
- **Supabase:** estado persistente e fonte operacional de verdade, com consumo compatível com os limites do plano gratuito.
- **Vercel:** funções curtas para validação, execução e persistência, respeitando duração e cotas efetivas do projeto.
- **Navegador:** orquestrador permitido e preferencial no cenário de operador único, sem depender dele como repositório do estado crítico.

Não introduzir Cloudflare, Redis, brokers pagos, novas contas/infraestruturas nem mudança de provedor como solução padrão. Não sacrificar preview, filtros, personalização, histórico, webhooks, unsubscribe, prevenção de duplicidade ou proteção da reputação de envio. Evitar alterações em outros módulos.

## 2. Diagnóstico baseado em evidências e limites da auditoria

### 2.1 Fatos observados em produção (consultas de leitura, 29/10/2026)

| Caso                               | Evidência                                                                                                                                                 | Interpretação correta                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campanha `a0cbaebd…` de 20/10      | `799` destinatários/`799` itens `sent` com `provider_message_id`; eventos de `794` entregas, `4` supressões e `3` bounces.                                | Aceitação na Resend **não** significa entrega. Eventos de tipos distintos podem coexistir por mensagem; não somar esses eventos como categorias mutuamente exclusivas. |
| Campanha `17d7ad60…` de 28/10      | `404` itens `sent` com identificação do provedor, `396` eventos de entrega e `8` de supressão.                                                            | O painel pode mostrar 404 aceitos, mas não 404 entregues.                                                                                                              |
| Campanha `2725beda…` de 27/10      | `276` itens marcados `sent`, mas somente `176` com `provider_message_id` e `176` logs `sent`; `100` itens `sent` sem ID do provedor e com código de erro. | Há **lacuna de auditoria** em 100 registros: não presumir nem entrega nem falha; reconciliar antes de qualquer reenvio.                                                |
| Campanha `8a56bef1…` de 28/10      | `399` destinatários inseridos na fila, campanha ainda `draft`, sem disparos registrados.                                                                  | Preparação/ativação não concluiu; apurar erro de unicidade/idempotência e tornar a criação recuperável.                                                                |
| Campanha `f23475af…` de 21/10      | Cabeçalho com `1.339` destinatários, mas apenas `500` linhas na fila, posteriormente canceladas.                                                          | Existe histórico de preparação parcialmente persistida; o cabeçalho não pode ser tratado como manifesto fechado.                                                       |
| Cadastro de universidades não HBCU | `3.252` registros de coaches com e-mail; `2.801` e-mails normalizados distintos; `451` registros excedentes por repetição.                                | A UI pode contar contatos selecionáveis enquanto o envio precisa contar endereços únicos; a diferença deve ser mostrada antes da confirmação.                          |

**Contexto do schema:** verificações de leitura anteriores indicaram que o `coach_id` de `recruit_email_logs` é anulável e que `mailer_burst_ready()` está apta, compatível com a alteração essencial da migration `0030`. Isso **não** substitui a verificação formal de todos os objetos/assinaturas no momento do deploy. Não reaplicar migrations às cegas.

**Limite de evidência:** a auditoria utilizou código do GitHub, tabelas e eventos no Supabase; não houve inspeção autenticada completa dos painéis/logs da Vercel e da Resend neste registro. Portanto, rate limiting, timeout, falha de webhook e outros mecanismos devem ser confirmados por correlação de logs antes de serem declarados causa única. A diferença citada pelo operador (ex.: cerca de 800 selecionados para 770 confirmados) precisa ser vinculada a um `campaign_id` para determinar cada exclusão real.

### 2.2 Defeitos arquiteturais identificados no código

1. **Contagem de seleção diferente de destinatários canônicos:** a interface computa `activeSelectedRecipients` por sintaxe/supressão, mas não deduplica globalmente por e-mail. Na ação de envio, o payload usa `selectedRecipientsList`, abrangendo também itens que a UI havia considerado inelegíveis. Isso produz múltiplas definições de “total”.
2. **Deduplicação limitada a cada fatia:** `enqueueCampaignDispatches` divide a lista em blocos de 500 e `appendCampaignRecipients` recria `seenEmails` a cada chamada. Endereços repetidos em fatias diferentes alcançam a restrição única de idempotência da fila; uma falha posterior deixa linhas de blocos anteriores já persistidas.
3. **Preparação sem fechamento atômico lógico:** criação do `draft`, snapshot, inserções e atualização do cabeçalho ocorrem em múltiplas operações. Quando uma delas falha, faltam estado de preparação recuperável, manifesto consistente e mensagem clara para o usuário.
4. **Semântica imprecisa de status:** `sent`/“Aceitos Resend” deriva da resposta de envio; a mesma métrica não pode ser usada como prova de `delivered`. Contadores do cabeçalho, da fila, dos logs e dos webhooks precisam ter hierarquia e reconciliação explícitas.
5. **Persistência e reconciliação heterogêneas:** o fallback após falha de `complete_mailer_burst` e a reconciliação manual já mitigam parte dos incidentes, mas há registros históricos `sent` sem ID do provedor e divergência entre fila/logs. Não apagar/reescrever evidências para “fechar 100%”.
6. **Orquestração com múltiplos relógios:** timers React, Web Worker, polling, cooldown, lease de controlador e estados no banco coexistem. Auditar cancelamento/reagendamento de tick, troca de campanha, aba em segundo plano, recarregamento e disputa entre abas; não presumir que um relógio de interface seja garantia de processamento.
7. **Risco de operações longas e custo:** o worker pode formar chunks de até 100 e executá-los em paralelo quando o lote pedido é maior; inspeções/renderizações e consultas repetidas podem aumentar duração da Vercel e tráfego do Supabase. Os limites reais devem ser medidos, não inferidos apenas de testes mockados.

**Causa-raiz de produto:** faltam contratos claros e uma única fonte de verdade para **manifesto → elegibilidade → tentativa → aceitação → evento de entrega → resolução de incidente**. Corrigir apenas um erro SQL ou mudar o tamanho da rajada não elimina a classe de defeitos.

---

## 3. Contrato de experiência do operador (UX)

### 3.1 Antes de enviar: preflight obrigatório

Exibir uma conferência única e fechada:

- **Selecionados:** registros marcados pelo operador.
- **Duplicados:** seleções repetidas após normalização do e-mail, com motivo.
- **Inválidos:** sintaxe rejeitada, sem inferir entregabilidade.
- **Suprimidos/descadastrados:** inelegíveis por opt-out ou bloqueio.
- **Outras exclusões justificadas:** caso existam, com classificação própria.
- **Elegíveis:** e-mails únicos aptos à tentativa de envio.

**Invariante:** `selecionados = duplicados + inválidos + suprimidos + outras_exclusões + elegíveis`, usando motivo primário mutuamente exclusivo por seleção. Os grupos podem ter detalhes adicionais, mas não inflar a soma.

Exemplo ilustrativo: 800 selecionados − 20 duplicados − 10 suprimidos = **770 elegíveis**. Nunca apresentar 800 como promessa de envio sem explicar os 30 descartes. Guardar o preflight associado à campanha; mudanças na lista exigem novo cálculo/consentimento.

### 3.2 Durante o processamento

Exibir **duas dimensões**, sem falsa equivalência:

- **Progresso operacional:** elegíveis, pendentes, processando, aceitos pelo provedor, falhas definitivas, não confirmados, cancelados; % de itens com decisão operacional, separado dos eventos posteriores.
- **Resultado de entrega:** entregues confirmados, bounces, supressões pelo provedor, outros eventos relevantes e **aguardando confirmação**. Contagens por **mensagem distinta**, com regra explícita de precedência e carimbo de última atualização.

Os estados de entrega podem mudar após a campanha terminar de submeter as mensagens; não mostrar “100% entregue” enquanto faltarem comprovantes. Status possíveis de alto nível: “Preparando”, “Enviando”, “Aguardando intervalo”, “Aguardando confirmação”, “Pausada por segurança”, “Concluída com ressalvas”, “Concluída — aceitação confirmada”, e “Entrega confirmada” apenas com eventos consistentes. Critérios devem ser definidos sem rótulos ambíguos.

Mensagens objetivas: “Próximo lote em 45 s”, “Resend solicitou uma pausa; retomada programada”, “8 mensagens suprimidas pelo provedor”, “3 envios exigem verificação antes de qualquer reenvio”. Oferecer drill-down por destinatário sem expor erro bruto em primeira camada; deixar detalhes técnicos expansíveis.

### 3.3 Ao interromper e retomar

O navegador pode disparar ticks **enquanto a página estiver ativa**. Ao fechar a aba/dispositivo, **não prometer envio em background** na arquitetura browser-driven. Persistir o ponto seguro e informar “Envio interrompido; reabra para retomar”. Na reabertura, recuperar campanha e estado do banco; respeitar lease, bloqueios e cooldown. A retomada pode ser automática para itens comprovadamente seguros e deve exigir decisão humana em casos ambíguos.

---

## 4. Arquitetura-alvo (reaproveitando a stack)

`UI de composição/preview → Preflight canônico → Manifesto persistente + snapshot imutável (Supabase) → Controlador navegador → Tick autenticado na Vercel → Claim atômico de lote ≤ 100 → Resend Batch API → Persistência de aceitação na fila → Webhooks Resend → Eventos/indicadores de entrega.`

**Princípios de implementação:**

1. **Identidade:** normalizar e-mail em um único serviço compartilhado (frontend usa prévia, backend é autoritativo); deduplicação global por campanha, e não por fatia. Preservar o registro original e a razão da exclusão.
2. **Preparação reexecutável:** atribuir identificador/idempotência estável à operação de criação, persistir a lista canônica antes da ativação, usar operação transacional/RPC adequada quando viável e reconciliar contagem/fingerprint entre manifesto e fila. Se falhar no meio, permanecer `draft/preparing` com erro compreensível; **nunca ativar fila incompleta**. Retentativa não cria nova campanha nem duplica linhas.
3. **Payload econômico:** persistir snapshot editorial imutável uma vez; por item armazenar metadados mínimos necessários. Renderizar no envio ou de forma limitada, evitando replicar HTML volumoso e leituras integrais da fila.
4. **Execução curta e controlada:** inicialmente **um único chunk Resend de até 100 e-mails por tick**, serializado por campanha; um controlador autorizado por lease no Supabase. Respeitar limitações e intervalos efetivos do plano/conta da Resend e do runtime Vercel, inclusive `Retry-After` e cota diária, sem fixar “2 req/s” como garantia contratual universal. Mudança de ritmo somente por métricas verificadas.
5. **Persistência antes e depois:** reservar itens com lease, registrar identificação da tentativa; persistir resultado com `provider_message_id` assim que a aceitação for conhecida, isolando falhas de log secundário. Nunca contabilizar `sent` com ID ausente como prova automática de aceitação; investigar os casos legados.
6. **Sem falsa garantia de exactly-once:** não existe transação distribuída única entre Supabase e Resend. Usar idempotência onde suportada pelo provedor, correlação por `campaign_id`/`queue_item_id`/ID Resend e quarentena `unconfirmed` quando a resposta for ambígua. **Jamais reenviar automaticamente uma tentativa cujo resultado pode ter sido aceito.**
7. **Falhas por categoria:** 429/5xx com rejeição demonstrada → backoff e nova tentativa segura; 4xx definitivo → falha terminal explicada; timeout/resultado desconhecido → reconciliar por evidência, senão quarentena; bounce/complaint/opt-out → supressão e proteção de reputação.
8. **Webhooks auditáveis:** autenticar assinatura, processar idempotentemente eventos repetidos e fora de ordem, correlacionar pelo ID da Resend, atualizar status de entrega sem sobrescrever evidências de aceitação. Falha na gravação de supressão deve ser observável/reprocessável.
9. **Progresso econômico:** leitura agregada por campanha e por lote concluído; polling adaptativo (ativo, cooldown, pausado, finalizado), evitando consulta por destinatário a cada segundo. Consultas filtradas/indexadas, mínimo egress, retenção definida; indicadores de consumo sem prometer gratuitamente volumes ilimitados.
10. **Proteções:** autenticação `agency_admin`, RLS e acesso privilegiado apenas no servidor, unsubscribe obrigatório, proteção contra replays, registros de auditoria sem vazar e-mails em logs externos, e ações destrutivas ou reenvios com confirmação deliberada.

---

## 5. Plano de implementação proposto (somente após aprovação)

### Fase A — Auditoria técnica e linha de base

- Conferir migrations/constraints/RPCs 0029–0030 com scripts **somente leitura**, incluindo funções `complete_mailer_burst`, `claim_mailer_queue_batch`, `mailer_burst_ready` e progress summary. Não pressupor status aplicado apenas pelo nome da migration.
- Correlacionar `campaign_id` entre `mailer_campaigns`, `mailer_queue`, `recruit_email_logs`, `email_events` e logs da Vercel/Resend, quando houver acesso; separar resultados confirmados e hipóteses.
- Levantar limites/consumo efetivos (Resend: cota e throttle; Vercel: duração/execuções; Supabase: consultas, CPU, tamanho e egress). Definir budget operacional por tamanho de campanha e alerta antes de atingir cotas.

### Fase B — Preflight, manifesto e ativação segura

- Criar função compartilhada para normalização, classificação única e deduplicação **global**; decidir deterministicamente qual registro de coach prevalece por e-mail.
- Harmonizar preview/contadores com o **mesmo resultado do backend**; proibir divergência entre `activeSelectedRecipients`, `selectedRecipientsList` e o payload efetivo.
- Persistir manifestação de exclusões com motivo e manifesto canônico; inserção em fatias idempotentes sem alterar o conjunto; validação de integridade antes de ativar.
- Em erro de preparação, mostrar “X de Y preparados; campanha não iniciada” e oferecer “Tentar concluir preparação” (sem criar novo ID/duplicar).

### Fase C — Motor de execução confiável

- Unificar orquestrador em uma máquina de estados com uma rotina ativa por campanha e timeout controlado; sincronizar worker/timer/cooldown/lease.
- Reservar até 100 itens por tick e emitir no máximo uma chamada batch por tick no caminho padrão; monitorar duração e respeitar backoff. Nunca explodir 100 envios individuais no mesmo tick para “recuperar” 429.
- Persistir resultados de forma consistente (incluindo sucesso parcial, erro por item, ID do provedor, reserva expirada); reconciliar por evidência e isolar resultados ambíguos.
- Revisar mecanismos existentes de `unconfirmed` e decisões humanas, evitando alteração retroativa de `sent` sem prova.

### Fase D — Eventos, métricas e interface

- Separar API/UI de andamento operacional e entrega confirmada; ordenar eventos por mensagem e tratar duplicação/atraso de webhook.
- Barra de progresso e contadores provenientes de agregações no banco (nunca somatório de `setState`), com horário de atualização, explicações e drill-down.
- Exibir motivos de exclusão/erro individual e ações seguras (retomar, reconciliar, exportar relatório). O modo dry-run deve ser claramente identificado e não aparecer como entrega real.

### Fase E — Otimização, migração e homologação

- Ajustar índices/queries e reduzir polling/egress mediante medições; novas tabelas ou migrations somente se justificadas, versionadas, verificáveis e reversíveis quando possível.
- Prever compatibilidade dos registros históricos e estratégia de rollback; não reescrever os 100 registros incertos como enviados ou falhos sem conciliação.
- Entregar arquitetura revisada, diffs, evidências, resultados de testes, estimativa de consumo e guia operacional num relatório **consolidado**. Evitar múltiplas microversões editoriais.

**Arquivos para inspeção/alteração provável** (validar necessidade antes de modificar): `src/routes/_authenticated/admin/mailer.tsx`, `src/lib/email/mailer-queue.server.ts`, `src/lib/email/mail-provider.server.ts`, `src/lib/email/mailer-runner.server.ts`, `src/lib/email/recruit-email.functions.ts`, `src/lib/email/resend-webhook.server.ts`, módulos de métricas/preflight e testes correspondentes, `db/migrations/`, `CERNE.md` e `BACKLOGER.md`. Preservar `package.json` e `bun.lock`.

---

## 6. Aceite verificável e bateria de testes

**Testes com Resend, Supabase e rede mockados; nenhum envio real nesta etapa.** Cenários de campanhas com 100, 500, 800, 1.500 e 5.000 seleções, incluindo todos os modos (individual, multi-atleta, catálogo).

| Cenário                                                              | Resultado obrigatório                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Duplicatas na mesma fatia e entre fatias de 500                      | Um único item por e-mail normalizado; exclusões explicadas; não ocorre violação de unicidade.                                   |
| E-mails inválidos, opt-out e supressão entre preflight e envio       | Contagem fecha, elegibilidade atualizada, nenhuma mensagem proibida é enviada.                                                  |
| Falha no meio da preparação ou clique repetido                       | Mesmo identificador lógico, nenhuma ativação parcial, possibilidade de completar sem duplicar linhas.                           |
| Sucesso/erro mistos em batch e 429 com `Retry-After`                 | Só itens rejeitados comprovadamente entram em retry seguro; backoff e número de chamadas respeitados.                           |
| Timeout após envio aceito, resposta ambígua ou falha de persistência | Não há replay cego; fica `unconfirmed` até evidência/decisão humana auditada.                                                   |
| Fechar/recarregar aba, offline/online, duas abas, lease vencida      | Estado permanece íntegro; retomada segura sem concorrência dupla; nenhuma promessa de disparo com aba fechada.                  |
| Webhook duplicado, tardio ou fora de ordem                           | Contadores por mensagem única, evento íntegro, distinção entre `accepted` e `delivered`.                                        |
| Campanha com bounces/supressões/falhas                               | Nunca exibir “entregue integralmente” sem comprovação; divergências visíveis por causa.                                         |
| Limites dos planos e consultas                                       | Medir chamadas, duração, queries/egress, definir teto/alarme por campanha e demonstrar desempenho dentro dos budgets acordados. |
| Sem alterações do produto fora do Mailer                             | Preview, filtros, atletas, personalização, histórico, autenticação e descadastro preservados.                                   |

**Invariantes de aceite:**

- `selecionados = elegíveis + exclusões_disjuntas`.
- `elegíveis = pendentes + processando + aceitos + falhas_definitivas + unconfirmed + cancelados`, com estados mutuamente exclusivos na visão operacional de cada campanha.
- Aceitação pela Resend tem prova correlacionável; entrega exige evento válido. “100% processado” **não** equivale a “100% entregue”.
- Nenhum reenvio automático de item com aceitação incerta; nenhuma exclusão silenciosa.
- Teste verde não é prova de entrega real ou de ausência de risco: aprovação final requer validação humana e observação de eventos reais em campanha de teste.

**Portão de validação obrigatório (AGENTS.md, regra 7):** `bun install --frozen-lockfile`, `git diff --exit-code -- package.json bun.lock` e `bun run validate` (lint, typecheck, testes e build), com **saídas reais** anexadas a `BACKLOGER.md`; mocks sem rede externa; `src/lib/lockfile-sync.test.ts` mantido. Alteração de contratos requer atualização de todos os chamadores, inclusive `src/server.ts`. Atualizar `CERNE.md` após edição de código.

---

## 7. Implantação segura, riscos e alternativas

1. **Antes:** gerar baseline/backups e confirmar produção versus repo; nenhum disparo em andamento durante migrações que afetem contratos de fila. Solicitar aprovação para SQL e deploy separadamente.
2. **Em ambiente isolado:** simular volume/falhas com provedor fake e fixtures; executar CI completo; validar consumo estimado e semântica dos estados.
3. **Homologação real controlada:** após autorização explícita, campanha pequena para caixas de teste autorizadas; confrontar UI, Supabase, identificadores Resend e webhooks. Não usar bases de coaches como campo de teste.
4. **Liberação progressiva:** aumentar volumes após evidência consistente e budgets aceitáveis; monitorar rejeições, supressões, tempo de função e carga do banco; definir rollback rápido sem reiniciar campanhas.
5. **Casos históricos:** auditar primeiro os `100` itens `sent` sem `provider_message_id` da campanha `2725beda…` e o `draft` de `399` destinatários. Não reexecutar campanhas legadas por padrão.

**Riscos/trade-offs assumidos:**

- Navegador é suficiente para operador único **enquanto aberto e autorizado**, mas não garante processamento com dispositivo desligado; executar sem aba seria uma mudança explícita de produto/infraestrutura.
- A comunicação com a Resend não é transacional com o banco: sem evidência, o objetivo correto é **não duplicar e tornar a incerteza visível**, e não prometer “exactly once” ou entrega universal.
- Limites gratuitos são cotas variáveis; precisa haver medição e bloqueio preventivo, não uma promessa absoluta de custo zero.
- Suprimidos e bounces não podem ser “forçados” a receber; o contrato é **processar todos os elegíveis e explicar todos os demais**, jamais garantir 100% de entregabilidade.
- Priorizar correção incremental do núcleo atual; só reconsiderar fornecedor ou infraestrutura se métricas concretas demonstrarem impossibilidade técnica/econômica.

---

## 8. Entregáveis, decisão pendente e status

**Entregáveis esperados da implementação:** núcleo estável, preflight canônico, fila recuperável, reconciliação segura, métricas verdadeiras, UX acessível/mobile-first conforme `UI&UX.md`, testes de volume e falhas, relatório de custos, checklist de deploy/rollback e documentação viva.

**Decisão pendente:** aprovação humana explícita deste plano para **alterar código/migrations**. A solicitação atual autorizou **somente registrar o plano em `think/`**. Não há autorização para modificar lógica, schema, dados, configurações ou realizar envios.

**Status final desta etapa:** **[PLANO DOCUMENTADO — IMPLEMENTAÇÃO PENDENTE DE APROVAÇÃO]**.
