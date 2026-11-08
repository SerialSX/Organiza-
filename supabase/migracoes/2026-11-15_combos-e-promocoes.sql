-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-14_meio-a-meio.sql (este arquivo sobe a versão do banco
-- para 20261115). Pode rodar a qualquer hora: não muda nada do que já existe.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Combos e promoções:
-- 1. combos, combo_partes e combo_opcoes: combo com preço fixo, partes fixas e
--    partes à escolha (com acréscimo opcional). Cada parte diz o tamanho.
-- 2. promocoes e promocao_itens: preço de promoção por dia da semana e horário,
--    para produtos, tamanhos e combos. Volta ao normal sozinho.
-- 3. itens_pedido: cada parte do combo vira um item (cozinha, caixa e relatório
--    somam como sempre), com o combo, o grupo e a parte; e a promoção que deu
--    o preço, com o preço sem ela.
-- 4. gravar_itens_pedido e editar_pedido: combos e promoções. O item que já
--    estava no pedido mantém o preço combinado, mesmo com a promoção acabada.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'itens_pedido' and column_name = 'segundo_produto_id'
  ) then
    raise exception 'Rode antes supabase/migracoes/2026-11-14_meio-a-meio.sql';
  end if;
end;
$$;

-- Tabelas ----------------------------------------------------------------------------

-- Combos e promoções (2026-11-15).
-- Combo: preço fixo digitado pelo dono, com partes fixas ("X-Burguer") e
-- partes à escolha ("Coca, Guaraná ou Suco +R$ 2,00"). Cada parte diz o
-- tamanho ("Pizza G"). No pedido, cada parte vira um item comum (a cozinha, o
-- caixa e o relatório continuam somando como sempre), ligado ao combo por
-- combo_grupo; o preço do combo é dividido entre as partes pelo preço normal
-- de cada uma.
create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  -- Pelo menos R$ 1,00: dividido entre até 12 partes, nenhuma fica negativa
  -- no arredondamento.
  preco numeric(10, 2) not null check (preco >= 1),
  disponivel boolean not null default true,
  -- "Excluir" arquiva: some do cardápio, os pedidos antigos continuam com o nome.
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  -- Mexe a cada salvar: o tempo real avisa as outras telas.
  atualizado_em timestamptz not null default now(),
  unique (id, negocio_id)
);
create index if not exists combos_negocio_idx on public.combos (negocio_id);
-- Dois combos com o mesmo nome confundiriam o atendente.
create unique index if not exists combos_nome_unico_idx
  on public.combos (negocio_id, lower(trim(nome))) where not arquivado;

-- Uma parte do combo. Com uma opção só, é fixa; com mais, o atendente escolhe
-- uma ("Bebida"). Dois X-Burguer no combo são duas partes.
create table if not exists public.combo_partes (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null,
  negocio_id uuid not null,
  ordem smallint not null check (ordem between 0 and 11),
  nome text check (nome is null or length(trim(nome)) between 1 and 40),
  unique (id, negocio_id),
  unique (combo_id, ordem),
  foreign key (combo_id, negocio_id) references public.combos (id, negocio_id) on delete cascade
);
create index if not exists combo_partes_negocio_idx on public.combo_partes (negocio_id);

create table if not exists public.combo_opcoes (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null,
  negocio_id uuid not null,
  produto_id uuid not null,
  -- O tamanho daquela opção (produto com tamanhos); vazio no produto de preço único.
  tamanho_id uuid,
  -- Quanto a mais o cliente paga por esta opção (trocar refri por suco).
  acrescimo numeric(10, 2) not null default 0 check (acrescimo between 0 and 9999.99),
  ordem smallint not null check (ordem between 0 and 19),
  foreign key (parte_id, negocio_id) references public.combo_partes (id, negocio_id) on delete cascade,
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade,
  foreign key (tamanho_id, negocio_id) references public.produto_tamanhos (id, negocio_id) on delete cascade
);
create index if not exists combo_opcoes_parte_idx on public.combo_opcoes (parte_id);
create index if not exists combo_opcoes_produto_idx on public.combo_opcoes (produto_id);
create index if not exists combo_opcoes_tamanho_idx on public.combo_opcoes (tamanho_id);
create index if not exists combo_opcoes_negocio_idx on public.combo_opcoes (negocio_id);

