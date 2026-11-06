# TASK-116 — aplicação humana e homologação

Implementação: ChatGPT/Codex, por autorização de Kauan em 06/11/2026. Nenhuma migration, extensão, segredo, agendamento ou campanha foi alterado no Supabase/Vercel de produção nesta implementação. A decisão de 16/10 de execução exclusiva no navegador foi revista em 06/11 a pedido de Kauan: cron como rede de segurança, com o navegador mantendo ticks.

## Ordem antes do deploy

Escolha uma janela sem disparos em andamento. Preserve o estado das campanhas existentes; não reaplique a 0031 nem reenvie campanhas antigas.

No SQL Editor, execute cada arquivo integralmente em consulta separada e nesta ordem (todos com menos de 250 linhas):

1. `db/migrations/0033a_mailer_prereqs_heartbeat.sql` — verifica todas as dependências e cria heartbeat, auditoria, contadores e armazenamento de payload.
2. `db/migrations/0033b_mailer_claim.sql` — claim, janela de 23h e autocura conservadora de órfãos.
3. `db/migrations/0033c_mailer_finalize.sql` — retentativas e finalização transacional.
4. `db/migrations/0033d_mailer_progress.sql` — progresso agregado e saúde.
5. `db/migrations/0033e_mailer_controls_bounce.sql` — pausa/retomada/cancelamento, sincronização de lease e override auditado.
6. `db/migrations/0033f_mailer_cron_status.sql` — leitura segura do status mesmo sem schema cron.
7. `db/migrations/verify-0033.sql` — somente leitura. Todos os RPCs devem existir, ser SECURITY DEFINER, ter `search_path=public`, negar execução a anon/authenticated e permitir service_role. Conferir seis colunas novas em campaigns e três em batches. Investigar contagens de órfãos/accepted sem ID antes da homologação.

Cada parte usa sua própria transação. Se alguma falhar, pare, leia a lista de dependências faltantes e resolva a causa; as anteriores não são revertidas automaticamente. Todas são idempotentes. Não referenciam `profiles.role`. O contrato de colunas conferido antes do SQL está em `TASK-116-schema.md`.

Após esses seis arquivos e o verify, publique o código deste PR na Vercel. O agendamento opcional 0032 é aplicado **depois** de configurar as extensões, o Vault e a aplicação, para não chamar o código antigo.

## Ativação humana do cron

