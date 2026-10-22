-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-10-19_senha-3-digitos_edicao-com-versao_meus-dados.sql.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- 1. Ingredientes (com preço de compra) e a lista de ingredientes de cada
--    produto: o custo do produto passa a ser calculado sozinho.
-- 2. A cozinha avisa qual ingrediente faltou, não o produto inteiro.
-- 3. versao_do_banco(): o site avisa a equipe quando o banco está atrasado.
begin;

-- Sem a migração anterior, a senha continua com 4 dígitos e o cliente não
-- consegue acompanhar o pedido. Para tudo em vez de seguir pela metade.
do $$
begin
  if to_regclass('public.contador_pedidos') is null then
    raise exception 'Rode antes supabase/migracoes/2026-10-19_senha-3-digitos_edicao-com-versao_meus-dados.sql';
  end if;
end;
$$;

-- 1. Tabelas -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_id_negocio_id_key') then
    alter table public.produtos add constraint produtos_id_negocio_id_key unique (id, negocio_id);
  end if;
end;
$$;

alter table public.itens_pedido
  add column if not exists faltou_ingredientes text[] not null default '{}'
  check (cardinality(faltou_ingredientes) <= 30);

-- Ingredientes e embalagens que o negócio compra. A compra é guardada na
-- unidade base (g, ml ou un): "R$ 45,00 por 1 kg" fica 45,00 por 1000 g.
-- Sem preço, o ingrediente serve só para a cozinha avisar o que faltou.
create table if not exists public.ingredientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  unidade text not null check (unidade in ('g', 'ml', 'un')),
  preco_compra numeric(10, 2) check (preco_compra between 0 and 99999.99),
  quantidade_compra numeric(12, 3) check (quantidade_compra between 1 and 1000000),
  -- "Excluir" arquiva: some da lista e sai dos produtos.
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  check ((preco_compra is null) = (quantidade_compra is null)),
  unique (id, negocio_id)
);

-- O que vai em cada produto e quanto ("X-Burguer: 120 g de carne, 1 pão").
-- As chaves compostas garantem que produto e ingrediente são do mesmo negócio.
create table if not exists public.produto_ingredientes (
  produto_id uuid not null,
  ingrediente_id uuid not null,
  negocio_id uuid not null,
  quantidade numeric(12, 3) not null check (quantidade > 0 and quantidade <= 100000),
  primary key (produto_id, ingrediente_id),
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade,
  foreign key (ingrediente_id, negocio_id) references public.ingredientes (id, negocio_id) on delete cascade
);

create index if not exists ingredientes_negocio_idx on public.ingredientes (negocio_id);
-- Dois ingredientes ativos com o mesmo nome confundiriam a cozinha.
create unique index if not exists ingredientes_nome_unico_idx
  on public.ingredientes (negocio_id, lower(trim(nome))) where not arquivado;
create index if not exists produto_ingredientes_ingrediente_idx on public.produto_ingredientes (ingrediente_id);
create index if not exists produto_ingredientes_negocio_idx on public.produto_ingredientes (negocio_id);

alter table public.ingredientes enable row level security;
alter table public.produto_ingredientes enable row level security;

-- Ingredientes: cadastro direto, como produtos, mas sem trocar de negócio.
-- A lista de cada produto só muda por salvar_ingredientes_do_produto.
revoke all on public.ingredientes, public.produto_ingredientes from anon, authenticated;
grant select on public.ingredientes, public.produto_ingredientes to authenticated;
grant insert (negocio_id, nome, unidade, preco_compra, quantidade_compra) on public.ingredientes to authenticated;
grant update (nome, unidade, preco_compra, quantidade_compra, arquivado) on public.ingredientes to authenticated;

drop policy if exists "ingredientes isolados por negocio_id" on public.ingredientes;
create policy "ingredientes isolados por negocio_id"
  on public.ingredientes for all to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "produto_ingredientes isolados por negocio_id" on public.produto_ingredientes;
create policy "produto_ingredientes isolados por negocio_id"
  on public.produto_ingredientes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- 2. Funções -------------------------------------------------------------------