-- Promoção por dia e horário ("Terça do hambúrguer", "Happy hour"). Vale toda
-- semana até o dono pausar ou apagar. dias: 0 = domingo ... 6 = sábado, no dia
-- de trabalho (até as 5h ainda é o dia anterior). Sem horário: o dia todo.
-- hora_fim menor que hora_inicio: passa da meia-noite (22h às 2h).
create table if not exists public.promocoes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  dias smallint[] not null check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  hora_inicio time,
  hora_fim time,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((hora_inicio is null) = (hora_fim is null)),
  check (hora_inicio is distinct from hora_fim or hora_inicio is null),
  unique (id, negocio_id)
);
create index if not exists promocoes_negocio_idx on public.promocoes (negocio_id);

-- O preço de cada item na promoção: um produto de preço único, um tamanho
-- ("só a Pizza G") ou um combo.
create table if not exists public.promocao_itens (
  id uuid primary key default gen_random_uuid(),
  promocao_id uuid not null,
  negocio_id uuid not null,
  produto_id uuid,
  tamanho_id uuid,
  combo_id uuid,
  preco numeric(10, 2) not null check (preco > 0),
  foreign key (promocao_id, negocio_id) references public.promocoes (id, negocio_id) on delete cascade,
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade,
  foreign key (tamanho_id, negocio_id) references public.produto_tamanhos (id, negocio_id) on delete cascade,
  foreign key (combo_id, negocio_id) references public.combos (id, negocio_id) on delete cascade,
  check ((combo_id is null) <> (produto_id is null)),
  check (tamanho_id is null or produto_id is not null)
);
create index if not exists promocao_itens_promocao_idx on public.promocao_itens (promocao_id);
create index if not exists promocao_itens_produto_idx on public.promocao_itens (produto_id);
create index if not exists promocao_itens_tamanho_idx on public.promocao_itens (tamanho_id);
create index if not exists promocao_itens_combo_idx on public.promocao_itens (combo_id);
create index if not exists promocao_itens_negocio_idx on public.promocao_itens (negocio_id);

-- O item do pedido que veio de um combo: o combo (id e nome copiado), qual
-- combo do pedido (combo_grupo: dois "Combo Casal" no mesmo pedido são dois
-- grupos) e a posição da parte. E a promoção que deu o preço (id e nome
-- copiado) com o preço sem ela, para o relatório mostrar o desconto.
alter table public.itens_pedido
  add column if not exists combo_id uuid references public.combos (id) on delete cascade,
  add column if not exists combo_nome text check (combo_nome is null or length(combo_nome) between 1 and 80),
  add column if not exists combo_grupo uuid,
  add column if not exists combo_parte smallint check (combo_parte between 0 and 11),
  add column if not exists promocao_id uuid references public.promocoes (id) on delete set null,
  add column if not exists promocao text check (promocao is null or length(promocao) between 1 and 60),
  add column if not exists preco_cheio numeric(10, 2) check (preco_cheio >= 0);
create index if not exists itens_pedido_combo_idx on public.itens_pedido (combo_id);
create index if not exists itens_pedido_promocao_idx on public.itens_pedido (promocao_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'itens_pedido_combo_completo'
  ) then
    alter table public.itens_pedido
      add constraint itens_pedido_combo_completo
      check (
        (combo_id is null) = (combo_grupo is null)
        and (combo_id is null) = (combo_nome is null)
        and (combo_id is null) = (combo_parte is null)
      );
  end if;
end;
$$;

