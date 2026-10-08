# Planejamento — TASK-087: Métricas de Abertura e Clique do Mailer: Captura Confiável, Atribuição Correta e Relatórios Acionáveis

- **Data/Hora:** 2026-10-08 04:04 UTC (2026-10-07 21:04 Local)
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Status:** `[APROVADO COM AJUSTES E EM EXECUÇÃO]`
- **Tarefa Associada:** `TASK-087` no `BACKLOGER.md`

---

## 1. Contexto e Diagnóstico dos 9 Problemas Confirmados

O provedor de e-mail oficial é o **Resend** (`POST /api/webhooks/resend`). A plataforma já conta com a tabela `email_events` (migration `0021`), o serviço `src/lib/email/mailer-metrics.server.ts`, o componente `src/components/mailer-metrics-dashboard.tsx` e a aba `Metrics` em `/admin/mailer`. Contudo, para que os números de **abertura** e **clique** sejam 100% confiáveis, sem misturar campanhas, sem truncamento de linhas e sem estourar o egress do Supabase (~3.500 coaches), os 9 problemas abaixo serão corrigidos de ponta a ponta:

1. **`resend-webhook.server.ts` ignora erro do banco:** O `upsert` em `email_events` não checa `{ error }` (o `supabase-js` não lança exceção em falhas SQL/HTTP). **Correção:** Checar `error` em todas as operações de banco do webhook, logar com `console.error` e retornar status HTTP `500` em caso de falha de persistência para que o Resend/Svix reenvie o evento automaticamente.
2. **`verifyResendWebhookSignature` permissivo em produção:** Quando `RESEND_WEBHOOK_SECRET` não está configurado, a função retorna `true` incondicionalmente. **Correção:** Em produção (`process.env.VERCEL_ENV === "production"` ou `process.env.NODE_ENV === "production"` quando `VERCEL_ENV` não for `preview`/`development`), falhar fechado (`false` -> HTTP `401` + `console.error`). Manter modo permissivo apenas em `development` e `test`.
3. **Descarte de `data.tags` e persistência excessiva de `data.click` (privacidade):** O webhook descarta `data.tags` e salva o objeto `data.click` bruto (que pode conter `ipAddress`). **Correção:** Extrair e normalizar `data.tags` (suportando tanto array `[{ name, value }]` quanto record `{ [key]: value }`), extrair de `data.click` apenas `{ link, timestamp, userAgent }` (removendo `ipAddress` tanto das colunas quanto do `payload` sanitizado em JSONB) e popular as colunas indexadas `campaign_id`, `athlete_id`, `clicked_url`, `clicked_at`, `user_agent` e `is_probable_automated`.
4. **Eventos adicionais do Resend não tratados:** **Correção:** Tratar explicitamente `email.failed`, `email.suppressed` e `email.delivery_delayed`, além de aceitar qualquer evento desconhecido futuro gravando-o em `email_events` sem quebrar a execução nem a tipagem.
5. **Conceito incorreto de `delivered` em `mailer-metrics.server.ts`:** Hoje `delivered` soma logs com `status = 'sent'` (apenas aceito pela API). **Correção:** `sent` = e-mails aceitos pela API (`recruit_email_logs` com `status = 'sent'`); `delivered` = contagem distinta de `provider_email_id` com evento `email.delivered` (com fallback seguro para e-mails que já possuem evento de `opened`/`clicked` caso o webhook `delivered` tenha chegado fora de ordem).
6. **Atribuição incorreta de campanha por e-mail do destinatário:** `mailer-metrics.server.ts` filtrava eventos com `providerIds.has(...) || recipientEmails.has(...)`, misturando aberturas/cliques de outras campanhas enviadas para o mesmo coach. **Correção:** Atribuir eventos a campanhas **somente** por `campaign_id` (via tag/coluna) ou `provider_email_id` (join direto `email_events.provider_email_id = recruit_email_logs.provider_id`). Nunca atribuir campanha por `recipient_email`.
7. **Truncamento de linhas (`.limit(200)` e `.select("*")` sujeito ao teto de 1.000 linhas do PostgREST) e risco de egress:** **Correção:** Eliminar `.select("*")` e `.limit(200)` no Node. Criar funções RPC SQL no PostgreSQL em `snake_case` minúsculo (`public.get_mailer_filter_options` e `public.get_mailer_dashboard_metrics`), com `language plpgsql`, `security definer`, `set search_path = public`, `REVOKE EXECUTE ON FUNCTION ... FROM public, anon, authenticated; GRANT EXECUTE ... TO service_role;` (sem `is_agency_admin()` dentro das RPCs, pois o servidor chama via `getAdminClient()` onde `auth.uid()` é nulo e o controle de acesso já é garantido por `requireAgency` nas server functions).
8. **Taxas calculadas com contagens brutas (podendo ultrapassar 100%):** **Correção:** Calcular todas as taxas primárias (`deliveryRate`, `uniqueOpenRate`, `uniqueClickRate`, `clickToOpenRate`, `bounceRate`) sobre contagens **únicas** por envio (`provider_email_id`), limitadas ao teto de `100%` (`Math.min(100, ...)`), mantendo contagens brutas (`totalOpens`, `totalClicks`) apenas como dado secundário.
9. **`recruit-email.server.ts` sem `tags`, sem registro de campanha, truncando multi-atleta no log e ignorando erro de insert:** **Correção:**
   - Criar registro em `mailer_campaigns` antes de cada disparo tanto em `sendMailerEmails` quanto na função legada `sendRecruitEmailToCoaches` (singular).
   - Passar `tags` sanitizadas (`campaign_id`, `email_type`, e `athlete_id` quando single) tanto em `resend.batch.send` quanto no fallback individual `resend.emails.send`.
   - Salvar `campaign_id` e `athlete_ids` completo (`uuid[]`) em `recruit_email_logs` (mantendo `athlete_id` como o primeiro atleta ou null no catálogo para retrocompatibilidade).
   - Checar `{ error }` em todos os `.insert()` de `recruit_email_logs` e `mailer_campaigns`, logando qualquer falha detalhadamente.

