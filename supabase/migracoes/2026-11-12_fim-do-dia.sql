-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-11_mesas-e-conta.sql (este arquivo sobe a versão do
-- banco para 20261112). Rodar de dia (depois das 8h): a virada passa a ser
-- 5h para todos.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Fim do dia:
-- 1. "Encerrar o dia" (dias_encerrados), só com tudo resolvido. Pedido novo
--    ou reaberto naquele dia desfaz o encerramento.
-- 2. Resolver o que ficou aberto: "Já foi entregue", "Foi embora sem pagar"
--    (não recebido, com desfazer) e "Cancelar a conta".
-- 3. Cancelar pedido pago pergunta se o dinheiro foi devolvido; "Devolvi"
--    depois, no Caixa.
-- 4. A hora da virada do dia não é mais escolhida: 5h para todos.
-- 5. Fecha a transição do "cartão": pagamento novo é crédito ou débito (os
--    pedidos antigos em cartão continuam valendo).
-- 6. Excluir a conta confere a senha aqui no banco, com limite de tentativas.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contas_mesa'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-11_mesas-e-conta.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'extensions' and p.proname = 'crypt') then
    raise exception 'O pgcrypto precisa estar no schema extensions (Database > Extensions > pgcrypto).';
  end if;
end;
$$;

-- Virada do dia fixa às 5h ---------------------------------------------------------
update public.negocios set virada_do_dia = 5 where virada_do_dia <> 5;

-- A hora da virada do dia não é mais escolhida (sempre 5h) e a tela da
-- cozinha é respondida em configurar_atendimento.
drop function if exists public.configurar_operacao(smallint, boolean);
drop function if exists public.configurar_operacao(smallint, boolean, timestamptz);

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


-- ---------------------------------------------------------------------------
-- Fim do dia: encerrar o dia, resolver o que ficou aberto e devolver dinheiro
-- ---------------------------------------------------------------------------
-- nao_recebido_em: "Foi embora sem pagar". O pedido sai das contas abertas e
-- aparece no Caixa e nos relatórios como não recebido.
-- devolucao: pedido pago e depois cancelado. 'a_devolver' fica no Caixa até
-- alguém tocar em "Devolvi"; 'devolvido' já voltou para o cliente. Vazio num
-- pedido pago e cancelado: cancelado antes desta pergunta existir (o Caixa
-- trata como a devolver).
alter table public.pedidos
  add column if not exists nao_recebido_em timestamptz,
  add column if not exists devolucao text check (devolucao in ('a_devolver', 'devolvido')),
  add column if not exists devolvido_em timestamptz;
alter table public.pedidos drop constraint if exists pedidos_fim_do_dia_coerente;
alter table public.pedidos
  add constraint pedidos_fim_do_dia_coerente check (
    (nao_recebido_em is null or (pago_em is null and status <> 'cancelado'))
    and (devolucao is null or (status = 'cancelado' and pago_em is not null and conta_id is null))
    and ((devolvido_em is not null) = (devolucao is not distinct from 'devolvido'))
  );
-- Pendências: pedidos sem receber de dias anteriores.
create index if not exists pedidos_sem_receber_idx on public.pedidos (negocio_id, dia)
  where status <> 'cancelado' and pago_em is null and nao_recebido_em is null;

-- Dia encerrado pelo botão "Encerrar o dia". Lançar ou reabrir um pedido
-- daquele dia apaga o encerramento (gatilho abaixo) e o dia volta a ficar
-- aberto. O dia de trabalho vira sozinho às 5h, encerrado ou não.
create table if not exists public.dias_encerrados (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  dia date not null,
  encerrado_em timestamptz not null default now(),
  encerrado_por uuid references public.usuarios (id) on delete set null,
  primary key (negocio_id, dia)
);

alter table public.dias_encerrados enable row level security;
revoke all on public.dias_encerrados from anon, authenticated;
grant select on public.dias_encerrados to authenticated;

