-- PROPOSTA — revisar com o responsável pelo back-end antes de rodar.
-- Rodar no SQL Editor do Supabase DEPOIS de supabase/schema.sql.
--
-- O front-end (src/context/AuthProvider.jsx e src/services/) já está pronto
-- para funcionar com o que está aqui. Detalhes e motivos em
-- docs/backend/PENDENCIAS.md.

-- ---------------------------------------------------------------------------
-- 1. Cadastro: cria o negócio e o perfil admin quando alguém se cadastra
-- ---------------------------------------------------------------------------
-- O Cadastro.jsx chama supabase.auth.signUp com
--   options.data = { nome, nome_negocio }
-- Esses dados chegam em auth.users.raw_user_meta_data. Fazer isso num trigger
-- (security definer) evita abrir policies de INSERT em negocios/usuarios para
-- o cliente, que permitiriam a qualquer usuário criar negócios à vontade.

create or replace function public.criar_negocio_do_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_negocio_id uuid;
begin
  insert into negocios (nome)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_negocio'), ''), 'Meu negócio'))
  returning id into novo_negocio_id;

  insert into usuarios (id, negocio_id, nome, papel)
  values (
    new.id,
    novo_negocio_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
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
-- 2. Tempo real: publica as tabelas que a Cozinha e os Pedidos escutam
-- ---------------------------------------------------------------------------
-- Sem isso, supabase.channel(...).on('postgres_changes', ...) não recebe nada.
-- O Realtime respeita o RLS, então cada negócio só recebe os próprios eventos.

-- Idempotente: se alguém já ligou o Realtime pelo painel, não dá erro.
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

-- ---------------------------------------------------------------------------
-- 3. Pedido numa transação só, com preço vindo do banco
-- ---------------------------------------------------------------------------
-- Hoje o front grava o pedido e depois os itens (duas chamadas) e manda o
-- preço_unitario. Com esta função: tudo ou nada, o preço é lido da tabela
-- produtos (o cliente não consegue alterar) e produto esgotado é recusado.
--
-- Uso no front (src/services/pedidos.js, função criarPedido):
--   const { data, error } = await supabase.rpc('criar_pedido', {
--     itens: [{ produto_id, quantidade }, ...],
--   });

create or replace function public.criar_pedido(itens jsonb)
returns pedidos
language plpgsql
security invoker
set search_path = public
as $$
declare
  negocio uuid := negocio_do_usuario_atual();
  novo pedidos;
  item jsonb;
  produto produtos;
begin
  if negocio is null then
    raise exception 'usuário sem negócio';
  end if;

  if jsonb_array_length(itens) = 0 then
    raise exception 'pedido sem itens';
  end if;

  insert into pedidos (negocio_id, criado_por)
  values (negocio, auth.uid())
  returning * into novo;

  for item in select * from jsonb_array_elements(itens) loop
    select * into produto
    from produtos
    where id = (item ->> 'produto_id')::uuid
      and negocio_id = negocio;

    if produto.id is null then
      raise exception 'produto não encontrado';
    end if;
    if not produto.disponivel then
      raise exception 'produto esgotado: %', produto.nome;
    end if;

    insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
    values (novo.id, produto.id, (item ->> 'quantidade')::int, produto.preco);
  end loop;

  return novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Índices para as consultas que o front faz
-- ---------------------------------------------------------------------------
-- Cozinha: pedidos abertos por negócio, ordenados por criado_em.
-- Relatórios: pedidos por negócio num intervalo de criado_em.
create index if not exists pedidos_negocio_criado_em_idx on pedidos (negocio_id, criado_em);
create index if not exists itens_pedido_pedido_idx on itens_pedido (pedido_id);
create index if not exists produtos_negocio_idx on produtos (negocio_id);
