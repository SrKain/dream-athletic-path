# Planejamento — TASK-062: Migração do Mailer para Aba Dedicada + Cadastro Estruturado de Universidades

**Data:** 2026-09-09 13:00  
**Status:** [AGUARDANDO APROVAÇÃO HUMANA]  
**Autor:** Antigravity / Gemini Agent  
**Solicitante:** Kauan (Usuário Humano)  
**Governança:** AI Governance (Regras 1 a 5 de `AGENTS.md` e `README.md`)

---

## 1. Contexto & Objetivo Geral

A funcionalidade de "Recruit Email" (criada na TASK-058) permitia o envio de e-mails em lote exclusivamente a partir da página individual de cada atleta (`/admin/athletes/$id`), utilizando uma tabela rasa de `coaches` (`id`, `name`, `email`, `institution`) e a tabela de auditoria `recruit_email_logs`.

Esta tarefa tem como objetivos centrais:

1. **Migrar e desacoplar o Mailer**: transformar a funcionalidade em uma nova aba dedicada de primeira classe no menu administrativo (`/admin/mailer`), ao lado de Atletas e Universidades.
2. **Suportar 3 Modos de Envio no Mailer**:
   - **Multi-atleta**: seleção em lote de múltiplos atletas + seleção de destinatários (coaches), disparando o teaser individual correspondente de cada atleta.
   - **Atleta específico**: fluxo focado em um atleta individual pré ou pós-selecionado, com preview WYSIWYG completo e histórico de envios anteriores.
   - **Catálogo/Home genérico**: disparo institucional focado no elenco completo da agência com CTA direcionando para a home pública do portfólio (`portfolio.goteamgoagency.com`), sem vínculo com atleta individual.
3. **Evoluir o Modelo de Dados (Coaches → Universidades)**:
   - Substituir a entidade isolada `coaches` por uma entidade rica e estruturada `universities`, onde os coaches tornam-se sub-registros (múltiplos coaches por universidade).
   - Campos de `universities`:
     - `name` (texto, obrigatório)
     - `city` (texto, obrigatório)
     - `state` (select dos 50 estados dos EUA + DC, obrigatório)
     - `league` (select: `NJCAA D1`, `NJCAA D2`, `NCAA D1`, `NCAA D2`, `NAIA`, opcional)
     - `source_url` (URL de referência/fonte, opcional)
     - `is_hbcu` (boolean, default `false`, opcional)
     - `budget_level` (select fechado: `0–1000`, `1000–5000`, `5000–10000`, `10000+`, opcional)
     - `toefl_level` (select fechado: `0`, `0–61`, `61+`, opcional)
     - `coaches` (array estruturado de sub-registros: `id`, `first_name`, `last_name`, `email`)
     - `history` (array estruturado de sub-registros: `id`, `date`, `event`)
4. **Substituir UI de Coaches por Universidades**:
   - Atualizar a rota administrativa `/admin/coaches` para `/admin/universities` (mantendo redirecionamento ou compatibilidade caso necessário).
   - Implementar listagem rica com busca e filtros multifacetados (estado, liga, HBCU, budget, TOEFL).
   - Implementar formulário/drawer de CRUD manual completo com adição dinâmica de coaches e eventos de histórico.
   - Adaptar o importador de planilhas CSV/XLSX para o novo mapeamento de colunas.
5. **Implementar Suppression List & Fluxo de Descadastro (Unsubscribe)**:
   - Todo e-mail (teaser ou catálogo) deve incluir rodapé com link de descadastro obrigatório.
   - Criação da tabela `email_suppressions` indexada por e-mail (case-insensitive).
   - Rota pública `/unsubscribe` para confirmação amigável do descadastro.
   - Motor de envio do backend deve consultar a suppression list antes de qualquer disparo, pulando contatos bloqueados e registrando como `suppressed` no log de auditoria.
