-- TASK-070: Migration para Sinais de Interesse dos Coaches e Descadastro em 2 Níveis

-- 1. Tabela de Sinais de Interesse dos Treinadores / Coaches
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

-- Índices de consulta rápida
create index if not exists idx_coach_interest_signals_email on public.coach_interest_signals (lower(trim(coach_email)));
create index if not exists idx_coach_interest_signals_expires on public.coach_interest_signals (expires_at);
create index if not exists idx_coach_interest_signals_athlete on public.coach_interest_signals (athlete_id);

-- 2. Evolução da Tabela de Supressão para Suportar Bloqueio Temporário (6 meses) vs Permanente
alter table public.email_suppressions add column if not exists suppression_type text not null default 'permanent' check (suppression_type in ('temporary_6m', 'permanent'));
alter table public.email_suppressions add column if not exists expires_at timestamptz;

-- Atualizar registros legados se houverem
update public.email_suppressions set suppression_type = 'permanent' where suppression_type is null;

-- 3. RLS Policies
alter table public.coach_interest_signals enable row level security;

-- Agency Admin possui controle total sobre coach_interest_signals
drop policy if exists "Agency admin full access on coach_interest_signals" on public.coach_interest_signals;
create policy "Agency admin full access on coach_interest_signals"
  on public.coach_interest_signals for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- Permitir inserção anônima em coach_interest_signals via rota pública de feedback
drop policy if exists "Public can insert coach_interest_signals" on public.coach_interest_signals;
create policy "Public can insert coach_interest_signals"
  on public.coach_interest_signals for insert
  to anon
  with check (true);