---

## 2. Escopo Detalhado da Implementação (Com Ajustes Aprovados)

### A) Modelo de Campanha, Atribuição e UTMs (`db/migrations/0022_mailer_campaigns_and_metrics_rpc.sql`)

1. **Nova Tabela `public.mailer_campaigns` (Aditiva e Idempotente):**
   - Colunas:
     - `id uuid primary key default gen_random_uuid()`
     - `created_at timestamptz not null default timezone('utc', now())`
     - `created_by uuid references auth.users(id) on delete set null`
     - `mode text not null check (mode in ('single_athlete', 'multi_athlete', 'catalog'))`
     - `subject text not null`
     - `athlete_ids uuid[] not null default '{}'`
     - `recipients_count integer not null default 0`
     - `filters jsonb not null default '{}'::jsonb`
   - RLS ativado com policy `"Agency admin full access on mailer_campaigns"` usando `public.is_agency_admin()`.

2. **Evolução de `public.recruit_email_logs`:**
   - Adicionar `campaign_id uuid references public.mailer_campaigns(id) on delete set null`.
   - Adicionar `athlete_ids uuid[] not null default '{}'`.
   - Índices em `campaign_id`, `provider_id`, `sent_at desc` e `GIN (athlete_ids)`.
   - Backfill idempotente: onde `athlete_ids = '{}'` e `athlete_id is not null`, preencher `athlete_ids = array[athlete_id]`.

