-- Organiza+ — schema inicial (Fase 0)
-- Rodar no SQL Editor do projeto Supabase.

create extension if not exists pgcrypto;

create table negocios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  negocio_id uuid not null references negocios (id) on delete cascade,
  nome text not null,
  papel text not null check (papel in ('admin', 'atendente', 'cozinha'))
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios (id) on delete cascade,
  nome text not null,
  preco numeric(10, 2) not null,
  custo numeric(10, 2),
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios (id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_preparo', 'pronto', 'entregue')),
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios (id)
);

create table itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  produto_id uuid not null references produtos (id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null
);

-- Resolve o negocio_id do usuário autenticado, usado nas policies abaixo.
create or replace function negocio_do_usuario_atual()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select negocio_id from usuarios where id = auth.uid();
$$;

alter table negocios enable row level security;
alter table usuarios enable row level security;
alter table produtos enable row level security;
alter table pedidos enable row level security;
alter table itens_pedido enable row level security;

create policy "negocios isolados por negocio_id"
  on negocios for select
  using (id = negocio_do_usuario_atual());

create policy "usuarios isolados por negocio_id"
  on usuarios for select
  using (negocio_id = negocio_do_usuario_atual());

create policy "usuario atualiza o proprio perfil"
  on usuarios for update
  using (id = auth.uid());

create policy "produtos isolados por negocio_id"
  on produtos for all
  using (negocio_id = negocio_do_usuario_atual())
  with check (negocio_id = negocio_do_usuario_atual());

create policy "pedidos isolados por negocio_id"
  on pedidos for all
  using (negocio_id = negocio_do_usuario_atual())
  with check (negocio_id = negocio_do_usuario_atual());

create policy "itens_pedido isolados por negocio_id"
  on itens_pedido for all
  using (
    exists (
      select 1 from pedidos
      where pedidos.id = itens_pedido.pedido_id
      and pedidos.negocio_id = negocio_do_usuario_atual()
    )
  )
  with check (
    exists (
      select 1 from pedidos
      where pedidos.id = itens_pedido.pedido_id
      and pedidos.negocio_id = negocio_do_usuario_atual()
    )
  );

-- As policies de INSERT para o fluxo de cadastro (criar negocio + primeiro
-- usuario admin) serão definidas na Fase 1, junto com a implementação do
-- cadastro real.
