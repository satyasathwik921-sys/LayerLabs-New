-- Shared admin-managed cover image URL used by the LayerLabs site.
create table public.store_site_settings (
  id integer not null,
  cover_image_url text,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  constraint store_site_settings_pkey primary key (id),
  constraint store_site_settings_id_check check (id = 1)
);

alter table public.store_site_settings enable row level security;

create policy store_site_settings_admin_insert on public.store_site_settings
  for insert to authenticated
  with check (
    public.is_layerlabs_admin()
    and updated_by = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy store_site_settings_admin_update on public.store_site_settings
  for update to authenticated
  using (public.is_layerlabs_admin())
  with check (
    public.is_layerlabs_admin()
    and updated_by = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy store_site_settings_public_read on public.store_site_settings
  for select to anon, authenticated using (true);

revoke all privileges on table public.store_site_settings from public, anon, authenticated;
grant select on table public.store_site_settings to anon;
grant select, insert, update on table public.store_site_settings to authenticated;
grant all privileges on table public.store_site_settings to service_role;

notify pgrst, 'reload schema';
