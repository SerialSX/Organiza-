-- REFERÊNCIA, NÃO RODAR. Schema do MVP em TypeScript que estava na main (PR #19).
-- A lógica dele (pedido atômico, transição de status validada, produto arquivado,
-- custo gravado no item) foi portada para supabase/schema.sql, com os nomes em
-- português que o front usa. Este arquivo fica só como histórico da decisão.

-- Execute este arquivo inteiro no SQL Editor de um projeto Supabase novo.
begin;

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  price numeric(12,2) not null check (price >= 0),
  cost numeric(12,2) not null check (cost >= 0),
  status text not null default 'disponivel' check (status in ('disponivel', 'esgotado')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'preparando', 'pronto', 'entregue')),
  total numeric(12,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  -- Snapshot do custo: alterações futuras no produto não mudam relatórios antigos.
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);

create index if not exists products_business_id_idx on public.products(business_id);
create index if not exists orders_business_created_idx on public.orders(business_id, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Não dependemos dos grants padrão de projetos Supabase.
revoke all on public.businesses, public.products, public.orders, public.order_items from anon, authenticated;
grant select on public.businesses, public.products, public.orders, public.order_items to authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())));

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())));

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.id = order_id and b.owner_id = (select auth.uid())));

-- Cria o negócio no cadastro, inclusive quando a confirmação de e-mail está ativa.
create or replace function public.create_business_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.businesses (owner_id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 'Meu negócio'), 120));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_business on auth.users;
create trigger on_auth_user_created_business
  after insert on auth.users for each row execute function public.create_business_for_user();

-- O cliente manda apenas IDs e quantidades. O banco confere estoque e fixa preço/custo.
create or replace function public.place_order(p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_total numeric(12,2) := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Faça login para lançar pedidos';
  end if;
  select id into v_business_id from public.businesses where owner_id = (select auth.uid());
  if v_business_id is null then
    raise exception 'Negócio não encontrado';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Pedido deve ter de 1 a 100 itens';
  end if;

  insert into public.orders (business_id) values (v_business_id) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'product_id') <> 'string'
       or jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception 'Item inválido';
    end if;
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity not between 1 and 999 then
      raise exception 'Quantidade deve estar entre 1 e 999';
    end if;
    select * into v_product from public.products
      where id = v_product_id and business_id = v_business_id
        and status = 'disponivel' and archived = false for share;
    if not found then
      raise exception 'Produto indisponível';
    end if;
    insert into public.order_items (order_id, product_id, quantity, unit_price, unit_cost)
      values (v_order_id, v_product_id, v_quantity, v_product.price, v_product.cost);
    v_total := v_total + v_quantity * v_product.price;
  end loop;
  update public.orders set total = v_total where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_current text;
begin
  select o.status into v_current from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.id = p_order_id and b.owner_id = (select auth.uid()) for update of o;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if not ((v_current = 'pendente' and p_status in ('preparando', 'pronto'))
       or (v_current = 'preparando' and p_status = 'pronto')
       or (v_current = 'pronto' and p_status = 'entregue')) then
    raise exception 'Transição de status inválida';
  end if;
  update public.orders set status = p_status where id = p_order_id;
end;
$$;

-- Relatório de pedidos entregues, com margem sobre o faturamento histórico.
create or replace function public.business_report()
returns table (
  top_product text,
  units_sold bigint,
  revenue numeric,
  gross_profit numeric,
  margin_percent numeric
) language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
begin
  select id into v_business_id from public.businesses where owner_id = (select auth.uid());
  if v_business_id is null then
    raise exception 'Negócio não encontrado';
  end if;
  return query
    with delivered as (
      select o.id, o.total from public.orders o
      where o.business_id = v_business_id and o.status = 'entregue'
    ), sales as (
      select oi.product_id, sum(oi.quantity)::bigint as units,
        sum((oi.unit_price - oi.unit_cost) * oi.quantity) as profit
      from public.order_items oi join delivered d on d.id = oi.order_id
      group by oi.product_id
    ), top_seller as (
      select p.name, s.units from sales s
      join public.products p on p.id = s.product_id
      order by s.units desc, p.name asc limit 1
    )
    select (select t.name from top_seller t),
      coalesce((select t.units from top_seller t), 0::bigint),
      coalesce((select sum(d.total) from delivered d), 0::numeric),
      coalesce((select sum(s.profit) from sales s), 0::numeric),
      case when coalesce((select sum(d.total) from delivered d), 0) = 0 then 0::numeric
        else round(coalesce((select sum(s.profit) from sales s), 0) * 100 /
          (select sum(d.total) from delivered d), 2) end;
end;
$$;

revoke all on function public.create_business_for_user() from public, anon, authenticated;
revoke all on function public.place_order(jsonb) from public, anon;
revoke all on function public.set_order_status(uuid, text) from public, anon;
revoke all on function public.business_report() from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.business_report() to authenticated;

-- Necessário para receber INSERT/UPDATE de pedidos e mudanças de disponibilidade.
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
    alter publication supabase_realtime add table public.products;
  end if;
end;
$$;

commit;
