-- Organiza+ — schema completo do banco.
-- Rodar inteiro no SQL Editor de um projeto Supabase novo.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 120),
  criado_em timestamptz not null default now(),
  -- Página pública de acompanhamento (QR code). O código vai na URL impressa:
  -- longo e aleatório para ninguém achar a página de um negócio por tentativa.
  codigo_publico text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- Nome mostrado ao cliente; sem ele, vale o nome do cadastro.
  nome_publico text check (nome_publico is null or length(nome_publico) between 1 and 60),
  pagina_ativa boolean not null default true
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  papel text not null default 'admin' check (papel in ('admin', 'atendente', 'cozinha'))
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  preco numeric(10, 2) not null check (preco >= 0),
  custo numeric(10, 2) check (custo >= 0),
  disponivel boolean not null default true,
  -- "Excluir" arquiva: o produto some do cardápio, mas os pedidos antigos continuam com nome.
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Dia de operação no fuso dos negócios atendidos (Fortaleza). Separa a fila
-- de hoje das pendências de dias anteriores e reinicia os números do pedido.
create or replace function public.hoje_no_negocio()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Fortaleza')::date;
$$;

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_preparo', 'pronto', 'entregue', 'cancelado')),
  -- Número que o cliente ouve e digita na página do QR. Aleatório para não
  -- dar para adivinhar o pedido dos outros em sequência; único no dia.
  numero smallint not null check (numero between 1000 and 9999),
  dia date not null default public.hoje_no_negocio(),
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null,
  -- Gerada pelo aparelho que envia: repetir o envio (toque duplo, internet
  -- lenta) devolve o mesmo pedido em vez de criar outro.
  chave_envio uuid not null,
  atualizado_em timestamptz not null default now(),
  alterado_em timestamptz,
  pronto_em timestamptz,
  entregue_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text
    check (motivo_cancelamento in ('cliente_desistiu', 'erro_lancamento', 'faltou_ingrediente', 'outro')),
  unique (negocio_id, dia, numero),
  unique (negocio_id, chave_envio)
);

create table if not exists public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  -- Cascade só tem efeito ao apagar o negócio inteiro (LGPD): ninguém tem
  -- permissão de apagar produto, que é arquivado.
  produto_id uuid not null references public.produtos (id) on delete cascade,
  quantidade int not null check (quantidade between 1 and 999),
  -- Preço e custo copiados do produto na hora do pedido: mudar o produto
  -- depois não altera o faturamento nem o lucro de dias anteriores.
  preco_unitario numeric(10, 2) not null check (preco_unitario >= 0),
  custo_unitario numeric(10, 2) check (custo_unitario >= 0),
  -- Ex.: "sem salada". Texto livre de quem lança o pedido, mostrado na cozinha.
  observacao text check (observacao is null or length(observacao) between 1 and 140),
  -- A cozinha avisa que não tem como fazer este item; o atendente edita ou cancela.
  faltou boolean not null default false
);

create index if not exists usuarios_negocio_idx on public.usuarios (negocio_id);
create index if not exists produtos_negocio_idx on public.produtos (negocio_id);
create index if not exists pedidos_negocio_criado_em_idx on public.pedidos (negocio_id, criado_em);
create index if not exists pedidos_abertos_idx on public.pedidos (negocio_id, dia)
  where status in ('pendente', 'em_preparo', 'pronto');