6. **Desacoplamento do Perfil do Atleta**:
   - Remover o botão "Send to Coaches" de `/admin/athletes/$id.tsx`, substituindo-o por link/atalho contextual intuitivo "Abrir no Mailer", que direciona o admin para `/admin/mailer?mode=single&athleteId=...`.

---

## 2. Modelo de Dados & Migração SQL

### 2.1 Nova Migration: `db/migrations/0018_universities_and_mailer.sql`

```sql
-- 1. Tabela estruturada de Universidades
create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  league text check (league in ('NJCAA D1', 'NJCAA D2', 'NCAA D1', 'NCAA D2', 'NAIA')),
  source_url text,
  is_hbcu boolean not null default false,
  budget_level text check (budget_level in ('0–1000', '1000–5000', '5000–10000', '10000+')),
  toefl_level text check (toefl_level in ('0', '0–61', '61+')),
  coaches jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Índices de consulta rápida
create index if not exists idx_universities_name on public.universities (name);
create index if not exists idx_universities_state on public.universities (state);
create index if not exists idx_universities_league on public.universities (league);

-- 2. Tabela de Descadastros (Suppression List)
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text default 'user_unsubscribed',
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_email_suppressions_email_lower
  on public.email_suppressions (lower(trim(email)));

-- 3. Evolução da tabela recruit_email_logs
-- Permitir envio de catálogo genérico (athlete_id nullable) e desvincular FK rígida de coach_id antigo
alter table public.recruit_email_logs alter column athlete_id drop not null;
alter table public.recruit_email_logs drop constraint if exists recruit_email_logs_coach_id_fkey;

-- Adicionar metadados adicionais para auditoria independente
alter table public.recruit_email_logs add column if not exists email_type text not null default 'athlete_teaser';
alter table public.recruit_email_logs add column if not exists recipient_email text;
alter table public.recruit_email_logs add column if not exists recipient_name text;
alter table public.recruit_email_logs add column if not exists university_name text;

-- 4. Migração de dados legados da tabela coaches para universities (se houverem)
do $$
declare
  r record;
  u_id uuid;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'coaches') then
    for r in select * from public.coaches loop
      -- Agrupar ou criar universidade baseada no institution
      select id into u_id from public.universities where lower(trim(name)) = lower(trim(coalesce(r.institution, 'Unspecified Institution'))) limit 1;
      if u_id is null then
        insert into public.universities (name, city, state, coaches)
        values (
          coalesce(r.institution, 'Unspecified Institution'),
          'Unknown',
          'CA',
          jsonb_build_array(jsonb_build_object(
            'id', r.id::text,
            'first_name', split_part(r.name, ' ', 1),
            'last_name', substr(r.name, length(split_part(r.name, ' ', 1)) + 2),
            'email', r.email
          ))
        ) returning id into u_id;
      else
        update public.universities
        set coaches = coaches || jsonb_build_object(
          'id', r.id::text,
          'first_name', split_part(r.name, ' ', 1),
          'last_name', substr(r.name, length(split_part(r.name, ' ', 1)) + 2),
          'email', r.email
        )
        where id = u_id;
      end if;
    end loop;
  end if;
end $$;

-- 5. RLS Policies
alter table public.universities enable row level security;
alter table public.email_suppressions enable row level security;

-- Agency Admin possui controle total sobre universidades
create policy "Agency admin full access on universities"
  on public.universities for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));

-- Agency Admin possui controle total sobre suppression list
create policy "Agency admin full access on email_suppressions"
  on public.email_suppressions for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));

-- Permitir inserção anônima em email_suppressions via rota pública de unsubscribe
create policy "Public can insert into email_suppressions"
  on public.email_suppressions for insert
  to anon
  with check (true);
```

---

## 3. Arquitetura do Mailer & Templates de E-mail

### 3.1 Templates de E-mail (`src/lib/email/`)

