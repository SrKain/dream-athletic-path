-- Migration 0017: Storage Cache-Control update and admin policy hardening
-- Define long-term immutable cache control on public buckets to drastically reduce storage egress

-- 1. Ensure admin update policy exists on athlete-media if not already present
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' 
      and tablename = 'objects' 
      and policyname = 'media_admin_update'
  ) then
    create policy media_admin_update on storage.objects for update to authenticated
      using (bucket_id = 'athlete-media' and public.is_agency_admin());
  end if;
end
$$;

-- 2. Update existing objects in public buckets to long-term immutable cache control
-- This informs CDN (Cloudflare) and browser to cache assets for 1 year (31536000s)
update storage.objects
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{cacheControl}',
  '"max-age=31536000, public, immutable"'
)
where bucket_id in ('athlete-media', 'proposal-assets', 'stage-celebrations');
