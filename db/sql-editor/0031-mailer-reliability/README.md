# 0031 — execução manual em três partes (Supabase SQL Editor)

**Não é uma migration adicional.** Estes três arquivos são uma divisão da fonte original `db/migrations/0031_mailer_reliability.sql` no commit/base blob `dde0902eb3f452fe67bdd1cbfb450af57db093b4`. O arquivo original permanece intacto. **Não executar original e partes juntos** (evitar alterações duplicadas no banco).

## Execução (somente manual, em ordem)

1. Faça backup/snapshot validado e programe uma janela sem disparos pelo mailer. A parte 01 **altera dados legados e exclui registros duplicados de `public.mailer_queue`** conforme lógica original — analisar o impacto antes.
2. Execute `db/migrations/verify-0031-prereqs.sql` (somente leitura) e resolva os pré-requisitos pendentes.
3. No Supabase SQL Editor, abra **01_prereqs_schema_preflight.sql**, copie o conteúdo integral, execute e confirme sucesso sem erro.
4. Em **nova consulta**, execute **02_campaign_activation_claim.sql** e confirme sucesso.
5. Em **nova consulta**, execute **03_finalize_progress_security.sql** e confirme sucesso.
6. Execute `db/migrations/verify-0031.sql` e confira `mailer_v2_ready = true`, `has_mailer_batches = true`, `has_mailer_campaign_exclusions = true`, `has_unique_campaign_email_norm_index = true`, `accepted_without_provider_id_count = 0` e `v2_rpc_count = 7`. Apenas depois habilite/deploy o mailer V2.

## Como a divisão funciona

- **01**: seções 0–5 da fonte original (pré-checagem, novas tabelas, evolução, reconciliação e RPC `mailer_preflight`).
- **02**: seções 6–8 (RPCs `create_mailer_campaign`, `activate_mailer_campaign`, `claim_mailer_batch`).
- **03**: seções 9–13 (RPCs `finalize_mailer_batch`, `mailer_campaign_progress`, `mailer_requeue_failed_retryable`, permissões, `mailer_burst_ready` e `NOTIFY`).

Cada parte usa `BEGIN`/`COMMIT` para falhar sem deixar **aquela parte** aplicada parcialmente. **As três partes não constituem uma única transação**: se uma falhar, não repita automaticamente anteriores; registre o erro, verifique o estado do banco e corrija antes de continuar. As partes 02 e 03 têm guardas para detectar etapas anteriores ausentes. `REVOKE`/`GRANT` foram antecipados para impedir que RPCs `SECURITY DEFINER` fiquem acessíveis a `PUBLIC`, `anon` ou `authenticated` entre etapas. O SQL funcional original foi preservado integralmente e na mesma ordem.

**Importante**: SQL Editor remoto não registra automaticamente estas alterações na tabela de histórico de migrations da CLI. Se o projeto faz deploy via `supabase db push`, reconcilie o histórico de migrations com o responsável pelo deploy antes de usar o pipeline. Estes arquivos foram mantidos fora de `supabase/migrations` para não entrarem no fluxo automático.

Não foi executado SQL no Supabase. A validação realizada nesta preparação é **estática**; a validação real depende dos scripts pré/pós-migração no banco alvo.
