-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-07_leituras-cardapio.sql (este arquivo sobe a versão do
-- banco para 20261108).
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Vem da validação de campo (Batata Delas, Império do Sabor, Espetaria VIP)
-- e do Raio-X de 28/10:
-- 1. Virada do dia configurável (padrão 5h): turno depois da meia-noite não
--    perde a fila nem recomeça a senha (BAN-01).
-- 2. Nome do cliente no pedido (a mesa veio em 29/10), forma de pagamento e
--    fechamento do caixa.
-- 3. Produto que não passa pela cozinha (bebida).
-- 4. Modo sem tela de cozinha (cozinha do lado do balcão).
-- 5. Tabela de eventos: esgotado que evitou venda e faltas que continuam
--    contadas mesmo depois de editar o pedido (TCC-01, TCC-04).
begin;

do $$
begin
  if to_regclass('public.produto_ingredientes') is null then
    raise exception 'Rode antes supabase/migracoes/2026-10-22_ingredientes-custo-e-versao.sql';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedidos' and column_name = 'mesa'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-10-29_mesa-no-pedido.sql';
  end if;
  if to_regclass('public.leituras_cardapio') is null then
    raise exception 'Rode antes supabase/migracoes/2026-11-07_leituras-cardapio.sql';
  end if;
end;
$$;

-- 1. Colunas novas ----------------------------------------------------------------
alter table public.negocios
  add column if not exists virada_do_dia smallint not null default 5 check (virada_do_dia between 0 and 8),
  add column if not exists usa_tela_cozinha boolean not null default true;

alter table public.produtos
  add column if not exists vai_para_cozinha boolean not null default true;

alter table public.pedidos
  add column if not exists identificacao text check (identificacao is null or length(identificacao) between 1 and 30),
  add column if not exists forma_pagamento text check (forma_pagamento in ('dinheiro', 'pix', 'cartao')),
  add column if not exists pago_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_pagamento_coerente') then
    alter table public.pedidos
      add constraint pedidos_pagamento_coerente check ((forma_pagamento is null) = (pago_em is null));
  end if;
end;
$$;

-- O mesmo, respeitando a hora em que o dia de trabalho do negócio vira.
-- p_agora existe para os testes; no uso normal é o horário do banco.
create or replace function public.dia_do_negocio(p_negocio_id uuid, p_agora timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_agora at time zone 'America/Fortaleza') - make_interval(hours => coalesce(n.virada_do_dia, 0)))::date
  from public.negocios n
  where n.id = p_negocio_id;
$$;

-- Registro do que aconteceu no balcão e na cozinha, para as métricas do TCC:
-- produto esgotado que evitou venda, faltas avisadas pela cozinha (que
-- continuam contadas mesmo se o pedido for editado depois). Só funções do
-- banco gravam aqui.
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  tipo text not null check (tipo in (
    'marcado_esgotado', 'voltou_disponivel', 'toque_bloqueado', 'faltou_item', 'faltou_ingrediente'
  )),
  produto_id uuid references public.produtos (id) on delete cascade,
  pedido_id uuid references public.pedidos (id) on delete cascade,
  detalhe text check (detalhe is null or length(detalhe) <= 60),
  criado_em timestamptz not null default now()
);

create index if not exists eventos_negocio_criado_em_idx on public.eventos (negocio_id, criado_em);
create index if not exists eventos_produto_idx on public.eventos (produto_id);
create index if not exists eventos_pedido_idx on public.eventos (pedido_id);

alter table public.eventos enable row level security;
-- Eventos: o negócio lê os seus; só as funções do banco escrevem.
revoke all on public.eventos from anon, authenticated;
grant select on public.eventos to authenticated;

drop policy if exists "eventos isolados por negocio_id" on public.eventos;
create policy "eventos isolados por negocio_id"
  on public.eventos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- 2. Pedidos ------------------------------------------------------------------------
