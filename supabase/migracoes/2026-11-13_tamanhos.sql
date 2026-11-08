-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-12_fim-do-dia.sql (este arquivo sobe a versão do banco
-- para 20261113). Pode rodar a qualquer hora: não muda nada do que já existe.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Tamanhos (P, M, G; 300 ml, 500 ml):
-- 1. produto_tamanhos: cada tamanho com preço, custo e esgotado próprios.
--    Tamanho removido é arquivado: pedidos antigos continuam com o nome.
-- 2. tamanho_ingredientes: quanto vai de cada ingrediente em cada tamanho; o
--    custo de cada tamanho sai sozinho. produto_ingredientes continua sendo a
--    lista do produto (para o "faltou" e o "acabou um ingrediente").
-- 3. itens_pedido guarda o tamanho escolhido (id e nome copiado). Produto com
--    tamanhos não entra no pedido sem o tamanho.
-- 4. criar_produtos_com_tamanhos: cardápio pronto e planilha criam produtos
--    com tamanhos de uma vez (tudo ou nada).
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'dias_encerrados'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-12_fim-do-dia.sql';
  end if;
end;
$$;

-- Tabelas -----------------------------------------------------------------------------

-- Tamanhos de um produto. O produto continua com preco/custo (iguais aos do
-- primeiro tamanho), para o que só olha o produto.
create table if not exists public.produto_tamanhos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null,
  negocio_id uuid not null,
  nome text not null check (length(trim(nome)) between 1 and 20),
  preco numeric(10, 2) not null check (preco > 0),
  custo numeric(10, 2) check (custo >= 0),
  disponivel boolean not null default true,
  arquivado boolean not null default false,
  ordem smallint not null default 0 check (ordem between 0 and 99),
  criado_em timestamptz not null default now(),
  unique (id, negocio_id),
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade
);
create index if not exists produto_tamanhos_produto_idx on public.produto_tamanhos (produto_id);
create index if not exists produto_tamanhos_negocio_idx on public.produto_tamanhos (negocio_id);
-- Dois tamanhos com o mesmo nome no mesmo produto confundiriam o atendente.
create unique index if not exists produto_tamanhos_nome_unico_idx
  on public.produto_tamanhos (produto_id, lower(trim(nome))) where not arquivado;

create table if not exists public.tamanho_ingredientes (
  tamanho_id uuid not null,
  ingrediente_id uuid not null,
  negocio_id uuid not null,
  quantidade numeric(12, 3) not null check (quantidade > 0 and quantidade <= 100000),
  primary key (tamanho_id, ingrediente_id),
  foreign key (tamanho_id, negocio_id) references public.produto_tamanhos (id, negocio_id) on delete cascade,
  foreign key (ingrediente_id, negocio_id) references public.ingredientes (id, negocio_id) on delete cascade
);
create index if not exists tamanho_ingredientes_ingrediente_idx on public.tamanho_ingredientes (ingrediente_id);
create index if not exists tamanho_ingredientes_negocio_idx on public.tamanho_ingredientes (negocio_id);

-- O tamanho do item: id (para editar) e o nome copiado (o histórico não muda
-- se o tamanho for renomeado ou removido depois).
alter table public.itens_pedido
  add column if not exists tamanho_id uuid references public.produto_tamanhos (id) on delete cascade,
  add column if not exists tamanho text check (tamanho is null or length(tamanho) between 1 and 20);
create index if not exists itens_pedido_tamanho_idx on public.itens_pedido (tamanho_id);

-- Acesso: o dono lê e liga/desliga o esgotado; o resto só pelas funções.
alter table public.produto_tamanhos enable row level security;
alter table public.tamanho_ingredientes enable row level security;
revoke all on public.produto_tamanhos, public.tamanho_ingredientes from anon, authenticated;
grant select on public.produto_tamanhos, public.tamanho_ingredientes to authenticated;
grant update (disponivel) on public.produto_tamanhos to authenticated;

