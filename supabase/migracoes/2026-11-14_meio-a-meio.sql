-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-13_tamanhos.sql (este arquivo sobe a versão do banco
-- para 20261114). Pode rodar a qualquer hora: não muda nada do que já existe.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Meio a meio (pizza ½ Calabresa + ½ Portuguesa):
-- 1. negocios.regra_meio_a_meio: o dono escolhe uma vez como cobra, pelo
--    sabor mais caro ou pela média dos dois.
-- 2. produtos.meio_a_meio: o dono marca o que pode ser meio a meio. Os sabores
--    só se juntam entre produtos marcados e com o mesmo tamanho (G com G).
-- 3. itens_pedido guarda o segundo sabor (id, tamanho e nome copiado). O preço
--    fica no item: mudar a regra depois não muda os pedidos feitos.
-- 4. A cozinha pode dizer que faltou um ingrediente de qualquer um dos sabores.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'produto_tamanhos'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-13_tamanhos.sql';
  end if;
end;
$$;

-- Colunas -----------------------------------------------------------------------------

-- Vazio: o dono ainda não escolheu (a tela pergunta ao marcar o primeiro
-- produto como meio a meio).
alter table public.negocios
  add column if not exists regra_meio_a_meio text check (regra_meio_a_meio in ('mais_caro', 'media'));

alter table public.produtos
  add column if not exists meio_a_meio boolean not null default false;

-- O segundo sabor do item. Sem chave estrangeira de propósito: uma segunda
-- ligação de itens_pedido com produtos deixaria ambíguas as consultas que já
-- leem "produtos ( nome )" pelo item. Quem garante que o sabor existe e é do
-- mesmo negócio é gravar_itens_pedido. O nome é copiado: o histórico não muda
-- se o sabor for renomeado ou arquivado depois.
alter table public.itens_pedido
  add column if not exists segundo_produto_id uuid,
  add column if not exists segundo_tamanho_id uuid,
  add column if not exists segundo_sabor text check (segundo_sabor is null or length(segundo_sabor) between 1 and 120);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'itens_pedido_segundo_sabor_completo'
  ) then
    alter table public.itens_pedido
      add constraint itens_pedido_segundo_sabor_completo
      check ((segundo_produto_id is null) = (segundo_sabor is null));
  end if;
end;
$$;

-- Funções -----------------------------------------------------------------------------