-- Nome do cliente digitado pelo atendente: sem espaços sobrando, até 30 letras.
create or replace function public.limpar_identificacao(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_texto text := nullif(regexp_replace(trim(p_texto), '\s+', ' ', 'g'), '');
begin
  if length(v_texto) > 30 then
    raise exception 'O nome do cliente pode ter no máximo 30 letras.';
  end if;
  return v_texto;
end;
$$;

-- p_mesa continua como na migração de 29/10 (mesa no salão; vazio = balcão).
-- As versões antigas saem: com os valores padrão, uma chamada com menos
-- argumentos ficaria ambígua.
drop function if exists public.criar_pedido(jsonb, uuid);
drop function if exists public.criar_pedido(jsonb, uuid, int);
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
  if p_forma_pagamento is not null and p_forma_pagamento not in ('dinheiro', 'pix', 'cartao') then
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

revoke all on function public.limpar_identificacao(text) from public, anon, authenticated;
revoke all on function public.criar_pedido(jsonb, uuid, int, text, text) from public, anon;
grant execute on function public.criar_pedido(jsonb, uuid, int, text, text) to authenticated;

-- Caminhos permitidos:
--   pendente → em_preparo | pronto,  em_preparo → pronto,  pronto → entregue
--   pronto → pendente: desfazer um "Pronto" tocado por engano, até 2 minutos depois
--   pedido de dia anterior ainda aberto → entregue: o dono resolve a pendência
create or replace function public.atualizar_status_pedido(p_pedido_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  select * into v_pedido from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_pedido.status = 'pronto' and p_status = 'pendente'
     and v_pedido.pronto_em <= now() - interval '2 minutes' then
    raise exception 'O tempo para desfazer acabou.';
  end if;

  if not ((v_pedido.status = 'pendente' and p_status in ('em_preparo', 'pronto'))
       or (v_pedido.status = 'em_preparo' and p_status = 'pronto')
       or (v_pedido.status = 'pronto' and p_status in ('entregue', 'pendente'))
       or (v_pedido.dia < public.dia_do_negocio(v_pedido.negocio_id)
           and v_pedido.status in ('pendente', 'em_preparo') and p_status = 'entregue')) then
    raise exception 'Este pedido já mudou de status. Atualize a tela.';
  end if;

  update public.pedidos
  set status = p_status,
      pronto_em = case p_status when 'pronto' then now() when 'pendente' then null else pronto_em end,
      entregue_em = case when p_status = 'entregue' then now() else entregue_em end,
      atualizado_em = now()
  where id = p_pedido_id;
end;
$$;

-- A cozinha marca que não tem como fazer um item. Mexe em atualizado_em do
-- pedido para o tempo real avisar a tela do atendente.
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
  if coalesce(p_faltou, false) then
    insert into public.eventos (negocio_id, tipo, produto_id, pedido_id)
    select p.negocio_id, 'faltou_item', i.produto_id, p.id
    from public.itens_pedido i join public.pedidos p on p.id = i.pedido_id
    where i.id = p_item_id;
  end if;
end;
$$;

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
  if coalesce(p_faltou, false) then
    insert into public.eventos (negocio_id, tipo, produto_id, pedido_id, detalhe)
    select p.negocio_id, 'faltou_ingrediente', v_produto_id, p.id, left(v_nome, 60)
    from public.pedidos p where p.id = v_pedido_id;
  end if;
end;
$$;

-- 3. Esgotados, pagamento e jeito de trabalhar do negócio ---------------------------
-- Marcar e desmarcar esgotado fica registrado (métrica do TCC: quanto tempo
-- cada produto ficou fora e quantas vendas isso evitou).
create or replace function public.ao_mudar_disponivel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.eventos (negocio_id, tipo, produto_id)
  values (new.negocio_id, case when new.disponivel then 'voltou_disponivel' else 'marcado_esgotado' end, new.id);
  return new;
end;
$$;

drop trigger if exists ao_mudar_disponivel on public.produtos;
create trigger ao_mudar_disponivel
  after update of disponivel on public.produtos
  for each row
  when (old.disponivel is distinct from new.disponivel)
  execute function public.ao_mudar_disponivel();

-- O atendente tocou num produto esgotado: a venda que teria saído errada.
-- Toques repetidos no mesmo produto em 5 segundos contam uma vez só.
create or replace function public.registrar_toque_esgotado(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
begin
  perform 1 from public.produtos
  where id = p_produto_id and negocio_id = v_negocio_id and not disponivel;
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.eventos
    where negocio_id = v_negocio_id and produto_id = p_produto_id
      and tipo = 'toque_bloqueado' and criado_em > now() - interval '5 seconds'
  ) then
    return;
  end if;
  insert into public.eventos (negocio_id, tipo, produto_id)
  values (v_negocio_id, 'toque_bloqueado', p_produto_id);
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
  if p_forma is not null and p_forma not in ('dinheiro', 'pix', 'cartao') then
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

-- Só o dono: hora da virada do dia e se a cozinha tem tela própria.
create or replace function public.configurar_operacao(p_virada_do_dia smallint, p_usa_tela_cozinha boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_virada_do_dia is null or p_virada_do_dia not between 0 and 8 then
    raise exception 'Escolha uma hora entre 0h e 8h.';
  end if;
  update public.negocios
  set virada_do_dia = p_virada_do_dia,
      usa_tela_cozinha = coalesce(p_usa_tela_cozinha, usa_tela_cozinha)
  where id = public.negocio_do_admin_atual();
end;
$$;

revoke all on function public.ao_mudar_disponivel() from public, anon, authenticated;
revoke all on function public.registrar_toque_esgotado(uuid) from public, anon;
revoke all on function public.registrar_pagamento(uuid[], text) from public, anon;
revoke all on function public.configurar_operacao(smallint, boolean) from public, anon;
grant execute on function public.registrar_toque_esgotado(uuid) to authenticated;
grant execute on function public.registrar_pagamento(uuid[], text) to authenticated;
grant execute on function public.configurar_operacao(smallint, boolean) to authenticated;

-- 4. Página do cliente ------------------------------------------------------------------
create or replace function public.pagina_publica(p_codigo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_virada smallint;
begin
  perform public.conferir_limite_consultas();

  select coalesce(nome_publico, nome), virada_do_dia into v_nome, v_virada
  from public.negocios
  where codigo_publico = p_codigo and pagina_ativa;

  perform public.registrar_consulta(v_nome is null);
  if v_nome is null then
    return null;
  end if;
  -- A virada do dia serve para o celular do cliente esquecer a senha de ontem.
  return json_build_object('nome', v_nome, 'virada_do_dia', v_virada);
end;
$$;

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

-- 5. Versão do banco ----------------------------------------------------------------------
-- O site confere este número ao abrir. Se o banco no ar estiver atrás do
-- código (migração esquecida), a equipe vê um aviso em vez de o sistema
-- funcionar pela metade sem ninguém perceber. Toda migração nova sobe este
-- número junto com VERSAO_DO_BANCO em src/lib/versaoDoBanco.js.
create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261108;
$$;

commit;
