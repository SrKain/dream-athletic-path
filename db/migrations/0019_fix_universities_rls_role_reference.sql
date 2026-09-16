-- TASK-063: Hotfix de RLS para universities e email_suppressions
-- Substitui a consulta inválida a profiles.role pela função canônica public.is_agency_admin()

drop policy if exists "Agency admin full access on universities" on public.universities;
create policy "Agency admin full access on universities"
  on public.universities for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop policy if exists "Agency admin full access on email_suppressions" on public.email_suppressions;
create policy "Agency admin full access on email_suppressions"
  on public.email_suppressions for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());