create index if not exists itens_pedido_pedido_idx on public.itens_pedido (pedido_id);
create index if not exists itens_pedido_produto_idx on public.itens_pedido (produto_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Resolve o negocio_id do usuário autenticado, usado nas policies abaixo.
create or replace function public.negocio_do_usuario_atual()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select negocio_id from public.usuarios where id = (select auth.uid());
$$;

alter table public.negocios enable row level security;
alter table public.usuarios enable row level security;
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;

-- Não depende dos grants padrão do Supabase. Pedidos e itens só são gravados
-- pelas funções criar_pedido e atualizar_status_pedido.
revoke all on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  from anon, authenticated;
grant select on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  to authenticated;
grant insert, update on public.produtos to authenticated;
-- Só o nome: liberar negocio_id ou papel deixaria o usuário entrar em outro negócio.
grant update (nome) on public.usuarios to authenticated;

drop policy if exists "negocios isolados por negocio_id" on public.negocios;
create policy "negocios isolados por negocio_id"
  on public.negocios for select to authenticated
  using (id = (select public.negocio_do_usuario_atual()));

drop policy if exists "usuarios isolados por negocio_id" on public.usuarios;
create policy "usuarios isolados por negocio_id"
  on public.usuarios for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "usuario atualiza o proprio perfil" on public.usuarios;
create policy "usuario atualiza o proprio perfil"
  on public.usuarios for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "produtos isolados por negocio_id" on public.produtos;
create policy "produtos isolados por negocio_id"
  on public.produtos for all to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "pedidos isolados por negocio_id" on public.pedidos;
create policy "pedidos isolados por negocio_id"
  on public.pedidos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "itens_pedido isolados por negocio_id" on public.itens_pedido;
create policy "itens_pedido isolados por negocio_id"
  on public.itens_pedido for select to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_id and p.negocio_id = (select public.negocio_do_usuario_atual())
  ));

-- ---------------------------------------------------------------------------
-- Cadastro: cria o negócio e o perfil admin
-- ---------------------------------------------------------------------------
-- O Cadastro.jsx chama supabase.auth.signUp com options.data = { nome, nome_negocio }.
-- Um trigger security definer evita abrir INSERT em negocios/usuarios para o
-- cliente, e funciona também com a confirmação de e-mail ligada.

create or replace function public.criar_negocio_do_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
begin
  insert into public.negocios (nome)
  values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_negocio'), ''), 'Meu negócio'), 120))
  returning id into v_negocio_id;

  insert into public.usuarios (id, negocio_id, nome, papel)
  values (
    new.id,
    v_negocio_id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)), 120),
    'admin'
  );

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario_auth on auth.users;
create trigger ao_criar_usuario_auth
  after insert on auth.users
  for each row execute function public.criar_negocio_do_novo_usuario();

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
-- Ninguém escreve direto em pedidos e itens: tudo passa por estas funções, que
-- conferem negócio, status e produtos. As mensagens de erro aparecem na tela
-- (o front mostra o texto dos erros com código P0001), por isso são escritas
-- para o usuário.

-- Grava os itens de um pedido com preço e custo do cadastro. Na edição,
-- p_anteriores traz { produto_id: { preco, custo } } do que já estava no
-- pedido: esses produtos mantêm o preço combinado e continuam aceitos mesmo
-- que tenham esgotado depois (a cozinha pode já estar preparando).
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
  v_quantidade int;
  v_observacao text;
  v_achou boolean;
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
       or coalesce(jsonb_typeof(v_item -> 'observacao'), 'null') not in ('string', 'null') then
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
    where id = (v_item ->> 'produto_id')::uuid and negocio_id = p_negocio_id
    for share;
    v_achou := found;
    v_ja_estava := v_achou and p_anteriores ? v_produto.id::text;
    if not v_achou or (not v_ja_estava and (not v_produto.disponivel or v_produto.arquivado)) then
      raise exception 'Um dos produtos esgotou. Revise o pedido.';
    end if;

    if v_ja_estava then
      v_preco := (p_anteriores -> v_produto.id::text ->> 'preco')::numeric;
      v_custo := (p_anteriores -> v_produto.id::text ->> 'custo')::numeric;
    else
      v_preco := v_produto.preco;
      v_custo := v_produto.custo;
    end if;

    insert into public.itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, custo_unitario, observacao)
    values (p_pedido_id, v_produto.id, v_quantidade, v_preco, v_custo, v_observacao);
  end loop;
end;
$$;

