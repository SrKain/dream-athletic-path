# Migração completa para a Hetzner — banco (Supabase) e hospedagem do app (Vercel)

- **Data/hora:** 2026-11-10 17:42 (America/Sao_Paulo).
- **Solicitante:** Kauan — Go Team Go. **Planejamento:** Claude (Claude Code).
- **Base:** `main` em `f75f777` (merge do PR #14, TASK-116).
- **Pedido:** "Quero migrar pra Hetzner o app inteiro, tanto banco quanto a hospedagem dele, preciso que guie o preciso."
- **Status:** PLANO — aguardando aprovação humana explícita (Regra 2). Nenhum código, migration, dependência, segredo ou dado de produção alterado.

---

## 1. Contexto e objetivo

Hoje o sistema roda em dois fornecedores gerenciados:

| Camada | Hoje | Onde aparece no repo |
| --- | --- | --- |
| Front + server functions + API (`/api/mailer/tick`, `/api/webhooks/resend`, `/api/unsubscribe`, `/api/mailer/worker`, `/api/cron/process-scheduled-emails`) | **Vercel** (Nitro preset `vercel`) | `vite.config.ts`, `vercel.json`, `.github/workflows/vercel-mailer-validation.yml` |
| Banco Postgres + RLS + RPCs | **Supabase Cloud** | `db/migrations/0001…0033f` |
| Autenticação (login, convite, reset de senha) | **Supabase Auth (GoTrue)** | `src/lib/auth.functions.ts` (`auth.admin.createUser/updateUserById/inviteUserByEmail`), `src/routes/forgot-password.tsx` |
| Arquivos (4 buckets: `athlete-media`, `documents`, `proposal-assets`, `stage-celebrations`) | **Supabase Storage** + Image Transformation (`/storage/v1/render/image`) | `src/lib/image-transform.ts`, telas admin/portal |
| Fila do mailer em segundo plano | `pg_cron` + `pg_net` + `supabase_vault` (ainda **não ativados** em produção, TASK-116) | `0032_mailer_cron_optional.sql`, `0033f` |
| E-mail | Resend (continua igual — não migra) | `RESEND_*`, `EMAIL_FROM` |

**Objetivo:** tudo isso passar a rodar em servidores Hetzner controlados pela agência, sem perder usuários, senhas, arquivos, histórico do mailer nem a URL pública `portfolio.goteamgoagency.com`, com caminho de volta (rollback) enquanto a migração não for confirmada.

## 2. Decisão central: como substituir o Supabase

| Opção | O que é | Mudança no código | Risco | Recomendação |
| --- | --- | --- | --- | --- |
| **A. Supabase self-hosted na Hetzner** | Mesmo software do Supabase (Postgres, GoTrue, PostgREST, Storage, imgproxy, Kong, Studio) em Docker no seu servidor | **Quase nenhuma**: só URLs e chaves no `.env` | Baixo/médio — você passa a cuidar de backup, atualização e segurança | ✅ **Recomendada** |
| B. Postgres "puro" na Hetzner + reescrever auth e storage | Trocar `supabase-js` por outro auth (ex.: Better Auth/Lucia), outro storage (S3 da Hetzner), reescrever RLS para checagens no servidor | **Muito grande** (todas as telas, `auth.uid()` em dezenas de policies/RPCs, upload, convites) | Alto — semanas de trabalho e regressões | ❌ Não agora |
| C. Só o app na Hetzner, banco continua no Supabase Cloud | Metade da migração | Pequena | Baixo | Possível como **fase 1** se quiser ir por etapas |

O código usa Supabase em todo lugar: RLS com `auth.uid()`/`public.is_agency_admin()`, `auth.admin.*`, Storage e `render/image`. Por isso a opção **A** é a única que migra "o app inteiro" sem reescrever o produto.

## 3. Arquitetura alvo (recomendada)

```
                    DNS (goteamgoagency.com)
      portfolio.goteamgoagency.com      api.goteamgoagency.com
                 │                               │
          ┌──────▼───────────── Hetzner Cloud ───▼──────────────┐
          │  Caddy/Traefik (HTTPS automático, Let's Encrypt)     │
          │   ├─ app  (Node 22 rodando .output/server/index.mjs) │
          │   └─ Supabase self-hosted (docker compose)           │
          │        kong · auth · rest · storage · imgproxy ·     │
          │        postgres (com pg_cron/pg_net/vault) · studio  │
          │  Volume Hetzner (dados do Postgres e do Storage)     │
          └──────────────────────────────────────────────────────┘
                 │ backups diários
          Hetzner Storage Box / Object Storage (fora do servidor)
```

- **Servidor:** 1 × **CPX31** (4 vCPU, 8 GB RAM) ou **CCX23** (dedicado, mais estável). A stack completa do Supabase pede ~4 GB, e o app Node ~0,5 GB; 8 GB dá folga. Cerca de €15–30/mês, contra Supabase Pro (US$25) + Vercel Pro (US$20) mais excedentes.
- **Região:** **Ashburn (EUA)**, porque coaches nos EUA são o público do catálogo e a latência a partir do Brasil é aceitável (~120 ms). Alternativa: Falkenstein/Nuremberg (UE), mais barata em tráfego e mais longe dos dois públicos. Nos EUA o tráfego incluso é menor (~1 TB/mês); como vídeos ficam no YouTube, deve bastar.
- **Gerenciador:** **Coolify** (painel open source instalado no próprio servidor): deploy por `git push` parecido com a Vercel, HTTPS automático, template oficial de Supabase e agendamento de backups. Alternativa sem painel: `docker compose` manual + Caddy. Mais simples de auditar, mas toda operação fica na linha de comando.
- **Volume separado** para `/var/lib/postgresql` e para os arquivos do Storage, para não perder dados se o servidor for recriado.

## 4. O que muda no código (só após aprovação)

Todas as mudanças são pequenas. **Nenhuma** mexe em `package.json` ou `bun.lock` (Regra 6/7).

1. **`vite.config.ts`**: o preset do Nitro passa a ser `node-server` quando `NITRO_PRESET=node-server` (padrão continua `vercel` até o corte, para a Vercel não quebrar durante a transição). Saída: `.output/server/index.mjs`, executado com `node`.
2. **`Dockerfile` + `.dockerignore`** (novos): build com a imagem `oven/bun:1.3.14` (`bun install --frozen-lockfile` → `bun run build`), runtime `node:22-slim` executando `.output`. Usuário sem root, `HEALTHCHECK`.
3. **`deploy/hetzner/`** (novo): `docker-compose.app.yml`, exemplo de `Caddyfile`, `.env.production.example` com **todas** as variáveis (lista na seção 6), scripts:
   - `backup-db.sh` (pg_dump diário + retenção, envio para Storage Box);
   - `migrate-storage.sh` (cópia dos 4 buckets via API S3, com `rclone`);
   - `verify-migration.sql` (somente leitura: contagens de linhas por tabela, `auth.users`, `storage.objects`, extensões, jobs do cron).
4. **Migration `0034_rewrite_storage_urls.sql`** (idempotente, com pré-checagem e `verify-0034.sql`): troca o host antigo (`https://<projeto>.supabase.co`) pelo novo (`https://api.goteamgoagency.com`) nas colunas de URL que guardam links do Storage (`photo_url`, `avatar_url`, `cover_url`, `logo_url`, `hero_background_url`, `thumbnail_url`, `source_url`, `recipient_photo_url` etc.). O SQL será montado a partir de uma busca real no schema, não de suposição.
5. **`src/lib/email/resend-webhook.server.ts`**: nenhuma mudança obrigatória. Sem `VERCEL_ENV`, a regra `NODE_ENV=production` já falha fechado se faltar `RESEND_WEBHOOK_SECRET`. Um teste vai cobrir explicitamente esse cenário "fora da Vercel".
6. **CI**: o workflow continua validando (lint/typecheck/test/build). Um passo opcional de build da imagem Docker garante que o `node-server` compila.
7. **Vercel Analytics** (`<Analytics />` de `@vercel/analytics` em `src/routes/__root.tsx`): fora da Vercel o script tenta `/_vercel/insights` e não coleta nada. GA4, Clarity e Meta Pixel continuam funcionando. Proposta: renderizar `<Analytics />` só quando o build for para a Vercel. A dependência fica no `package.json`; removê-la seria mudança de dependência e exige pedido humano (Regra 7.2).
8. **Depois do corte confirmado** (tarefa separada): remover `vercel.json`, trocar o preset padrão para `node-server`, retirar `<Analytics />` e renomear o workflow.
9. **Docs:** `docs/hetzner/RUNBOOK.md` (passo a passo da seção 5), `CERNE.md` e `BACKLOGER.md`.

## 5. Passo a passo da migração (operação humana guiada)

> Tudo que envolve sua conta Hetzner, DNS, Supabase Cloud, Vercel e segredos é executado **por você**. Eu não tenho acesso a esses painéis. Eu entrego scripts, comandos prontos e checklists, e acompanho cada etapa com você.

### Fase 0 — Preparação (sem impacto em produção)
1. Criar conta/projeto na Hetzner Cloud; adicionar sua **chave SSH**.
2. **Resolver a TASK-116 primeiro:** confirmar se as migrations `0033a–f` já foram aplicadas no Supabase atual, já que o código delas está na `main`. Migrar um banco em estado intermediário multiplica o risco.
3. Baixar o TTL do DNS de `portfolio.goteamgoagency.com` para 300 s com 48 h de antecedência.
4. Inventário no Supabase Cloud: versão do Postgres (o self-hosted deve ser **igual ou maior**), extensões ativas, configurações de Auth (Site URL, Redirect URLs, templates de e-mail de convite/reset, SMTP) e tamanho do Storage.

### Fase 1 — Servidor
5. Criar o servidor (Ubuntu 24.04, CPX31/CCX23, região escolhida) + **Volume** + **Cloud Firewall**: entrada só 80/443 para todos e 22 só para o seu IP. **5432 nunca exposto.**
6. Endurecimento: login só por chave, `unattended-upgrades`, `fail2ban`, usuário sem root.
7. Instalar Docker e Coolify (ou docker compose + Caddy).

### Fase 2 — Supabase self-hosted
8. Subir a stack oficial (`supabase/docker`) e **trocar todos os segredos padrão** do `.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME/PASSWORD`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`.
9. Configurar Auth: `SITE_URL=https://portfolio.goteamgoagency.com`, `ADDITIONAL_REDIRECT_URLS` com `/auth/accept-invite` e `/reset-password`, **SMTP pelo Resend** (`smtp.resend.com:465`, usuário `resend`, senha = API key) e templates de convite/reset copiados do Cloud. `DISABLE_SIGNUP=true`, porque só a agência cria contas.
10. Storage com `ENABLE_IMAGE_TRANSFORMATION=true` (imgproxy), para o `render/image` continuar funcionando.
11. Expor só a Kong em `https://api.goteamgoagency.com`. O **Studio** fica protegido (senha + só o seu IP, ou acesso por túnel SSH).
12. Habilitar `pg_cron`, `pg_net` e `supabase_vault` (já vêm na imagem `supabase/postgres`).

### Fase 3 — Ensaio geral (sem desligar nada)
13. Dump do Cloud (método oficial do Supabase): `supabase db dump --role-only`, depois `supabase db dump` (schema) e `supabase db dump --data-only --use-copy`, incluindo `auth` e `storage`. As senhas dos usuários migram junto, porque os hashes ficam em `auth.users`.
14. Restaurar no servidor novo e rodar `verify-migration.sql`: contagens iguais tabela a tabela.
15. Copiar os arquivos dos 4 buckets com `migrate-storage.sh` (S3 do Cloud → S3 do self-hosted) e conferir quantidade e tamanho.
16. Aplicar `0034` (URLs) + `verify-0034.sql`.
17. Subir o app (imagem Docker) apontando para o Supabase novo, num subdomínio de teste (ex.: `novo.goteamgoagency.com`). Testar: login admin, login atleta, convite, reset de senha, upload/visualização de foto e documento, catálogo público, perfil `/athlete/<slug>`, imagens otimizadas, proposta + PDF e mailer em **dry run**.

### Fase 4 — Corte (janela de manutenção, ~1–2 h)
18. Pausar o mailer (nenhuma campanha `running`) e avisar a equipe para não editar nada.
19. Dump **final** do Cloud → restaurar → copiar arquivos novos (sincronização incremental) → `0034` → verify.
20. Variáveis definitivas no app (seção 6) e Vault (`mailer_tick_url`, `mailer_cron_secret`) → aplicar `0032` → `verify-0033`.
21. **Trocar o DNS** de `portfolio.goteamgoagency.com` para o IP da Hetzner. O endpoint de webhook da Resend continua o mesmo, porque o domínio não muda.
22. Repetir os testes da Fase 3 no domínio real e mais um teste de **webhook da Resend** (evento de teste no painel).
23. Todo mundo faz login de novo. É esperado: o `JWT_SECRET` muda, então as sessões antigas caem. As senhas continuam valendo.

### Fase 5 — Pós-corte
24. **Backups:** pg_dump diário fora do servidor (Storage Box) com retenção de 14 dias + backup dos arquivos do Storage + snapshot semanal do servidor. **Testar uma restauração** antes de dar por concluído.
25. Monitoramento: uptime externo (ex.: UptimeRobot) em `/` e `api.../auth/v1/health`, além de alerta de disco.
26. **Manter Supabase Cloud e Vercel ligados por 14–30 dias** (somente leitura, sem uso) como rollback. **Atenção:** e-mails já enviados têm imagens apontando para `*.supabase.co`; ao desligar o projeto Cloud, essas imagens antigas somem. Decida o prazo sabendo disso.
27. Desligar Vercel/Supabase Cloud e fazer a limpeza de código (item 8 da seção 4).

## 6. Variáveis de ambiente do app na Hetzner

`NODE_ENV=production`, `PORT=3000`, `APP_URL=https://portfolio.goteamgoagency.com`, `SUPABASE_URL` / `VITE_SUPABASE_URL=https://api.goteamgoagency.com`, `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` = `ANON_KEY` novo, `SUPABASE_SECRET_KEY` (e `SUPABASE_SERVICE_ROLE_KEY`) = `SERVICE_ROLE_KEY` novo, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `MAILER_*` (os mesmos de hoje; `MAILER_TICK_BUDGET_MS` pode subir, porque deixa de existir o limite de duração de função da Vercel), `MAILER_UNSUBSCRIBE_SECRET`, `MAILER_WORKER_SECRET`, `MAILER_CRON_ENABLED`, `MAILER_CRON_SECRET`, `VITE_MAX_*_SIZE_MB`, `VITE_AGENCY_CONTACT_EMAIL`.

As `VITE_*` são embutidas **no build**, então a imagem precisa ser construída já com os valores novos.

## 7. Riscos e cuidados

| Risco | Mitigação |
| --- | --- |
| Perda de dados no corte | Ensaio completo antes; dump final em janela parada; verify com contagens; Cloud intacto para rollback |
| Servidor único = ponto único de falha | Backups externos testados + snapshot; aceitar ~minutos de indisponibilidade em falha. Alta disponibilidade (2 servidores) fica para depois, se necessário |
| Você passa a ser o "time de infraestrutura" (atualizações, segurança) | Coolify + `unattended-upgrades` + runbook; atualização do Supabase self-hosted a cada 1–3 meses |
| Convites/reset param de chegar | SMTP pelo Resend configurado e testado na Fase 3 |
| Imagens quebradas | `0034` reescreve URLs; imgproxy ligado; teste visual no catálogo |
| Mailer duplicar/perder envios no corte | Nenhuma campanha `running` durante o corte; idempotência por lote da v2 se mantém |
| LGPD (dados de atletas, possivelmente menores) | Hetzner oferece DPA (contrato de processamento de dados): aceitar no painel; criptografia em trânsito (HTTPS) e Postgres fechado |
| Lovable | O editor Lovable continua sincronizando o Git; o preview dele não usa a Hetzner. Ninguém deve usar Lovable Cloud (regra do README) |

## 8. Validação

- Código: portão da Regra 7 completo (Bun 1.3.14, frozen lockfile, `git diff` limpo em `package.json`/`bun.lock`, `bun run validate`) + build da imagem Docker com preset `node-server` + smoke test local (`node .output/server/index.mjs` respondendo `/`).
- Dados: `verify-migration.sql` (contagens Cloud × Hetzner), `verify-0034.sql`, `verify-0033.sql`.
- Funcional: checklist da Fase 3 (passo 17) executado duas vezes, no ensaio e após o corte.

## 9. Decisões pendentes do solicitante

1. **Estratégia do banco:** A (Supabase self-hosted, recomendada), B (reescrever) ou C (só o app agora)?
2. **Gerenciamento:** Coolify (recomendado) ou docker compose manual?
3. **Região:** Ashburn/EUA (recomendada) ou Alemanha/Finlândia?
4. **Subdomínio da API:** `api.goteamgoagency.com` está bom?
5. **Rollback:** por quantos dias manter Supabase Cloud/Vercel ligados após o corte (sugestão: 30)?
6. **Estado da TASK-116 em produção:** as migrations 0033a–f já foram aplicadas no Supabase atual?

## 10. Status da aprovação humana e resultado

- 2026-11-10 17:42 — plano registrado e apresentado. **Aguardando aprovação explícita** para a etapa de código (seção 4). As etapas operacionais (seção 5) são executadas pelo solicitante, com acompanhamento.
- 2026-11-13 — Kauan: "Vamos começar, me guie etapa por etapa". **Plano aprovado** para execução guiada, etapa por etapa. As decisões da seção 9 não foram respondidas individualmente; seguem as **recomendações** (A: Supabase self-hosted; Coolify; Ashburn; `api.goteamgoagency.com`; 30 dias de rollback) até o solicitante dizer o contrário. O estado da TASK-116 em produção será conferido na Etapa 1. O código da seção 4 entra antes da Fase 3 (ensaio), depois que as decisões de servidor estiverem confirmadas.
- Etapa 1 (Fase 0 — preparação, sem impacto em produção) entregue ao solicitante: inventário somente leitura no Supabase Cloud (query única), conferência da 0033, TTL do DNS, conta Hetzner, chave SSH e DPA.

### Resultado da Etapa 1 (2026-11-13) e ajustes do plano

- Inventário (somente leitura, enviado pelo solicitante): PostgreSQL **17.6**; banco **214 MB**; **2** usuários em `auth.users`; extensões `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` 0.3.1, `pg_cron` 1.6.4, `pg_net` 0.20.4; Storage: `athlete-media` 20 arquivos / 11 MB, `documents` 1 arquivo / 174 kB; **0033 aplicada**; 0 campanhas `running`.
- DNS na **Cloudflare**, TTL 5 min. SMTP do Auth já é o **Resend** (reaproveitar as mesmas configurações no self-hosted). Conta Hetzner verificada.
- **Pendência TASK-116 resolvida:** 0033 aplicada em produção. Falta saber se a 0032 (job do cron) foi aplicada; isso é conferido no início da Etapa 2. Após o corte, o job do cron no Supabase **Cloud** precisa ser desativado, para não ficar disparando ticks.
- **Ajustes decorrentes:**
  - O Supabase self-hosted deve usar a imagem **`supabase/postgres` 17.x**. Restaurar dump do 17 num Postgres 15 falha.
  - Volume de dados pequeno: o dump/restore é rápido e os arquivos podem ser copiados com script simples. Sem **Volume** separado no início; a proteção vem do **Hetzner Backups** (snapshots diários automáticos) + pg_dump diário externo. Isso simplifica o uso com Coolify.
  - Servidor mantido em **CPX31** (8 GB), por causa da memória da stack completa do Supabase, não do tamanho dos dados.
  - O solicitante **não usa Windows**: a chave SSH passa a ser gerada no macOS/Linux, ou por app (Termius) no celular/tablet. Coolify instalado via **cloud-init** na criação do servidor, sem precisar de terminal.