drop policy if exists "produto_tamanhos isolados por negocio_id" on public.produto_tamanhos;
create policy "produto_tamanhos isolados por negocio_id"
  on public.produto_tamanhos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "produto_tamanhos esgotado pelo negocio" on public.produto_tamanhos;
create policy "produto_tamanhos esgotado pelo negocio"
  on public.produto_tamanhos for update to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "tamanho_ingredientes isolados por negocio_id" on public.tamanho_ingredientes;
create policy "tamanho_ingredientes isolados por negocio_id"
  on public.tamanho_ingredientes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Funções -----------------------------------------------------------------------------

-- Produto com tamanhos: preco e custo do produto acompanham o primeiro tamanho.
create or replace function public.sincronizar_produto_com_tamanhos(p_produto_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.produtos p
  set preco = t.preco, custo = t.custo
  from (
    select preco, custo from public.produto_tamanhos
    where produto_id = p_produto_id and not arquivado
    order by ordem, criado_em
    limit 1
  ) t
  where p.id = p_produto_id;
$$;

create or replace function public.recalcular_custo_do_produto(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.produtos p
  set custo = least(s.total, 99999999.99)
  from (
    select round(sum(pi.quantidade * i.preco_compra / i.quantidade_compra), 2) as total
    from public.produto_ingredientes pi
    join public.ingredientes i on i.id = pi.ingrediente_id
    where pi.produto_id = p_produto_id and i.preco_compra is not null
  ) s
  where p.id = p_produto_id and s.total is not null;

  -- Cada tamanho pela sua própria quantidade de ingredientes.
  update public.produto_tamanhos t
  set custo = least(s.total, 99999.99)
  from (
    select ti.tamanho_id, round(sum(ti.quantidade * i.preco_compra / i.quantidade_compra), 2) as total
    from public.tamanho_ingredientes ti
    join public.produto_tamanhos tt on tt.id = ti.tamanho_id
    join public.ingredientes i on i.id = ti.ingrediente_id
    where tt.produto_id = p_produto_id and i.preco_compra is not null
    group by ti.tamanho_id
  ) s
  where t.id = s.tamanho_id;

  perform public.sincronizar_produto_com_tamanhos(p_produto_id);
end;
$$;

-- Troca de uma vez os tamanhos do produto, na ordem da lista.
-- p_tamanhos: [{ "id": "..." (os que já existem), "nome": "G", "preco": 52,
-- "custo": null, "disponivel": true }]. Quem não está na lista é arquivado.
-- Lista vazia: o produto volta a ter um preço só. Devolve os tamanhos com id.
create or replace function public.salvar_tamanhos_do_produto(p_produto_id uuid, p_tamanhos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_ordem int := 0;
  v_nome text;
  v_preco numeric;
  v_custo numeric;
  v_id uuid;
  v_ids text[];
begin
  perform 1 from public.produtos
  where id = p_produto_id and negocio_id = v_negocio_id
  for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if p_tamanhos is null or jsonb_typeof(p_tamanhos) <> 'array' or jsonb_array_length(p_tamanhos) > 8 then
    raise exception 'Um produto pode ter até 8 tamanhos.';
  end if;
  if jsonb_array_length(p_tamanhos) = 1 then
    raise exception 'Com um tamanho só, use o preço do produto. Tamanhos são 2 ou mais.';
  end if;

  select coalesce(array_agg(value ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(p_tamanhos)
  where jsonb_typeof(value -> 'id') = 'string';

  -- Os que saíram da lista vão para o arquivo (pedidos antigos continuam com o
  -- nome) e deixam de contar no custo.
  update public.produto_tamanhos set arquivado = true
  where produto_id = p_produto_id and not arquivado and not (id::text = any (v_ids));
  delete from public.tamanho_ingredientes ti
  using public.produto_tamanhos t
  where t.id = ti.tamanho_id and t.produto_id = p_produto_id and t.arquivado;
  -- Nome provisório: trocar "P" com "G" de lugar não esbarra no nome único.
  update public.produto_tamanhos set nome = left('~' || id::text, 20)
  where produto_id = p_produto_id and not arquivado;

  for v_item in select value from jsonb_array_elements(p_tamanhos) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'nome') is distinct from 'string'
       or jsonb_typeof(v_item -> 'preco') is distinct from 'number'
       or coalesce(jsonb_typeof(v_item -> 'custo'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(v_item -> 'disponivel'), 'null') not in ('boolean', 'null')
       or coalesce(jsonb_typeof(v_item -> 'id'), 'null') not in ('string', 'null') then
      raise exception 'Tamanho inválido.';
    end if;
    v_nome := trim(regexp_replace(v_item ->> 'nome', '\s+', ' ', 'g'));
    if length(v_nome) not between 1 and 20 then
      raise exception 'O nome de cada tamanho precisa ter de 1 a 20 letras.';
    end if;
    v_preco := round((v_item ->> 'preco')::numeric, 2);
    if v_preco <= 0 or v_preco > 99999.99 then
      raise exception 'Digite o preço de cada tamanho.';
    end if;
    v_custo := round((v_item ->> 'custo')::numeric, 2);
    if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
      raise exception 'O custo de cada tamanho precisa ficar entre 0 e 99.999,99.';
    end if;
    if exists (
      select 1 from public.produto_tamanhos
      where produto_id = p_produto_id and not arquivado and lower(nome) = lower(v_nome)
    ) then
      raise exception 'Dois tamanhos com o nome "%". Use nomes diferentes.', v_nome;
    end if;

    if v_item ->> 'id' is not null then
      update public.produto_tamanhos
      set nome = v_nome, preco = v_preco, custo = v_custo, ordem = v_ordem,
          disponivel = coalesce((v_item ->> 'disponivel')::boolean, disponivel)
      where id::text = v_item ->> 'id' and produto_id = p_produto_id and not arquivado
      returning id into v_id;
      if not found then
        raise exception 'Um dos tamanhos foi removido em outro aparelho. Abra o produto de novo.';
      end if;
    else
      insert into public.produto_tamanhos (produto_id, negocio_id, nome, preco, custo, disponivel, ordem)
      values (p_produto_id, v_negocio_id, v_nome, v_preco, v_custo,
              coalesce((v_item ->> 'disponivel')::boolean, true), v_ordem);
    end if;
    v_ordem := v_ordem + 1;
  end loop;

  perform public.recalcular_custo_do_produto(p_produto_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by ordem)
    from public.produto_tamanhos
    where produto_id = p_produto_id and not arquivado
  ), '[]'::jsonb);
end;
$$;

-- Vários produtos de uma vez, com ou sem tamanhos (cardápio pronto e
-- planilha): tudo ou nada. Nome que já está no cardápio é pulado (tocar duas
-- vezes não duplica). Devolve quantos entraram.
-- p_produtos: [{ "nome": "Pizza Calabresa", "vai_para_cozinha": true,
--   "preco": 40, "custo": null }] ou, com tamanhos, [{ "nome": "...",
--   "tamanhos": [{ "nome": "P", "preco": 32, "custo": null }, ...] }].
create or replace function public.criar_produtos_com_tamanhos(p_produtos jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_tamanho jsonb;
  v_nome text;
  v_produto_id uuid;
  v_ordem int;
  v_criados int := 0;
  v_nome_tamanho text;
  v_preco numeric;
  v_custo numeric;
  v_vistos text[] := '{}';
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_produtos is null or jsonb_typeof(p_produtos) <> 'array' or jsonb_array_length(p_produtos) not between 1 and 300 then
    raise exception 'Envie de 1 a 300 produtos de uma vez.';
  end if;

  for v_item in select value from jsonb_array_elements(p_produtos) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'nome') is distinct from 'string'
       or coalesce(jsonb_typeof(v_item -> 'vai_para_cozinha'), 'null') not in ('boolean', 'null')
       or coalesce(jsonb_typeof(v_item -> 'tamanhos'), 'null') not in ('array', 'null')
       or coalesce(jsonb_typeof(v_item -> 'preco'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(v_item -> 'custo'), 'null') not in ('number', 'null') then
      raise exception 'Produto inválido.';
    end if;
    v_nome := trim(regexp_replace(v_item ->> 'nome', '\s+', ' ', 'g'));
    if length(v_nome) not between 1 and 120 then
      raise exception 'O nome de cada produto precisa ter de 1 a 120 letras.';
    end if;
    -- Já está no cardápio (ou repetido nesta lista): pula.
    if lower(v_nome) = any (v_vistos) or exists (
      select 1 from public.produtos
      where negocio_id = v_negocio_id and not arquivado and lower(trim(nome)) = lower(v_nome)
    ) then
      continue;
    end if;
    v_vistos := v_vistos || lower(v_nome);

    if v_item -> 'tamanhos' is not null and jsonb_array_length(v_item -> 'tamanhos') > 0 then
      if jsonb_array_length(v_item -> 'tamanhos') not between 2 and 8 then
        raise exception '% precisa ter de 2 a 8 tamanhos.', v_nome;
      end if;
      v_preco := null;
      v_custo := null;
    else
      v_preco := round((v_item ->> 'preco')::numeric, 2);
      v_custo := round((v_item ->> 'custo')::numeric, 2);
      if v_preco is null or v_preco <= 0 or v_preco > 99999.99 then
        raise exception 'Digite o preço de %.', v_nome;
      end if;
      if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
        raise exception 'O custo de % precisa ficar entre 0 e 99.999,99.', v_nome;
      end if;
    end if;

    insert into public.produtos (negocio_id, nome, preco, custo, vai_para_cozinha)
    values (v_negocio_id, v_nome, coalesce(v_preco, 0), v_custo, coalesce((v_item ->> 'vai_para_cozinha')::boolean, true))
    returning id into v_produto_id;

    v_ordem := 0;
    for v_tamanho in select value from jsonb_array_elements(coalesce(v_item -> 'tamanhos', '[]'::jsonb)) loop
      if jsonb_typeof(v_tamanho) <> 'object'
         or jsonb_typeof(v_tamanho -> 'nome') is distinct from 'string'
         or jsonb_typeof(v_tamanho -> 'preco') is distinct from 'number'
         or coalesce(jsonb_typeof(v_tamanho -> 'custo'), 'null') not in ('number', 'null') then
        raise exception 'Tamanho inválido em %.', v_nome;
      end if;
      v_nome_tamanho := trim(regexp_replace(v_tamanho ->> 'nome', '\s+', ' ', 'g'));
      if length(v_nome_tamanho) not between 1 and 20 then
        raise exception 'O nome de cada tamanho precisa ter de 1 a 20 letras.';
      end if;
      v_preco := round((v_tamanho ->> 'preco')::numeric, 2);
      v_custo := round((v_tamanho ->> 'custo')::numeric, 2);
      if v_preco <= 0 or v_preco > 99999.99 then
        raise exception 'Digite o preço de cada tamanho de %.', v_nome;
      end if;
      if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
        raise exception 'O custo de cada tamanho precisa ficar entre 0 e 99.999,99.';
      end if;
      if exists (
        select 1 from public.produto_tamanhos
        where produto_id = v_produto_id and not arquivado and lower(nome) = lower(v_nome_tamanho)
      ) then
        raise exception '% tem dois tamanhos com o nome "%".', v_nome, v_nome_tamanho;
      end if;
      insert into public.produto_tamanhos (produto_id, negocio_id, nome, preco, custo, ordem)
      values (v_produto_id, v_negocio_id, v_nome_tamanho, v_preco, v_custo, v_ordem);
      v_ordem := v_ordem + 1;
    end loop;

    perform public.sincronizar_produto_com_tamanhos(v_produto_id);
    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;

-- Troca de uma vez a lista de ingredientes do produto.
-- Sem tamanhos: [{ "ingrediente_id": "...", "quantidade": 120 }].
-- Com tamanhos: [{ "ingrediente_id": "...", "por_tamanho": { "<tamanho_id>": 120, ... } }];
-- o ingrediente pode faltar em algum tamanho (borda só na G), mas não em todos.
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
  v_com_tamanhos boolean;
  v_tamanho record;
  v_maior numeric;
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
  v_com_tamanhos := exists (select 1 from public.produto_tamanhos where produto_id = p_produto_id and not arquivado);

  delete from public.produto_ingredientes where produto_id = p_produto_id;
  delete from public.tamanho_ingredientes ti
  using public.produto_tamanhos t
  where t.id = ti.tamanho_id and t.produto_id = p_produto_id;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'ingrediente_id') is distinct from 'string' then
      raise exception 'Ingrediente inválido.';
    end if;
    select id into v_ingrediente_id from public.ingredientes
    where id::text = v_item ->> 'ingrediente_id' and negocio_id = v_negocio_id and not arquivado;
    if not found then
      raise exception 'Um dos ingredientes foi excluído. Revise a lista.';
    end if;

    if v_com_tamanhos then
      if jsonb_typeof(v_item -> 'por_tamanho') is distinct from 'object' then
        raise exception 'Este produto tem tamanhos. Atualize a página e diga quanto vai em cada tamanho.';
      end if;
      v_maior := null;
      for v_tamanho in
        select t.id, (v_item -> 'por_tamanho' ->> t.id::text) as valor
        from public.produto_tamanhos t
        where t.produto_id = p_produto_id and not t.arquivado
      loop
        if v_tamanho.valor is null then
          continue;
        end if;
        v_quantidade := round(v_tamanho.valor::numeric, 3);
        if v_quantidade <= 0 or v_quantidade > 100000 then
          raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
        end if;
        insert into public.tamanho_ingredientes (tamanho_id, ingrediente_id, negocio_id, quantidade)
        values (v_tamanho.id, v_ingrediente_id, v_negocio_id, v_quantidade)
        on conflict (tamanho_id, ingrediente_id) do update set quantidade = excluded.quantidade;
        v_maior := greatest(coalesce(v_maior, 0), v_quantidade);
      end loop;
      if v_maior is null then
        raise exception 'Diga quanto vai de cada ingrediente em pelo menos um tamanho.';
      end if;
      v_quantidade := v_maior;
    else
      if jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
        raise exception 'Ingrediente inválido.';
      end if;
      v_quantidade := round((v_item ->> 'quantidade')::numeric, 3);
      if v_quantidade <= 0 or v_quantidade > 100000 then
        raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
      end if;
    end if;

    -- A lista do produto (o que ele leva): vale para o "faltou" da cozinha.
    insert into public.produto_ingredientes (produto_id, ingrediente_id, negocio_id, quantidade)
    values (p_produto_id, v_ingrediente_id, v_negocio_id, v_quantidade)
    on conflict (produto_id, ingrediente_id) do update set quantidade = excluded.quantidade;
  end loop;

  perform public.recalcular_custo_do_produto(p_produto_id);
end;
$$;

-- Excluir (arquivar) um ingrediente também tira ele dos tamanhos.
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
    delete from public.tamanho_ingredientes where ingrediente_id = new.id;
  end if;

  foreach v_produto in array v_produtos loop
    perform public.recalcular_custo_do_produto(v_produto);
  end loop;
  return new;
end;
$$;

-- Grava os itens com preço e custo do cadastro (do tamanho, quando tem). Na
-- edição, p_anteriores traz { "produto_id|tamanho_id": { preco, custo, tamanho } }
-- do que já estava no pedido: esses itens mantêm o preço combinado e
-- continuam aceitos mesmo que tenham esgotado ou saído do cardápio depois.
create or replace function public.gravar_itens_pedido(
  p_pedido_id uuid,
  p_negocio_id uuid,
  p_itens jsonb,
  p_anteriores jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_produto public.produtos;
  v_tamanho public.produto_tamanhos;
  v_tamanho_id uuid;
  v_nome_tamanho text;
  v_chave text;
  v_quantidade int;
  v_observacao text;
  v_ja_estava boolean;
  v_preco numeric(10, 2);
  v_custo numeric(10, 2);
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'O pedido precisa ter de 1 a 100 itens.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    -- "is distinct from" porque uma chave ausente dá null, e "null <> x" não é verdadeiro.
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'produto_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number'
       or coalesce(jsonb_typeof(v_item -> 'observacao'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_item -> 'tamanho_id'), 'null') not in ('string', 'null') then
      raise exception 'Item do pedido inválido.';
    end if;

    v_quantidade := (v_item ->> 'quantidade')::int;
    if v_quantidade not between 1 and 999 then
      raise exception 'A quantidade precisa ficar entre 1 e 999.';
    end if;

    v_observacao := nullif(trim(v_item ->> 'observacao'), '');
    if length(v_observacao) > 140 then
      raise exception 'A observação pode ter no máximo 140 caracteres.';
    end if;

    -- "for share" impede que o produto seja alterado no meio do pedido.
    select * into v_produto from public.produtos
    where id::text = v_item ->> 'produto_id' and negocio_id = p_negocio_id
    for share;
    if not found then
      raise exception 'Um dos produtos esgotou. Revise o pedido.';
    end if;

    v_tamanho_id := null;
    v_nome_tamanho := null;
    if v_item ->> 'tamanho_id' is not null then
      select * into v_tamanho from public.produto_tamanhos
      where id::text = v_item ->> 'tamanho_id' and produto_id = v_produto.id
      for share;
      if not found then
        raise exception 'Um dos tamanhos saiu do cardápio. Lance o pedido de novo.';
      end if;
      v_tamanho_id := v_tamanho.id;
      v_nome_tamanho := v_tamanho.nome;
    end if;

    v_chave := v_produto.id::text || '|' || coalesce(v_tamanho_id::text, '');
    v_ja_estava := p_anteriores ? v_chave;

    if not v_ja_estava then
      if not v_produto.disponivel or v_produto.arquivado then
        raise exception 'Um dos produtos esgotou. Revise o pedido.';
      end if;
      if v_tamanho_id is null and exists (
        select 1 from public.produto_tamanhos where produto_id = v_produto.id and not arquivado
      ) then
        raise exception 'Escolha o tamanho de %. Revise o pedido.', v_produto.nome;
      end if;
      if v_tamanho_id is not null and v_tamanho.arquivado then
        raise exception 'O tamanho % de % saiu do cardápio. Lance o pedido de novo.', v_tamanho.nome, v_produto.nome;
      end if;
      if v_tamanho_id is not null and not v_tamanho.disponivel then
        raise exception 'Um dos produtos esgotou. Revise o pedido.';
      end if;
    end if;

    if v_ja_estava then
      v_preco := (p_anteriores -> v_chave ->> 'preco')::numeric;
      v_custo := (p_anteriores -> v_chave ->> 'custo')::numeric;
      -- O nome que o item já tinha, mesmo que o tamanho tenha sido renomeado.
      v_nome_tamanho := coalesce(p_anteriores -> v_chave ->> 'tamanho', v_nome_tamanho);
    elsif v_tamanho_id is not null then
      v_preco := v_tamanho.preco;
      v_custo := v_tamanho.custo;
    else
      v_preco := v_produto.preco;
      v_custo := v_produto.custo;
    end if;

    insert into public.itens_pedido (
      pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao, tamanho_id, tamanho
    )
    values (p_pedido_id, v_produto.id, v_quantidade, v_preco, v_custo, v_observacao, v_tamanho_id, v_nome_tamanho);
  end loop;
end;
$$;

create or replace function public.editar_pedido(
  p_pedido_id uuid,
  p_itens jsonb,
  p_versao timestamptz,
  p_mesa int default null,
  p_nome_mesa text default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_anteriores jsonb;
  v_total_antes numeric;
  v_total_depois numeric;
  v_para_cozinha boolean;
  v_nome_mesa text := public.limpar_nome_mesa(p_nome_mesa);
begin
  if p_mesa is not null and p_mesa not between 1 and 999 then
    raise exception 'O número da mesa precisa ficar entre 1 e 999.';
  end if;

  select * into v_pedido from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.status not in ('pendente', 'em_preparo') then
    raise exception 'Este pedido já ficou pronto ou foi encerrado. Lance um pedido novo.';
  end if;
  if v_pedido.alterado_em is distinct from p_versao then
    raise exception 'Outra pessoa alterou este pedido agora há pouco. Abra o pedido de novo para ver como ficou.';
  end if;

  -- Chave: produto e tamanho. Trocar a P pela G é um item novo, com o preço da G.
  select coalesce(
    jsonb_object_agg(
      produto_id::text || '|' || coalesce(tamanho_id::text, ''),
      jsonb_build_object('preco', preco_unitario, 'custo', custo_unitario, 'tamanho', tamanho)
    ),
    '{}'::jsonb
  )
  into v_anteriores
  from public.itens_pedido where pedido_id = p_pedido_id;
  select coalesce(sum(quantidade * preco_unitario), 0) into v_total_antes
  from public.itens_pedido where pedido_id = p_pedido_id;

  delete from public.itens_pedido where pedido_id = p_pedido_id;
  perform public.gravar_itens_pedido(p_pedido_id, v_pedido.negocio_id, p_itens, v_anteriores);

  select coalesce(sum(i.quantidade * i.preco_unitario), 0), coalesce(bool_or(pr.vai_para_cozinha), false)
  into v_total_depois, v_para_cozinha
  from public.itens_pedido i
  join public.produtos pr on pr.id = i.produto_id
  where i.pedido_id = p_pedido_id;

  -- Recebido numa conta de mesa já fechada: a conta guarda quanto entrou e de
  -- que forma. Mudar o valor só desfazendo o recebimento da conta.
  if v_pedido.conta_id is not null and v_total_depois <> v_total_antes then
    raise exception 'Este pedido já foi pago na conta da mesa. Para mudar o valor, desfaça o recebimento da conta no Caixa.';
  end if;

  -- Já pago e o valor mudou: o recebimento não vale mais para o pedido novo.
  -- Volta para "a receber" (o caixa não pode contar como pago o que não foi).
  -- Ficou só com bebida: sai da fila da cozinha, como no criar_pedido.
  update public.pedidos
  set mesa = case when v_pedido.conta_id is null then p_mesa else v_pedido.mesa end,
      nome_mesa = case
        when v_pedido.conta_id is not null then v_pedido.nome_mesa
        when p_mesa is null then null
        when v_nome_mesa is not null then v_nome_mesa
        when p_mesa = v_pedido.mesa then v_pedido.nome_mesa
      end,
      alterado_em = now(),
      atualizado_em = now(),
      forma_pagamento = case when v_total_depois = v_total_antes then forma_pagamento end,
      pago_em = case when v_total_depois = v_total_antes then pago_em end,
      status = case when v_para_cozinha then status else 'pronto' end,
      pronto_em = case when v_para_cozinha then pronto_em else now() end
  where id = p_pedido_id
  returning * into v_pedido;
  return v_pedido;
end;
$$;

revoke all on function public.sincronizar_produto_com_tamanhos(uuid) from public, anon, authenticated;
revoke all on function public.recalcular_custo_do_produto(uuid) from public, anon, authenticated;
revoke all on function public.salvar_tamanhos_do_produto(uuid, jsonb) from public, anon;
grant execute on function public.salvar_tamanhos_do_produto(uuid, jsonb) to authenticated;
revoke all on function public.criar_produtos_com_tamanhos(jsonb) from public, anon;
grant execute on function public.criar_produtos_com_tamanhos(jsonb) to authenticated;

-- Tempo real: ligar ou desligar o esgotado de um tamanho atualiza as telas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'produto_tamanhos'
  ) then
    alter publication supabase_realtime add table public.produto_tamanhos;
  end if;
end;
$$;

-- Versão do banco ----------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261113;
$$;

commit;