drop policy if exists "dias_encerrados isolados por negocio_id" on public.dias_encerrados;
create policy "dias_encerrados isolados por negocio_id"
  on public.dias_encerrados for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Pedido em aberto: ainda sem entregar, ou sem receber (e ninguém disse que
-- o cliente foi embora sem pagar). Um pedido assim reabre o dia encerrado.
create or replace function public.reabrir_dia_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelado'
     and (new.status in ('pendente', 'em_preparo', 'pronto') or (new.pago_em is null and new.nao_recebido_em is null)) then
    delete from public.dias_encerrados where negocio_id = new.negocio_id and dia = new.dia;
  end if;
  return null;
end;
$$;

drop trigger if exists reabrir_dia_do_pedido on public.pedidos;
create trigger reabrir_dia_do_pedido
  after insert or update on public.pedidos
  for each row execute function public.reabrir_dia_do_pedido();

-- "Encerrar o dia": só com tudo resolvido, nenhum pedido sem entregar e
-- nenhuma conta sem receber. Devolve a hora do encerramento.
create or replace function public.encerrar_dia(p_dia date)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_abertos int;
  v_quando timestamptz;
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_dia is null or p_dia > public.dia_do_negocio(v_negocio_id) then
    raise exception 'Este dia ainda não começou.';
  end if;

  select count(*) into v_abertos
  from public.pedidos
  where negocio_id = v_negocio_id
    and dia = p_dia
    and status <> 'cancelado'
    and (status in ('pendente', 'em_preparo', 'pronto') or (pago_em is null and nao_recebido_em is null));
  if v_abertos = 1 then
    raise exception 'Não dá para encerrar: 1 pedido está em aberto. Resolva antes de encerrar o dia.';
  elsif v_abertos > 1 then
    raise exception 'Não dá para encerrar: % pedidos estão em aberto. Resolva antes de encerrar o dia.', v_abertos;
  end if;

  insert into public.dias_encerrados (negocio_id, dia, encerrado_por)
  values (v_negocio_id, p_dia, (select auth.uid()))
  on conflict (negocio_id, dia) do nothing;
  select encerrado_em into v_quando
  from public.dias_encerrados
  where negocio_id = v_negocio_id and dia = p_dia;
  return v_quando;
end;
$$;