3. **Evolução de `public.email_events` e Backfill Estrito:**
   - Remover a `check constraint` restritiva de `event_type` (`alter table public.email_events drop constraint if exists email_events_event_type_check;`), permitindo `email.failed`, `email.suppressed`, `email.delivery_delayed` e eventos futuros desconhecidos sem erro.
   - Adicionar colunas nulláveis:
     - `campaign_id uuid references public.mailer_campaigns(id) on delete set null`
     - `athlete_id uuid references public.athletes(id) on delete set null`
     - `clicked_url text`
     - `clicked_at timestamptz`
     - `user_agent text`
     - `is_probable_automated boolean not null default false`
   - Criar índices em `(campaign_id)`, `(athlete_id)`, `(provider_email_id, event_type)` e `(occurred_at desc)`.
   - **Backfill idempotente em SQL (usando os caminhos reais `payload->'click'` e `payload->>'clicked_link'`):**
     - `clicked_url`: a partir de `coalesce(clicked_url, payload->'click'->>'link', payload->>'clicked_link')` onde `event_type = 'email.clicked'`.
     - `clicked_at`: a partir de `coalesce(clicked_at, nullif(payload->'click'->>'timestamp', '')::timestamptz, occurred_at)` onde `event_type = 'email.clicked'`.
     - `user_agent`: a partir de `coalesce(user_agent, payload->'click'->>'userAgent')`.
     - Remoção de IP: `update public.email_events set payload = payload #- '{click,ipAddress}' where payload->'click' ? 'ipAddress';`.
     - Verificação em SQL obrigatória: `select count(*) as remaining_ip_leaks from public.email_events where payload->'click' ? 'ipAddress';` (deve retornar `0`).
     - Vincular `campaign_id` e `athlete_id` a partir de `recruit_email_logs` via `provider_email_id = recruit_email_logs.provider_id` ou extraindo o slug em `/athlete/<slug>`.

4. **Tags do Resend e Sanitização (`sanitizeResendTagValue`):**
   - Conforme especificação do Resend SDK, nomes e valores de `tags` só permitem caracteres ASCII alfanuméricos, `_` e `-` (`/[^a-zA-Z0-9_-]/g`), com máximo de 256 caracteres.
   - Helper dedicado `buildResendTags({ campaignId, emailType, athleteId })` testado unitariamente, enviando `campaign_id`, `email_type` e (quando aplicável) `athlete_id`.

5. **Instrumentação de Links com UTM nos E-mails (`src/lib/email/recruit-email.ts` e templates):**
   - Helper `appendMailerUtmParams(url, { campaignId, content })`:
     - Aplica `utm_source=gtg_mailer`, `utm_medium=email`, `utm_campaign=<campaignId>` (quando disponível) e `utm_content=<botao>_<slug>` **apenas** em links HTTP(S) que apontam para o domínio do portfólio (`portfolio.goteamgoagency.com` ou `appUrl` configurado) nas ações de engajamento (`watch_film_<slug>`, `full_profile_<slug>`, `view_portfolio_catalog`).
     - **Preservação Estrita:** Links externos do YouTube (`youtube.com`), links `mailto:`, links de `/feedback` e links de `/unsubscribe` permanecem intocados para não quebrar nenhum dos 139 testes existentes nem as regras de compliance.
     - Layout de 680px e paleta `EMAIL_COLORS` permanecem 100% intactos. Regenerar `docs/email-previews/*.html` via `scripts/preview-emails.ts`.

---

### B) Qualidade da Métrica: Detecção de Scanners/Bots e Proxies de Privacidade (`src/lib/email/mailer-metrics-quality.ts`)