- `recruit-email-template.ts`: atualização do template teaser individual para incluir link obrigatório de descadastro no rodapé (`https://portfolio.goteamgoagency.com/unsubscribe?email=...`), mantendo estética Dark/Emerald Premium.
- `recruit-email-catalog-template.ts` (NOVO): template de e-mail institucional apresentando a agência Go Team Go e o catálogo geral de atletas internacionais, com:
  - Header oficial "Go Team Go • International Scouting Showcase".
  - Chamada editorial destacando a qualidade e elegância dos atletas recrutados.
  - Grade/Destaques de modalidades esportivas (Soccer, Basketball, Tennis, Track & Field, etc.).
  - CTA proeminente "Explore Full Athlete Roster & Highlights →" apontando para a home pública.
  - Rodapé com endereço institucional e link de descadastro direto.

### 3.2 Descadastro & Suppression List (`/unsubscribe`)

- Rota pública: `src/routes/unsubscribe.tsx`.
- Lê o parâmetro de query `?email=...`.
- Apresenta card minimalista e elegante Dark/Emerald confirmando o pedido de exclusão da lista de envios da agência.
- Ao submeter, chama server function protegida que insere em `email_suppressions` (evitando duplicidades).
- Exibe feedback imediato: _"Your email has been successfully unsubscribed. You will no longer receive recruitment showcases from Go Team Go."_

### 3.3 Motor de Disparo Backend (`recruit-email.server.ts`)

- Unifica os envios em uma função modular robusta:
  - Busca e-mails na tabela `email_suppressions`.
  - Filtra e ignora automaticamente qualquer destinatário que conste na suppression list, incrementando contador de `totalSuppressed` e salvando log com `status: 'suppressed'`.
  - Processa os lotes via Resend Batch API (limite de 100 e-mails por chamada).
  - Suporta os 3 modos:
    1. **Multi-atleta**: gera e envia o template individual para cada combinação de atleta selecionado e coach selecionado.
    2. **Atleta específico**: gera e envia o template com dados completos do atleta alvo para os coaches selecionados.
    3. **Catálogo genérico**: gera e envia o template de catálogo institucional para os coaches selecionados (sem `athlete_id`).
  - Grava logs de auditoria detalhados em `recruit_email_logs`.

---

## 4. Design & Estrutura de Telas (UI/UX)

### 4.1 Navegação no Admin (`src/components/app-shell.tsx`)

- Atualizar lista de links:
  - `{ to: "/admin/athletes", label: "Atletas", icon: Users }`
  - `{ to: "/admin/universities", label: "Universidades", icon: Building2 }` (substituindo `/admin/coaches`)
  - `{ to: "/admin/mailer", label: "Mailer", icon: Mail }` (NOVO)
  - Seguido de Pipeline, Documentos, Propostas, Notificações, Visual e Configurações.

### 4.2 Tela de Universidades (`src/routes/_authenticated/admin/universities.tsx`)

- **Visualização**: tabela responsiva com paginação e busca por nome, cidade, estado, liga.
- **Filtros rápidos**: Estado (dropdown dos 50 estados + DC), Liga (NJCAA D1/D2, NCAA D1/D2, NAIA), HBCU (Sim/Não), Budget Level, TOEFL Level.
- **Drawer/Modal de Criação e Edição**:
  - Dados Básicos: Nome, Cidade, Estado (select oficial).
  - Classificação: Liga, Link Fonte, Flag HBCU.
  - Requisitos: Budget Level (dropdown fechado: `0–1000`, `1000–5000`, `5000–10000`, `10000+`), TOEFL Level (dropdown fechado: `0`, `0–61`, `61+`).
  - **Coaches (Sub-registro)**: lista reativa com adição/edição/remoção em linha de Nome, Sobrenome e E-mail.
  - **Histórico (Sub-registro)**: timeline com adição de data e descrição de acontecimento/contato com a universidade.
- **Importador CSV/XLSX**:
  - Modal de importação adaptado para o novo schema (suportando mapeamento de colunas de universidade e coach).
  - Processamento inteligente com feedback de progresso e relatório de erros/sucessos.

