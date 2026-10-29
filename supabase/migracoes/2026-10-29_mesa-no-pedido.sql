-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-10-22_ingredientes-custo-e-versao.sql.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Mesa ou balcão: o pedido pode dizer a mesa onde o cliente está (consumo no
-- salão). Sem mesa, é retirada no balcão e o cliente é chamado pela senha.
-- 1. Coluna pedidos.mesa.
-- 2. criar_pedido e editar_pedido recebem a mesa (p_mesa, opcional).
-- 3. versao_do_banco() passa para 20261029.
begin;

do $$
begin
  if to_regclass('public.ingredientes') is null then
    raise exception 'Rode antes supabase/migracoes/2026-10-22_ingredientes-custo-e-versao.sql';
  end if;
end;
$$;

-- 1. Coluna --------------------------------------------------------------------
alter table public.pedidos
  add column if not exists mesa smallint check (mesa between 1 and 999);

-- 2. Funções -------------------------------------------------------------------
-- As versões sem p_mesa saem: com as duas no banco, a chamada sem mesa ficaria ambígua.
drop function if exists public.criar_pedido(jsonb, uuid);
create or replace function public.criar_pedido(p_itens jsonb, p_chave_envio uuid, p_mesa int default null)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_pedido public.pedidos;
  v_hoje date := public.hoje_no_negocio();
  v_numero smallint;
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_chave_envio is null then
    raise exception 'Não foi possível enviar o pedido. Tente de novo.';
  end if;
  if p_mesa is not null and p_mesa not between 1 and 999 then
    raise exception 'O número da mesa precisa ficar entre 1 e 999.';
  end if;

  select * into v_pedido from public.pedidos
  where negocio_id = v_negocio_id and chave_envio = p_chave_envio;
  if found then
    return v_pedido;
  end if;

  begin
    -- Próxima senha: 1 no primeiro pedido do dia, depois soma 1 e volta
    -- para 1 depois do 999.
    insert into public.contador_pedidos as c (negocio_id, dia, ultimo)
    values (v_negocio_id, v_hoje, 1)
    on conflict (negocio_id) do update
      set ultimo = case when c.dia = excluded.dia then c.ultimo % 999 + 1 else 1 end,
          dia = excluded.dia
    returning ultimo into v_numero;

    insert into public.pedidos (negocio_id, criado_por, chave_envio, numero, mesa)
    values (v_negocio_id, (select auth.uid()), p_chave_envio, v_numero, p_mesa)
    returning * into v_pedido;
  exception when unique_violation then
    -- O mesmo envio chegou duas vezes ao mesmo tempo: devolve o primeiro. A
    -- senha usada nesta tentativa volta junto com o resto (rollback do bloco).
    select * into v_pedido from public.pedidos
    where negocio_id = v_negocio_id and chave_envio = p_chave_envio;
    return v_pedido;
  end;

  perform public.gravar_itens_pedido(v_pedido.id, v_negocio_id, p_itens);
  return v_pedido;
end;
$$;

drop function if exists public.editar_pedido(uuid, jsonb, timestamptz);
create or replace function public.editar_pedido(p_pedido_id uuid, p_itens jsonb, p_versao timestamptz, p_mesa int default null)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_anteriores jsonb;
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

  delete from public.itens_pedido where pedido_id = p_pedido_id;
  perform public.gravar_itens_pedido(p_pedido_id, v_pedido.negocio_id, p_itens, v_anteriores);

  update public.pedidos set mesa = p_mesa, alterado_em = now(), atualizado_em = now()
  where id = p_pedido_id
  returning * into v_pedido;
  return v_pedido;
end;
$$;

revoke all on function public.criar_pedido(jsonb, uuid, int) from public, anon;
revoke all on function public.editar_pedido(uuid, jsonb, timestamptz, int) from public, anon;
grant execute on function public.criar_pedido(jsonb, uuid, int) to authenticated;
grant execute on function public.editar_pedido(uuid, jsonb, timestamptz, int) to authenticated;

-- 3. Versão do banco -------------------------------------------------------------
create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261029;
$$;

revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;

commit;
