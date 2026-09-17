# Planejamento Técnico — Unificação de Disparo Multi-Atleta, Filtros Avançados, Sinais de Interesse e Descadastro em Dois Níveis

**Data:** 2026-09-17 11:10  
**Status:** [PROPOSTO - AGUARDANDO APROVAÇÃO HUMANA]  
**Autor:** Antigravity AI / Gemini Coding Agent  
**Contexto:** Task Mailer Feature (3 frentes: disparo multi-atleta unificado em 1 e-mail, filtros de destinatário por HBCU/Budget/TOEFL, e sistema de feedback de interesse com validade de 6 meses + descadastro em dois níveis).

---

## 1. Visão Geral e Objetivos

O módulo de Mailer para prospecção esportiva universitária da **Go Team Go Agency** precisa de três melhorias estruturais fundamentais:

1. **Frente 1 — Disparo Multi-Atleta Unificado em E-mail Único:**
   - No modo "Multi-atleta (Em lote)", ao selecionar $N$ atletas e $M$ coaches, atualmente o sistema gerava $N \times M$ disparos individuais.
   - O novo comportamento deve agrupar as atletas selecionadas e disparar **1 único e-mail por coach** ($M$ disparos no total), contendo os cartões de todas as atletas selecionadas empilhados verticalmente no mesmo padrão visual elegante dos e-mails individuais.

2. **Frente 2 — Filtros de Destinatários na Seleção do Mailer:**
   - Adicionar os filtros baseados nas colunas existentes da entidade Universidade (`universities` — migration `0018`):
     - **HBCU:** Todos / Somente HBCU / Sem HBCU (`is_hbcu`)
     - **Budget Level:** Todos / `0–1000` / `1000–5000` / `5000–10000` / `10000+` (`budget_level`)
     - **TOEFL Level:** Todos / `0` / `0–61` / `61+` (`toefl_level`)
   - Esses filtros devem se combinar via operador lógico `AND` com os filtros existentes (Busca textual, Estado e Liga).
   - O botão "Marcar Visíveis" / "Desmarcar Visíveis" deve selecionar estritamente os coaches visíveis resultantes da combinação de todos os filtros.

3. **Frente 3 — Sistema de "Sinal de Interesse" e Descadastro em Dois Níveis:**
   - **3a) Link e Página Pública de Feedback de Interesse (`/feedback` ou `/interests`):**
     - Inserir no rodapé de todo e-mail de recrutamento um link claro para feedback: *"Not interested in this? Provide feedback"* (com parâmetros `email`, `coachId`, `athleteId`, `position`).
     - Criação da rota pública `/feedback` com formulário de escolha única entre as 4 opções fixas:
       1. `position_not_needed`: *"I don't need athletes in this position"*
       2. `fully_recruited`: *"I've already filled all the spots I needed"*
       3. `other_positions_only`: *"I'm only interested in other positions"*
       4. `specific_athlete_dislike`: *"I'm not interested in this specific athlete"*
     - Persistência na nova tabela `coach_interest_signals` com validade de 6 meses (`expires_at = now() + interval '6 months'`).
   - **3b) Sinais Visuais no Mailer:**
     - Identificar coaches com sinais ativos (não expirados) e exibir badges contextuais:
       - `fully_recruited` $\rightarrow$ Badge **"Already Full"**
       - `position_not_needed` $\rightarrow$ Badge **"Not interested in [Position]"** (quando coincide com a posição da atleta selecionada)
       - `specific_athlete_dislike` $\rightarrow$ Badge **"Not interested in [Athlete Name]"** (quando a atleta em questão está selecionada)
       - `other_positions_only` $\rightarrow$ Badge informativo
     - Adicionar controle de filtro: *"Ocultar coaches com sinais ativos"*.
   - **3c) Descadastro em Dois Níveis (`/unsubscribe`):**
     - Nível 1: **"Pause for now (6 months)"** $\rightarrow$ Bloqueio temporário de todos os disparos com expiração automática em 6 meses (`expires_at = now() + interval '6 months'`).
     - Nível 2: **"Unsubscribe permanently"** $\rightarrow$ Bloqueio definitivo na suppression list (`expires_at is null`).
     - Todas as funções de disparo (individual, multi-atleta ou catálogo) devem consultar a lista de supressão ativa considerando as datas de expiração.

---

## 2. Modelagem do Banco de Dados (Supabase SQL)

Será criada a migration `db/migrations/0020_interest_signals_and_suppression_levels.sql`:

```sql
-- 1. Tabela de Sinais de Interesse dos Coaches
create table if not exists public.coach_interest_signals (
  id uuid primary key default gen_random_uuid(),
  coach_id text,
  coach_email text not null,
  reason text not null check (reason in ('position_not_needed', 'fully_recruited', 'other_positions_only', 'specific_athlete_dislike')),
  athlete_id uuid references public.athletes(id) on delete set null,
  athlete_name text,
  position text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '6 months')
);

-- Índices para buscas rápidas por e-mail e expiração
create index if not exists idx_coach_interest_signals_email on public.coach_interest_signals (lower(trim(coach_email)));
create index if not exists idx_coach_interest_signals_expires on public.coach_interest_signals (expires_at);
create index if not exists idx_coach_interest_signals_athlete on public.coach_interest_signals (athlete_id);

-- 2. Evolução da Tabela de Supressão para Suportar Bloqueio Temporário (6 meses) vs Permanente
alter table public.email_suppressions add column if not exists suppression_type text not null default 'permanent' check (suppression_type in ('temporary_6m', 'permanent'));
alter table public.email_suppressions add column if not exists expires_at timestamptz;

-- Atualizar registros existentes se necessário
update public.email_suppressions set suppression_type = 'permanent' where suppression_type is null;

-- 3. RLS Policies
alter table public.coach_interest_signals enable row level security;

-- Agency Admin possui controle e leitura total sobre sinais de interesse
drop policy if exists "Agency admin full access on coach_interest_signals" on public.coach_interest_signals;
create policy "Agency admin full access on coach_interest_signals"
  on public.coach_interest_signals for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- Acesso anônimo/público para inserir sinais via página de feedback
drop policy if exists "Public can insert coach_interest_signals" on public.coach_interest_signals;
create policy "Public can insert coach_interest_signals"
  on public.coach_interest_signals for insert
  to anon
  with check (true);
```

---

## 3. Arquitetura de Templates de E-mail

### 3.1 Template de E-mail Multi-Atleta (`renderMultiAthleteRecruitEmail`)
- Criar a função `renderMultiAthleteRecruitEmail(data: MultiAthleteEmailData)` em `src/lib/email/recruit-email-template.ts`.
- Estrutura:
  - **Header:** Go Team Go Official Recruiting Showcase — Multi-Athlete Spotlight.
  - **Saudação:** "Dear Coach," com texto introdutório destacando a seleção de $N$ atletas internacionais.
  - **Cards Empilhados:** Para cada atleta selecionada, renderizar o card individual com foto/avatar, nome, esporte, posição, citação em itálico, grid 2x2 de estatísticas (Altura, Nacionalidade, Graduação, Status/GPA) e botão individual "View Full Profile & Highlights $\rightarrow$".
  - **Rodapé:** Assinatura institucional, link de **"Provide recruiting feedback / Not interested in this?"** (com link apontando para `/feedback`) e link de **"Unsubscribe"** (apontando para `/unsubscribe`).

### 3.2 Atualização do Rodapé em Todos os Templates
- No `renderRecruitEmail` (individual), no `renderMultiAthleteRecruitEmail` e no `renderCatalogEmail`, o rodapé incluirá:
  ```html
  <div style="font-size:10px;color:#4b6353;margin-top:12px;border-top:1px solid #e3e9dc;padding-top:12px;line-height:1.6;">
    Not interested in this position or roster full? 
    <a href="${feedbackUrl}" style="color:#084323;font-weight:700;text-decoration:underline;">Let us know here</a>.
    <br>
    If you wish to stop receiving recruit messages, you can 
    <a href="${unsubscribeUrl}" style="color:#4b6353;text-decoration:underline;">manage email preferences</a>.
  </div>
  ```

---

## 4. Arquitetura de Backend e Server Functions

### 4.1 Modificações em `src/lib/email/recruit-email.server.ts`
1. **Lógica de Envio Multi-Atleta Unificado:**
   - Quando `mode === "multi_athlete"`, carregar os dados de todas as atletas em `athleteIds`.
   - Para cada coach em `activeRecipients`, montar 1 única mensagem chamando `renderMultiAthleteRecruitEmail` e disparar 1 único e-mail no Amazon SES.
   - Gravar log em `recruit_email_logs` com `email_type: "athlete_teaser_multi"`.
2. **Atualização do `getSuppressedEmailSet`:**
   - Modificar a query para:
     ```ts
     const { data } = await admin
       .from("email_suppressions")
       .select("email, expires_at");
     // Filtrar apenas se expires_at for nulo (permanente) OU se expires_at > now() (temporário ativo)
     ```
3. **Atualização do `unsubscribeEmailAddress`:**
   - Aceitar parâmetro `type: "temporary_6m" | "permanent"`.
   - Se `temporary_6m`, calcular `expires_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()`.
