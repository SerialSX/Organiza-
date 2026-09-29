-- Organiza+ — schema completo do banco.
-- Rodar inteiro no SQL Editor de um projeto Supabase novo.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 120),
  criado_em timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  papel text not null default 'admin' check (papel in ('admin', 'atendente', 'cozinha'))
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  preco numeric(10, 2) not null check (preco >= 0),
  custo numeric(10, 2) check (custo >= 0),
  disponivel boolean not null default true,
  -- "Excluir" arquiva: o produto some do cardápio, mas os pedidos antigos continuam com nome.
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_preparo', 'pronto', 'entregue')),
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null
);

create table if not exists public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete restrict,
  quantidade int not null check (quantidade between 1 and 999),
  -- Preço e custo copiados do produto na hora do pedido: mudar o produto
  -- depois não altera o faturamento nem o lucro de dias anteriores.
  preco_unitario numeric(10, 2) not null check (preco_unitario >= 0),
  custo_unitario numeric(10, 2) check (custo_unitario >= 0)
);

create index if not exists usuarios_negocio_idx on public.usuarios (negocio_id);
create index if not exists produtos_negocio_idx on public.produtos (negocio_id);
create index if not exists pedidos_negocio_criado_em_idx on public.pedidos (negocio_id, criado_em);
create index if not exists itens_pedido_pedido_idx on public.itens_pedido (pedido_id);
create index if not exists itens_pedido_produto_idx on public.itens_pedido (produto_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Resolve o negocio_id do usuário autenticado, usado nas policies abaixo.
create or replace function public.negocio_do_usuario_atual()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select negocio_id from public.usuarios where id = (select auth.uid());
$$;

alter table public.negocios enable row level security;
alter table public.usuarios enable row level security;
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;

-- Não depende dos grants padrão do Supabase. Pedidos e itens só são gravados
-- pelas funções criar_pedido e atualizar_status_pedido.
revoke all on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  from anon, authenticated;
grant select on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  to authenticated;
grant insert, update on public.produtos to authenticated;
-- Só o nome: liberar negocio_id ou papel deixaria o usuário entrar em outro negócio.
grant update (nome) on public.usuarios to authenticated;

drop policy if exists "negocios isolados por negocio_id" on public.negocios;
create policy "negocios isolados por negocio_id"
  on public.negocios for select to authenticated
  using (id = (select public.negocio_do_usuario_atual()));

drop policy if exists "usuarios isolados por negocio_id" on public.usuarios;
create policy "usuarios isolados por negocio_id"
  on public.usuarios for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "usuario atualiza o proprio perfil" on public.usuarios;
create policy "usuario atualiza o proprio perfil"
  on public.usuarios for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "produtos isolados por negocio_id" on public.produtos;
create policy "produtos isolados por negocio_id"
  on public.produtos for all to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "pedidos isolados por negocio_id" on public.pedidos;
create policy "pedidos isolados por negocio_id"
  on public.pedidos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "itens_pedido isolados por negocio_id" on public.itens_pedido;
create policy "itens_pedido isolados por negocio_id"
  on public.itens_pedido for select to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_id and p.negocio_id = (select public.negocio_do_usuario_atual())
  ));

-- ---------------------------------------------------------------------------
-- Cadastro: cria o negócio e o perfil admin
-- ---------------------------------------------------------------------------
-- O Cadastro.jsx chama supabase.auth.signUp com options.data = { nome, nome_negocio }.
-- Um trigger security definer evita abrir INSERT em negocios/usuarios para o
-- cliente, e funciona também com a confirmação de e-mail ligada.

create or replace function public.criar_negocio_do_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
begin
  insert into public.negocios (nome)
  values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_negocio'), ''), 'Meu negócio'), 120))
  returning id into v_negocio_id;

  insert into public.usuarios (id, negocio_id, nome, papel)
  values (
    new.id,
    v_negocio_id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)), 120),
    'admin'
  );

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario_auth on auth.users;
create trigger ao_criar_usuario_auth
  after insert on auth.users
  for each row execute function public.criar_negocio_do_novo_usuario();

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
-- As mensagens de erro destas funções aparecem direto na tela (o front mostra
-- o texto de erros com código P0001), por isso são escritas para o usuário.

-- O cliente manda só produto_id e quantidade. O banco confere se o produto
-- está disponível, fixa preço e custo e grava tudo numa transação só.
create or replace function public.criar_pedido(p_itens jsonb)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_pedido public.pedidos;
  v_item jsonb;
  v_produto public.produtos;
  v_quantidade int;
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'O pedido precisa ter de 1 a 100 itens.';
  end if;

  insert into public.pedidos (negocio_id, criado_por)
  values (v_negocio_id, (select auth.uid()))
  returning * into v_pedido;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    -- "is distinct from" porque uma chave ausente dá null, e "null <> x" não é verdadeiro.
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'produto_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
      raise exception 'Item do pedido inválido.';
    end if;
    v_quantidade := (v_item ->> 'quantidade')::int;
    if v_quantidade not between 1 and 999 then
      raise exception 'A quantidade precisa ficar entre 1 e 999.';
    end if;

    -- "for share" impede que o produto seja alterado no meio do pedido.
    select * into v_produto from public.produtos
    where id = (v_item ->> 'produto_id')::uuid
      and negocio_id = v_negocio_id
      and disponivel and not arquivado
    for share;
    if not found then
      raise exception 'Um dos produtos esgotou. Revise o pedido.';
    end if;

    insert into public.itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, custo_unitario)
    values (v_pedido.id, v_produto.id, v_quantidade, v_produto.preco, v_produto.custo);
  end loop;

  return v_pedido;
end;
$$;

-- Só avança o status: pendente → em_preparo → pronto → entregue
-- (pendente pode ir direto para pronto).
create or replace function public.atualizar_status_pedido(p_pedido_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual text;
begin
  select status into v_atual from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not ((v_atual = 'pendente' and p_status in ('em_preparo', 'pronto'))
       or (v_atual = 'em_preparo' and p_status = 'pronto')
       or (v_atual = 'pronto' and p_status = 'entregue')) then
    raise exception 'Este pedido já mudou de status. Atualize a tela.';
  end if;

  update public.pedidos set status = p_status where id = p_pedido_id;
end;
$$;

revoke all on function public.negocio_do_usuario_atual() from public, anon;
revoke all on function public.criar_negocio_do_novo_usuario() from public, anon, authenticated;
revoke all on function public.criar_pedido(jsonb) from public, anon;
revoke all on function public.atualizar_status_pedido(uuid, text) from public, anon;
grant execute on function public.negocio_do_usuario_atual() to authenticated;
grant execute on function public.criar_pedido(jsonb) to authenticated;
grant execute on function public.atualizar_status_pedido(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------
-- Publica as tabelas que a Cozinha e os Pedidos escutam. O Realtime respeita
-- o RLS, então cada negócio só recebe os próprios eventos.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['produtos', 'pedidos', 'itens_pedido'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end;
$$;

commit;