create or replace function public.recalcular_custo_do_produto(p_produto_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.produtos p
  set custo = least(s.total, 99999999.99)
  from (
    select round(sum(pi.quantidade * i.preco_compra / i.quantidade_compra), 2) as total
    from public.produto_ingredientes pi
    join public.ingredientes i on i.id = pi.ingrediente_id
    where pi.produto_id = p_produto_id and i.preco_compra is not null
  ) s
  where p.id = p_produto_id and s.total is not null;
$$;

-- Troca de uma vez a lista de ingredientes do produto.
-- p_itens: [{ "ingrediente_id": "...", "quantidade": 120 }], na unidade do ingrediente.
create or replace function public.salvar_ingredientes_do_produto(p_produto_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_ingrediente_id uuid;
  v_quantidade numeric;
begin
  perform 1 from public.produtos
  where id = p_produto_id and negocio_id = v_negocio_id
  for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 30 then
    raise exception 'Um produto pode ter até 30 ingredientes.';
  end if;

  delete from public.produto_ingredientes where produto_id = p_produto_id;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'ingrediente_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
      raise exception 'Ingrediente inválido.';
    end if;
    v_quantidade := round((v_item ->> 'quantidade')::numeric, 3);
    if v_quantidade <= 0 or v_quantidade > 100000 then
      raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
    end if;

    select id into v_ingrediente_id from public.ingredientes
    where id::text = v_item ->> 'ingrediente_id' and negocio_id = v_negocio_id and not arquivado;
    if not found then
      raise exception 'Um dos ingredientes foi excluído. Revise a lista.';
    end if;

    insert into public.produto_ingredientes (produto_id, ingrediente_id, negocio_id, quantidade)
    values (p_produto_id, v_ingrediente_id, v_negocio_id, v_quantidade)
    on conflict (produto_id, ingrediente_id) do update set quantidade = excluded.quantidade;
  end loop;

  perform public.recalcular_custo_do_produto(p_produto_id);
end;
$$;

-- Mudou o preço de um ingrediente: o custo de todos os produtos que usam ele
-- muda junto. Excluir (arquivar) tira o ingrediente dos produtos.
create or replace function public.ao_mudar_ingrediente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produtos uuid[];
  v_produto uuid;
begin
  select coalesce(array_agg(produto_id), '{}') into v_produtos
  from public.produto_ingredientes where ingrediente_id = new.id;

  if new.unidade is distinct from old.unidade and cardinality(v_produtos) > 0 then
    raise exception 'Este ingrediente está em produtos. Para trocar a unidade, exclua e cadastre de novo.';
  end if;

  if new.arquivado and not old.arquivado then
    delete from public.produto_ingredientes where ingrediente_id = new.id;
  end if;

  foreach v_produto in array v_produtos loop
    perform public.recalcular_custo_do_produto(v_produto);
  end loop;
  return new;
end;
$$;

drop trigger if exists ao_mudar_ingrediente on public.ingredientes;
create trigger ao_mudar_ingrediente
  after update on public.ingredientes
  for each row
  when ((old.preco_compra, old.quantidade_compra, old.unidade, old.arquivado)
        is distinct from (new.preco_compra, new.quantidade_compra, new.unidade, new.arquivado))
  execute function public.ao_mudar_ingrediente();

-- A cozinha avisa que faltou um ingrediente de um item ("faltou queijo"). Só
-- aceita ingrediente que está no produto. Mexe em atualizado_em do pedido
-- para o tempo real avisar a tela do atendente.
create or replace function public.marcar_ingrediente_faltou(p_item_id uuid, p_ingrediente_id uuid, p_faltou boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_produto_id uuid;
  v_nome text;
begin
  select p.id, i.produto_id into v_pedido_id, v_produto_id
  from public.itens_pedido i
  join public.pedidos p on p.id = i.pedido_id
  where i.id = p_item_id
    and p.negocio_id = public.negocio_do_usuario_atual()
    and p.status in ('pendente', 'em_preparo')
  for update of p;
  if not found then
    raise exception 'Este pedido não está mais na fila.';
  end if;

  select g.nome into v_nome
  from public.produto_ingredientes pi
  join public.ingredientes g on g.id = pi.ingrediente_id
  where pi.produto_id = v_produto_id and pi.ingrediente_id = p_ingrediente_id;
  if not found then
    raise exception 'Este ingrediente não está mais no produto. Atualize a tela.';
  end if;

  update public.itens_pedido
  set faltou_ingredientes = case
    when not coalesce(p_faltou, false) then array_remove(faltou_ingredientes, v_nome)
    when v_nome = any (faltou_ingredientes) then faltou_ingredientes
    else faltou_ingredientes || v_nome
  end
  where id = p_item_id;
  update public.pedidos set atualizado_em = now() where id = v_pedido_id;
end;
$$;

revoke all on function public.recalcular_custo_do_produto(uuid) from public, anon, authenticated;
revoke all on function public.ao_mudar_ingrediente() from public, anon, authenticated;
revoke all on function public.salvar_ingredientes_do_produto(uuid, jsonb) from public, anon;
revoke all on function public.marcar_ingrediente_faltou(uuid, uuid, boolean) from public, anon;
grant execute on function public.salvar_ingredientes_do_produto(uuid, jsonb) to authenticated;
grant execute on function public.marcar_ingrediente_faltou(uuid, uuid, boolean) to authenticated;

-- O aviso da página do cliente também vale para ingrediente que faltou.
-- Número errado, de outro dia ou de outro negócio dão a mesma resposta
-- ("não encontrado"): a resposta não revela se um número existe.
create or replace function public.acompanhar_pedido(p_codigo text, p_numero int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_hoje date := public.hoje_no_negocio();
  v_pedido public.pedidos;
  v_posicao int;
  v_tempo_medio int;
  v_faltou boolean;
begin
  perform public.conferir_limite_consultas();

  select id into v_negocio_id
  from public.negocios
  where codigo_publico = p_codigo and pagina_ativa;

  if v_negocio_id is not null and p_numero between 1 and 999 then
    select * into v_pedido
    from public.pedidos
    where negocio_id = v_negocio_id and dia = v_hoje and numero = p_numero
    order by criado_em desc
    limit 1;
  end if;

  perform public.registrar_consulta(v_pedido.id is null);
  if v_pedido.id is null then
    return json_build_object('encontrado', false);
  end if;

  if v_pedido.status in ('pendente', 'em_preparo') then
    select count(*) + 1 into v_posicao
    from public.pedidos
    where negocio_id = v_negocio_id and dia = v_hoje
      and status in ('pendente', 'em_preparo')
      and (criado_em, id) < (v_pedido.criado_em, v_pedido.id);

    select exists (
      select 1 from public.itens_pedido
      where pedido_id = v_pedido.id and (faltou or cardinality(faltou_ingredientes) > 0)
    )
    into v_faltou;
  end if;

  -- Média dos 10 últimos pedidos que ficaram prontos hoje: do envio para a
  -- cozinha até o "Pronto". Recalculada a cada pedido pronto.
  select round(avg(extract(epoch from (pronto_em - criado_em)) / 60))::int into v_tempo_medio
  from (
    select pronto_em, criado_em from public.pedidos
    where negocio_id = v_negocio_id and dia = v_hoje
      and pronto_em is not null and status <> 'cancelado'
    order by pronto_em desc
    limit 10
  ) ultimos;

  return json_build_object(
    'encontrado', true,
    'status', v_pedido.status,
    'posicao', v_posicao,
    'tempo_medio_min', v_tempo_medio,
    'faltou', coalesce(v_faltou, false)
  );
end;
$$;

revoke all on function public.acompanhar_pedido(text, int) from public;
grant execute on function public.acompanhar_pedido(text, int) to anon, authenticated;

-- 3. Versão do banco -------------------------------------------------------------
create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261022;
$$;

revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;

commit;