-- p_chave_envio é gerada pelo aparelho. Se o mesmo envio chegar de novo
-- (toque duplo, nova tentativa com internet lenta), devolve o pedido já criado.
create or replace function public.criar_pedido(p_itens jsonb, p_chave_envio uuid)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_pedido public.pedidos;
  v_tentativas int := 0;
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

  loop
    v_tentativas := v_tentativas + 1;
    if v_tentativas > 50 then
      raise exception 'Não foi possível gerar o número do pedido. Tente de novo.';
    end if;
    begin
      insert into public.pedidos (negocio_id, criado_por, chave_envio, numero)
      values (v_negocio_id, (select auth.uid()), p_chave_envio, 1000 + floor(random() * 9000)::int)
      returning * into v_pedido;
      exit;
    exception when unique_violation then
      -- O mesmo envio chegou duas vezes ao mesmo tempo: devolve o primeiro.
      select * into v_pedido from public.pedidos
      where negocio_id = v_negocio_id and chave_envio = p_chave_envio;
      if found then
        return v_pedido;
      end if;
      -- Senão o número sorteado já existe hoje: sorteia outro.
    end;
  end loop;

  perform public.gravar_itens_pedido(v_pedido.id, v_negocio_id, p_itens);
  return v_pedido;
end;
$$;

-- Troca os itens de um pedido que ainda não ficou pronto. A posição na fila
-- (criado_em) não muda; alterado_em faz a cozinha destacar o cartão.
create or replace function public.editar_pedido(p_pedido_id uuid, p_itens jsonb)
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