1. **Constantes Nomeadas e Exportadas (Testadas Unitariamente):**
   - `FAST_CLICK_THRESHOLD_SECONDS = 10`: Clique ocorrido em $\le 10\text{s}$ após `email.delivered` (ou `email.sent`).
   - `BURST_CLICK_DISTINCT_LINKS_THRESHOLD = 3` e `BURST_CLICK_WINDOW_SECONDS = 5`: $\ge 3$ links distintos clicados em uma janela de $\le 5\text{s}$ para o mesmo `provider_email_id`.
   - `AUTOMATED_SCANNER_USER_AGENT_PATTERNS`: Padrões conhecidos de scanners corporativos/universitários (`.edu`) e headless browsers (`Barracuda`, `Proofpoint`, `Mimecast`, `Safelinks`, `Microsoft Office`, `ATP`, `Symantec`, `FireEye`, `TrendMicro`, `HeadlessChrome`, `PhantomJS`, `python-requests`, `curl/`, `wget/`, `Go-http-client`, `bot`, `crawler`, `spider`, `scanner`, `urlscan`).
   - `PRIVACY_PROXY_USER_AGENT_PATTERNS`: Contém exclusivamente `GoogleImageProxy`, `ggpht.com` e `YahooMailProxy` (SEM o UA genérico do Safari/Mac `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15`). A abertura via _Apple Mail Privacy Protection_ não é detectável de forma confiável por User-Agent e será documentada no tooltip do KPI de abertura como métrica "indicativa".

2. **Separação entre Regra Sem Estado (Ingestão) e Regra de Janela (Consulta RPC):**
   - **Na ingestão (`resend-webhook.server.ts`):** A coluna `email_events.is_probable_automated` guarda apenas as regras sem estado:
     1. Clique $\le 10\text{s}$ após `email.delivered` / `email.sent` do mesmo `provider_email_id`; ou
     2. `user_agent` casando com `AUTOMATED_SCANNER_USER_AGENT_PATTERNS`.
   - **Na consulta (`public.get_mailer_dashboard_metrics` em SQL e função pura equivalente em TS):**
     - A heurística de **burst** ($\ge 3$ links distintos clicados em $\le 5\text{s}$ no mesmo `provider_email_id`) é calculada em tempo de consulta com funções de janela/auto-join temporal sobre os cliques do `provider_email_id`, combinando `e.is_probable_automated OR is_burst_click` para classificar o clique como automatizado.

---

### C) Agregações no Banco de Dados e Relatórios Acionáveis na Aba `Metrics`

1. **Segurança e Assinatura das RPCs SQL (`0022_mailer_campaigns_and_metrics_rpc.sql`):**
   - Nomes em `snake_case` minúsculo:
     - `public.get_mailer_filter_options()`
     - `public.get_mailer_dashboard_metrics(p_days integer, p_campaign_id uuid, p_athlete_id uuid, p_division text)`
   - Ambas declaradas com `language plpgsql security definer set search_path = public`.
   - **Sem `public.is_agency_admin()` dentro das RPCs** (pois o servidor chama via `getAdminClient()` com `service_role`, onde `auth.uid()` é `null`).
   - Permissões estritas:
     ```sql
     revoke execute on function public.get_mailer_filter_options() from public, anon, authenticated;
     grant execute on function public.get_mailer_filter_options() to service_role;

     revoke execute on function public.get_mailer_dashboard_metrics(integer, uuid, uuid, text) from public, anon, authenticated;
     grant execute on function public.get_mailer_dashboard_metrics(integer, uuid, uuid, text) to service_role;
     ```

2. **Interface da Aba `Metrics` (`src/components/mailer-metrics-dashboard.tsx`):**
   - **Divisões Oficiais:** O filtro de divisão importa `LEAGUES` de `src/lib/universities-constants.ts` (`NJCAA D1`, `NJCAA D2`, `NCAA D1`, `NCAA D2`, `NAIA` — sem NCAA D3).
   - **KPIs, Tabelas Acionáveis e Exportação CSV:**
     - KPIs com taxas únicas limitadas a 100%, tooltip de abertura indicativa (explicando Apple MPP e Google Proxy) e destaque para **Human Unique Clicks** e **CTOR**.
     - Tabela de **Engaged Coaches (Hot Leads)** com exportação CSV, **Performance por Atleta**, **Histórico de Campanhas** e **Série Diária + Feed de Eventos**.