-- Acesso: o negócio lê os seus. Combo: liga/desliga e exclui (arquiva) direto;
-- o resto só por salvar_combo. Promoção: pausa e apaga direto; o resto só por
-- salvar_promocao.
alter table public.combos enable row level security;
alter table public.combo_partes enable row level security;
alter table public.combo_opcoes enable row level security;
alter table public.promocoes enable row level security;
alter table public.promocao_itens enable row level security;
revoke all on public.combos, public.combo_partes, public.combo_opcoes, public.promocoes, public.promocao_itens
  from anon, authenticated;
grant select on public.combos, public.combo_partes, public.combo_opcoes, public.promocoes, public.promocao_itens
  to authenticated;
grant update (disponivel, arquivado) on public.combos to authenticated;
grant update (ativa) on public.promocoes to authenticated;
grant delete on public.promocoes to authenticated;

drop policy if exists "combos isolados por negocio_id" on public.combos;
create policy "combos isolados por negocio_id"
  on public.combos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "combos alterados pelo negocio" on public.combos;
create policy "combos alterados pelo negocio"
  on public.combos for update to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "combo_partes isoladas por negocio_id" on public.combo_partes;
create policy "combo_partes isoladas por negocio_id"
  on public.combo_partes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "combo_opcoes isoladas por negocio_id" on public.combo_opcoes;
create policy "combo_opcoes isoladas por negocio_id"
  on public.combo_opcoes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "promocoes isoladas por negocio_id" on public.promocoes;
create policy "promocoes isoladas por negocio_id"
  on public.promocoes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "promocoes pausadas pelo negocio" on public.promocoes;
create policy "promocoes pausadas pelo negocio"
  on public.promocoes for update to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "promocoes apagadas pelo negocio" on public.promocoes;
create policy "promocoes apagadas pelo negocio"
  on public.promocoes for delete to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));
drop policy if exists "promocao_itens isolados por negocio_id" on public.promocao_itens;
create policy "promocao_itens isolados por negocio_id"
  on public.promocao_itens for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Funções -----------------------------------------------------------------------------

