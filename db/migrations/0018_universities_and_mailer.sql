-- TASK-062: Migration para Universidades, Mailer e Suppression List (Unsubscribe)

-- 1. Tabela estruturada de Universidades com sub-registros em JSONB
create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  league text check (league is null or league in ('NJCAA D1', 'NJCAA D2', 'NCAA D1', 'NCAA D2', 'NAIA')),
  source_url text,
  is_hbcu boolean not null default false,
  budget_level text check (budget_level is null or budget_level in ('0–1000', '1000–5000', '5000–10000', '10000+')),
  toefl_level text check (toefl_level is null or toefl_level in ('0', '0–61', '61+')),
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

-- Adicionar colunas adicionais para auditoria independente
alter table public.recruit_email_logs add column if not exists email_type text not null default 'athlete_teaser';
alter table public.recruit_email_logs add column if not exists recipient_email text;
alter table public.recruit_email_logs add column if not exists recipient_name text;
alter table public.recruit_email_logs add column if not exists university_name text;

-- 4. Migração de dados legados da tabela coaches para universities (se houverem registros)
do $$
declare
  r record;
  u_id uuid;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'coaches') then
    for r in select * from public.coaches loop
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

-- Agency Admin possui controle total sobre universities
drop policy if exists "Agency admin full access on universities" on public.universities;
create policy "Agency admin full access on universities"
  on public.universities for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));

-- Agency Admin possui controle total sobre suppression list
drop policy if exists "Agency admin full access on email_suppressions" on public.email_suppressions;
create policy "Agency admin full access on email_suppressions"
  on public.email_suppressions for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));

-- Permitir inserção anônima em email_suppressions via rota pública de unsubscribe
drop policy if exists "Public can insert into email_suppressions" on public.email_suppressions;
create policy "Public can insert into email_suppressions"
  on public.email_suppressions for insert
  to anon
  with check (true);