1. Supabase Dashboard → Database → Extensions: habilite `pg_cron`, `pg_net` e `supabase_vault`.
2. Consulte a versão instalada:

   ```sql
   select extname, extversion from pg_extension
   where extname in ('pg_cron','pg_net','supabase_vault');
   ```

   O pg_cron introduziu intervalos de 1–59 segundos na versão **1.5.0** ([changelog oficial](https://github.com/citusdata/pg_cron/blob/main/CHANGELOG.md)). A 0032 revisada escolhe `15 seconds` a partir de 1.5, e `* * * * *` nas versões anteriores. Use a versão efetiva do banco, não a versão de um cliente CLI.
3. Crie no Vault os dois secrets, substituindo os placeholders com dados reais **somente no painel**:

   ```sql
   select vault.create_secret('https://SEU-DOMINIO/api/mailer/tick','mailer_tick_url');
   select vault.create_secret('SEU-SEGREDO-ALEATORIO-FORTE','mailer_cron_secret');
   ```

   Se já existirem, atualize os mesmos registros pelo Vault, evitando nomes duplicados. Não coloque valores reais no Git, em logs ou em mensagens.
4. Na Vercel, configure `MAILER_CRON_ENABLED=true` e `MAILER_CRON_SECRET` com o mesmo valor do Vault; publique/republique a aplicação com essas variáveis no ambiente de produção. A URL do Vault precisa ser alcançável pelo Supabase e não pode exigir uma proteção de preview que impeça a chamada.
5. Confira **no painel da Vercel** a duração máxima da função. O código não consegue confirmar esse valor. `MAILER_TICK_BUDGET_MS` é o orçamento de processamento (padrão 8000ms; configuração entre 2000ms e 25000ms). O timeout do provedor é `min(10000, tempo restante − 1000ms)`; quando não cabe envio, o lote fica preservado. Reserve também tempo para consultas/finalização/heartbeat após o loop. Não configure orçamento igual ao limite da plataforma.
6. Aplique `db/migrations/0032_mailer_cron_optional.sql` revisada no SQL Editor. Ela exige extensões, secrets e 0033 antes de agendar. Não chama nem habilita extensões automaticamente. Mantém o nome estável do job, de forma idempotente.
7. Rode novamente `verify-0033.sql`. O `cron_status` deve ter `enabled=true`, `active=true` e o schedule escolhido. Na aplicação deve aparecer **“Rede de segurança: ativa”**. O selo combina job ativo, presença dos secrets e configuração da aplicação; a prova de funcionamento de ponta a ponta é a campanha de teste abaixo.

Cron filtra campanhas running com lease nulo/expirado e cooldown vencido. Cada requisição recebe um controllerId único. Ao terminar o tick, o lease restante é reduzido para no máximo 15s. Se o cron encontrar o lease ativo do navegador, acompanha sem criar outro lote nem registrar heartbeat falso. A cadência de 15s não promete um tick em cada fronteira: uma execução pode encontrar um lease que ainda está terminando e assumir na próxima janela.

## Checklist após deploy

- [ ] `verify-0033.sql` executado sem erro; RPCs e permissões corretas.
- [ ] Selo da aplicação ativo e schedule visível. Sem cron habilitado, aviso permanente “Fechar a aba pausa o envio”.
- [ ] Criar campanha **pequena em dry run** com contatos de teste, iniciar e fechar a aba imediatamente. Esperar várias janelas (até alguns minutos), reabrir e confirmar conclusão e `last_tick_by` de cron. Dry run não prova entrega real: não chama a Resend nem gera webhooks.
- [ ] Se autorizado para homologação real, enviar somente a contatos de teste consentidos; confirmar aceitação, eventos no webhook e entrega. Sem eventos após 2 min da primeira aceitação, a UI deve orientar verificar a integração.
- [ ] Abrir duas abas e observar takeover sem clique e sem lote duplicado; repetir com aba oculta.
- [ ] Pausar, retomar e cancelar uma campanha de teste. Cancelamento durante envio pode representar mensagens já aceitas pela Resend: ficam `unconfirmed/CANCELLED_IN_FLIGHT` e exigem reconciliação, sem reenvio automático.
- [ ] Com cron desligado e sem executor, running sem tick por mais de 45s e sem lease ativo deve aparecer como fila parada; testar “Retomar agora”. Não forçar esse cenário alterando campanhas reais antigas.
- [ ] Conferir logs de `/api/mailer/tick`, `cron.job_run_details` e respostas recentes de `net._http_response` no Supabase para confirmar HTTP e duração. Não exportar headers/segredos para logs compartilhados.

Para desligar a rede de segurança, desative o job pela função `cron.alter_job` ou pelo painel de Cron e defina `MAILER_CRON_ENABLED=false` na Vercel, republicando. O navegador continua podendo executar ticks. Não apague a fila nem remova automaticamente as migrations para fazer rollback.

## Evidência de teste e limites

- Testes Vitest exercitam o hook real com um host mínimo de hooks, o motor real com transporte Supabase/Resend simulado, controle v2, saúde, UI SSR e orçamento.
- `python3 scripts/mailer-tests/run.py` usa somente Docker local, imagem PostgreSQL fixada por digest, banco descartável sem porta publicada e SQL derivado das migrations anteriores. Exige que a imagem já esteja presente (`docker pull postgres:17-alpine` previamente). Aplica 0033 duas vezes, testa pré-checagem negativa, retentativas, cancelamento tardio, órfãos, bounces, 5000 destinatários sem navegador e concorrência em duas sessões PostgreSQL. Não conecta ao Supabase nem à Resend.
- A simulação de cron usa relógio virtual/janelas de lease expiradas; não espera 50 minutos de relógio real. O transporte pg_net/cron/Vault real e a duração máxima da Vercel dependem da homologação humana acima.
- `request_payload` congela os bytes usados no replay, incluindo tokens de descadastro ao cruzar meia-noite. O conteúdo é removido quando o lote fecha; não é enviado ao cliente pela RPC de progresso. Rate limits usam contador próprio; oito respostas ambíguas ou a janela de 23h encerram o replay para reconciliação.
- Wake Lock opcional não foi adicionado; a continuidade depende do cron configurado e a aba oculta continua tentando ticks sujeita ao throttling do navegador.