-- A promoção vale neste instante? O dia é o dia de trabalho (até a virada, 5h,
-- ainda é o dia anterior): a promoção de sexta das 22h às 2h vale até as 2h de
-- sábado. Sem horário, vale o dia de trabalho todo.
create or replace function public.promocao_vale(
  p_dias smallint[],
  p_hora_inicio time,
  p_hora_fim time,
  p_virada int,
  p_momento timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(dow from (l.t - make_interval(hours => coalesce(p_virada, 0))))::smallint = any (p_dias)
    and (
      p_hora_inicio is null
      or (p_hora_inicio < p_hora_fim and l.t::time >= p_hora_inicio and l.t::time < p_hora_fim)
      or (p_hora_inicio > p_hora_fim and (l.t::time >= p_hora_inicio or l.t::time < p_hora_fim))
    )
  from (select p_momento at time zone 'America/Fortaleza' as t) l;
$$;

-- O menor preço de promoção que vale agora para um produto de preço único, um
-- tamanho ou um combo. Nenhuma: nenhuma linha.
create or replace function public.preco_em_promocao(
  p_negocio_id uuid,
  p_produto_id uuid,
  p_tamanho_id uuid,
  p_combo_id uuid,
  p_momento timestamptz
)
returns table (preco numeric, promocao_id uuid, promocao text)
language sql
stable
security definer
set search_path = ''
as $$
  select pi.preco, p.id, p.nome
  from public.promocao_itens pi
  join public.promocoes p on p.id = pi.promocao_id
  join public.negocios n on n.id = p.negocio_id
  where p.negocio_id = p_negocio_id
    and p.ativa
    and case
      when p_combo_id is not null then pi.combo_id = p_combo_id
      else pi.combo_id is null and pi.produto_id = p_produto_id and pi.tamanho_id is not distinct from p_tamanho_id
    end
    and public.promocao_vale(p.dias, p.hora_inicio, p.hora_fim, n.virada_do_dia, p_momento)
  order by pi.preco, p.criado_em, p.id
  limit 1;
$$;

-- Quando o pedido foi feito, para a promoção: o aparelho manda "promocao_em".
-- O pedido guardado sem internet e enviado depois das 19h ainda sai com o
-- preço do happy hour, que foi o combinado com o cliente. Vale de até 12 horas
-- atrás; sem ele (ou fora disso), agora.
create or replace function public.momento_da_promocao(p_item jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_momento timestamptz;
begin
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

-- Divide o preço do combo entre as partes, pelo preço normal de cada uma (o
-- relatório soma cada parte no seu produto). Em centavos, meio centavo para
-- cima; o que sobra do arredondamento fica na parte mais cara (a primeira,
-- se empatar). Tudo zero: em partes iguais.
create or replace function public.dividir_preco(p_total numeric, p_bases numeric[])
returns numeric[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n int := cardinality(p_bases);
  v_soma numeric := 0;
  v_partes numeric[] := '{}';
  v_maior int := 1;
  v_i int;
begin
  for v_i in 1..v_n loop
    v_soma := v_soma + p_bases[v_i];
    if p_bases[v_i] > p_bases[v_maior] then
      v_maior := v_i;
    end if;
  end loop;
  for v_i in 1..v_n loop
    v_partes := v_partes || case when v_soma = 0 then round(p_total / v_n, 2) else round(p_total * p_bases[v_i] / v_soma, 2) end;
  end loop;
  v_soma := 0;
  for v_i in 1..v_n loop
    v_soma := v_soma + v_partes[v_i];
  end loop;
  v_partes[v_maior] := v_partes[v_maior] + (p_total - v_soma);
  return v_partes;
end;
$$;

-- Cria (p_combo_id vazio) ou troca um combo inteiro. p_partes:
-- [{ nome, opcoes: [{ produto_id, tamanho_id, acrescimo }] }], na ordem.
-- Pedidos já feitos não mudam: cada item guardou o nome e o preço.
create or replace function public.salvar_combo(p_combo_id uuid, p_nome text, p_preco numeric, p_partes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  v_id uuid;
  v_parte jsonb;
  v_opcao jsonb;
  v_parte_id uuid;
  v_nome_parte text;
  v_ordem int := 0;
  v_ordem_opcao int;
  v_produto public.produtos;
  v_tamanho public.produto_tamanhos;
  v_tamanho_id uuid;
  v_acrescimo numeric;
  v_vistos text[];
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if v_nome is null then
    raise exception 'Digite o nome do combo.';
  end if;
  if length(v_nome) > 80 then
    raise exception 'O nome do combo pode ter no máximo 80 letras.';
  end if;
  if p_preco is null or p_preco < 1 then
    raise exception 'O preço do combo precisa ser de pelo menos R$ 1,00.';
  end if;
  if p_preco > 99999.99 then
    raise exception 'O preço do combo pode ser de até R$ 99.999,99.';
  end if;
  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) not between 2 and 12 then
    raise exception 'O combo precisa ter de 2 a 12 partes.';
  end if;
  if exists (
    select 1 from public.combos
    where negocio_id = v_negocio_id and not arquivado and lower(trim(nome)) = lower(v_nome)
      and id is distinct from p_combo_id
  ) then
    raise exception 'Já existe um combo chamado %.', v_nome;
  end if;

  if p_combo_id is null then
    insert into public.combos (negocio_id, nome, preco) values (v_negocio_id, v_nome, p_preco)
    returning id into v_id;
  else
    select id into v_id from public.combos
    where id = p_combo_id and negocio_id = v_negocio_id and not arquivado
    for update;
    if not found then
      raise exception 'Este combo foi excluído. Atualize a tela.';
    end if;
    update public.combos set nome = v_nome, preco = p_preco, atualizado_em = now() where id = v_id;
    delete from public.combo_partes where combo_id = v_id;
  end if;

  for v_parte in select value from jsonb_array_elements(p_partes) loop
    if jsonb_typeof(v_parte) <> 'object'
       or coalesce(jsonb_typeof(v_parte -> 'nome'), 'null') not in ('string', 'null')
       or jsonb_typeof(v_parte -> 'opcoes') is distinct from 'array' then
      raise exception 'Parte do combo inválida.';
    end if;
    if jsonb_array_length(v_parte -> 'opcoes') not between 1 and 20 then
      raise exception 'Cada parte do combo precisa ter de 1 a 20 opções.';
    end if;
    v_nome_parte := nullif(regexp_replace(trim(coalesce(v_parte ->> 'nome', '')), '\s+', ' ', 'g'), '');
    if length(v_nome_parte) > 40 then
      raise exception 'O nome de cada parte pode ter no máximo 40 letras.';
    end if;
    insert into public.combo_partes (combo_id, negocio_id, ordem, nome)
    values (v_id, v_negocio_id, v_ordem, v_nome_parte)
    returning id into v_parte_id;

    v_ordem_opcao := 0;
    v_vistos := '{}';
    for v_opcao in select value from jsonb_array_elements(v_parte -> 'opcoes') loop
      if jsonb_typeof(v_opcao) <> 'object'
         or jsonb_typeof(v_opcao -> 'produto_id') is distinct from 'string'
         or coalesce(jsonb_typeof(v_opcao -> 'tamanho_id'), 'null') not in ('string', 'null')
         or coalesce(jsonb_typeof(v_opcao -> 'acrescimo'), 'null') not in ('number', 'null') then
        raise exception 'Parte do combo inválida.';
      end if;
      select * into v_produto from public.produtos
      where id::text = v_opcao ->> 'produto_id' and negocio_id = v_negocio_id and not arquivado;
      if not found then
        raise exception 'Um dos produtos do combo foi excluído. Revise o combo.';
      end if;
      v_tamanho_id := null;
      if v_opcao ->> 'tamanho_id' is not null then
        select * into v_tamanho from public.produto_tamanhos
        where id::text = v_opcao ->> 'tamanho_id' and produto_id = v_produto.id and not arquivado;
        if not found then
          raise exception 'Um dos tamanhos de % saiu do cardápio. Revise o combo.', v_produto.nome;
        end if;
        v_tamanho_id := v_tamanho.id;
      elsif exists (select 1 from public.produto_tamanhos where produto_id = v_produto.id and not arquivado) then
        raise exception 'Escolha o tamanho de % no combo.', v_produto.nome;
      end if;
      v_acrescimo := coalesce((v_opcao ->> 'acrescimo')::numeric, 0);
      if v_acrescimo < 0 or v_acrescimo > 9999.99 then
        raise exception 'O acréscimo precisa ficar entre R$ 0,00 e R$ 9.999,99.';
      end if;
      if v_acrescimo > 0 and jsonb_array_length(v_parte -> 'opcoes') = 1 then
        raise exception 'Só as opções à escolha podem ter acréscimo.';
      end if;
      if (v_produto.id::text || '|' || coalesce(v_tamanho_id::text, '')) = any (v_vistos) then
        raise exception '% aparece duas vezes na mesma parte do combo.', v_produto.nome;
      end if;
      v_vistos := v_vistos || (v_produto.id::text || '|' || coalesce(v_tamanho_id::text, ''));
      insert into public.combo_opcoes (parte_id, negocio_id, produto_id, tamanho_id, acrescimo, ordem)
      values (v_parte_id, v_negocio_id, v_produto.id, v_tamanho_id, v_acrescimo, v_ordem_opcao);
      v_ordem_opcao := v_ordem_opcao + 1;
    end loop;
    v_ordem := v_ordem + 1;
  end loop;

  return v_id;
end;
$$;

-- Cria (p_promocao_id vazio) ou troca uma promoção. p_dias: 0 = domingo ...
-- 6 = sábado. Sem horário (os dois vazios): o dia todo. p_itens:
-- [{ produto_id, tamanho_id } ou { combo_id }, com preco], cada um mais barato
-- que o preço normal de hoje.
create or replace function public.salvar_promocao(
  p_promocao_id uuid,
  p_nome text,
  p_dias int[],
  p_hora_inicio time,
  p_hora_fim time,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  v_dias smallint[];
  v_virada time;
  v_id uuid;
  v_item jsonb;
  v_produto public.produtos;
  v_tamanho public.produto_tamanhos;
  v_combo public.combos;
  v_tamanho_id uuid;
  v_normal numeric;
  v_preco numeric;
  v_rotulo text;
  v_alvo text;
  v_vistos text[] := '{}';
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if v_nome is null then
    raise exception 'Digite o nome da promoção.';
  end if;
  if length(v_nome) > 60 then
    raise exception 'O nome da promoção pode ter no máximo 60 letras.';
  end if;
  if p_dias is null or cardinality(p_dias) = 0 or exists (select 1 from unnest(p_dias) d where d is null or d not between 0 and 6) then
    raise exception 'Escolha pelo menos um dia da semana.';
  end if;
  select array_agg(distinct d order by d)::smallint[] into v_dias from unnest(p_dias) d;

  select make_time(virada_do_dia, 0, 0) into v_virada from public.negocios where id = v_negocio_id;
  if (p_hora_inicio is null) <> (p_hora_fim is null) then
    raise exception 'Diga a hora de começar e a de terminar, ou marque o dia todo.';
  end if;
  if p_hora_inicio = p_hora_fim then
    raise exception 'A hora de terminar precisa ser diferente da hora de começar.';
  end if;
  if p_hora_inicio < v_virada then
    raise exception 'A promoção precisa começar a partir das %h. Antes disso ainda é o dia anterior.', extract(hour from v_virada);
  end if;
  if p_hora_fim < p_hora_inicio and p_hora_fim > v_virada then
    raise exception 'Passando da meia-noite, a promoção pode ir até as %h.', extract(hour from v_virada);
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 50 then
    raise exception 'A promoção precisa ter de 1 a 50 itens.';
  end if;

  if p_promocao_id is null then
    insert into public.promocoes (negocio_id, nome, dias, hora_inicio, hora_fim)
    values (v_negocio_id, v_nome, v_dias, p_hora_inicio, p_hora_fim)
    returning id into v_id;
  else
    select id into v_id from public.promocoes
    where id = p_promocao_id and negocio_id = v_negocio_id
    for update;
    if not found then
      raise exception 'Esta promoção foi apagada. Atualize a tela.';
    end if;
    update public.promocoes
    set nome = v_nome, dias = v_dias, hora_inicio = p_hora_inicio, hora_fim = p_hora_fim, atualizado_em = now()
    where id = v_id;
    delete from public.promocao_itens where promocao_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'preco') is distinct from 'number'
       or coalesce(jsonb_typeof(v_item -> 'produto_id'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_item -> 'tamanho_id'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_item -> 'combo_id'), 'null') not in ('string', 'null')
       or ((v_item ->> 'produto_id') is null) = ((v_item ->> 'combo_id') is null) then
      raise exception 'Item da promoção inválido.';
    end if;
    v_preco := round((v_item ->> 'preco')::numeric, 2);
    v_tamanho_id := null;

    if v_item ->> 'combo_id' is not null then
      select * into v_combo from public.combos
      where id::text = v_item ->> 'combo_id' and negocio_id = v_negocio_id and not arquivado;
      if not found then
        raise exception 'Um dos combos da promoção foi excluído. Revise a promoção.';
      end if;
      v_normal := v_combo.preco;
      v_rotulo := v_combo.nome;
      v_alvo := 'c|' || v_combo.id::text;
      if v_preco < 1 then
        raise exception 'O preço do % na promoção precisa ser de pelo menos R$ 1,00.', v_rotulo;
      end if;
    else
      select * into v_produto from public.produtos
      where id::text = v_item ->> 'produto_id' and negocio_id = v_negocio_id and not arquivado;
      if not found then
        raise exception 'Um dos produtos da promoção foi excluído. Revise a promoção.';
      end if;
      if v_item ->> 'tamanho_id' is not null then
        select * into v_tamanho from public.produto_tamanhos
        where id::text = v_item ->> 'tamanho_id' and produto_id = v_produto.id and not arquivado;
        if not found then
          raise exception 'Um dos tamanhos de % saiu do cardápio. Revise a promoção.', v_produto.nome;
        end if;
        v_tamanho_id := v_tamanho.id;
        v_normal := v_tamanho.preco;
        v_rotulo := v_produto.nome || ' (' || v_tamanho.nome || ')';
      elsif exists (select 1 from public.produto_tamanhos where produto_id = v_produto.id and not arquivado) then
        raise exception 'Escolha o tamanho de % na promoção.', v_produto.nome;
      else
        v_normal := v_produto.preco;
        v_rotulo := v_produto.nome;
      end if;
      v_alvo := v_produto.id::text || '|' || coalesce(v_tamanho_id::text, '');
    end if;

    if v_preco <= 0 then
      raise exception 'Digite o preço de % na promoção.', v_rotulo;
    end if;
    if v_preco >= v_normal then
      raise exception 'O preço de % na promoção precisa ser menor que o normal (R$ %).',
        v_rotulo, replace(to_char(v_normal, 'FM999990.00'), '.', ',');
    end if;
    if v_alvo = any (v_vistos) then
      raise exception '% aparece duas vezes na promoção.', v_rotulo;
    end if;
    v_vistos := v_vistos || v_alvo;

    insert into public.promocao_itens (promocao_id, negocio_id, produto_id, tamanho_id, combo_id, preco)
    values (
      v_id, v_negocio_id,
      case when v_item ->> 'combo_id' is null then v_produto.id end,
      v_tamanho_id,
      case when v_item ->> 'combo_id' is not null then v_combo.id end,
      v_preco
    );
  end loop;

  return v_id;
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
        combo_id, combo_nome, combo_grupo, combo_parte, promocao_id, promocao, preco_cheio
      )
      values (
        p_pedido_id, (v_linha ->> 'produto_id')::uuid, v_quantidade, (v_linha ->> 'preco')::numeric,
        (v_linha ->> 'custo')::numeric, v_observacao, (v_linha ->> 'tamanho_id')::uuid, v_linha ->> 'tamanho',
        (v_linha ->> 'segundo_produto_id')::uuid, (v_linha ->> 'segundo_tamanho_id')::uuid, v_linha ->> 'segundo_sabor',
        v_combo.id, v_anterior ->> 'nome', v_grupo, (v_linha ->> 'parte')::smallint,
        -- A promoção pode ter sido apagada depois: fica só o nome.
        (select id from public.promocoes where id::text = v_linha ->> 'promocao_id'),
        v_linha ->> 'promocao', (v_linha ->> 'preco_cheio')::numeric
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
  v_momento timestamptz;
  v_promocao record;
  v_promocao_2 record;
  v_promocao_id uuid;
  v_promocao_nome text;
  v_preco_cheio numeric(10, 2);
  v_efetivo numeric(10, 2);
  v_efetivo_2 numeric(10, 2);
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'O pedido precisa ter de 1 a 100 itens.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
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
        v_preco_cheio := case when v_regra = 'mais_caro' then greatest(v_preco, v_preco_2) else round((v_preco + v_preco_2) / 2, 2) end;
        v_preco := case when v_regra = 'mais_caro' then greatest(v_efetivo, v_efetivo_2) else round((v_efetivo + v_efetivo_2) / 2, 2) end;
        -- Sem o custo de um dos sabores, o custo do item fica sem saber.
        v_custo := round(v_custo / 2 + v_custo_2 / 2, 2);
        if v_preco < v_preco_cheio then
          -- A promoção da primeira metade, se baixou o preço dela; senão a da segunda.
          if v_promocao.preco < v_preco then
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
      segundo_produto_id, segundo_tamanho_id, segundo_sabor, promocao_id, promocao, preco_cheio
    )
    values (
      p_pedido_id, v_produto.id, v_quantidade, v_preco, v_custo, v_observacao, v_tamanho_id, v_nome_tamanho,
      v_segundo_id, v_segundo_tamanho_id, v_segundo_sabor, v_promocao_id, v_promocao_nome, v_preco_cheio
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
  -- dos sabores, é um item novo, com o preço de hoje. O preço da promoção que
  -- já acabou continua no item que já estava.
  select coalesce(
    jsonb_object_agg(
      produto_id::text || '|' || coalesce(tamanho_id::text, '') || '|' || coalesce(segundo_produto_id::text, ''),
      jsonb_build_object(
        'preco', preco_unitario, 'custo', custo_unitario, 'tamanho', tamanho,
        'segundo_tamanho_id', segundo_tamanho_id, 'segundo_sabor', segundo_sabor,
        'promocao_id', promocao_id, 'promocao', promocao, 'preco_cheio', preco_cheio
      )
    ),
    '{}'::jsonb
  )
  into v_anteriores
  from public.itens_pedido where pedido_id = p_pedido_id and combo_id is null;

  -- Combos: a chave é o combo e o que foi escolhido em cada parte (a mesma do
  -- gravar_combo_do_pedido). O mesmo combo com as mesmas escolhas volta igual.
  select v_anteriores || coalesce(jsonb_object_agg(c.chave, c.valor), '{}'::jsonb)
  into v_anteriores
  from (
    select
      'c|' || i.combo_id::text || '|' || string_agg(
        i.produto_id::text || '|' || coalesce(i.tamanho_id::text, '') || '|' || coalesce(i.segundo_produto_id::text, ''),
        ';' order by i.combo_parte
      ) as chave,
      jsonb_build_object(
        'nome', min(i.combo_nome),
        'linhas', jsonb_agg(
          jsonb_build_object(
            'produto_id', i.produto_id, 'tamanho_id', i.tamanho_id, 'tamanho', i.tamanho,
            'segundo_produto_id', i.segundo_produto_id, 'segundo_tamanho_id', i.segundo_tamanho_id,
            'segundo_sabor', i.segundo_sabor, 'preco', i.preco_unitario, 'custo', i.custo_unitario,
            'promocao_id', i.promocao_id, 'promocao', i.promocao, 'preco_cheio', i.preco_cheio,
            'parte', i.combo_parte
          )
          order by i.combo_parte
        )
      ) as valor
    from public.itens_pedido i
    where i.pedido_id = p_pedido_id and i.combo_id is not null
    group by i.combo_grupo, i.combo_id
  ) c;
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

revoke all on function public.promocao_vale(smallint[], time, time, int, timestamptz) from public, anon, authenticated;
revoke all on function public.preco_em_promocao(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.momento_da_promocao(jsonb) from public, anon, authenticated;
revoke all on function public.dividir_preco(numeric, numeric[]) from public, anon, authenticated;
revoke all on function public.gravar_combo_do_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.gravar_itens_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.salvar_combo(uuid, text, numeric, jsonb) from public, anon;
revoke all on function public.salvar_promocao(uuid, text, int[], time, time, jsonb) from public, anon;
grant execute on function public.salvar_combo(uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.salvar_promocao(uuid, text, int[], time, time, jsonb) to authenticated;

-- Tempo real: combo ou promoção salvos num aparelho aparecem nos outros.
do $$
declare
  tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach tabela in array array['combos', 'promocoes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end;
$$;

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261115;
$$;

commit;
