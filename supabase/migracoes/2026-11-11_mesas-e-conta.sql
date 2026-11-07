-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-10_boas-vindas-e-pagamento.sql (este arquivo sobe a versão
-- do banco para 20261111).
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Mesas:
-- 1. Quantas mesas o negócio tem (mapa de mesas) e a taxa de serviço.
-- 2. Mesa extra com nome ("Varanda").
-- 3. Passar os pedidos para outra mesa (ou juntar duas mesas).
-- 4. Conta da mesa: consumo, serviço e como pagaram (um pagou tudo,
--    dividiram anotando cada parte, ou pagaram separado sem anotar).
--    Desfazer o recebimento da conta no Caixa.
-- Pedido pago numa conta fechada não muda de valor nem é cancelado sem antes
-- desfazer a conta.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'negocios' and column_name = 'modo_atendimento'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-10_boas-vindas-e-pagamento.sql';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- Mesas: mapa, conta da mesa e taxa de serviço
-- ---------------------------------------------------------------------------
-- Conta fechada de uma mesa: quanto foi consumido, a taxa de serviço e como
-- pagaram (um pagou tudo, dividiram anotando cada parte, ou pagaram separado
-- sem anotar). As partes ficam em pagamentos_conta. Desfazer o recebimento
-- apaga a conta e os pedidos voltam a ficar abertos na mesa.
create table if not exists public.contas_mesa (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  dia date not null,
  mesa smallint not null check (mesa between 1 and 999),
  nome_mesa text check (nome_mesa is null or length(nome_mesa) between 1 and 20),
  consumo numeric(10, 2) not null check (consumo >= 0),
  -- Percentual cobrado nesta conta (0: não cobrou ou o cliente não quis pagar).
  taxa_servico smallint not null default 0 check (taxa_servico between 0 and 30),
  servico numeric(10, 2) not null default 0 check (servico >= 0),
  jeito text not null check (jeito in ('um_pagou', 'dividiram', 'separado')),
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null
);
create index if not exists contas_mesa_negocio_dia on public.contas_mesa (negocio_id, dia);

