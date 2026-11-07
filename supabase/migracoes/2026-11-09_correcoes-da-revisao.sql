-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-08_operacao-de-campo-e-metricas.sql (este arquivo sobe a
-- versão do banco para 20261109).
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Correções da revisão da PR #32:
-- 1. Pedido pago e editado com outro valor volta para "a receber" (o caixa
--    contava como recebido um valor que o cliente não pagou).
-- 2. Pedido editado para só bebida sai da fila da cozinha, como no criar_pedido.
-- 3. Toque duplo em "faltou" (ou marca e desmarca) conta uma falta só.
-- 4. Pedido só de bebida (nasce pronto, 0 min) fica fora do tempo médio.
-- 5. A virada do dia não muda se isso trocar o dia de trabalho de agora
--    (entre 0h e 8h): as senhas recomeçariam no meio do turno.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negocios' and column_name = 'virada_do_dia'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-08_operacao-de-campo-e-metricas.sql';
  end if;
end;
$$;

-- 1 e 2. Editar pedido ---------------------------------------------------------------

create or replace function public.editar_pedido(p_pedido_id uuid, p_itens jsonb, p_versao timestamptz, p_mesa int default null)
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

  select coalesce(
    jsonb_object_agg(produto_id::text, jsonb_build_object('preco', preco_unitario, 'custo', custo_unitario)),
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

  -- Já pago e o valor mudou: o recebimento não vale mais para o pedido novo.
  -- Volta para "a receber" (o caixa não pode contar como pago o que não foi).
  -- Ficou só com bebida: sai da fila da cozinha, como no criar_pedido.
  update public.pedidos
  set mesa = p_mesa,
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

-- 3. Falta contada uma vez só ----------------------------------------------------------

create or replace function public.marcar_item_faltou(p_item_id uuid, p_faltou boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
begin
  select p.id into v_pedido_id
  from public.itens_pedido i
  join public.pedidos p on p.id = i.pedido_id
  where i.id = p_item_id
    and p.negocio_id = public.negocio_do_usuario_atual()
    and p.status in ('pendente', 'em_preparo')
  for update of p;
  if not found then
    raise exception 'Este pedido não está mais na fila.';
  end if;

  update public.itens_pedido set faltou = coalesce(p_faltou, false) where id = p_item_id;
  update public.pedidos set atualizado_em = now() where id = v_pedido_id;
  -- Fica registrado mesmo que o atendente edite o pedido depois.
  -- Toque duplo ou marca e desmarca: a mesma falta conta uma vez só.
  if coalesce(p_faltou, false) then
    insert into public.eventos (negocio_id, tipo, produto_id, pedido_id)
    select p.negocio_id, 'faltou_item', i.produto_id, p.id
    from public.itens_pedido i join public.pedidos p on p.id = i.pedido_id
    where i.id = p_item_id
      and not exists (
        select 1 from public.eventos e
        where e.pedido_id = p.id and e.produto_id = i.produto_id and e.tipo = 'faltou_item'
      );
  end if;
end;
$$;

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

-- 4. Tempo médio sem os pedidos só de bebida ----------------------------------------

create or replace function public.acompanhar_pedido(p_codigo text, p_numero int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_hoje date;
  v_pedido public.pedidos;
  v_posicao int;
  v_tempo_medio int;
  v_faltou boolean;
begin
  perform public.conferir_limite_consultas();

  select id into v_negocio_id
  from public.negocios
  where codigo_publico = p_codigo and pagina_ativa;
  v_hoje := public.dia_do_negocio(v_negocio_id);

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
  -- cozinha até o "Pronto". Recalculada a cada pedido pronto. Pedido só de
  -- bebida nasce pronto (0 min) e não passou pela cozinha: fica de fora.
  select round(avg(extract(epoch from (pronto_em - criado_em)) / 60))::int into v_tempo_medio
  from (
    select pronto_em, criado_em from public.pedidos
    where negocio_id = v_negocio_id and dia = v_hoje
      and pronto_em > criado_em and status <> 'cancelado'
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

-- 5. Virada do dia ------------------------------------------------------------------------

-- Só o dono: hora da virada do dia e se a cozinha tem tela própria.
-- A virada não muda se isso trocar o dia de trabalho de agora (entre 0h e 8h):
-- a senha voltaria para 001 no meio do turno e se repetiria no mesmo dia, e
-- a página do QR poderia mostrar ao cliente o pedido de outra pessoa.
-- p_agora existe para os testes; no uso normal é o horário do banco.
drop function if exists public.configurar_operacao(smallint, boolean);
create or replace function public.configurar_operacao(
  p_virada_do_dia smallint,
  p_usa_tela_cozinha boolean,
  p_agora timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_virada_atual smallint;
begin
  select u.negocio_id, n.virada_do_dia into v_negocio_id, v_virada_atual
  from public.usuarios u
  join public.negocios n on n.id = u.negocio_id
  where u.id = (select auth.uid()) and u.papel = 'admin';
  if v_negocio_id is null then
    raise exception 'Só o dono do negócio pode mudar isso.';
  end if;
  if p_virada_do_dia is null or p_virada_do_dia not between 0 and 8 then
    raise exception 'Escolha uma hora entre 0h e 8h.';
  end if;
  if p_virada_do_dia <> v_virada_atual
    and ((p_agora at time zone 'America/Fortaleza') - make_interval(hours => p_virada_do_dia))::date
      <> ((p_agora at time zone 'America/Fortaleza') - make_interval(hours => v_virada_atual))::date
  then
    raise exception 'Agora não dá para mudar a hora: o dia de trabalho viraria no meio do turno e as senhas se repetiriam. Mude depois das 8h da manhã.';
  end if;
  update public.negocios
  set virada_do_dia = p_virada_do_dia,
      usa_tela_cozinha = coalesce(p_usa_tela_cozinha, usa_tela_cozinha)
  where id = v_negocio_id;
end;
$$;

revoke all on function public.configurar_operacao(smallint, boolean, timestamptz) from public, anon;
grant execute on function public.configurar_operacao(smallint, boolean, timestamptz) to authenticated;

-- Versão do banco -------------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261109;
$$;

commit;