create or replace function public.cancelar_pedido(p_pedido_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_motivo is null or p_motivo not in ('cliente_desistiu', 'erro_lancamento', 'faltou_ingrediente', 'outro') then
    raise exception 'Escolha o motivo do cancelamento.';
  end if;

  select status into v_status from public.pedidos
  where id = p_pedido_id and negocio_id = public.negocio_do_usuario_atual()
  for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_status in ('entregue', 'cancelado') then
    raise exception 'Este pedido já foi encerrado.';
  end if;

  update public.pedidos
  set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo, atualizado_em = now()
  where id = p_pedido_id;
end;
$$;

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
       or (v_pedido.dia < public.hoje_no_negocio()
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
end;
$$;

revoke all on function public.negocio_do_usuario_atual() from public, anon;
revoke all on function public.criar_negocio_do_novo_usuario() from public, anon, authenticated;
revoke all on function public.gravar_itens_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.criar_pedido(jsonb, uuid) from public, anon;
revoke all on function public.editar_pedido(uuid, jsonb) from public, anon;
revoke all on function public.cancelar_pedido(uuid, text) from public, anon;
revoke all on function public.atualizar_status_pedido(uuid, text) from public, anon;
revoke all on function public.marcar_item_faltou(uuid, boolean) from public, anon;
grant execute on function public.negocio_do_usuario_atual() to authenticated;
grant execute on function public.criar_pedido(jsonb, uuid) to authenticated;
grant execute on function public.editar_pedido(uuid, jsonb) to authenticated;
grant execute on function public.cancelar_pedido(uuid, text) to authenticated;
grant execute on function public.atualizar_status_pedido(uuid, text) to authenticated;
grant execute on function public.marcar_item_faltou(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Página pública de acompanhamento (QR code)
-- ---------------------------------------------------------------------------
-- Quem lê o QR não tem conta. O papel anon não lê nenhuma tabela nem view:
-- só pode chamar pagina_publica e acompanhar_pedido, que devolvem o mínimo
-- (nome do negócio; posição, status e tempo médio de um pedido) e contam as
-- consultas de cada aparelho para barrar quem tenta números em sequência.

-- Consultas por aparelho e por minuto. Guarda só um hash do IP (LGPD).
create table if not exists public.limite_consultas (
  chave text not null,
  minuto timestamptz not null,
  consultas int not null default 0,
  erros int not null default 0,
  primary key (chave, minuto)
);
alter table public.limite_consultas enable row level security;
revoke all on public.limite_consultas from anon, authenticated;

create or replace function public.chave_do_aparelho()
returns text
language sql
stable
set search_path = ''
as $$
  -- O Supabase repassa os cabeçalhos da requisição em request.headers.
  -- cf-connecting-ip vem do proxy do Supabase; os outros são reserva.
  select md5(coalesce(
    nullif(trim(h ->> 'cf-connecting-ip'), ''),
    nullif(trim(h ->> 'x-real-ip'), ''),
    nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''),
    'sem-ip'
  ))
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) cabecalhos;
$$;

-- Até 60 consultas por minuto por aparelho (a página consulta a cada 10 s) e
-- até 10 números ou endereços errados em 10 minutos.
create or replace function public.conferir_limite_consultas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := public.chave_do_aparelho();
  v_neste_minuto int;
  v_erros int;
begin
  select coalesce(sum(consultas) filter (where minuto = date_trunc('minute', now())), 0),
         coalesce(sum(erros), 0)
  into v_neste_minuto, v_erros
  from public.limite_consultas
  where chave = v_chave and minuto > now() - interval '10 minutes';

  if v_neste_minuto >= 60 or v_erros >= 10 then
    raise exception 'Muitas consultas seguidas. Espere um minuto e tente de novo.';
  end if;
end;
$$;

create or replace function public.registrar_consulta(p_errou boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.limite_consultas as l (chave, minuto, consultas, erros)
  values (public.chave_do_aparelho(), date_trunc('minute', now()), 1, case when p_errou then 1 else 0 end)
  on conflict (chave, minuto)
  do update set consultas = l.consultas + 1, erros = l.erros + excluded.erros;

  delete from public.limite_consultas where minuto < now() - interval '1 hour';
end;
$$;

create or replace function public.pagina_publica(p_codigo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  perform public.conferir_limite_consultas();

  select coalesce(nome_publico, nome) into v_nome
  from public.negocios
  where codigo_publico = p_codigo and pagina_ativa;

  perform public.registrar_consulta(v_nome is null);
  if v_nome is null then
    return null;
  end if;
  return json_build_object('nome', v_nome);
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

  if v_negocio_id is not null and p_numero between 1000 and 9999 then
    select * into v_pedido
    from public.pedidos
    where negocio_id = v_negocio_id and dia = v_hoje and numero = p_numero;
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

-- Configuração da página: só o dono (papel admin).
create or replace function public.negocio_do_admin_atual()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_negocio_id uuid;
begin
  select negocio_id into v_negocio_id
  from public.usuarios
  where id = (select auth.uid()) and papel = 'admin';
  if v_negocio_id is null then
    raise exception 'Só o dono do negócio pode mudar a página do cliente.';
  end if;
  return v_negocio_id;
end;
$$;

create or replace function public.configurar_pagina_publica(p_nome_publico text, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := nullif(trim(p_nome_publico), '');
begin
  if length(v_nome) > 60 then
    raise exception 'O nome pode ter no máximo 60 caracteres.';
  end if;
  update public.negocios
  set nome_publico = v_nome, pagina_ativa = coalesce(p_ativa, pagina_ativa)
  where id = public.negocio_do_admin_atual();
end;
$$;

-- Para quando um QR vazar ou for usado de má-fé: o endereço antigo para de
-- funcionar e os cartazes precisam ser impressos de novo.
create or replace function public.trocar_codigo_publico()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  update public.negocios
  set codigo_publico = replace(gen_random_uuid()::text, '-', '')
  where id = public.negocio_do_admin_atual()
  returning codigo_publico into v_codigo;
  return v_codigo;
end;
$$;

revoke all on function public.chave_do_aparelho() from public, anon, authenticated;
revoke all on function public.conferir_limite_consultas() from public, anon, authenticated;
revoke all on function public.registrar_consulta(boolean) from public, anon, authenticated;
revoke all on function public.negocio_do_admin_atual() from public, anon, authenticated;
revoke all on function public.pagina_publica(text) from public;
revoke all on function public.acompanhar_pedido(text, int) from public;
revoke all on function public.configurar_pagina_publica(text, boolean) from public, anon;
revoke all on function public.trocar_codigo_publico() from public, anon;
grant execute on function public.pagina_publica(text) to anon, authenticated;
grant execute on function public.acompanhar_pedido(text, int) to anon, authenticated;
grant execute on function public.configurar_pagina_publica(text, boolean) to authenticated;
grant execute on function public.trocar_codigo_publico() to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------
-- Publica as tabelas que a Cozinha e os Pedidos escutam. O Realtime respeita
-- o RLS, então cada negócio só recebe os próprios eventos.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['produtos', 'pedidos', 'itens_pedido'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end;
$$;

commit;