4. **Novas Funções de Sinais de Interesse:**
   - `recordInterestSignal(signal: CoachInterestSignalInput)`: Grava na tabela `coach_interest_signals`.
   - `getActiveCoachInterestSignals()`: Carrega todos os registros onde `expires_at > now()`.

### 4.2 Novas Server Functions em `src/lib/email/recruit-email.functions.ts`
- `submitInterestSignalServerFn`: Função pública para registrar sinais vindo de `/feedback`.
- `getActiveInterestSignalsServerFn`: Função protegida (`requireAgency`) para alimentar os badges do Mailer.
- Atualização da `unsubscribeServerFn` para receber `type: "temporary_6m" | "permanent"`.

---

## 5. Arquitetura de Frontend e Telas

### 5.1 Nova Rota Pública `/feedback` (`src/routes/feedback.tsx`)
- Recebe query params: `email`, `coachId`, `athleteId`, `position`.
- UI limpa, mobile-first, no tema escuro da agência.
- Exibe o e-mail do destinatário e, quando disponível, a atleta/posição referenciada.
- Permite escolher uma das 4 opções:
  - *"I don't need athletes in this position"* (captura `position` automaticamente se disponível ou permite preencher).
  - *"I've already filled all the spots I needed"*
  - *"I'm only interested in other positions"*
  - *"I'm not interested in this specific athlete"* (captura `athlete_id`).
- Ao submeter, exibe mensagem clara: *"Thank you Coach. Your preferences have been registered for the next 6 months. We will calibrate our future outreach accordingly."*

### 5.2 Evolução da Rota `/unsubscribe` (`src/routes/unsubscribe.tsx`)
- Apresenta claramente duas opções selecionáveis:
  1. **Pause Communications for 6 Months (Recommended)**: Pausa temporária automática.
  2. **Unsubscribe Permanently**: Bloqueio definitivo na lista de supressão.
- Exibe explicitamente o e-mail que está sendo afetado.

### 5.3 Evolução do Mailer (`src/routes/_authenticated/admin/mailer.tsx`)
1. **Filtros Adicionais de Destinatários:**
   - Select de **HBCU**: *Todos / Somente HBCU / Sem HBCU*
   - Select de **Budget**: *Todos / $0–$1,000 / $1,000–$5,000 / $5,000–$10,000 / $10,000+*
   - Select de **TOEFL**: *Todos / 0 / 0–61 / 61+*
   - Filtro toggle/checkbox: *"Ocultar coaches com sinais de interesse ativos"*
2. **Badges de Sinais de Interesse:**
   - Consultar sinais ativos via `getActiveInterestSignalsServerFn`.
   - Comparar cada coach com o contexto da seleção atual:
     - Se coach tem `fully_recruited` ativo $\rightarrow$ Badge âmbar/vermelho `Already Full (6m)`.
     - Se coach tem `position_not_needed` para a mesma posição da(s) atleta(s) selecionada(s) $\rightarrow$ Badge `Not seeking [Position]`.
     - Se coach tem `specific_athlete_dislike` para alguma atleta selecionada $\rightarrow$ Badge `Not interested in [Athlete]`.
3. **Cálculo Correto do Total de E-mails:**
   - No modo `multi`, o total de e-mails passa a ser exatamente o número de destinatários ativos selecionados (`activeSelectedRecipients.length`), e não mais a multiplicação por atletas!
4. **Preview Dinâmico Multi-Atleta:**
   - O preview WYSIWYG renderiza o e-mail real empilhado com todas as atletas selecionadas.

---

## 6. Plano de Execução Passo a Passo

1. **Migration SQL (`0020`):** Criar `db/migrations/0020_interest_signals_and_suppression_levels.sql` e atualizar tipos em `src/types/db.ts`.
2. **Templates de E-mail:** Implementar `renderMultiAthleteRecruitEmail` e atualizar links de feedback em `src/lib/email/recruit-email-template.ts` e `recruit-email-catalog-template.ts`.
3. **Backend Server & Server Functions:** Atualizar `src/lib/email/recruit-email.server.ts` e `src/lib/email/recruit-email.functions.ts`.
4. **Página Pública de Feedback:** Criar `src/routes/feedback.tsx`.
5. **Página de Unsubscribe:** Atualizar `src/routes/unsubscribe.tsx` com os dois níveis.
6. **Tela do Mailer:** Atualizar `src/routes/_authenticated/admin/mailer.tsx` com novos filtros, badges de sinal, e unificação de disparo multi-atleta.
7. **Testes e Validações:** Executar testes unitários e linter.
8. **Documentação Viva:** Atualizar `CERNE.md` e registrar a entrega em `BACKLOGER.md`.

---

## 7. Solicitação de Aprovação

Solicito a aprovação humana deste plano técnico para dar início imediato à implementação do código conforme as diretrizes do projeto.
