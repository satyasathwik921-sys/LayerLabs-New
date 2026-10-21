-- LayerLabs order security hardening (applied to live Layerlabsnew).
-- Customer inserts are canonicalized from store_catalog, privileged metadata is protected,
-- cancellation and tracking are email-matched, and status changes are durably audited.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists public.store_order_audit_log (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  event_type text not null,
  actor_role text not null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists store_order_audit_log_order_created_idx
  on public.store_order_audit_log (order_number, created_at desc);
alter table public.store_order_audit_log enable row level security;
revoke all privileges on table public.store_order_audit_log from public, anon, authenticated;
grant select on table public.store_order_audit_log to authenticated;
grant all privileges on table public.store_order_audit_log to service_role;
drop policy if exists store_order_audit_log_admin_read on public.store_order_audit_log;
create policy store_order_audit_log_admin_read
  on public.store_order_audit_log for select to authenticated
  using (public.is_layerlabs_admin());

-- Ensure table-level anon insert/select/update are absent. Checkout uses column-level INSERT only.
revoke insert, select, update, delete on table public.store_orders from public, anon;
revoke insert on table public.store_orders from anon;
grant insert (
  order_number, customer_name, customer_email, customer_phone, shipping_address, items,
  subtotal, discount, discount_code_applied, shipping_cost, total_amount, payment_method,
  upi_reference_number, payment_screenshot_name, status, delivery_option_id,
  delivery_option_name, refund_status
) on table public.store_orders to anon;
grant select, insert, update on table public.store_orders to authenticated;
grant all privileges on table public.store_orders to service_role;

alter table public.store_orders enable row level security;
drop policy if exists store_orders_public_create on public.store_orders;
create policy store_orders_public_create on public.store_orders for insert to anon
  with check (
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
drop policy if exists store_orders_admin_select on public.store_orders;
create policy store_orders_admin_select on public.store_orders
  for select to authenticated using (public.is_layerlabs_admin());
drop policy if exists store_orders_admin_insert on public.store_orders;
create policy store_orders_admin_insert on public.store_orders
  for insert to authenticated with check (public.is_layerlabs_admin());
drop policy if exists store_orders_admin_update on public.store_orders;
create policy store_orders_admin_update on public.store_orders
  for update to authenticated using (public.is_layerlabs_admin())
  with check (public.is_layerlabs_admin());

alter table public.store_orders drop constraint if exists store_orders_discount_not_over_subtotal;
alter table public.store_orders add constraint store_orders_discount_not_over_subtotal
  check (discount >= 0 and discount <= subtotal) not valid;
alter table public.store_orders validate constraint store_orders_discount_not_over_subtotal;
alter table public.store_orders drop constraint if exists store_orders_total_matches_parts;
alter table public.store_orders add constraint store_orders_total_matches_parts
  check (total_amount = greatest(0, subtotal - discount) + shipping_cost) not valid;
alter table public.store_orders validate constraint store_orders_total_matches_parts;

create unique index if not exists store_orders_upi_reference_number_unique
on public.store_orders (
  upper(regexp_replace(btrim(upi_reference_number), '[[:space:]]+', '', 'g'))
)
where upi_reference_number is not null and btrim(upi_reference_number) <> '';

CREATE OR REPLACE FUNCTION private.prepare_public_store_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_catalog jsonb;
  v_shipping_options jsonb;
  v_item jsonb;
  v_product jsonb;
  v_clean_item jsonb;
  v_clean_items jsonb := '[]'::jsonb;
  v_requested jsonb := '{}'::jsonb;
  v_product_id text;
  v_selected_color text;
  v_selected_material text;
  v_coupon text;
  v_quantity integer;
  v_prior_quantity integer;
  v_reserved_quantity integer;
  v_stock integer;
  v_product_is_digital boolean := false;
  v_base_price numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_shipping numeric := 0;
  v_total numeric := 0;
  v_has_physical boolean := false;
  v_shipping_option jsonb;
  v_promo jsonb;
  v_discount_type text;
  v_target_type text;
  v_minimum numeric := 0;
  v_discount_value numeric := 0;
  v_max_discount numeric;
  v_customer_coupon_count integer := 0;
  v_per_customer_limit integer;
  v_usage_limit integer := 0;
  v_coupon_order_count integer := 0;
  v_has_previous_verified_order boolean := false;
  v_free_shipping_enabled boolean := false;
  v_free_shipping_threshold numeric := 0;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    ''
  );

  -- Trusted admin/service writes may record historical orders. Anonymous checkout is normalized.
  if v_role <> 'anon' then
    return new;
  end if;

  if new.order_number !~ '^ORD-[0-9A-Z]+-[0-9A-Z]{4}$' then
    raise exception 'Invalid order reference format.';
  end if;
  if length(btrim(coalesce(new.customer_name, ''))) not between 2 and 120 then
    raise exception 'Enter a valid customer name.';
  end if;
  if length(btrim(coalesce(new.customer_email, ''))) not between 5 and 254
     or btrim(new.customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid checkout email.';
  end if;
  if length(regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g')) not between 10 and 15 then
    raise exception 'Enter a valid contact number.';
  end if;
  if coalesce(new.upi_reference_number, '') !~ '^[A-Za-z0-9]{8,22}$' then
    raise exception 'Enter a valid UPI transaction reference.';
  end if;
  if jsonb_typeof(new.shipping_address) is distinct from 'object' then
    raise exception 'A valid shipping or collection address is required.';
  end if;
  if jsonb_typeof(new.items) is distinct from 'array'
     or jsonb_array_length(new.items) not between 1 and 40 then
    raise exception 'The order must contain between 1 and 40 line items.';
  end if;

  -- Serializes anonymous checkouts so concurrent orders cannot both consume the same remaining stock.
  select c.catalog into v_catalog
  from public.store_catalog as c
  where c.id = 1
  for update;

  if v_catalog is null or jsonb_typeof(v_catalog -> 'products') is distinct from 'array' then
    raise exception 'The published catalogue is unavailable. Please try again later.';
  end if;

  for v_item in select value from jsonb_array_elements(new.items)
  loop
    if jsonb_typeof(v_item -> 'product') is distinct from 'object' then
      raise exception 'An order item is missing its product reference.';
    end if;
    v_product_id := nullif(v_item -> 'product' ->> 'id', '');
    if v_product_id is null then
      raise exception 'An order item is missing its product ID.';
    end if;
    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Each product quantity must be a whole number.';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Product quantities must be between 1 and 99.';
    end if;

    select p.product into v_product
    from jsonb_array_elements(v_catalog -> 'products') as p(product)
    where p.product ->> 'id' = v_product_id
    limit 1;

    if v_product is null or coalesce(v_product ->> 'status', 'published') <> 'published' then
      raise exception 'A product in your bag is no longer available. Refresh the catalogue and try again.';
    end if;

    -- Preserve only variant selections that the published product explicitly offers.
    v_selected_color := nullif(btrim(coalesce(v_item ->> 'selectedColor', '')), '');
    if v_selected_color is not null and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_product #> '{variants,colors}', '[]'::jsonb)) as color(value)
      where color.value = v_selected_color
    ) then
      raise exception 'The selected color for % is no longer available.', v_product ->> 'name';
    end if;

    v_selected_material := nullif(btrim(coalesce(v_item ->> 'selectedMaterial', '')), '');
    if v_selected_material is not null and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_product #> '{variants,materials}', '[]'::jsonb)) as material(value)
      where material.value = v_selected_material
    ) then
      raise exception 'The selected material for % is no longer available.', v_product ->> 'name';
    end if;

    v_product_is_digital := (
      coalesce((v_product ->> 'isDigital')::boolean, false)
      or lower(coalesce(v_product ->> 'productType', '')) in ('digital', 'digital-model', 'digital-download')
    );

    if not v_product_is_digital then
      if coalesce(v_product ->> 'stock', '') !~ '^[0-9]+$' then
        raise exception 'Inventory is not configured for one of the selected products.';
      end if;
      v_stock := (v_product ->> 'stock')::integer;
      v_prior_quantity := coalesce((v_requested ->> v_product_id)::integer, 0);

      select coalesce(sum((i.item ->> 'quantity')::integer), 0)::integer
        into v_reserved_quantity
      from public.store_orders as o
      cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as i(item)
      where (
          o.status in ('PAYMENT_VERIFIED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED')
          or (o.status in ('NEW', 'PAYMENT_PENDING') and o.created_at > now() - interval '24 hours')
        )
        and i.item #>> '{product,id}' = v_product_id
        and coalesce(i.item ->> 'quantity', '') ~ '^[0-9]{1,3}$';

      if v_stock <= 0 or v_reserved_quantity + v_prior_quantity + v_quantity > v_stock then
        raise exception 'There is not enough stock for %; please reduce the quantity.', v_product ->> 'name';
      end if;
      v_requested := jsonb_set(v_requested, array[v_product_id], to_jsonb(v_prior_quantity + v_quantity), true);
    end if;

    if coalesce(v_product ->> 'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'The published price for a selected product is invalid.';
    end if;
    v_base_price := (v_product ->> 'price')::numeric;
    if nullif(v_product ->> 'salePrice', '') is not null then
      if (v_product ->> 'salePrice') !~ '^[0-9]+([.][0-9]{1,2})?$' then
        raise exception 'The published sale price for a selected product is invalid.';
      end if;
      v_unit_price := (v_product ->> 'salePrice')::numeric;
    else
      v_unit_price := v_base_price;
    end if;
    if v_unit_price < 0 or v_unit_price > v_base_price then
      raise exception 'The published sale price for a selected product is invalid.';
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    if not v_product_is_digital then
      v_has_physical := true;
    end if;

    v_clean_item := jsonb_build_object('product', v_product, 'quantity', v_quantity);
    if nullif(btrim(coalesce(v_item ->> 'id', '')), '') is not null then
      v_clean_item := v_clean_item || jsonb_build_object('id', left(btrim(v_item ->> 'id'), 128));
    end if;
    if v_selected_color is not null then
      v_clean_item := v_clean_item || jsonb_build_object('selectedColor', v_selected_color);
    end if;
    if v_selected_material is not null then
      v_clean_item := v_clean_item || jsonb_build_object('selectedMaterial', v_selected_material);
    end if;
    v_clean_items := v_clean_items || jsonb_build_array(v_clean_item);
  end loop;

  new.items := v_clean_items;
  new.subtotal := v_subtotal;
  new.payment_method := 'MANUAL_UPI';
  new.status := 'PAYMENT_PENDING';
  new.refund_status := 'NOT_REQUESTED';
  new.created_at := now();
  new.updated_at := now();
  new.verified_at := null;
  new.verified_by := null;
  new.rejection_reason := null;
  new.courier_name := null;
  new.fulfillment_method := null;
  new.tracking_number := null;
  new.tracking_url := null;
  new.cancellation_reason := null;
  new.refund_note := null;
  new.payment_screenshot_path := null;
  new.customer_name := btrim(new.customer_name);
  new.customer_email := lower(btrim(new.customer_email));
  new.customer_phone := btrim(new.customer_phone);
  new.upi_reference_number := btrim(new.upi_reference_number);
  new.payment_screenshot_name := nullif(left(coalesce(new.payment_screenshot_name, ''), 180), '');

  if not v_has_physical then
    new.delivery_option_id := 'digital';
    new.delivery_option_name := 'Digital fulfillment';
    v_shipping := 0;
  else
    v_shipping_options := v_catalog #> '{shippingSettings,options}';
    select o.option into v_shipping_option
    from jsonb_array_elements(coalesce(v_shipping_options, '[]'::jsonb)) as o(option)
    where o.option ->> 'id' = coalesce(new.delivery_option_id, '')
      and coalesce((o.option ->> 'enabled')::boolean, false)
    limit 1;

    if v_shipping_option is null then
      raise exception 'The selected delivery option is unavailable. Refresh checkout and choose another option.';
    end if;
    if coalesce(v_shipping_option ->> 'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'The published price for the selected delivery option is invalid.';
    end if;

    new.delivery_option_id := v_shipping_option ->> 'id';
    new.delivery_option_name := coalesce(v_shipping_option ->> 'name', 'Delivery');
    v_shipping := (v_shipping_option ->> 'price')::numeric;

    v_free_shipping_enabled := coalesce((v_catalog #>> '{shippingSettings,freeShippingEnabled}')::boolean, false);
    v_free_shipping_threshold := coalesce(nullif(v_catalog #>> '{shippingSettings,freeShippingThreshold}', '')::numeric, 0);
    if v_free_shipping_enabled and v_free_shipping_threshold > 0 and v_subtotal >= v_free_shipping_threshold then
      v_shipping := 0;
    end if;
  end if;

  v_coupon := upper(btrim(coalesce(new.discount_code_applied, '')));
  if v_coupon = '' then
    new.discount_code_applied := null;
    v_discount := 0;
  else
    select p.promo into v_promo
    from jsonb_array_elements(coalesce(v_catalog -> 'promotions', '[]'::jsonb)) as p(promo)
    where upper(coalesce(p.promo ->> 'code', '')) = v_coupon
      and coalesce((p.promo ->> 'isActive')::boolean, false)
    limit 1;
    if v_promo is null then
      raise exception 'This coupon is not active. Remove it and retry checkout.';
    end if;

    v_minimum := coalesce(nullif(v_promo ->> 'minOrderSubtotal', '')::numeric, 0);
    if v_subtotal < v_minimum then
      raise exception 'This coupon requires a product subtotal of at least ₹%.', v_minimum;
    end if;

    v_usage_limit := coalesce(nullif(v_promo ->> 'usageLimit', '')::integer, 0);
    if v_usage_limit > 0 then
      select count(*)::integer into v_coupon_order_count
      from public.store_orders as prior_coupon_order
      where upper(coalesce(prior_coupon_order.discount_code_applied, '')) = v_coupon
        and prior_coupon_order.status not in ('CANCELLED', 'REJECTED');
      if v_coupon_order_count >= v_usage_limit then
        raise exception 'This coupon has reached its usage limit.';
      end if;
    end if;

    v_per_customer_limit := coalesce(nullif(v_promo ->> 'perCustomerLimit', '')::integer, 0);
    if v_per_customer_limit > 0 then
      select count(*)::integer into v_customer_coupon_count
      from public.store_orders as previous_order
      where lower(previous_order.customer_email) = lower(new.customer_email)
        and upper(coalesce(previous_order.discount_code_applied, '')) = v_coupon
        and previous_order.status not in ('CANCELLED', 'REJECTED');
      if v_customer_coupon_count >= v_per_customer_limit then
        raise exception 'This coupon has already been used the maximum number of times for this checkout email.';
      end if;
    end if;

    v_discount_type := coalesce(v_promo ->> 'discountType', '');
    v_target_type := coalesce(v_promo ->> 'targetType', '');
    v_discount_value := coalesce(nullif(v_promo ->> 'discountValue', '')::numeric, 0);
    if v_discount_value < 0 then
      raise exception 'The published coupon configuration is invalid.';
    end if;

    if v_target_type = 'first-order' then
      select exists (
        select 1 from public.store_orders as previous_order
        where lower(previous_order.customer_email) = lower(new.customer_email)
          and (
            previous_order.verified_at is not null
            or previous_order.status in ('PAYMENT_VERIFIED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED')
          )
      ) into v_has_previous_verified_order;
      if v_has_previous_verified_order then
        raise exception 'This coupon is available only on your first verified order.';
      end if;
    elsif v_target_type = 'referral' then
      raise exception 'Referral discounts need administrator verification. Contact LayerLabs to apply this credit.';
    elsif v_target_type not in ('minimum-order', 'general', 'all-orders') then
      raise exception 'This coupon type is not supported at checkout.';
    end if;

    if coalesce((v_promo ->> 'requiresThresholdConfig')::boolean, false)
       and v_minimum <= 0 then
      raise exception 'This coupon is not fully configured for checkout yet.';
    end if;

    if v_discount_type = 'percentage' then
      v_discount := round(v_subtotal * v_discount_value / 100, 0);
    elsif v_discount_type = 'fixed' then
      v_discount := v_discount_value;
    else
      raise exception 'The published coupon configuration is invalid.';
    end if;

    if nullif(v_promo ->> 'maxDiscountAmount', '') is not null then
      v_max_discount := (v_promo ->> 'maxDiscountAmount')::numeric;
      v_discount := least(v_discount, v_max_discount);
    end if;
    v_discount := greatest(0, least(v_subtotal, v_discount));
    new.discount_code_applied := v_coupon;
  end if;

  new.discount := v_discount;
  new.shipping_cost := v_shipping;
  v_total := greatest(0, v_subtotal - v_discount) + v_shipping;
  new.total_amount := v_total;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_store_order(p_order_number text, p_customer_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if length(trim(coalesce(p_order_number, ''))) not between 10 and 80
     or length(trim(coalesce(p_customer_email, ''))) not between 5 and 254
     or trim(p_order_number) !~ '^ORD-[0-9A-Z]+-[0-9A-Z]{4}$'
     or trim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return null;
  end if;

  select jsonb_build_object(
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'customer_email', lower(trim(p_customer_email)),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.item ->> 'id',
        'quantity', (i.item ->> 'quantity')::integer,
        'selectedColor', i.item ->> 'selectedColor',
        'selectedMaterial', i.item ->> 'selectedMaterial',
        'product', jsonb_build_object(
          'id', i.item #>> '{product,id}',
          'name', i.item #>> '{product,name}',
          'price', i.item #> '{product,price}',
          'salePrice', i.item #> '{product,salePrice}',
          'category', i.item #>> '{product,category}',
          'productType', i.item #>> '{product,productType}',
          'isDigital', i.item #> '{product,isDigital}'
        )
      )), '[]'::jsonb)
      from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as i(item)
    ),
    'subtotal', o.subtotal,
    'discount', o.discount,
    'discount_code_applied', o.discount_code_applied,
    'shipping_cost', o.shipping_cost,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'status', o.status,
    'created_at', o.created_at,
    'verified_at', o.verified_at,
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
  where o.order_number = upper(trim(p_order_number))
    and lower(o.customer_email) = lower(trim(p_customer_email))
  limit 1;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_store_order_cancellation(p_order_number text, p_customer_email text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text;
  v_changed integer;
begin
  if coalesce(trim(p_order_number), '') !~ '^ORD-[0-9A-Z]+-[0-9A-Z]{4}$'
     or length(trim(coalesce(p_customer_email, ''))) not between 5 and 254
     or trim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    return jsonb_build_object(
      'success', false,
      'message', 'Enter the order ID, checkout email, and a short cancellation reason.'
    );
  end if;

  v_reason := left(trim(p_reason), 500);

  update public.store_orders as o
  set status = 'CANCELLED',
      cancellation_reason = v_reason,
      refund_status = case
        when o.status = 'PAYMENT_VERIFIED' or o.verified_at is not null
          then 'REQUESTED'
        else coalesce(o.refund_status, 'NOT_REQUESTED')
      end,
      refund_note = case
        when o.status = 'PAYMENT_VERIFIED' or o.verified_at is not null
          then 'Cancellation received. Any refund requires manual payment reconciliation and approval; no automatic transfer has been made.'
        else o.refund_note
      end,
      updated_at = now()
  where o.order_number = upper(trim(p_order_number))
    and lower(o.customer_email) = lower(trim(p_customer_email))
    and o.status in ('NEW', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED');

  get diagnostics v_changed = row_count;

  if v_changed <> 1 then
    return jsonb_build_object(
      'success', false,
      'message', 'This order could not be cancelled automatically. Check the order ID and checkout email, or contact LayerLabs for a manual review.'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Cancellation recorded. If payment was verified, refund review is pending; this does not mean a refund has been transferred.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.audit_store_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_actor_email text;
  v_event text;
  v_details jsonb;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    'unknown'
  );

  v_actor_email := case
    when v_role = 'authenticated' then lower(coalesce(auth.jwt() ->> 'email', ''))
    else null
  end;

  if tg_op = 'INSERT' then
    v_event := 'ORDER_CREATED';
    v_details := jsonb_build_object(
      'status', new.status,
      'payment_method', new.payment_method,
      'total_amount', new.total_amount,
      'discount', new.discount,
      'shipping_cost', new.shipping_cost,
      'delivery_option_id', new.delivery_option_id
    );
    insert into public.store_order_audit_log(order_number,event_type,actor_role,actor_email,details)
    values (new.order_number,v_event,v_role,v_actor_email,v_details);
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'PAYMENT_VERIFIED' and old.status <> 'PAYMENT_VERIFIED' then
      v_event := 'PAYMENT_VERIFIED';
    elsif new.status = 'REJECTED' and old.status <> 'REJECTED' then
      v_event := 'PAYMENT_REJECTED';
    elsif new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
      v_event := 'ORDER_CANCELLED';
    else
      v_event := 'ORDER_STATUS_CHANGED';
    end if;
  elsif old.refund_status is distinct from new.refund_status then
    v_event := 'REFUND_STATUS_CHANGED';
  elsif old.verified_at is distinct from new.verified_at
     or old.verified_by is distinct from new.verified_by then
    v_event := 'PAYMENT_VERIFICATION_METADATA_CHANGED';
  elsif old.tracking_number is distinct from new.tracking_number
     or old.tracking_url is distinct from new.tracking_url
     or old.courier_name is distinct from new.courier_name
     or old.fulfillment_method is distinct from new.fulfillment_method then
    v_event := 'FULFILLMENT_DETAILS_CHANGED';
  elsif old.total_amount is distinct from new.total_amount
     or old.discount is distinct from new.discount
     or old.shipping_cost is distinct from new.shipping_cost then
    v_event := 'ORDER_FINANCIALS_CHANGED';
  elsif old.cancellation_reason is distinct from new.cancellation_reason
     or old.refund_note is distinct from new.refund_note
     or old.rejection_reason is distinct from new.rejection_reason then
    v_event := 'ORDER_REVIEW_NOTE_CHANGED';
  else
    return new;
  end if;

  v_details := jsonb_build_object(
    'old_status', old.status,
    'new_status', new.status,
    'old_refund_status', old.refund_status,
    'new_refund_status', new.refund_status,
    'old_verified_at', old.verified_at,
    'new_verified_at', new.verified_at,
    'old_total_amount', old.total_amount,
    'new_total_amount', new.total_amount,
    'old_shipping_cost', old.shipping_cost,
    'new_shipping_cost', new.shipping_cost,
    'old_discount', old.discount,
    'new_discount', new.discount,
    'tracking_number_changed', old.tracking_number is distinct from new.tracking_number,
    'tracking_url_changed', old.tracking_url is distinct from new.tracking_url,
    'review_note_changed',
      old.cancellation_reason is distinct from new.cancellation_reason
      or old.refund_note is distinct from new.refund_note
      or old.rejection_reason is distinct from new.rejection_reason
  );

  insert into public.store_order_audit_log(order_number,event_type,actor_role,actor_email,details)
  values (new.order_number,v_event,v_role,v_actor_email,v_details);

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_admin_store_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_email text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    ''
  );
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  new.updated_at := now();

  if new.status = 'PAYMENT_VERIFIED' and old.status is distinct from 'PAYMENT_VERIFIED' then
    if v_role = 'authenticated' and v_email = '' then
      raise exception 'A signed-in administrator email is required to verify payment.';
    end if;
    if v_role = 'authenticated' then
      new.verified_at := now();
      new.verified_by := v_email;
    end if;
  elsif old.verified_at is null and new.status is distinct from 'PAYMENT_VERIFIED' then
    -- A caller cannot set verifier metadata while an order is still unpaid.
    new.verified_at := null;
    new.verified_by := null;
  end if;

  -- Once written, the original verifier and timestamp are immutable audit metadata.
  if old.verified_at is not null then
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;

  return new;
end;
$function$;
revoke all on function private.prepare_public_store_order() from public, anon, authenticated;
revoke all on function private.normalize_admin_store_order_update() from public, anon, authenticated;
revoke all on function private.audit_store_order_change() from public, anon, authenticated;
revoke all on function public.lookup_store_order(text, text) from public;
grant execute on function public.lookup_store_order(text, text) to anon, authenticated;
revoke all on function public.request_store_order_cancellation(text, text, text) from public;
grant execute on function public.request_store_order_cancellation(text, text, text) to anon, authenticated;

drop trigger if exists store_orders_prepare_public_insert on public.store_orders;
create trigger store_orders_prepare_public_insert
  before insert on public.store_orders
  for each row execute function private.prepare_public_store_order();

drop trigger if exists store_orders_normalize_update on public.store_orders;
create trigger store_orders_normalize_update
  before update on public.store_orders
  for each row execute function private.normalize_admin_store_order_update();

drop trigger if exists store_orders_audit_after_change on public.store_orders;
create trigger store_orders_audit_after_change
  after insert or update on public.store_orders
  for each row execute function private.audit_store_order_change();

notify pgrst, 'reload schema';

-- State when this migration was captured for repository history: 0 orders and 0 audit log rows.