create table if not exists public.pagamentos_conta (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas_mesa (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  forma text not null check (forma in ('dinheiro', 'pix', 'credito', 'debito')),
  valor numeric(10, 2) not null check (valor > 0)
);
create index if not exists pagamentos_conta_conta on public.pagamentos_conta (conta_id);

-- Quantas mesas o negócio tem (mapa de mesas) e a taxa de serviço em %
-- (0: não cobra). Vazio: o dono ainda não respondeu.
alter table public.negocios
  add column if not exists quantidade_mesas smallint check (quantidade_mesas between 1 and 200),
  add column if not exists taxa_servico smallint check (taxa_servico between 0 and 30);

-- nome_mesa: nome da mesa extra ("Varanda"); vazio nas mesas do mapa.
-- conta_id: a conta fechada em que o pedido foi recebido.
alter table public.pedidos
  add column if not exists nome_mesa text check (nome_mesa is null or length(nome_mesa) between 1 and 20),
  add column if not exists conta_id uuid references public.contas_mesa (id);
create index if not exists pedidos_conta on public.pedidos (conta_id) where conta_id is not null;

-- Pago na hora (balcão): forma e horário juntos. Pago na conta da mesa: a
-- forma fica nas partes da conta, e o pedido guarda só o horário.
alter table public.pedidos drop constraint if exists pedidos_pagamento_coerente;
alter table public.pedidos
  add constraint pedidos_pagamento_coerente check (
    (conta_id is null and (forma_pagamento is null) = (pago_em is null))
    or (conta_id is not null and forma_pagamento is null and pago_em is not null)
  );

alter table public.contas_mesa enable row level security;
alter table public.pagamentos_conta enable row level security;
revoke all on public.contas_mesa, public.pagamentos_conta from anon, authenticated;
grant select on public.contas_mesa, public.pagamentos_conta to authenticated;

drop policy if exists "contas_mesa isoladas por negocio_id" on public.contas_mesa;
create policy "contas_mesa isoladas por negocio_id"
  on public.contas_mesa for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "pagamentos_conta isolados por negocio_id" on public.pagamentos_conta;
create policy "pagamentos_conta isolados por negocio_id"
  on public.pagamentos_conta for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Nome da mesa extra: sem espaços sobrando, até 20 letras.
create or replace function public.limpar_nome_mesa(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_texto text := nullif(regexp_replace(trim(p_texto), '\s+', ' ', 'g'), '');
begin
  if length(v_texto) > 20 then
    raise exception 'O nome da mesa pode ter no máximo 20 letras.';
  end if;
  return v_texto;
end;
$$;

-- Só o dono: quantas mesas tem e a taxa de serviço (0 = não cobra).
create or replace function public.configurar_mesas(p_quantidade int, p_taxa_servico int)
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
    raise exception 'Só o dono do negócio pode mudar as mesas.';
  end if;
  if p_quantidade is null or p_quantidade not between 1 and 200 then
    raise exception 'O número de mesas precisa ficar entre 1 e 200.';
  end if;
  if p_taxa_servico is null or p_taxa_servico not between 0 and 30 then
    raise exception 'A taxa de serviço precisa ficar entre 0%% e 30%%.';
  end if;
  update public.negocios
  set quantidade_mesas = p_quantidade,
      taxa_servico = p_taxa_servico
  where id = v_negocio_id;
end;
$$;

-- Passa os pedidos abertos de uma mesa para outra. Se a outra já tem
-- pedidos abertos, as duas contas viram uma só (a tela confirma antes).
-- alterado_em muda para quem estiver editando um desses pedidos não salvar
-- por cima com a mesa antiga.
create or replace function public.passar_mesa(p_pedido_ids uuid[], p_mesa int, p_nome_mesa text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_nome text := public.limpar_nome_mesa(p_nome_mesa);
  v_quantos int;
begin
  if p_mesa is null or p_mesa not between 1 and 999 then
    raise exception 'O número da mesa precisa ficar entre 1 e 999.';
  end if;
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;

  update public.pedidos
  set mesa = p_mesa,
      nome_mesa = v_nome,
      alterado_em = now(),
      atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = v_negocio_id
    and mesa is not null
    and status <> 'cancelado'
    and pago_em is null;
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- Fecha a conta da mesa com os pedidos marcados.
-- p_jeito: 'um_pagou' (uma parte com o total), 'dividiram' (cada parte com a
-- forma e o valor; a soma precisa bater com o total) ou 'separado' (pagaram
-- separado e ninguém anotou: fica pago, sem forma).
-- p_cobrar_servico: false quando o cliente não quis pagar a taxa.
-- p_pagamentos: [{ "forma": "pix", "valor": 23.50 }, ...]
-- O consumo e a taxa são calculados aqui, nunca pelo aparelho.
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
    where id = any (p_pedido_ids) and (mesa is null or status = 'cancelado' or pago_em is not null)
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
    v_negocio_id, public.dia_do_negocio(v_negocio_id), v_mesa, v_nome_mesa, v_consumo,
    case when v_servico > 0 then v_taxa else 0 end, v_servico, p_jeito, (select auth.uid())
  )
  returning id into v_conta_id;

  -- Parte de R$ 0,00 (conta sem valor) não vira pagamento.
  insert into public.pagamentos_conta (conta_id, negocio_id, forma, valor)
  select v_conta_id, v_negocio_id, e ->> 'forma', (e ->> 'valor')::numeric
  from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e
  where (e ->> 'valor')::numeric > 0;

  update public.pedidos
  set conta_id = v_conta_id,
      pago_em = now(),
      forma_pagamento = null,
      atualizado_em = now()
  where id = any (p_pedido_ids);

  return v_conta_id;
end;
$$;

-- Recebeu errado (forma, valor ou mesa errada): a conta some e os pedidos
-- voltam a ficar abertos na mesa, para fechar de novo.
create or replace function public.desfazer_conta_mesa(p_conta_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
begin
  perform 1 from public.contas_mesa
  where id = p_conta_id and negocio_id = v_negocio_id
  for update;
  if not found then
    raise exception 'Esta conta já foi desfeita. Atualize a tela.';
  end if;

  update public.pedidos
  set conta_id = null,
      pago_em = null,
      atualizado_em = now()
  where conta_id = p_conta_id;
  delete from public.contas_mesa where id = p_conta_id;
end;
$$;

revoke all on function public.limpar_nome_mesa(text) from public, anon;
revoke all on function public.configurar_mesas(int, int) from public, anon;
revoke all on function public.passar_mesa(uuid[], int, text) from public, anon;
revoke all on function public.fechar_conta_mesa(uuid[], text, boolean, jsonb) from public, anon;
revoke all on function public.desfazer_conta_mesa(uuid) from public, anon;
grant execute on function public.configurar_mesas(int, int) to authenticated;
grant execute on function public.passar_mesa(uuid[], int, text) to authenticated;
grant execute on function public.fechar_conta_mesa(uuid[], text, boolean, jsonb) to authenticated;
grant execute on function public.desfazer_conta_mesa(uuid) to authenticated;


-- Pedido com o nome da mesa extra --------------------------------------------------

-- p_chave_envio é gerada pelo aparelho. Se o mesmo envio chegar de novo
-- (toque duplo, internet que caiu e voltou), devolve o pedido já criado.
-- p_mesa: mesa onde o cliente está; vazio quando ele retira no balcão.
-- p_identificacao: nome do cliente para chamar (opcional).
-- p_forma_pagamento: já pago na hora (opcional; sem ela, o pedido fica a receber).
-- p_nome_mesa: nome da mesa extra ("Varanda"); só vale com p_mesa.
-- As versões antigas não podem continuar no banco: com os valores padrão,
-- uma chamada com menos argumentos ficaria ambígua.
drop function if exists public.criar_pedido(jsonb, uuid);
drop function if exists public.criar_pedido(jsonb, uuid, int);
drop function if exists public.criar_pedido(jsonb, uuid, text, text);
drop function if exists public.criar_pedido(jsonb, uuid, int, text, text);
create or replace function public.criar_pedido(
  p_itens jsonb,
  p_chave_envio uuid,
  p_mesa int default null,
  p_identificacao text default null,
  p_forma_pagamento text default null,
  p_nome_mesa text default null
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
  v_nome_mesa text := case when p_mesa is not null then public.limpar_nome_mesa(p_nome_mesa) end;
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
  -- 'cartao' continua aceito enquanto houver aparelho com a versão anterior
  -- do site aberta (botão "Cartão" e pedidos guardados sem internet). Sai numa
  -- migração futura, depois que todos os aparelhos estiverem na versão nova.
  if p_forma_pagamento is not null and p_forma_pagamento not in ('dinheiro', 'pix', 'credito', 'debito', 'cartao') then
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
      negocio_id, criado_por, chave_envio, numero, dia, mesa, nome_mesa, identificacao, forma_pagamento, pago_em
    )
    values (
      v_negocio_id, (select auth.uid()), p_chave_envio, v_numero, v_hoje, p_mesa, v_nome_mesa, v_identificacao,
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

-- Troca os itens e a mesa de um pedido que ainda não ficou pronto. A posição
-- na fila (criado_em) não muda; alterado_em faz a cozinha destacar o cartão.
-- p_versao é o alterado_em que a tela carregou: se outra pessoa editou nesse
-- meio-tempo, a edição é recusada em vez de apagar a dela sem aviso.
-- p_mesa é a mesa como ficou (vazio: balcão).
-- p_nome_mesa: nome da mesa extra. Sem ele, o pedido que fica na mesma mesa
-- mantém o nome que tinha.
-- As versões antigas não podem continuar no banco.
drop function if exists public.editar_pedido(uuid, jsonb);
drop function if exists public.editar_pedido(uuid, jsonb, timestamptz);
drop function if exists public.editar_pedido(uuid, jsonb, timestamptz, int);
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

create or replace function public.cancelar_pedido(p_pedido_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_conta_id uuid;
begin
  if p_motivo is null or p_motivo not in ('cliente_desistiu', 'erro_lancamento', 'faltou_ingrediente', 'outro') then
    raise exception 'Escolha o motivo do cancelamento.';
  end if;

  select status, conta_id into v_status, v_conta_id from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_conta_id is not null then
    raise exception 'Este pedido já foi pago na conta da mesa. Para cancelar, desfaça o recebimento da conta no Caixa.';
  end if;
  if v_status in ('entregue', 'cancelado') then
    raise exception 'Este pedido já foi encerrado.';
  end if;

  update public.pedidos
  set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo, atualizado_em = now()
  where id = p_pedido_id;
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
  -- 'cartao' continua aceito enquanto houver aparelho com a versão anterior
  -- do site aberta (botão "Cartão" e pedidos guardados sem internet). Sai numa
  -- migração futura, depois que todos os aparelhos estiverem na versão nova.
  if p_forma is not null and p_forma not in ('dinheiro', 'pix', 'credito', 'debito', 'cartao') then
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
    and conta_id is null
    and (p_forma is null or pago_em is null);
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

revoke all on function public.criar_pedido(jsonb, uuid, int, text, text, text) from public, anon;
revoke all on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) from public, anon;
grant execute on function public.criar_pedido(jsonb, uuid, int, text, text, text) to authenticated;
grant execute on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) to authenticated;

-- Versão do banco ----------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261111;
$$;

commit;
