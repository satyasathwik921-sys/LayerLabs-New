-- Live LayerLabs manual-UPI order storage.
-- Customer submissions are restricted to pending manual-UPI orders; only admins can list or update them.

create table public.store_orders (
  id uuid not null default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  shipping_cost numeric not null default 0,
  total_amount numeric not null default 0,
  payment_method text not null default 'MANUAL_UPI',
  upi_reference_number text,
  payment_screenshot_path text,
  status text not null default 'PAYMENT_PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  discount_code_applied text,
  payment_screenshot_name text,
  verified_at timestamptz,
  verified_by text,
  rejection_reason text,
  courier_name text,
  fulfillment_method text,
  tracking_number text,
  tracking_url text,
  cancellation_reason text,
  delivery_option_id text,
  delivery_option_name text,
  refund_status text not null default 'NOT_REQUESTED',
  refund_note text,
  constraint store_orders_pkey primary key (id),
  constraint store_orders_order_number_key unique (order_number),
  constraint store_orders_subtotal_check check (subtotal >= 0),
  constraint store_orders_discount_check check (discount >= 0),
  constraint store_orders_shipping_cost_check check (shipping_cost >= 0),
  constraint store_orders_total_amount_check check (total_amount >= 0),
  constraint store_orders_payment_method_check check (payment_method = 'MANUAL_UPI'),
  constraint store_orders_refund_status_check check (
    refund_status in ('NOT_REQUESTED', 'REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED')
  )
);

create index store_orders_created_at_desc_idx on public.store_orders (created_at desc);
create index store_orders_status_idx on public.store_orders (status);
create index store_orders_order_number_idx on public.store_orders (order_number);

alter table public.store_orders enable row level security;

create policy store_orders_admin_insert on public.store_orders
  for insert to authenticated with check (public.is_layerlabs_admin());
create policy store_orders_admin_select on public.store_orders
  for select to authenticated using (public.is_layerlabs_admin());
create policy store_orders_admin_update on public.store_orders
  for update to authenticated using (public.is_layerlabs_admin())
  with check (public.is_layerlabs_admin());

create policy store_orders_public_create on public.store_orders
  for insert to anon with check (
    status = 'PAYMENT_PENDING'
    and payment_method = 'MANUAL_UPI'
    and length(trim(order_number)) between 10 and 80
    and length(trim(customer_name)) between 2 and 120
    and length(trim(customer_email)) between 5 and 254
    and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) between 10 and 15
    and jsonb_typeof(shipping_address) = 'object'
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 40
    and subtotal between 0 and 10000000
    and discount between 0 and subtotal
    and shipping_cost between 0 and 1000000
    and total_amount between 0 and 10000000
    and upi_reference_number ~ '^[A-Za-z0-9]{8,22}$'
  );

-- Required for customer order tracking. The secret order number and matching checkout email
-- are both required. Keep the fixed empty search_path and schema-qualify the table.
create or replace function public.lookup_store_order(p_order_number text, p_customer_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
begin
  if length(trim(coalesce(p_order_number, ''))) not between 10 and 80
     or length(trim(coalesce(p_customer_email, ''))) not between 5 and 254 then
    return null;
  end if;

  select jsonb_build_object(
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'customer_email', o.customer_email,
    'customer_phone', o.customer_phone,
    'shipping_address', o.shipping_address,
    'items', o.items,
    'subtotal', o.subtotal,
    'discount', o.discount,
    'discount_code_applied', o.discount_code_applied,
    'shipping_cost', o.shipping_cost,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'upi_reference_number', o.upi_reference_number,
    'payment_screenshot_name', o.payment_screenshot_name,
    'status', o.status,
    'created_at', o.created_at,
    'verified_at', o.verified_at,
    'verified_by', o.verified_by,
    'rejection_reason', o.rejection_reason,
    'courier_name', o.courier_name,
    'fulfillment_method', o.fulfillment_method,
    'tracking_number', o.tracking_number,
    'tracking_url', o.tracking_url,
    'cancellation_reason', o.cancellation_reason,
    'delivery_option_id', o.delivery_option_id,
    'delivery_option_name', o.delivery_option_name,
    'refund_status', o.refund_status,
    'refund_note', o.refund_note
  )
  into result
  from public.store_orders as o
  where o.order_number = trim(p_order_number)
    and lower(o.customer_email) = lower(trim(p_customer_email))
  limit 1;

  return result;
end;
$function$;

revoke all on function public.lookup_store_order(text, text) from public;
grant execute on function public.lookup_store_order(text, text) to anon, authenticated;

revoke all privileges on table public.store_orders from public, anon, authenticated;
grant insert on table public.store_orders to anon;
grant select, insert, update on table public.store_orders to authenticated;
grant all privileges on table public.store_orders to service_role;

notify pgrst, 'reload schema';