### 4.3 Nova Tela do Mailer (`src/routes/_authenticated/admin/mailer.tsx`)

- **Seletor de Modo**:
  1. `Multi-atleta` (Disparo individual em lote de múltiplos atletas)
  2. `Atleta específico` (Disparo focado em um atleta individual com preview ao vivo)
  3. `Catálogo institucional` (Disparo da agência/home geral para coaches)
- **Painel de Destinatários**:
  - Árvore/Lista de Universidades e Coaches com busca unificada (por universidade, estado, liga, nome de coach, e-mail).
  - Seleção por universidade inteira (seleciona todos os coaches da instituição) ou seleção granular de coach individual.
  - Indicador visual claro de coaches já contatados anteriormente ou bloqueados por descadastro (`Suppressed`).
- **Painel de Preview (WYSIWYG)**:
  - Exibe o e-mail exato que o destinatário receberá (iframe seguro com HTML renderizado).
- **Barra de Ação & Envio**:
  - Contador dinâmico: _"X coaches selecionados em Y universidades"_.
  - Modal de confirmação seguro antes de iniciar o disparo em lote.
  - Relatório ao vivo com status de envio via toast da Sonner e barra de progresso.
- **Aba de Histórico**:
  - Tabela com histórico completo de disparos (`recruit_email_logs`), status (`sent`, `failed`, `suppressed`), data e tipo.

### 4.4 Perfil do Atleta (`src/routes/_authenticated/admin/athletes/$id.tsx`)

- Remover o modal antigo e o botão solto "Send to Coaches".
- Adicionar atalho sutil e elegante no menu de ações do perfil:
  - Botão com ícone `Mail`: "Abrir no Mailer", que navega para `/admin/mailer?mode=single&athleteId=${athlete.id}`.

---

## 5. Plano de Execução Sequencial

1. **Aprovação Humana Prévia**: aguardar confirmação explícita do usuário.
2. **Banco de Dados**: criar e registrar migration `0018_universities_and_mailer.sql`.
3. **Tipos TypeScript**: atualizar `src/types/db.ts` com interfaces `University`, `UniversityCoach`, `UniversityHistoryEntry`, `EmailSuppression`, e campos atualizados de `RecruitEmailLog`.
4. **Templates & Servidor de E-mail**:
   - Atualizar `recruit-email-template.ts` (link de unsubscribe).
   - Criar `recruit-email-catalog-template.ts`.
   - Implementar servidor `recruit-email.server.ts` com suporte à suppression list e aos 3 modos de envio.
   - Atualizar server functions em `recruit-email.functions.ts`.
5. **Fluxo de Descadastro Público**: criar rota `src/routes/unsubscribe.tsx` com server function de gravação em `email_suppressions`.
6. **UI de Universidades**:
   - Criar rota `src/routes/_authenticated/admin/universities.tsx`.
   - Atualizar/substituir o importador e drawer de edição.
   - Atualizar navegação em `src/components/app-shell.tsx`.
7. **UI do Mailer**:
   - Criar rota `src/routes/_authenticated/admin/mailer.tsx` com suporte aos modos Multi-atleta, Atleta específico e Catálogo.
8. **Refatoração no Perfil do Atleta**:
   - Remover botão antigo em `admin/athletes/$id.tsx` e adicionar link de redirecionamento contextual para o Mailer.
9. **Testes & Validação Técnica**:
   - Executar `npm run typecheck`, `npm run lint`, `npm run test` e `compile_applet`.
10. **Documentação Viva**:

- Atualizar `CERNE.md` com a nova arquitetura de Universidades, Mailer e Suppression List.
- Atualizar `BACKLOGER.md` marcando a tarefa TASK-062 como `[CONCLUÍDO]`.

---

## 6. Próximo Passo

Aguardar aprovação humana deste plano para iniciar a implementação do código.
