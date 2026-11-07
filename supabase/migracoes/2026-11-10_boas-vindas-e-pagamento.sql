-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-09_correcoes-da-revisao.sql (este arquivo sobe a versão do
-- banco para 20261110).
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Perguntas de boas-vindas e pagamento na hora certa:
-- 1. Como o negócio atende (balcão, mesa ou os dois), respondido pelo dono
--    na primeira vez que entra. Vazio = ainda não respondeu.
-- 2. Cartão separado em crédito e débito. 'cartao' continua valendo só para
--    os pedidos que já foram pagos assim.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedidos' and column_name = 'forma_pagamento'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-08_operacao-de-campo-e-metricas.sql';
  end if;
  if to_regprocedure('public.configurar_operacao(smallint, boolean, timestamptz)') is null then
    raise exception 'Rode antes supabase/migracoes/2026-11-09_correcoes-da-revisao.sql';
  end if;
end;
$$;

-- 1. Como o negócio atende ---------------------------------------------------------
alter table public.negocios
  add column if not exists modo_atendimento text
    check (modo_atendimento in ('balcao', 'mesa', 'balcao_e_mesa'));

-- Só o dono: as respostas das perguntas de boas-vindas (como atende e se a
-- cozinha tem aparelho próprio). Dá para mudar depois em Minha conta.
create or replace function public.configurar_atendimento(p_modo text, p_usa_tela_cozinha boolean)
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
    raise exception 'Só o dono do negócio pode mudar como o negócio atende.';
  end if;
  if p_modo is null or p_modo not in ('balcao', 'mesa', 'balcao_e_mesa') then
    raise exception 'Escolha como você atende seus clientes.';
  end if;
  if p_usa_tela_cozinha is null then
    raise exception 'Diga se quem prepara os pedidos fica longe de você.';
  end if;
  update public.negocios
  set modo_atendimento = p_modo,
      usa_tela_cozinha = p_usa_tela_cozinha
  where id = v_negocio_id;
end;
$$;

revoke all on function public.configurar_atendimento(text, boolean) from public, anon;
grant execute on function public.configurar_atendimento(text, boolean) to authenticated;

-- 2. Crédito e débito ----------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_forma_pagamento_check;
alter table public.pedidos
  add constraint pedidos_forma_pagamento_check
    check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'cartao'));

create or replace function public.criar_pedido(
  p_itens jsonb,
  p_chave_envio uuid,
  p_mesa int default null,
  p_identificacao text default null,
  p_forma_pagamento text default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_pedido public.pedidos;
  v_hoje date := public.dia_do_negocio(v_negocio_id);
  v_numero smallint;
  v_identificacao text := public.limpar_identificacao(p_identificacao);
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
  if p_forma_pagamento is not null and p_forma_pagamento not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.';
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

    insert into public.pedidos (
      negocio_id, criado_por, chave_envio, numero, dia, mesa, identificacao, forma_pagamento, pago_em
    )
    values (
      v_negocio_id, (select auth.uid()), p_chave_envio, v_numero, v_hoje, p_mesa, v_identificacao,
      p_forma_pagamento, case when p_forma_pagamento is not null then now() end
    )
    returning * into v_pedido;
  exception when unique_violation then
    -- O mesmo envio chegou duas vezes ao mesmo tempo: devolve o primeiro. A
    -- senha usada nesta tentativa volta junto com o resto (rollback do bloco).
    select * into v_pedido from public.pedidos
    where negocio_id = v_negocio_id and chave_envio = p_chave_envio;
    return v_pedido;
  end;

  perform public.gravar_itens_pedido(v_pedido.id, v_negocio_id, p_itens);

  -- Só bebida ou o que já sai pronto: não passa pela cozinha. Em todo caso,
  -- mexe no pedido depois dos itens gravados, para o tempo real avisar as
  -- telas quando o pedido já está completo.
  update public.pedidos p
  set atualizado_em = now(),
      status = case when vai.para_cozinha then p.status else 'pronto' end,
      pronto_em = case when vai.para_cozinha then p.pronto_em else now() end
  from (
    select coalesce(bool_or(pr.vai_para_cozinha), false) as para_cozinha
    from public.itens_pedido i
    join public.produtos pr on pr.id = i.produto_id
    where i.pedido_id = v_pedido.id
  ) vai
  where p.id = v_pedido.id
  returning p.* into v_pedido;
  return v_pedido;
end;
$$;

-- Recebe um ou mais pedidos de uma vez (a conta da mesa inteira). p_forma
-- nula desfaz o recebimento. Pedido cancelado não recebe.
create or replace function public.registrar_pagamento(p_pedido_ids uuid[], p_forma text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_quantos int;
begin
  if p_forma is not null and p_forma not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;

  update public.pedidos
  set forma_pagamento = p_forma,
      pago_em = case when p_forma is null then null else now() end,
      atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = v_negocio_id
    and status <> 'cancelado'
    and (p_forma is null or pago_em is null);
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- 3. Versão do banco ----------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261110;
$$;

commit;
