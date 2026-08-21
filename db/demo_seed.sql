-- Dados demonstrativos reais para homologação. Execute depois das migrations.
-- Não cria usuários Auth nem credenciais. Idempotente por slug.

insert into public.agencies (name, slug)
values ('Go Team Go', 'go-team-go')
on conflict (slug) do update set name = excluded.name;

insert into public.athletes (
  agency_id, slug, full_name, birth_date, height_cm, weight_kg,
  nationality, sport_id, position_id, is_public, is_featured
)
select a.id, 'marina-alves', 'Marina Alves', '2007-04-12', 184, 72, 'BR',
  s.id, p.id, true, true
from public.agencies a
join public.sports s on s.slug = 'volleyball'
join public.positions p on p.sport_id = s.id and p.name_en = 'Outside Hitter'
where a.slug = 'go-team-go'
on conflict (slug) do update set
  is_public = excluded.is_public,
  is_featured = excluded.is_featured;

insert into public.athletes (
  agency_id, slug, full_name, birth_date, height_cm, weight_kg,
  nationality, sport_id, position_id, is_public, is_featured
)
select a.id, 'gabriel-santos', 'Gabriel Santos', '2006-09-21', 188, 79, 'BR',
  s.id, p.id, true, false
from public.agencies a
join public.sports s on s.slug = 'soccer'
join public.positions p on p.sport_id = s.id and p.name_en = 'Midfielder'
where a.slug = 'go-team-go'
on conflict (slug) do update set is_public = excluded.is_public;

insert into public.athletes (
  agency_id, slug, full_name, email, nationality, sport_id, is_public
)
select a.id, 'luiza-costa', 'Luiza Costa', 'atleta.demo@example.com', 'BR', s.id, false
from public.agencies a
join public.sports s on s.slug = 'basketball'
where a.slug = 'go-team-go'
on conflict (slug) do nothing;

insert into public.athlete_profiles (
  athlete_id, bio_en, graduation_year, gpa, english_level, course_of_interest, stats
)
select id,
  'High-performance outside hitter with offensive power and strong academic discipline.',
  2026, 3.72, 'Advanced', 'Business Administration', '{"Winning Attacks": 312, "Blocks": 84}'::jsonb
from public.athletes where slug = 'marina-alves'
on conflict (athlete_id) do update set bio_en = excluded.bio_en, course_of_interest = excluded.course_of_interest, stats = excluded.stats;

insert into public.athlete_profiles (
  athlete_id, bio_en, graduation_year, gpa, english_level, course_of_interest, stats
)
select id,
  'Midfielder with vision, intensity and national competition experience.',
  2025, 3.45, 'Intermediate', 'Kinesiology', '{"Assists": 18, "Matches": 42}'::jsonb
from public.athletes where slug = 'gabriel-santos'
on conflict (athlete_id) do update set bio_en = excluded.bio_en, course_of_interest = excluded.course_of_interest, stats = excluded.stats;

insert into public.achievements (athlete_id, title_en, achieved_on)
select id, 'State champion', '2025-11-10'
from public.athletes a
where slug = 'marina-alves'
  and not exists (
    select 1 from public.achievements x
    where x.athlete_id = a.id and x.title_en = 'State champion'
  );

insert into public.checklist_items (stage_id, label_en, requires_document, sort_order)
select ps.id, item.label_en, true, item.sort_order
from public.pipeline_stages ps
join public.agencies a on a.id = ps.agency_id and a.slug = 'go-team-go'
join (values
  ('diagnosis', 'Passport', 10),
  ('personal-plan', 'School transcript', 10),
  ('video-exposure', 'Highlight video', 10)
) as item(stage_key, label_en, sort_order) on item.stage_key = ps.key
where not exists (
  select 1 from public.checklist_items ci
  where ci.stage_id = ps.id and ci.label_en = item.label_en
);
