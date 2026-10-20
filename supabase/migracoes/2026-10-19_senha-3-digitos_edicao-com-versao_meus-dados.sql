-- Migração para o Supabase que já está no ar (criado com o schema.sql da dev
-- até 07/10/2026). Rodar UMA vez no SQL Editor. Quem cria um projeto novo
-- roda só o supabase/schema.sql, que já tem tudo isto.
--
-- 1. Senha do pedido de 1 a 999, em sequência por negócio, recomeçando a cada
--    dia e voltando para 1 depois do 999 (antes: 4 dígitos aleatórios).
-- 2. editar_pedido com versão: recusa a edição se outra pessoa salvou antes.
-- 3. atualizar_meus_dados: tela Minha conta edita o nome e o nome do negócio.
begin;

-- 1. Senha de 1 a 999 ---------------------------------------------------------
create table if not exists public.contador_pedidos (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  dia date not null,
  ultimo smallint not null check (ultimo between 1 and 999)
);
alter table public.contador_pedidos enable row level security;
revoke all on public.contador_pedidos from anon, authenticated;

-- Pedidos antigos têm senha de 4 dígitos: a regra nova vale só para os novos
-- (not valid), sem apagar nem mexer no histórico.
alter table public.pedidos drop constraint if exists pedidos_negocio_id_dia_numero_key;
alter table public.pedidos drop constraint if exists pedidos_numero_check;
alter table public.pedidos add constraint pedidos_numero_check check (numero between 1 and 999) not valid;
create index if not exists pedidos_negocio_dia_numero_idx on public.pedidos (negocio_id, dia, numero);

create or replace function public.criar_pedido(p_itens jsonb, p_chave_envio uuid)
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

    insert into public.pedidos (negocio_id, criado_por, chave_envio, numero)
    values (v_negocio_id, (select auth.uid()), p_chave_envio, v_numero)
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

    select exists (select 1 from public.itens_pedido where pedido_id = v_pedido.id and faltou)
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

-- 2. Edição com versão --------------------------------------------------------
drop function if exists public.editar_pedido(uuid, jsonb);
create or replace function public.editar_pedido(p_pedido_id uuid, p_itens jsonb, p_versao timestamptz)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_anteriores jsonb;
begin
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

  update public.pedidos set alterado_em = now(), atualizado_em = now()
  where id = p_pedido_id
  returning * into v_pedido;
  return v_pedido;
end;
$$;

revoke all on function public.editar_pedido(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb, timestamptz) to authenticated;

-- 3. Minha conta --------------------------------------------------------------
create or replace function public.atualizar_meus_dados(p_nome text, p_nome_negocio text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_nome text := trim(p_nome);
  v_nome_negocio text := trim(p_nome_negocio);
begin
  select * into v_usuario from public.usuarios where id = (select auth.uid());
  if not found then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if coalesce(length(v_nome), 0) not between 1 and 120 then
    raise exception 'Digite seu nome (até 120 letras).';
  end if;

  update public.usuarios set nome = v_nome where id = v_usuario.id;

  if v_nome_negocio is not null then
    if v_usuario.papel <> 'admin' then
      raise exception 'Só o dono pode mudar o nome do negócio.';
    end if;
    if length(v_nome_negocio) not between 1 and 120 then
      raise exception 'Digite o nome do negócio (até 120 letras).';
    end if;
    update public.negocios set nome = v_nome_negocio where id = v_usuario.negocio_id;
  end if;
end;
$$;

revoke all on function public.atualizar_meus_dados(text, text) from public, anon;
grant execute on function public.atualizar_meus_dados(text, text) to authenticated;

commit;
