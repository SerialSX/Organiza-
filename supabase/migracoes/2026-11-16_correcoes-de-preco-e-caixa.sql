-- Correções da Etapa 10. Executar depois da migração 2026-11-15.
begin;
do $$
begin
  if to_regclass('public.combos') is null then
    raise exception 'Rode antes supabase/migracoes/2026-11-15_combos-e-promocoes.sql';
  end if;
end;
$$;

create or replace function public.momento_da_promocao(p_item jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_momento timestamptz;
begin
  -- Janela de 12 horas exclusivamente para criação de pedidos da fila offline.
  -- editar_pedido remove promocao_em antes de gravar os itens.
  if jsonb_typeof(p_item -> 'promocao_em') is distinct from 'string' then
    return now();
  end if;
  begin
    v_momento := (p_item ->> 'promocao_em')::timestamptz;
  exception when others then
    return now();
  end;
  if v_momento < now() - interval '12 hours' or v_momento > now() + interval '5 minutes' then
    return now();
  end if;
  return least(v_momento, now());
end;
$$;

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
  v_lote jsonb;
  v_lotes jsonb;
  v_restantes jsonb;
  v_falta int;
  v_usar int;
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
  v_momento timestamptz;
  v_promocao record;
  v_promocao_2 record;
  v_promocao_id uuid;
  v_promocao_nome text;
  v_preco_cheio numeric(10, 2);
  v_efetivo numeric(10, 2);
  v_efetivo_2 numeric(10, 2);
  v_normal_1 numeric(10, 2);
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'O pedido precisa ter de 1 a 100 itens.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    -- Divide a quantidade entre os lotes já combinados e o excedente de hoje.
    -- Atualiza o saldo local também quando o payload repete a mesma chave.
    if v_item ? 'combo_id' and jsonb_typeof(v_item -> 'partes') = 'array' then
      select 'c|' || (v_item ->> 'combo_id') || '|' || string_agg(
        (e.value ->> 'produto_id') || '|' || coalesce(e.value ->> 'tamanho_id', '') || '|' || coalesce(e.value ->> 'segundo_produto_id', ''),
        ';' order by e.ordinality) into v_chave
      from jsonb_array_elements(v_item -> 'partes') with ordinality e;
    else
      v_chave := (v_item ->> 'produto_id') || '|' || coalesce(v_item ->> 'tamanho_id', '') || '|' || coalesce(v_item ->> 'segundo_produto_id', '');
    end if;
    v_lotes := p_anteriores -> v_chave -> 'lotes';
    if v_lotes is not null then
      if jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
        raise exception 'Item do pedido inválido.';
      end if;
      v_falta := (v_item ->> 'quantidade')::int;
      if v_falta not between 1 and 999 then
        raise exception 'A quantidade precisa ficar entre 1 e 999.';
      end if;
      v_restantes := '[]'::jsonb;
      for v_lote in select value from jsonb_array_elements(v_lotes) loop
        v_usar := least(v_falta, (v_lote ->> 'quantidade')::int);
        if v_usar > 0 then
          perform public.gravar_itens_pedido(p_pedido_id, p_negocio_id,
            jsonb_build_array(v_item || jsonb_build_object('quantidade', v_usar)), jsonb_build_object(v_chave, v_lote));
          v_falta := v_falta - v_usar;
        end if;
        if (v_lote ->> 'quantidade')::int > v_usar then
          v_restantes := v_restantes || jsonb_build_array(v_lote || jsonb_build_object('quantidade', (v_lote ->> 'quantidade')::int - v_usar));
        end if;
      end loop;
      p_anteriores := jsonb_set(p_anteriores, array[v_chave, 'lotes'], v_restantes);
      if v_falta > 0 then
        perform public.gravar_itens_pedido(p_pedido_id, p_negocio_id,
          jsonb_build_array(v_item || jsonb_build_object('quantidade', v_falta)), '{}');
      end if;
      continue;
    end if;
    if jsonb_typeof(v_item) = 'object' and v_item ? 'combo_id' then
      perform public.gravar_combo_do_pedido(p_pedido_id, p_negocio_id, v_item, coalesce(p_anteriores, '{}'::jsonb));
      continue;
    end if;

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

    v_promocao_id := null;
    v_promocao_nome := null;
    v_preco_cheio := null;
    if v_ja_estava then
      v_preco := (p_anteriores -> v_chave ->> 'preco')::numeric;
      v_custo := (p_anteriores -> v_chave ->> 'custo')::numeric;
      -- O nome que o item já tinha, mesmo que o tamanho tenha sido renomeado.
      v_nome_tamanho := coalesce(p_anteriores -> v_chave ->> 'tamanho', v_nome_tamanho);
      -- A promoção que deu o preço continua no item, mesmo que já tenha acabado.
      v_promocao_id := (select id from public.promocoes where id::text = p_anteriores -> v_chave ->> 'promocao_id');
      v_promocao_nome := p_anteriores -> v_chave ->> 'promocao';
      v_preco_cheio := (p_anteriores -> v_chave ->> 'preco_cheio')::numeric;
    elsif v_tamanho_id is not null then
      v_preco := v_tamanho.preco;
      v_custo := v_tamanho.custo;
    else
      v_preco := v_produto.preco;
      v_custo := v_produto.custo;
    end if;

    if not v_ja_estava then
      v_momento := public.momento_da_promocao(v_item);
      select * into v_promocao from public.preco_em_promocao(p_negocio_id, v_produto.id, v_tamanho_id, null, v_momento);
      v_efetivo := case when v_promocao.preco < v_preco then v_promocao.preco else v_preco end;
      if v_segundo_id is not null then
        -- Meio a meio: cada metade pelo preço que tem agora (com a promoção, se
        -- tiver), e a regra do negócio por cima.
        select * into v_promocao_2
        from public.preco_em_promocao(p_negocio_id, v_segundo.id, v_segundo_tamanho_id, null, v_momento);
        v_efetivo_2 := case when v_promocao_2.preco < v_preco_2 then v_promocao_2.preco else v_preco_2 end;
        v_normal_1 := v_preco;
        v_preco_cheio := case when v_regra = 'mais_caro' then greatest(v_preco, v_preco_2) else round((v_preco + v_preco_2) / 2, 2) end;
        v_preco := case when v_regra = 'mais_caro' then greatest(v_efetivo, v_efetivo_2) else round((v_efetivo + v_efetivo_2) / 2, 2) end;
        -- Sem o custo de um dos sabores, o custo do item fica sem saber.
        v_custo := round(v_custo / 2 + v_custo_2 / 2, 2);
        if v_preco < v_preco_cheio then
          -- Mais caro: o desconto vem da metade de preço normal maior (é ela que dá o
          -- preço cheio); com preços normais iguais, a de preço efetivo maior.
          -- Média: a metade que teve o maior desconto, antes de combinar os preços.
          if (v_regra = 'mais_caro' and (v_normal_1 > v_preco_2 or (v_normal_1 = v_preco_2 and v_efetivo >= v_efetivo_2)))
             or (v_regra = 'media' and v_normal_1 - v_efetivo >= v_preco_2 - v_efetivo_2) then
            v_promocao_id := v_promocao.promocao_id;
            v_promocao_nome := v_promocao.promocao;
          else
            v_promocao_id := v_promocao_2.promocao_id;
            v_promocao_nome := v_promocao_2.promocao;
          end if;
        else
          v_preco_cheio := null;
        end if;
      elsif v_efetivo < v_preco then
        v_preco_cheio := v_preco;
        v_preco := v_efetivo;
        v_promocao_id := v_promocao.promocao_id;
        v_promocao_nome := v_promocao.promocao;
      end if;
    end if;

    insert into public.itens_pedido (
      pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao, tamanho_id, tamanho,
      segundo_produto_id, segundo_tamanho_id, segundo_sabor, promocao_id, promocao, preco_cheio, faltou, faltou_ingredientes
    )
    values (
      p_pedido_id, v_produto.id, v_quantidade, v_preco, v_custo, v_observacao, v_tamanho_id, v_nome_tamanho,
      v_segundo_id, v_segundo_tamanho_id, v_segundo_sabor, v_promocao_id, v_promocao_nome, v_preco_cheio,
      coalesce((p_anteriores -> v_chave ->> 'faltou')::boolean, false),
      array(select jsonb_array_elements_text(coalesce(p_anteriores -> v_chave -> 'faltou_ingredientes', '[]'::jsonb)))
    );
  end loop;
end;
$$;

create or replace function public.gravar_combo_do_pedido(
  p_pedido_id uuid,
  p_negocio_id uuid,
  p_item jsonb,
  p_anteriores jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_combo public.combos;
  v_partes jsonb := p_item -> 'partes';
  v_quantidade int;
  v_observacao text;
  v_chave text;
  v_anterior jsonb;
  v_linha jsonb;
  v_linhas jsonb := '[]'::jsonb;
  v_grupo uuid := gen_random_uuid();
  v_parte public.combo_partes;
  v_escolha jsonb;
  v_opcao public.combo_opcoes;
  v_opcao_2 public.combo_opcoes;
  v_produto public.produtos;
  v_tamanho public.produto_tamanhos;
  v_segundo public.produtos;
  v_tamanho_2 public.produto_tamanhos;
  v_i int := 0;
  v_n int;
  v_base numeric;
  v_base_2 numeric;
  v_custo numeric;
  v_acrescimo numeric;
  v_bases numeric[] := '{}';
  v_total numeric;
  v_cheio numeric;
  v_divisao numeric[];
  v_divisao_cheia numeric[];
  v_promocao record;
  v_promocao_id uuid;
  v_promocao_nome text;
begin
  if jsonb_typeof(p_item -> 'combo_id') is distinct from 'string'
     or jsonb_typeof(p_item -> 'quantidade') is distinct from 'number'
     or coalesce(jsonb_typeof(p_item -> 'observacao'), 'null') not in ('string', 'null')
     or jsonb_typeof(v_partes) is distinct from 'array'
     or jsonb_array_length(v_partes) not between 1 and 12
     or exists (
       select 1 from jsonb_array_elements(v_partes) e
       where jsonb_typeof(e.value) <> 'object'
          or jsonb_typeof(e.value -> 'produto_id') is distinct from 'string'
          or coalesce(jsonb_typeof(e.value -> 'tamanho_id'), 'null') not in ('string', 'null')
          or coalesce(jsonb_typeof(e.value -> 'segundo_produto_id'), 'null') not in ('string', 'null')
     ) then
    raise exception 'Item do pedido inválido.';
  end if;

  v_quantidade := (p_item ->> 'quantidade')::int;
  if v_quantidade not between 1 and 999 then
    raise exception 'A quantidade precisa ficar entre 1 e 999.';
  end if;
  v_observacao := nullif(trim(p_item ->> 'observacao'), '');
  if length(v_observacao) > 140 then
    raise exception 'A observação pode ter no máximo 140 caracteres.';
  end if;

  select * into v_combo from public.combos
  where id::text = p_item ->> 'combo_id' and negocio_id = p_negocio_id
  for share;
  if not found then
    raise exception 'Um dos combos saiu do cardápio. Lance o pedido de novo.';
  end if;

  -- Mesma chave do editar_pedido: o combo e o que foi escolhido em cada parte.
  select 'c|' || v_combo.id::text || '|' || string_agg(
    (e.value ->> 'produto_id') || '|' || coalesce(e.value ->> 'tamanho_id', '') || '|' || coalesce(e.value ->> 'segundo_produto_id', ''),
    ';' order by e.ordinality
  )
  into v_chave
  from jsonb_array_elements(v_partes) with ordinality e;
  v_anterior := p_anteriores -> v_chave;

  if v_anterior is not null then
    for v_linha in select value from jsonb_array_elements(v_anterior -> 'linhas') loop
      insert into public.itens_pedido (
        pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao, tamanho_id, tamanho,
        segundo_produto_id, segundo_tamanho_id, segundo_sabor,
        combo_id, combo_nome, combo_grupo, combo_parte, promocao_id, promocao, preco_cheio, faltou, faltou_ingredientes
      )
      values (
        p_pedido_id, (v_linha ->> 'produto_id')::uuid, v_quantidade, (v_linha ->> 'preco')::numeric,
        (v_linha ->> 'custo')::numeric, v_observacao, (v_linha ->> 'tamanho_id')::uuid, v_linha ->> 'tamanho',
        (v_linha ->> 'segundo_produto_id')::uuid, (v_linha ->> 'segundo_tamanho_id')::uuid, v_linha ->> 'segundo_sabor',
        v_combo.id, v_anterior ->> 'nome', v_grupo, (v_linha ->> 'parte')::smallint,
        -- A promoção pode ter sido apagada depois: fica só o nome.
        (select id from public.promocoes where id::text = v_linha ->> 'promocao_id'),
        v_linha ->> 'promocao', (v_linha ->> 'preco_cheio')::numeric,
        coalesce((v_linha ->> 'faltou')::boolean, false),
        array(select jsonb_array_elements_text(coalesce(v_linha -> 'faltou_ingredientes', '[]'::jsonb)))
      );
    end loop;
    return;
  end if;

  if v_combo.arquivado then
    raise exception 'O combo % saiu do cardápio. Lance o pedido de novo.', v_combo.nome;
  end if;
  if not v_combo.disponivel then
    raise exception 'O combo % esgotou. Revise o pedido.', v_combo.nome;
  end if;
  select count(*) into v_n from public.combo_partes where combo_id = v_combo.id;
  if jsonb_array_length(v_partes) <> v_n then
    raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
  end if;

  for v_parte in select * from public.combo_partes where combo_id = v_combo.id order by ordem loop
    v_escolha := v_partes -> v_i;

    select * into v_opcao from public.combo_opcoes
    where parte_id = v_parte.id
      and produto_id::text = v_escolha ->> 'produto_id'
      and tamanho_id is not distinct from (v_escolha ->> 'tamanho_id')::uuid;
    if not found then
      raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
    end if;

    select * into v_produto from public.produtos where id = v_opcao.produto_id for share;
    if v_produto.arquivado then
      raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
    end if;
    if not v_produto.disponivel then
      raise exception 'No combo %, % esgotou. Revise o pedido.', v_combo.nome, v_produto.nome;
    end if;
    v_tamanho := null;
    if v_opcao.tamanho_id is not null then
      select * into v_tamanho from public.produto_tamanhos where id = v_opcao.tamanho_id for share;
      if v_tamanho.arquivado then
        raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
      end if;
      if not v_tamanho.disponivel then
        raise exception 'No combo %, % % esgotou. Revise o pedido.', v_combo.nome, v_produto.nome, v_tamanho.nome;
      end if;
      v_base := v_tamanho.preco;
      v_custo := v_tamanho.custo;
    else
      if exists (select 1 from public.produto_tamanhos where produto_id = v_produto.id and not arquivado) then
        raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
      end if;
      v_base := v_produto.preco;
      v_custo := v_produto.custo;
    end if;
    v_acrescimo := v_opcao.acrescimo;

    v_segundo := null;
    v_tamanho_2 := null;
    if v_escolha ->> 'segundo_produto_id' is not null then
      if v_escolha ->> 'segundo_produto_id' = v_produto.id::text then
        raise exception 'Escolha dois sabores diferentes para o meio a meio.';
      end if;
      -- A outra metade: outra opção da mesma parte, com o tamanho de mesmo nome.
      select o.* into v_opcao_2
      from public.combo_opcoes o
      left join public.produto_tamanhos t on t.id = o.tamanho_id
      where o.parte_id = v_parte.id
        and o.produto_id::text = v_escolha ->> 'segundo_produto_id'
        and (
          (v_tamanho.id is null and o.tamanho_id is null)
          or (v_tamanho.id is not null and lower(t.nome) = lower(v_tamanho.nome))
        );
      if not found then
        raise exception 'No combo %, os dois sabores precisam ser opções da mesma parte e do mesmo tamanho. Revise o pedido.', v_combo.nome;
      end if;
      select * into v_segundo from public.produtos where id = v_opcao_2.produto_id for share;
      if not v_produto.meio_a_meio then
        raise exception '% não pode ser meio a meio. Revise o pedido.', v_produto.nome;
      end if;
      if not v_segundo.meio_a_meio then
        raise exception '% não pode ser meio a meio. Revise o pedido.', v_segundo.nome;
      end if;
      if v_segundo.arquivado then
        raise exception 'O sabor % saiu do cardápio. Lance o pedido de novo.', v_segundo.nome;
      end if;
      if not v_segundo.disponivel then
        raise exception 'O sabor % esgotou. Revise o pedido.', v_segundo.nome;
      end if;
      if v_opcao_2.tamanho_id is not null then
        select * into v_tamanho_2 from public.produto_tamanhos where id = v_opcao_2.tamanho_id for share;
        if v_tamanho_2.arquivado then
          raise exception 'O combo % mudou no cardápio. Lance o pedido de novo.', v_combo.nome;
        end if;
        if not v_tamanho_2.disponivel then
          raise exception 'O sabor % esgotou no tamanho %. Revise o pedido.', v_segundo.nome, v_tamanho_2.nome;
        end if;
        v_base_2 := v_tamanho_2.preco;
        v_custo := round(v_custo / 2 + v_tamanho_2.custo / 2, 2);
      else
        v_base_2 := v_segundo.preco;
        v_custo := round(v_custo / 2 + v_segundo.custo / 2, 2);
      end if;
      -- Só para dividir o preço do combo: a média dos dois sabores.
      v_base := round((v_base + v_base_2) / 2, 2);
      v_acrescimo := greatest(v_acrescimo, v_opcao_2.acrescimo);
    end if;

    v_bases := v_bases || v_base;
    v_linhas := v_linhas || jsonb_build_object(
      'produto_id', v_produto.id,
      'tamanho_id', v_tamanho.id,
      'tamanho', v_tamanho.nome,
      'segundo_produto_id', v_segundo.id,
      'segundo_tamanho_id', v_tamanho_2.id,
      'segundo_sabor', v_segundo.nome,
      'custo', v_custo,
      'acrescimo', v_acrescimo,
      'parte', v_i
    );
    v_i := v_i + 1;
  end loop;

  v_total := v_combo.preco;
  v_cheio := null;
  v_promocao_id := null;
  v_promocao_nome := null;
  select * into v_promocao
  from public.preco_em_promocao(p_negocio_id, null, null, v_combo.id, public.momento_da_promocao(p_item));
  if found and v_promocao.preco < v_combo.preco then
    v_cheio := v_combo.preco;
    v_total := v_promocao.preco;
    v_promocao_id := v_promocao.promocao_id;
    v_promocao_nome := v_promocao.promocao;
  end if;
  v_divisao := public.dividir_preco(v_total, v_bases);
  if v_cheio is not null then
    v_divisao_cheia := public.dividir_preco(v_cheio, v_bases);
  end if;

  v_i := 0;
  for v_linha in select value from jsonb_array_elements(v_linhas) loop
    v_i := v_i + 1;
    insert into public.itens_pedido (
      pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao, tamanho_id, tamanho,
      segundo_produto_id, segundo_tamanho_id, segundo_sabor,
      combo_id, combo_nome, combo_grupo, combo_parte, promocao_id, promocao, preco_cheio
    )
    values (
      p_pedido_id, (v_linha ->> 'produto_id')::uuid, v_quantidade,
      v_divisao[v_i] + (v_linha ->> 'acrescimo')::numeric,
      (v_linha ->> 'custo')::numeric, v_observacao, (v_linha ->> 'tamanho_id')::uuid, v_linha ->> 'tamanho',
      (v_linha ->> 'segundo_produto_id')::uuid, (v_linha ->> 'segundo_tamanho_id')::uuid, v_linha ->> 'segundo_sabor',
      v_combo.id, v_combo.nome, v_grupo, (v_linha ->> 'parte')::smallint,
      v_promocao_id, v_promocao_nome,
      case when v_cheio is not null then v_divisao_cheia[v_i] + (v_linha ->> 'acrescimo')::numeric end
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

  -- Cada chave guarda os lotes e suas quantidades; uma nova edição não
  -- perde os preços diferentes de um aumento anterior. Consome os mais baratos primeiro.
  select coalesce(jsonb_object_agg(chave, jsonb_build_object('lotes', lotes)), '{}')
  into v_anteriores from (
    select chave, jsonb_agg(valor order by preco) as lotes from (
      select produto_id::text || '|' || coalesce(tamanho_id::text, '') || '|' || coalesce(segundo_produto_id::text, '') as chave,
        preco_unitario as preco,
        jsonb_build_object('quantidade', quantidade,
          'faltou', faltou, 'faltou_ingredientes', faltou_ingredientes,
          'preco', preco_unitario, 'custo', custo_unitario, 'tamanho', tamanho,
          'segundo_tamanho_id', segundo_tamanho_id, 'segundo_sabor', segundo_sabor,
          'promocao_id', promocao_id, 'promocao', promocao, 'preco_cheio', preco_cheio) as valor
      from public.itens_pedido where pedido_id = p_pedido_id and combo_id is null
      union all
      select 'c|' || i.combo_id::text || '|' || string_agg(
          i.produto_id::text || '|' || coalesce(i.tamanho_id::text, '') || '|' || coalesce(i.segundo_produto_id::text, ''),
          ';' order by i.combo_parte),
        sum(i.preco_unitario),
        jsonb_build_object('quantidade', min(i.quantidade), 'nome', min(i.combo_nome),
          'linhas', jsonb_agg(jsonb_build_object(
            'produto_id', i.produto_id, 'tamanho_id', i.tamanho_id, 'tamanho', i.tamanho,
            'segundo_produto_id', i.segundo_produto_id, 'segundo_tamanho_id', i.segundo_tamanho_id,
            'segundo_sabor', i.segundo_sabor, 'preco', i.preco_unitario, 'custo', i.custo_unitario,
            'promocao_id', i.promocao_id, 'promocao', i.promocao, 'preco_cheio', i.preco_cheio,
            'faltou', i.faltou, 'faltou_ingredientes', i.faltou_ingredientes,
            'parte', i.combo_parte) order by i.combo_parte))
      from public.itens_pedido i where i.pedido_id = p_pedido_id and i.combo_id is not null
      group by i.combo_grupo, i.combo_id
    ) originais group by chave
  ) agrupados;
  select coalesce(sum(quantidade * preco_unitario), 0) into v_total_antes
  from public.itens_pedido where pedido_id = p_pedido_id;

  -- Edição usa a hora do servidor. A janela offline só vale na criação.
  select jsonb_agg(value - 'promocao_em') into p_itens from jsonb_array_elements(p_itens);
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

create or replace function public.fechar_conta_mesa(
  p_pedido_ids uuid[],
  p_jeito text,
  p_cobrar_servico boolean,
  p_pagamentos jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_encontrados int;
  v_mesas int;
  v_mesa smallint;
  v_nome_mesa text;
  v_consumo numeric(10, 2);
  v_taxa smallint := 0;
  v_servico numeric(10, 2);
  v_total numeric(10, 2);
  v_partes int := coalesce(jsonb_array_length(case when jsonb_typeof(p_pagamentos) = 'array' then p_pagamentos end), 0);
  v_soma numeric(10, 2) := 0;
  v_parte jsonb;
  v_valor numeric;
  v_conta_id uuid;
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;
  if p_jeito is null or p_jeito not in ('um_pagou', 'dividiram', 'separado') then
    raise exception 'Escolha como pagaram.';
  end if;
  if p_pagamentos is not null and jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Não foi possível fechar a conta. Tente de novo.';
  end if;

  -- Trava os pedidos: dois aparelhos fechando a mesma mesa ao mesmo tempo
  -- não recebem duas vezes.
  perform 1 from public.pedidos
  where id = any (p_pedido_ids) and negocio_id = v_negocio_id
  for update;

  select count(*), count(distinct mesa)
  into v_encontrados, v_mesas
  from public.pedidos
  where id = any (p_pedido_ids) and negocio_id = v_negocio_id;
  if v_encontrados <> (select count(distinct x) from unnest(p_pedido_ids) x) then
    raise exception 'Um dos pedidos não foi encontrado. Atualize a tela.';
  end if;
  if exists (
    select 1 from public.pedidos
    where id = any (p_pedido_ids)
      and (mesa is null or status = 'cancelado' or pago_em is not null or nao_recebido_em is not null)
  ) then
    raise exception 'Esta conta mudou: algum pedido já foi recebido ou cancelado. Atualize a tela.';
  end if;
  if v_mesas <> 1 then
    raise exception 'Os pedidos precisam ser da mesma mesa.';
  end if;

  select p.mesa, p.nome_mesa into v_mesa, v_nome_mesa
  from public.pedidos p
  where p.id = any (p_pedido_ids)
  order by p.criado_em desc
  limit 1;

  select coalesce(sum(i.quantidade * i.preco_unitario), 0) into v_consumo
  from public.itens_pedido i
  where i.pedido_id = any (p_pedido_ids);

  if coalesce(p_cobrar_servico, false) then
    select coalesce(taxa_servico, 0) into v_taxa from public.negocios where id = v_negocio_id;
  end if;
  v_servico := round(v_consumo * v_taxa / 100.0, 2);
  v_total := v_consumo + v_servico;

  if p_jeito = 'separado' and v_partes > 0 then
    raise exception 'Pagaram separado: não anote as partes.';
  end if;
  if p_jeito = 'um_pagou' and v_partes <> 1 then
    raise exception 'Escolha como o cliente pagou.';
  end if;
  if p_jeito = 'dividiram' and v_partes not between 1 and 30 then
    raise exception 'Anote de 1 a 30 partes.';
  end if;

  for v_parte in select value from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    if coalesce(v_parte ->> 'forma', '') not in ('dinheiro', 'pix', 'credito', 'debito') then
      raise exception 'Escolha como foi paga cada parte.';
    end if;
    begin
      v_valor := (v_parte ->> 'valor')::numeric;
    exception when others then
      raise exception 'Valor inválido numa das partes.';
    end;
    if v_valor is null or v_valor < 0 or v_valor <> round(v_valor, 2) then
      raise exception 'Valor inválido numa das partes.';
    end if;
    v_soma := v_soma + v_valor;
  end loop;
  if p_jeito <> 'separado' and v_soma <> v_total then
    raise exception 'A soma das partes não bate com o total da conta. Confira os valores.';
  end if;

  insert into public.contas_mesa (negocio_id, dia, mesa, nome_mesa, consumo, taxa_servico, servico, jeito, criado_por)
  values (
    v_negocio_id, (select min(p.dia) from public.pedidos p where p.id = any (p_pedido_ids)), v_mesa, v_nome_mesa, v_consumo,
    case when v_servico > 0 then v_taxa else 0 end, v_servico, p_jeito, (select auth.uid())
  )
  returning id into v_conta_id;

  -- Parte de R$ 0,00 (conta sem valor) não vira pagamento.
  insert into public.pagamentos_conta (conta_id, negocio_id, forma, valor)
  select v_conta_id, v_negocio_id, e ->> 'forma', (e ->> 'valor')::numeric
  from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e
  where (e ->> 'valor')::numeric > 0;

  -- A mesa pagou e foi embora: o que estava pronto já foi levado.
  update public.pedidos
  set conta_id = v_conta_id,
      pago_em = now(),
      forma_pagamento = null,
      status = case when status = 'pronto' then 'entregue' else status end,
      entregue_em = case when status = 'pronto' then now() else entregue_em end,
      atualizado_em = now()
  where id = any (p_pedido_ids);

  return v_conta_id;
end;
$$;

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261116;
$$;

-- Mantém os mesmos privilégios das funções substituídas.
revoke all on function public.momento_da_promocao(jsonb) from public, anon, authenticated;
revoke all on function public.gravar_itens_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.gravar_combo_do_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) to authenticated;
revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;
revoke all on function public.fechar_conta_mesa(uuid[], text, boolean, jsonb) from public, anon;
grant execute on function public.fechar_conta_mesa(uuid[], text, boolean, jsonb) to authenticated;
commit;
