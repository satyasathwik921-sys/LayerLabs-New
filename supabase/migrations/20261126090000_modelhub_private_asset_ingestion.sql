-- Cloud-first ModelHub draft ingestion. This migration is intentionally not applied by automation.
-- Apply only to the Supabase project used by the LayerLabs preview after verifying the project ref.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'modelhub-assets',
  'modelhub-assets',
  false,
  209715200,
  array[
    'application/octet-stream',
    'application/zip',
    'model/stl',
    'model/3mf',
    'model/obj',
    'model/step',
    'model/iges',
    'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The bucket is private. Only the server-side service role receives access through
-- its privileged Storage API; no anon/authenticated object policies are created.

create or replace function public.modelhub_upsert_draft(p_product jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_catalog jsonb;
  v_products jsonb;
  v_product_id text;
  v_modelhub_id text;
  v_asset_path text;
  v_license text;
  v_commercial boolean;
begin
  if jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'Product payload must be a JSON object.';
  end if;

  v_product_id := nullif(p_product ->> 'id', '');
  v_modelhub_id := nullif(p_product ->> 'modelhubModelId', '');
  v_asset_path := nullif(p_product #>> '{modelAsset,path}', '');
  v_license := coalesce(p_product ->> 'licenseCode', 'UNKNOWN');
  v_commercial := coalesce((p_product ->> 'commercialAllowed')::boolean, false);

  if v_product_id is null or v_modelhub_id is null then
    raise exception 'Product id and modelhubModelId are required.';
  end if;
  if p_product ->> 'status' <> 'draft' then
    raise exception 'ModelHub ingestion may create drafts only.';
  end if;
  if v_asset_path is null or v_asset_path not like ('modelhub/' || v_modelhub_id || '/%') then
    raise exception 'Model asset must be stored under its ModelHub model namespace.';
  end if;
  if coalesce(p_product #>> '{modelAsset,bucket}', '') <> 'modelhub-assets' then
    raise exception 'Model asset bucket is invalid.';
  end if;
  if not v_commercial or v_license not in ('CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT') then
    raise exception 'Only explicitly verified commercial-use licences may enter the draft catalogue.';
  end if;
  if nullif(p_product ->> 'licenseVerifiedAt', '') is null then
    raise exception 'A verified licence timestamp is required.';
  end if;

  select catalog into v_catalog
  from public.store_catalog
  where id = 1
  for update;

  if v_catalog is null then
    raise exception 'The shared LayerLabs catalogue row (id=1) is missing.';
  end if;

  v_products := coalesce(v_catalog -> 'products', '[]'::jsonb);
  if jsonb_typeof(v_products) is distinct from 'array' then
    raise exception 'The shared catalogue products field is not an array.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_products) as item
    where item ->> 'id' = v_product_id
       or item ->> 'modelhubModelId' = v_modelhub_id
  ) then
    select coalesce(
      jsonb_agg(
        case
          when item ->> 'id' = v_product_id or item ->> 'modelhubModelId' = v_modelhub_id
          then p_product
          else item
        end
      ),
      '[]'::jsonb
    ) into v_products
    from jsonb_array_elements(v_products) as item;
  else
    v_products := v_products || jsonb_build_array(p_product);
  end if;

  v_catalog := jsonb_set(v_catalog, '{products}', v_products, true);
  update public.store_catalog set catalog = v_catalog where id = 1;
  return p_product;
end;
$$;

revoke all on function public.modelhub_upsert_draft(jsonb) from public, anon, authenticated;
grant execute on function public.modelhub_upsert_draft(jsonb) to service_role;