-- "Já foi entregue": o pedido saiu e ninguém marcou. Resolve um pedido ou
-- todos os prontos de uma vez antes de encerrar o dia.
create or replace function public.marcar_entregues(p_pedido_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos int;
begin
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;
  update public.pedidos
  set status = 'entregue',
      entregue_em = now(),
      atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = public.negocio_do_usuario_atual()
    and status in ('pendente', 'em_preparo', 'pronto');
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- "Foi embora sem pagar": a conta sai das abertas e fica como não recebida.
-- Quem foi embora já levou o pedido: o que ainda estava aberto vira entregue.
create or replace function public.marcar_nao_recebido(p_pedido_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos int;
begin
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;
  update public.pedidos
  set nao_recebido_em = now(),
      status = case when status in ('pendente', 'em_preparo', 'pronto') then 'entregue' else status end,
      entregue_em = case when status in ('pendente', 'em_preparo', 'pronto') then now() else entregue_em end,
      atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = public.negocio_do_usuario_atual()
    and status <> 'cancelado'
    and pago_em is null
    and nao_recebido_em is null;
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- Marcou "não recebido" por engano, ou o cliente voltou para pagar: a conta
-- volta a ficar aberta (e o dia, se estava encerrado, reabre).
create or replace function public.desfazer_nao_recebido(p_pedido_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos int;
begin
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;
  update public.pedidos
  set nao_recebido_em = null,
      atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = public.negocio_do_usuario_atual()
    and nao_recebido_em is not null;
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- "Cancelar a conta": cancela de uma vez os pedidos que ninguém pagou (a mesa
-- inteira ou o pedido do balcão). Pedido já pago não entra: para ele a
-- pergunta é se o dinheiro foi devolvido (cancelar_pedido).
create or replace function public.cancelar_conta(p_pedido_ids uuid[], p_motivo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_quantos int;
begin
  if p_motivo is null or p_motivo not in ('cliente_desistiu', 'erro_lancamento', 'faltou_ingrediente', 'outro') then
    raise exception 'Escolha o motivo do cancelamento.';
  end if;
  if p_pedido_ids is null or cardinality(p_pedido_ids) not between 1 and 200 then
    raise exception 'Escolha de 1 a 200 pedidos.';
  end if;

  perform 1 from public.pedidos
  where id = any (p_pedido_ids) and negocio_id = v_negocio_id
  for update;
  if exists (
    select 1 from public.pedidos
    where id = any (p_pedido_ids) and negocio_id = v_negocio_id
      and status <> 'cancelado' and (pago_em is not null or nao_recebido_em is not null)
  ) then
    raise exception 'Esta conta mudou: algum pedido já foi recebido. Atualize a tela.';
  end if;

  update public.pedidos
  set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo, atualizado_em = now()
  where id = any (p_pedido_ids)
    and negocio_id = v_negocio_id
    and status <> 'cancelado';
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- "Devolvi": o dinheiro do pedido cancelado voltou para o cliente.
create or replace function public.marcar_devolvido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos
  set devolucao = 'devolvido',
      devolvido_em = now(),
      atualizado_em = now()
  where id = p_pedido_id
    and negocio_id = public.negocio_do_usuario_atual()
    and status = 'cancelado'
    and pago_em is not null
    and conta_id is null
    and devolucao is distinct from 'devolvido';
  if not found then
    raise exception 'Este dinheiro já foi marcado como devolvido. Atualize a tela.';
  end if;
end;
$$;

revoke all on function public.reabrir_dia_do_pedido() from public, anon, authenticated;
revoke all on function public.encerrar_dia(date) from public, anon;
revoke all on function public.marcar_entregues(uuid[]) from public, anon;
revoke all on function public.marcar_nao_recebido(uuid[]) from public, anon;
revoke all on function public.desfazer_nao_recebido(uuid[]) from public, anon;
revoke all on function public.cancelar_conta(uuid[], text) from public, anon;
revoke all on function public.marcar_devolvido(uuid) from public, anon;
grant execute on function public.encerrar_dia(date) to authenticated;
grant execute on function public.marcar_entregues(uuid[]) to authenticated;
grant execute on function public.marcar_nao_recebido(uuid[]) to authenticated;
grant execute on function public.desfazer_nao_recebido(uuid[]) to authenticated;
grant execute on function public.cancelar_conta(uuid[], text) to authenticated;
grant execute on function public.marcar_devolvido(uuid) to authenticated;


-- Cancelar pedido pago: devolveu o dinheiro? ----------------------------------------

-- Pedido já pago (na hora, no balcão): p_devolucao diz se o dinheiro já
-- voltou para o cliente ('devolvido') ou ainda vai voltar ('a_devolver', que
-- fica no Caixa até alguém tocar em "Devolvi"). Sem resposta (aparelho com a
-- versão anterior do site), fica a devolver: o dinheiro do cliente não some
-- de vista.
-- Pedido entregue só é cancelado se ninguém pagou (cancelar a conta).
drop function if exists public.cancelar_pedido(uuid, text);
create or replace function public.cancelar_pedido(p_pedido_id uuid, p_motivo text, p_devolucao text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_devolucao text;
begin
  if p_motivo is null or p_motivo not in ('cliente_desistiu', 'erro_lancamento', 'faltou_ingrediente', 'outro') then
    raise exception 'Escolha o motivo do cancelamento.';
  end if;
  if p_devolucao is not null and p_devolucao not in ('devolvido', 'a_devolver') then
    raise exception 'Diga se você já devolveu o dinheiro ao cliente.';
  end if;

  select * into v_pedido from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.conta_id is not null then
    raise exception 'Este pedido já foi pago na conta da mesa. Para cancelar, desfaça o recebimento da conta no Caixa.';
  end if;
  if v_pedido.nao_recebido_em is not null then
    raise exception 'Este pedido está como não recebido. Para cancelar, desfaça o "não recebido" no Caixa.';
  end if;
  if v_pedido.status = 'cancelado' or (v_pedido.status = 'entregue' and v_pedido.pago_em is not null) then
    raise exception 'Este pedido já foi encerrado.';
  end if;

  if v_pedido.pago_em is not null then
    v_devolucao := coalesce(p_devolucao, 'a_devolver');
  end if;
  update public.pedidos
  set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo, atualizado_em = now(),
      devolucao = v_devolucao,
      devolvido_em = case when v_devolucao = 'devolvido' then now() end
  where id = p_pedido_id;
end;
$$;

revoke all on function public.cancelar_pedido(uuid, text, text) from public, anon;
grant execute on function public.cancelar_pedido(uuid, text, text) to authenticated;

-- Cartão só nos pedidos antigos; conta não recebida não é recebida avulsa ----------

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
  -- 'cartao' só existe nos pedidos pagos antes de separar crédito e débito.
  if p_forma_pagamento = 'cartao' then
    raise exception 'Cartão agora é anotado como crédito ou débito. Lance o pedido de novo escolhendo um dos dois.';
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
  -- 'cartao' só existe nos pedidos pagos antes de separar crédito e débito.
  if p_forma = 'cartao' then
    raise exception 'Cartão agora é anotado como crédito ou débito. Escolha um dos dois.';
  end if;
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
    and conta_id is null
    and nao_recebido_em is null
    and (p_forma is null or pago_em is null);
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- Conta não recebida não passa de mesa nem fecha; mesa paga entrega o pronto -------

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
    and pago_em is null
    and nao_recebido_em is null;
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
    v_negocio_id, public.dia_do_negocio(v_negocio_id), v_mesa, v_nome_mesa, v_consumo,
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

-- Excluir a conta com a senha ----------------------------------------------------------

-- Senhas erradas ao excluir a conta: 5 em 15 minutos e é preciso esperar.
create table if not exists public.tentativas_senha (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists tentativas_senha_usuario_idx on public.tentativas_senha (usuario_id, criado_em);
alter table public.tentativas_senha enable row level security;
revoke all on public.tentativas_senha from anon, authenticated;

-- Excluir a conta pede a senha atual, conferida aqui: quem pega o celular com
-- a conta aberta não apaga o negócio sem saber a senha. Devolve 'excluida' ou
-- 'senha_incorreta' (sem erro, para a tentativa errada ficar gravada).
drop function if exists public.excluir_minha_conta();
create or replace function public.excluir_minha_conta(p_senha text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_papel text;
  v_hash text;
begin
  if v_usuario_id is null then
    raise exception 'Entre na sua conta para excluí-la.';
  end if;

  delete from public.tentativas_senha where criado_em < now() - interval '1 day';
  if (
    select count(*) from public.tentativas_senha
    where usuario_id = v_usuario_id and criado_em > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'Muitas tentativas com a senha errada. Espere 15 minutos e tente de novo.';
  end if;

  select encrypted_password into v_hash from auth.users where id = v_usuario_id;
  if coalesce(p_senha, '') = '' or coalesce(v_hash, '') = ''
     or extensions.crypt(p_senha, v_hash) is distinct from v_hash then
    insert into public.tentativas_senha (usuario_id) values (v_usuario_id);
    return 'senha_incorreta';
  end if;

  select negocio_id, papel into v_negocio_id, v_papel
  from public.usuarios
  where id = v_usuario_id;

  if v_papel = 'admin' then
    delete from auth.users
    where id in (select id from public.usuarios where negocio_id = v_negocio_id);
    delete from public.negocios where id = v_negocio_id;
  end if;

  delete from auth.users where id = v_usuario_id;
  return 'excluida';
end;
$$;

revoke all on function public.excluir_minha_conta(text) from public, anon;
grant execute on function public.excluir_minha_conta(text) to authenticated;


-- Versão do banco ----------------------------------------------------------------------

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261112;
$$;

commit;