-- Só o dono: como cobra o meio a meio. Vale só para os pedidos novos.
create or replace function public.configurar_meio_a_meio(p_regra text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
begin
  select negocio_id into v_negocio_id
  from public.usuarios
  where id = (select auth.uid()) and papel = 'admin';
  if v_negocio_id is null then
    raise exception 'Só o dono do negócio pode mudar como cobra o meio a meio.';
  end if;
  if p_regra is null or p_regra not in ('mais_caro', 'media') then
    raise exception 'Escolha como cobrar o meio a meio.';
  end if;
  update public.negocios set regra_meio_a_meio = p_regra where id = v_negocio_id;
end;
$$;

-- Cardápio pronto e planilha: agora também com "meio_a_meio" em cada produto.
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
       or coalesce(jsonb_typeof(v_item -> 'meio_a_meio'), 'null') not in ('boolean', 'null')
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

    insert into public.produtos (negocio_id, nome, preco, custo, vai_para_cozinha, meio_a_meio)
    values (
      v_negocio_id, v_nome, coalesce(v_preco, 0), v_custo,
      coalesce((v_item ->> 'vai_para_cozinha')::boolean, true),
      coalesce((v_item ->> 'meio_a_meio')::boolean, false)
    )
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

-- Grava os itens com preço e custo do cadastro (do tamanho, quando tem). Na
-- edição, p_anteriores traz { "produto_id|tamanho_id|segundo_produto_id":
-- { preco, custo, tamanho, segundo_tamanho_id, segundo_sabor } } do que já
-- estava no pedido: esses itens mantêm o preço combinado e continuam aceitos
-- mesmo que tenham esgotado ou saído do cardápio depois.
-- Meio a meio: o item traz "segundo_produto_id". O tamanho do segundo sabor é
-- o de mesmo nome (G com G); o preço segue a regra do negócio e o custo é a
-- metade do custo de cada sabor.
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
  v_segundo public.produtos;
  v_segundo_tamanho public.produto_tamanhos;
  v_segundo_id uuid;
  v_segundo_tamanho_id uuid;
  v_segundo_sabor text;
  v_regra text;
  v_chave text;
  v_quantidade int;
  v_observacao text;
  v_ja_estava boolean;
  v_preco numeric(10, 2);
  v_custo numeric(10, 2);
  v_preco_2 numeric(10, 2);
  v_custo_2 numeric(10, 2);
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
       or coalesce(jsonb_typeof(v_item -> 'tamanho_id'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_item -> 'segundo_produto_id'), 'null') not in ('string', 'null') then
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

    v_segundo_id := null;
    if v_item ->> 'segundo_produto_id' is not null then
      select * into v_segundo from public.produtos
      where id::text = v_item ->> 'segundo_produto_id' and negocio_id = p_negocio_id
      for share;
      if not found then
        raise exception 'Um dos sabores saiu do cardápio. Lance o pedido de novo.';
      end if;
      if v_segundo.id = v_produto.id then
        raise exception 'Escolha dois sabores diferentes para o meio a meio.';
      end if;
      v_segundo_id := v_segundo.id;
    end if;

    v_chave := v_produto.id::text || '|' || coalesce(v_tamanho_id::text, '') || '|' || coalesce(v_segundo_id::text, '');
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

    v_segundo_tamanho_id := null;
    v_segundo_sabor := null;
    if v_segundo_id is not null and v_ja_estava then
      v_segundo_tamanho_id := (p_anteriores -> v_chave ->> 'segundo_tamanho_id')::uuid;
      v_segundo_sabor := coalesce(p_anteriores -> v_chave ->> 'segundo_sabor', v_segundo.nome);
    elsif v_segundo_id is not null then
      if not v_produto.meio_a_meio then
        raise exception '% não pode ser meio a meio. Revise o pedido.', v_produto.nome;
      end if;
      if v_segundo.arquivado then
        raise exception 'O sabor % saiu do cardápio. Lance o pedido de novo.', v_segundo.nome;
      end if;
      if not v_segundo.meio_a_meio then
        raise exception '% não pode ser meio a meio. Revise o pedido.', v_segundo.nome;
      end if;
      if not v_segundo.disponivel then
        raise exception 'O sabor % esgotou. Revise o pedido.', v_segundo.nome;
      end if;
      if v_tamanho_id is not null then
        select * into v_segundo_tamanho from public.produto_tamanhos
        where produto_id = v_segundo.id and not arquivado and lower(nome) = lower(v_tamanho.nome)
        for share;
        if not found then
          raise exception 'O sabor % não tem o tamanho %. Revise o pedido.', v_segundo.nome, v_tamanho.nome;
        end if;
        if not v_segundo_tamanho.disponivel then
          raise exception 'O sabor % esgotou no tamanho %. Revise o pedido.', v_segundo.nome, v_tamanho.nome;
        end if;
        v_segundo_tamanho_id := v_segundo_tamanho.id;
        v_preco_2 := v_segundo_tamanho.preco;
        v_custo_2 := v_segundo_tamanho.custo;
      else
        if exists (
          select 1 from public.produto_tamanhos where produto_id = v_segundo.id and not arquivado
        ) then
          raise exception 'Os dois sabores precisam ter o mesmo tamanho. Revise o pedido.';
        end if;
        v_preco_2 := v_segundo.preco;
        v_custo_2 := v_segundo.custo;
      end if;
      v_segundo_sabor := v_segundo.nome;
      select regra_meio_a_meio into v_regra from public.negocios where id = p_negocio_id;
      if v_regra is null then
        raise exception 'Escolha em Minha conta como cobrar o meio a meio.';
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

    if v_segundo_id is not null and not v_ja_estava then
      v_preco := case when v_regra = 'mais_caro' then greatest(v_preco, v_preco_2) else round((v_preco + v_preco_2) / 2, 2) end;
      -- Sem o custo de um dos sabores, o custo do item fica sem saber.
      v_custo := round(v_custo / 2 + v_custo_2 / 2, 2);
    end if;

    insert into public.itens_pedido (
      pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao, tamanho_id, tamanho,
      segundo_produto_id, segundo_tamanho_id, segundo_sabor
    )
    values (
      p_pedido_id, v_produto.id, v_quantidade, v_preco, v_custo, v_observacao, v_tamanho_id, v_nome_tamanho,
      v_segundo_id, v_segundo_tamanho_id, v_segundo_sabor
    );
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

  -- Chave: produto, tamanho e segundo sabor. Trocar a P pela G, ou trocar um
  -- dos sabores, é um item novo, com o preço de hoje.
  select coalesce(
    jsonb_object_agg(
      produto_id::text || '|' || coalesce(tamanho_id::text, '') || '|' || coalesce(segundo_produto_id::text, ''),
      jsonb_build_object(
        'preco', preco_unitario, 'custo', custo_unitario, 'tamanho', tamanho,
        'segundo_tamanho_id', segundo_tamanho_id, 'segundo_sabor', segundo_sabor
      )
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

-- A cozinha avisa que faltou um ingrediente de um item ("faltou queijo"). Só
-- aceita ingrediente que está no produto (ou no segundo sabor, no meio a
-- meio). Mexe em atualizado_em do pedido para o tempo real avisar a tela do
-- atendente.
create or replace function public.marcar_ingrediente_faltou(p_item_id uuid, p_ingrediente_id uuid, p_faltou boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_produto_id uuid;
  v_segundo_id uuid;
  v_nome text;
begin
  select p.id, i.produto_id, i.segundo_produto_id into v_pedido_id, v_produto_id, v_segundo_id
  from public.itens_pedido i
  join public.pedidos p on p.id = i.pedido_id
  where i.id = p_item_id
    and p.negocio_id = public.negocio_do_usuario_atual()
    and p.status in ('pendente', 'em_preparo')
  for update of p;
  if not found then
    raise exception 'Este pedido não está mais na fila.';
  end if;

  -- O evento fica com o sabor que tem o ingrediente (o primeiro, se os dois têm).
  select g.nome, pi.produto_id into v_nome, v_produto_id
  from public.produto_ingredientes pi
  join public.ingredientes g on g.id = pi.ingrediente_id
  where pi.ingrediente_id = p_ingrediente_id
    and (pi.produto_id = v_produto_id or pi.produto_id = v_segundo_id)
  order by pi.produto_id = v_produto_id desc
  limit 1;
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
  -- Toque duplo ou marca e desmarca: a mesma falta conta uma vez só.
  if coalesce(p_faltou, false) then
    insert into public.eventos (negocio_id, tipo, produto_id, pedido_id, detalhe)
    select p.negocio_id, 'faltou_ingrediente', v_produto_id, p.id, left(v_nome, 60)
    from public.pedidos p
    where p.id = v_pedido_id
      and not exists (
        select 1 from public.eventos e
        where e.pedido_id = p.id and e.produto_id = v_produto_id
          and e.tipo = 'faltou_ingrediente' and e.detalhe = left(v_nome, 60)
      );
  end if;
end;
$$;

revoke all on function public.configurar_meio_a_meio(text) from public, anon;
grant execute on function public.configurar_meio_a_meio(text) to authenticated;

-- Versão do banco ----------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261114;
$$;

commit;
