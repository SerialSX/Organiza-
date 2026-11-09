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
  pagina_ativa boolean not null default true,
  -- Hora em que o dia de trabalho vira: 5h para todos (não é mais escolhida
  -- pelo dono). Um pedido à 1h da manhã ainda é do dia anterior: a fila não
  -- some e a senha não recomeça no meio do turno.
  virada_do_dia smallint not null default 5 check (virada_do_dia between 0 and 8),
  -- false: a cozinha fica do lado do balcão e o "Pronto" é marcado na tela de
  -- pedidos, sem uma tela de cozinha separada.
  usa_tela_cozinha boolean not null default true,
  -- Como o negócio atende: só balcão (paga na hora e recebe um número), só
  -- mesa (vai somando na conta e paga no final) ou os dois. Vazio: o dono
  -- ainda não respondeu as perguntas de boas-vindas.
  modo_atendimento text check (modo_atendimento in ('balcao', 'mesa', 'balcao_e_mesa'))
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
  criado_em timestamptz not null default now(),
  -- false: bebida e o que já sai pronto. Não aparece na fila da cozinha.
  vai_para_cozinha boolean not null default true,
  -- Alvo das chaves de produto_ingredientes: produto e ingrediente do mesmo negócio.
  unique (id, negocio_id)
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

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_preparo', 'pronto', 'entregue', 'cancelado')),
  -- Senha que o cliente ouve e digita na página do QR: de 1 a 999, em
  -- sequência por negócio (contador_pedidos). Recomeça a cada dia e volta
  -- para 1 depois do 999.
  numero smallint not null check (numero between 1 and 999),
  -- Mesa onde o cliente está (consumo no salão). Vazio: retirada no balcão,
  -- e o cliente é chamado pela senha.
  mesa smallint check (mesa between 1 and 999),
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
  -- Nome do cliente ("Carlos"), opcional: para chamar quando ficar pronto.
  identificacao text check (identificacao is null or length(identificacao) between 1 and 30),
  -- Para fechar o caixa. Sem forma, o pedido ainda não foi pago. 'cartao'
  -- ficou só para os pedidos antigos: hoje se anota crédito ou débito.
  forma_pagamento text check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'cartao')),
  pago_em timestamptz,
  constraint pedidos_pagamento_coerente check ((forma_pagamento is null) = (pago_em is null)),
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
  -- Vale para produto sem ingredientes cadastrados.
  faltou boolean not null default false,
  -- Com ingredientes cadastrados, a cozinha diz o que faltou ("queijo"). Guarda
  -- o nome, para o histórico não mudar se o ingrediente for renomeado depois.
  faltou_ingredientes text[] not null default '{}' check (cardinality(faltou_ingredientes) <= 30)
);

-- Última senha entregue por negócio. A linha fica travada durante o
-- criar_pedido, então dois pedidos ao mesmo tempo nunca pegam a mesma senha.
create table if not exists public.contador_pedidos (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  dia date not null,
  ultimo smallint not null check (ultimo between 1 and 999)
);

-- Ingredientes e embalagens que o negócio compra. A compra é guardada na
-- unidade base (g, ml ou un): "R$ 45,00 por 1 kg" fica 45,00 por 1000 g.
-- Sem preço, o ingrediente serve só para a cozinha avisar o que faltou.
create table if not exists public.ingredientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  unidade text not null check (unidade in ('g', 'ml', 'un')),
  preco_compra numeric(10, 2) check (preco_compra between 0 and 99999.99),
  quantidade_compra numeric(12, 3) check (quantidade_compra between 1 and 1000000),
  -- "Excluir" arquiva: some da lista e sai dos produtos.
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  check ((preco_compra is null) = (quantidade_compra is null)),
  unique (id, negocio_id)
);

-- O que vai em cada produto e quanto ("X-Burguer: 120 g de carne, 1 pão").
-- As chaves compostas garantem que produto e ingrediente são do mesmo negócio.
create table if not exists public.produto_ingredientes (
  produto_id uuid not null,
  ingrediente_id uuid not null,
  negocio_id uuid not null,
  quantidade numeric(12, 3) not null check (quantidade > 0 and quantidade <= 100000),
  primary key (produto_id, ingrediente_id),
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade,
  foreign key (ingrediente_id, negocio_id) references public.ingredientes (id, negocio_id) on delete cascade
);

-- Tamanhos de um produto. O produto continua com preco/custo (iguais aos do
-- primeiro tamanho), para o que só olha o produto.
create table if not exists public.produto_tamanhos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null,
  negocio_id uuid not null,
  nome text not null check (length(trim(nome)) between 1 and 20),
  preco numeric(10, 2) not null check (preco > 0),
  custo numeric(10, 2) check (custo >= 0),
  disponivel boolean not null default true,
  arquivado boolean not null default false,
  ordem smallint not null default 0 check (ordem between 0 and 99),
  criado_em timestamptz not null default now(),
  unique (id, negocio_id),
  foreign key (produto_id, negocio_id) references public.produtos (id, negocio_id) on delete cascade
);
create index if not exists produto_tamanhos_produto_idx on public.produto_tamanhos (produto_id);
create index if not exists produto_tamanhos_negocio_idx on public.produto_tamanhos (negocio_id);
-- Dois tamanhos com o mesmo nome no mesmo produto confundiriam o atendente.
create unique index if not exists produto_tamanhos_nome_unico_idx
  on public.produto_tamanhos (produto_id, lower(trim(nome))) where not arquivado;

create table if not exists public.tamanho_ingredientes (
  tamanho_id uuid not null,
  ingrediente_id uuid not null,
  negocio_id uuid not null,
  quantidade numeric(12, 3) not null check (quantidade > 0 and quantidade <= 100000),
  primary key (tamanho_id, ingrediente_id),
  foreign key (tamanho_id, negocio_id) references public.produto_tamanhos (id, negocio_id) on delete cascade,
  foreign key (ingrediente_id, negocio_id) references public.ingredientes (id, negocio_id) on delete cascade
);
create index if not exists tamanho_ingredientes_ingrediente_idx on public.tamanho_ingredientes (ingrediente_id);
create index if not exists tamanho_ingredientes_negocio_idx on public.tamanho_ingredientes (negocio_id);

-- O tamanho do item: id (para editar) e o nome copiado (o histórico não muda
-- se o tamanho for renomeado ou removido depois).
alter table public.itens_pedido
  add column if not exists tamanho_id uuid references public.produto_tamanhos (id) on delete cascade,
  add column if not exists tamanho text check (tamanho is null or length(tamanho) between 1 and 20);
create index if not exists itens_pedido_tamanho_idx on public.itens_pedido (tamanho_id);

-- Meio a meio (2026-11-14).
-- Vazio: o dono ainda não escolheu (a tela pergunta ao marcar o primeiro
-- produto como meio a meio).
alter table public.negocios
  add column if not exists regra_meio_a_meio text check (regra_meio_a_meio in ('mais_caro', 'media'));

alter table public.produtos
  add column if not exists meio_a_meio boolean not null default false;

-- O segundo sabor do item. Sem chave estrangeira de propósito: uma segunda
-- ligação de itens_pedido com produtos deixaria ambíguas as consultas que já
-- leem "produtos ( nome )" pelo item. Quem garante que o sabor existe e é do
-- mesmo negócio é gravar_itens_pedido. O nome é copiado: o histórico não muda
-- se o sabor for renomeado ou arquivado depois.
alter table public.itens_pedido
  add column if not exists segundo_produto_id uuid,
  add column if not exists segundo_tamanho_id uuid,
  add column if not exists segundo_sabor text check (segundo_sabor is null or length(segundo_sabor) between 1 and 120);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'itens_pedido_segundo_sabor_completo'
  ) then
    alter table public.itens_pedido
      add constraint itens_pedido_segundo_sabor_completo
      check ((segundo_produto_id is null) = (segundo_sabor is null));
  end if;
end;
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

create index if not exists usuarios_negocio_idx on public.usuarios (negocio_id);
create index if not exists produtos_negocio_idx on public.produtos (negocio_id);
create index if not exists pedidos_negocio_criado_em_idx on public.pedidos (negocio_id, criado_em);
-- Busca pela senha na página do QR. Não é único: passando de 999 pedidos no
-- dia, a senha se repete e vale o pedido mais recente.
create index if not exists pedidos_negocio_dia_numero_idx on public.pedidos (negocio_id, dia, numero);
create index if not exists pedidos_abertos_idx on public.pedidos (negocio_id, dia)
  where status in ('pendente', 'em_preparo', 'pronto');
create index if not exists itens_pedido_pedido_idx on public.itens_pedido (pedido_id);
create index if not exists itens_pedido_produto_idx on public.itens_pedido (produto_id);
create index if not exists ingredientes_negocio_idx on public.ingredientes (negocio_id);
-- Dois ingredientes ativos com o mesmo nome confundiriam a cozinha.
create unique index if not exists ingredientes_nome_unico_idx
  on public.ingredientes (negocio_id, lower(trim(nome))) where not arquivado;
create index if not exists produto_ingredientes_ingrediente_idx on public.produto_ingredientes (ingrediente_id);
create index if not exists produto_ingredientes_negocio_idx on public.produto_ingredientes (negocio_id);
create index if not exists eventos_negocio_criado_em_idx on public.eventos (negocio_id, criado_em);
create index if not exists eventos_produto_idx on public.eventos (produto_id);
create index if not exists eventos_pedido_idx on public.eventos (pedido_id);

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
alter table public.ingredientes enable row level security;
alter table public.produto_ingredientes enable row level security;
alter table public.eventos enable row level security;
-- Só as funções do banco mexem no contador de senhas: RLS ligado e nenhuma policy.
alter table public.contador_pedidos enable row level security;
revoke all on public.contador_pedidos from anon, authenticated;

-- Não depende dos grants padrão do Supabase. Pedidos e itens só são gravados
-- pelas funções criar_pedido e atualizar_status_pedido.
revoke all on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  from anon, authenticated;
grant select on public.negocios, public.usuarios, public.produtos, public.pedidos, public.itens_pedido
  to authenticated;
grant insert, update on public.produtos to authenticated;
-- Só o nome: liberar negocio_id ou papel deixaria o usuário entrar em outro negócio.
grant update (nome) on public.usuarios to authenticated;
-- Ingredientes: cadastro direto, como produtos, mas sem trocar de negócio.
-- A lista de cada produto só muda por salvar_ingredientes_do_produto.
revoke all on public.ingredientes, public.produto_ingredientes from anon, authenticated;
grant select on public.ingredientes, public.produto_ingredientes to authenticated;
grant insert (negocio_id, nome, unidade, preco_compra, quantidade_compra) on public.ingredientes to authenticated;
grant update (nome, unidade, preco_compra, quantidade_compra, arquivado) on public.ingredientes to authenticated;

drop policy if exists "ingredientes isolados por negocio_id" on public.ingredientes;
create policy "ingredientes isolados por negocio_id"
  on public.ingredientes for all to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "produto_ingredientes isolados por negocio_id" on public.produto_ingredientes;
create policy "produto_ingredientes isolados por negocio_id"
  on public.produto_ingredientes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Acesso: o dono lê e liga/desliga o esgotado; o resto só pelas funções.
alter table public.produto_tamanhos enable row level security;
alter table public.tamanho_ingredientes enable row level security;
revoke all on public.produto_tamanhos, public.tamanho_ingredientes from anon, authenticated;
grant select on public.produto_tamanhos, public.tamanho_ingredientes to authenticated;
grant update (disponivel) on public.produto_tamanhos to authenticated;

drop policy if exists "produto_tamanhos isolados por negocio_id" on public.produto_tamanhos;
create policy "produto_tamanhos isolados por negocio_id"
  on public.produto_tamanhos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "produto_tamanhos esgotado pelo negocio" on public.produto_tamanhos;
create policy "produto_tamanhos esgotado pelo negocio"
  on public.produto_tamanhos for update to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()))
  with check (negocio_id = (select public.negocio_do_usuario_atual()));

drop policy if exists "tamanho_ingredientes isolados por negocio_id" on public.tamanho_ingredientes;
create policy "tamanho_ingredientes isolados por negocio_id"
  on public.tamanho_ingredientes for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

-- Eventos: o negócio lê os seus; só as funções do banco escrevem.
revoke all on public.eventos from anon, authenticated;
grant select on public.eventos to authenticated;

drop policy if exists "eventos isolados por negocio_id" on public.eventos;
create policy "eventos isolados por negocio_id"
  on public.eventos for select to authenticated
  using (negocio_id = (select public.negocio_do_usuario_atual()));

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

-- Grava os itens com preço e custo do cadastro (do tamanho, quando tem). Na
-- edição, p_anteriores traz { "produto_id|tamanho_id|segundo_produto_id":
-- { preco, custo, tamanho, segundo_tamanho_id, segundo_sabor } } do que já
-- estava no pedido: esses itens mantêm o preço combinado e continuam aceitos
-- mesmo que tenham esgotado ou saído do cardápio depois.
-- Meio a meio: o item traz "segundo_produto_id". O tamanho do segundo sabor é
-- o de mesmo nome (G com G); o preço segue a regra do negócio e o custo é a
-- metade do custo de cada sabor.
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

revoke all on function public.negocio_do_usuario_atual() from public, anon;
revoke all on function public.criar_negocio_do_novo_usuario() from public, anon, authenticated;
revoke all on function public.gravar_itens_pedido(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.limpar_identificacao(text) from public, anon, authenticated;
revoke all on function public.criar_pedido(jsonb, uuid, int, text, text, text) from public, anon;
revoke all on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) from public, anon;
revoke all on function public.cancelar_pedido(uuid, text, text) from public, anon;
revoke all on function public.atualizar_status_pedido(uuid, text) from public, anon;
revoke all on function public.marcar_item_faltou(uuid, boolean) from public, anon;
grant execute on function public.negocio_do_usuario_atual() to authenticated;
grant execute on function public.criar_pedido(jsonb, uuid, int, text, text, text) to authenticated;
grant execute on function public.editar_pedido(uuid, jsonb, timestamptz, int, text) to authenticated;
grant execute on function public.cancelar_pedido(uuid, text, text) to authenticated;
grant execute on function public.atualizar_status_pedido(uuid, text) to authenticated;
grant execute on function public.marcar_item_faltou(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ingredientes e custo estimado
-- ---------------------------------------------------------------------------
-- Produto com pelo menos um ingrediente com preço tem o custo calculado: soma
-- de (quantidade usada × preço da compra ÷ quantidade da compra). Sem isso, o
-- custo continua o que o dono digitou. O custo fica gravado em produtos.custo,
-- então pedidos e relatórios não mudam nada.

-- Produto com tamanhos: preco e custo do produto acompanham o primeiro tamanho.
create or replace function public.sincronizar_produto_com_tamanhos(p_produto_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.produtos p
  set preco = t.preco, custo = t.custo
  from (
    select preco, custo from public.produto_tamanhos
    where produto_id = p_produto_id and not arquivado
    order by ordem, criado_em
    limit 1
  ) t
  where p.id = p_produto_id;
$$;

create or replace function public.recalcular_custo_do_produto(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.produtos p
  set custo = least(s.total, 99999999.99)
  from (
    select round(sum(pi.quantidade * i.preco_compra / i.quantidade_compra), 2) as total
    from public.produto_ingredientes pi
    join public.ingredientes i on i.id = pi.ingrediente_id
    where pi.produto_id = p_produto_id and i.preco_compra is not null
  ) s
  where p.id = p_produto_id and s.total is not null;

  -- Cada tamanho pela sua própria quantidade de ingredientes.
  update public.produto_tamanhos t
  set custo = least(s.total, 99999.99)
  from (
    select ti.tamanho_id, round(sum(ti.quantidade * i.preco_compra / i.quantidade_compra), 2) as total
    from public.tamanho_ingredientes ti
    join public.produto_tamanhos tt on tt.id = ti.tamanho_id
    join public.ingredientes i on i.id = ti.ingrediente_id
    where tt.produto_id = p_produto_id and i.preco_compra is not null
    group by ti.tamanho_id
  ) s
  where t.id = s.tamanho_id;

  perform public.sincronizar_produto_com_tamanhos(p_produto_id);
end;
$$;

-- Troca de uma vez os tamanhos do produto, na ordem da lista.
-- p_tamanhos: [{ "id": "..." (os que já existem), "nome": "G", "preco": 52,
-- "custo": null, "disponivel": true }]. Quem não está na lista é arquivado.
-- Lista vazia: o produto volta a ter um preço só. Devolve os tamanhos com id.
create or replace function public.salvar_tamanhos_do_produto(p_produto_id uuid, p_tamanhos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_ordem int := 0;
  v_nome text;
  v_preco numeric;
  v_custo numeric;
  v_id uuid;
  v_ids text[];
begin
  perform 1 from public.produtos
  where id = p_produto_id and negocio_id = v_negocio_id
  for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if p_tamanhos is null or jsonb_typeof(p_tamanhos) <> 'array' or jsonb_array_length(p_tamanhos) > 8 then
    raise exception 'Um produto pode ter até 8 tamanhos.';
  end if;
  if jsonb_array_length(p_tamanhos) = 1 then
    raise exception 'Com um tamanho só, use o preço do produto. Tamanhos são 2 ou mais.';
  end if;

  select coalesce(array_agg(value ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(p_tamanhos)
  where jsonb_typeof(value -> 'id') = 'string';

  -- Os que saíram da lista vão para o arquivo (pedidos antigos continuam com o
  -- nome) e deixam de contar no custo.
  update public.produto_tamanhos set arquivado = true
  where produto_id = p_produto_id and not arquivado and not (id::text = any (v_ids));
  delete from public.tamanho_ingredientes ti
  using public.produto_tamanhos t
  where t.id = ti.tamanho_id and t.produto_id = p_produto_id and t.arquivado;
  -- Nome provisório: trocar "P" com "G" de lugar não esbarra no nome único.
  update public.produto_tamanhos set nome = left('~' || id::text, 20)
  where produto_id = p_produto_id and not arquivado;

  for v_item in select value from jsonb_array_elements(p_tamanhos) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'nome') is distinct from 'string'
       or jsonb_typeof(v_item -> 'preco') is distinct from 'number'
       or coalesce(jsonb_typeof(v_item -> 'custo'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(v_item -> 'disponivel'), 'null') not in ('boolean', 'null')
       or coalesce(jsonb_typeof(v_item -> 'id'), 'null') not in ('string', 'null') then
      raise exception 'Tamanho inválido.';
    end if;
    v_nome := trim(regexp_replace(v_item ->> 'nome', '\s+', ' ', 'g'));
    if length(v_nome) not between 1 and 20 then
      raise exception 'O nome de cada tamanho precisa ter de 1 a 20 letras.';
    end if;
    v_preco := round((v_item ->> 'preco')::numeric, 2);
    if v_preco <= 0 or v_preco > 99999.99 then
      raise exception 'Digite o preço de cada tamanho.';
    end if;
    v_custo := round((v_item ->> 'custo')::numeric, 2);
    if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
      raise exception 'O custo de cada tamanho precisa ficar entre 0 e 99.999,99.';
    end if;
    if exists (
      select 1 from public.produto_tamanhos
      where produto_id = p_produto_id and not arquivado and lower(nome) = lower(v_nome)
    ) then
      raise exception 'Dois tamanhos com o nome "%". Use nomes diferentes.', v_nome;
    end if;

    if v_item ->> 'id' is not null then
      update public.produto_tamanhos
      set nome = v_nome, preco = v_preco, custo = v_custo, ordem = v_ordem,
          disponivel = coalesce((v_item ->> 'disponivel')::boolean, disponivel)
      where id::text = v_item ->> 'id' and produto_id = p_produto_id and not arquivado
      returning id into v_id;
      if not found then
        raise exception 'Um dos tamanhos foi removido em outro aparelho. Abra o produto de novo.';
      end if;
    else
      insert into public.produto_tamanhos (produto_id, negocio_id, nome, preco, custo, disponivel, ordem)
      values (p_produto_id, v_negocio_id, v_nome, v_preco, v_custo,
              coalesce((v_item ->> 'disponivel')::boolean, true), v_ordem);
    end if;
    v_ordem := v_ordem + 1;
  end loop;

  perform public.recalcular_custo_do_produto(p_produto_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by ordem)
    from public.produto_tamanhos
    where produto_id = p_produto_id and not arquivado
  ), '[]'::jsonb);
end;
$$;

-- Cardápio pronto e planilha: cria os produtos (com tamanhos ou não, e com
-- "meio_a_meio") de uma vez, tudo ou nada.
create or replace function public.criar_produtos_com_tamanhos(p_produtos jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_tamanho jsonb;
  v_nome text;
  v_produto_id uuid;
  v_ordem int;
  v_criados int := 0;
  v_nome_tamanho text;
  v_preco numeric;
  v_custo numeric;
  v_vistos text[] := '{}';
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  if p_produtos is null or jsonb_typeof(p_produtos) <> 'array' or jsonb_array_length(p_produtos) not between 1 and 300 then
    raise exception 'Envie de 1 a 300 produtos de uma vez.';
  end if;

  for v_item in select value from jsonb_array_elements(p_produtos) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'nome') is distinct from 'string'
       or coalesce(jsonb_typeof(v_item -> 'vai_para_cozinha'), 'null') not in ('boolean', 'null')
       or coalesce(jsonb_typeof(v_item -> 'meio_a_meio'), 'null') not in ('boolean', 'null')
       or coalesce(jsonb_typeof(v_item -> 'tamanhos'), 'null') not in ('array', 'null')
       or coalesce(jsonb_typeof(v_item -> 'preco'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(v_item -> 'custo'), 'null') not in ('number', 'null') then
      raise exception 'Produto inválido.';
    end if;
    v_nome := trim(regexp_replace(v_item ->> 'nome', '\s+', ' ', 'g'));
    if length(v_nome) not between 1 and 120 then
      raise exception 'O nome de cada produto precisa ter de 1 a 120 letras.';
    end if;
    -- Já está no cardápio (ou repetido nesta lista): pula.
    if lower(v_nome) = any (v_vistos) or exists (
      select 1 from public.produtos
      where negocio_id = v_negocio_id and not arquivado and lower(trim(nome)) = lower(v_nome)
    ) then
      continue;
    end if;
    v_vistos := v_vistos || lower(v_nome);

    if v_item -> 'tamanhos' is not null and jsonb_array_length(v_item -> 'tamanhos') > 0 then
      if jsonb_array_length(v_item -> 'tamanhos') not between 2 and 8 then
        raise exception '% precisa ter de 2 a 8 tamanhos.', v_nome;
      end if;
      v_preco := null;
      v_custo := null;
    else
      v_preco := round((v_item ->> 'preco')::numeric, 2);
      v_custo := round((v_item ->> 'custo')::numeric, 2);
      if v_preco is null or v_preco <= 0 or v_preco > 99999.99 then
        raise exception 'Digite o preço de %.', v_nome;
      end if;
      if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
        raise exception 'O custo de % precisa ficar entre 0 e 99.999,99.', v_nome;
      end if;
    end if;

    insert into public.produtos (negocio_id, nome, preco, custo, vai_para_cozinha, meio_a_meio)
    values (
      v_negocio_id, v_nome, coalesce(v_preco, 0), v_custo,
      coalesce((v_item ->> 'vai_para_cozinha')::boolean, true),
      coalesce((v_item ->> 'meio_a_meio')::boolean, false)
    )
    returning id into v_produto_id;

    v_ordem := 0;
    for v_tamanho in select value from jsonb_array_elements(coalesce(v_item -> 'tamanhos', '[]'::jsonb)) loop
      if jsonb_typeof(v_tamanho) <> 'object'
         or jsonb_typeof(v_tamanho -> 'nome') is distinct from 'string'
         or jsonb_typeof(v_tamanho -> 'preco') is distinct from 'number'
         or coalesce(jsonb_typeof(v_tamanho -> 'custo'), 'null') not in ('number', 'null') then
        raise exception 'Tamanho inválido em %.', v_nome;
      end if;
      v_nome_tamanho := trim(regexp_replace(v_tamanho ->> 'nome', '\s+', ' ', 'g'));
      if length(v_nome_tamanho) not between 1 and 20 then
        raise exception 'O nome de cada tamanho precisa ter de 1 a 20 letras.';
      end if;
      v_preco := round((v_tamanho ->> 'preco')::numeric, 2);
      v_custo := round((v_tamanho ->> 'custo')::numeric, 2);
      if v_preco <= 0 or v_preco > 99999.99 then
        raise exception 'Digite o preço de cada tamanho de %.', v_nome;
      end if;
      if v_custo is not null and (v_custo < 0 or v_custo > 99999.99) then
        raise exception 'O custo de cada tamanho precisa ficar entre 0 e 99.999,99.';
      end if;
      if exists (
        select 1 from public.produto_tamanhos
        where produto_id = v_produto_id and not arquivado and lower(nome) = lower(v_nome_tamanho)
      ) then
        raise exception '% tem dois tamanhos com o nome "%".', v_nome, v_nome_tamanho;
      end if;
      insert into public.produto_tamanhos (produto_id, negocio_id, nome, preco, custo, ordem)
      values (v_produto_id, v_negocio_id, v_nome_tamanho, v_preco, v_custo, v_ordem);
      v_ordem := v_ordem + 1;
    end loop;

    perform public.sincronizar_produto_com_tamanhos(v_produto_id);
    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;

-- Troca de uma vez a lista de ingredientes do produto.
-- Sem tamanhos: [{ "ingrediente_id": "...", "quantidade": 120 }].
-- Com tamanhos: [{ "ingrediente_id": "...", "por_tamanho": { "<tamanho_id>": 120, ... } }];
-- o ingrediente pode faltar em algum tamanho (borda só na G), mas não em todos.
create or replace function public.salvar_ingredientes_do_produto(p_produto_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_item jsonb;
  v_ingrediente_id uuid;
  v_quantidade numeric;
  v_com_tamanhos boolean;
  v_tamanho record;
  v_maior numeric;
begin
  perform 1 from public.produtos
  where id = p_produto_id and negocio_id = v_negocio_id
  for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 30 then
    raise exception 'Um produto pode ter até 30 ingredientes.';
  end if;
  v_com_tamanhos := exists (select 1 from public.produto_tamanhos where produto_id = p_produto_id and not arquivado);

  delete from public.produto_ingredientes where produto_id = p_produto_id;
  delete from public.tamanho_ingredientes ti
  using public.produto_tamanhos t
  where t.id = ti.tamanho_id and t.produto_id = p_produto_id;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'ingrediente_id') is distinct from 'string' then
      raise exception 'Ingrediente inválido.';
    end if;
    select id into v_ingrediente_id from public.ingredientes
    where id::text = v_item ->> 'ingrediente_id' and negocio_id = v_negocio_id and not arquivado;
    if not found then
      raise exception 'Um dos ingredientes foi excluído. Revise a lista.';
    end if;

    if v_com_tamanhos then
      if jsonb_typeof(v_item -> 'por_tamanho') is distinct from 'object' then
        raise exception 'Este produto tem tamanhos. Atualize a página e diga quanto vai em cada tamanho.';
      end if;
      v_maior := null;
      for v_tamanho in
        select t.id, (v_item -> 'por_tamanho' ->> t.id::text) as valor
        from public.produto_tamanhos t
        where t.produto_id = p_produto_id and not t.arquivado
      loop
        if v_tamanho.valor is null then
          continue;
        end if;
        v_quantidade := round(v_tamanho.valor::numeric, 3);
        if v_quantidade <= 0 or v_quantidade > 100000 then
          raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
        end if;
        insert into public.tamanho_ingredientes (tamanho_id, ingrediente_id, negocio_id, quantidade)
        values (v_tamanho.id, v_ingrediente_id, v_negocio_id, v_quantidade)
        on conflict (tamanho_id, ingrediente_id) do update set quantidade = excluded.quantidade;
        v_maior := greatest(coalesce(v_maior, 0), v_quantidade);
      end loop;
      if v_maior is null then
        raise exception 'Diga quanto vai de cada ingrediente em pelo menos um tamanho.';
      end if;
      v_quantidade := v_maior;
    else
      if jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
        raise exception 'Ingrediente inválido.';
      end if;
      v_quantidade := round((v_item ->> 'quantidade')::numeric, 3);
      if v_quantidade <= 0 or v_quantidade > 100000 then
        raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
      end if;
    end if;

    -- A lista do produto (o que ele leva): vale para o "faltou" da cozinha.
    insert into public.produto_ingredientes (produto_id, ingrediente_id, negocio_id, quantidade)
    values (p_produto_id, v_ingrediente_id, v_negocio_id, v_quantidade)
    on conflict (produto_id, ingrediente_id) do update set quantidade = excluded.quantidade;
  end loop;

  perform public.recalcular_custo_do_produto(p_produto_id);
end;
$$;

-- Mudou o preço de um ingrediente: o custo de todos os produtos que usam ele
-- muda junto. Excluir (arquivar) tira o ingrediente dos produtos e dos tamanhos.
create or replace function public.ao_mudar_ingrediente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produtos uuid[];
  v_produto uuid;
begin
  select coalesce(array_agg(produto_id), '{}') into v_produtos
  from public.produto_ingredientes where ingrediente_id = new.id;

  if new.unidade is distinct from old.unidade and cardinality(v_produtos) > 0 then
    raise exception 'Este ingrediente está em produtos. Para trocar a unidade, exclua e cadastre de novo.';
  end if;

  if new.arquivado and not old.arquivado then
    delete from public.produto_ingredientes where ingrediente_id = new.id;
    delete from public.tamanho_ingredientes where ingrediente_id = new.id;
  end if;

  foreach v_produto in array v_produtos loop
    perform public.recalcular_custo_do_produto(v_produto);
  end loop;
  return new;
end;
$$;

drop trigger if exists ao_mudar_ingrediente on public.ingredientes;
create trigger ao_mudar_ingrediente
  after update on public.ingredientes
  for each row
  when ((old.preco_compra, old.quantidade_compra, old.unidade, old.arquivado)
        is distinct from (new.preco_compra, new.quantidade_compra, new.unidade, new.arquivado))
  execute function public.ao_mudar_ingrediente();

-- A cozinha avisa que faltou um ingrediente de um item ("faltou queijo"). Só
-- aceita ingrediente que está no produto (ou no segundo sabor, no meio a
-- meio). Mexe em atualizado_em do pedido para o tempo real avisar a tela do
-- atendente.
create or replace function public.marcar_ingrediente_faltou(p_item_id uuid, p_ingrediente_id uuid, p_faltou boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_produto_id uuid;
  v_segundo_id uuid;
  v_nome text;
begin
  select p.id, i.produto_id, i.segundo_produto_id into v_pedido_id, v_produto_id, v_segundo_id
  from public.itens_pedido i
  join public.pedidos p on p.id = i.pedido_id
  where i.id = p_item_id
    and p.negocio_id = public.negocio_do_usuario_atual()
    and p.status in ('pendente', 'em_preparo')
  for update of p;
  if not found then
    raise exception 'Este pedido não está mais na fila.';
  end if;

  -- O evento fica com o sabor que tem o ingrediente (o primeiro, se os dois têm).
  select g.nome, pi.produto_id into v_nome, v_produto_id
  from public.produto_ingredientes pi
  join public.ingredientes g on g.id = pi.ingrediente_id
  where pi.ingrediente_id = p_ingrediente_id
    and (pi.produto_id = v_produto_id or pi.produto_id = v_segundo_id)
  order by pi.produto_id = v_produto_id desc
  limit 1;
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

revoke all on function public.recalcular_custo_do_produto(uuid) from public, anon, authenticated;
revoke all on function public.sincronizar_produto_com_tamanhos(uuid) from public, anon, authenticated;
revoke all on function public.salvar_tamanhos_do_produto(uuid, jsonb) from public, anon;
grant execute on function public.salvar_tamanhos_do_produto(uuid, jsonb) to authenticated;
revoke all on function public.criar_produtos_com_tamanhos(jsonb) from public, anon;
grant execute on function public.criar_produtos_com_tamanhos(jsonb) to authenticated;
revoke all on function public.ao_mudar_ingrediente() from public, anon, authenticated;
revoke all on function public.salvar_ingredientes_do_produto(uuid, jsonb) from public, anon;
revoke all on function public.marcar_ingrediente_faltou(uuid, uuid, boolean) from public, anon;
grant execute on function public.salvar_ingredientes_do_produto(uuid, jsonb) to authenticated;
grant execute on function public.marcar_ingrediente_faltou(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Esgotados, pagamento e jeito de trabalhar do negócio
-- ---------------------------------------------------------------------------

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

revoke all on function public.ao_mudar_disponivel() from public, anon, authenticated;
revoke all on function public.registrar_toque_esgotado(uuid) from public, anon;
revoke all on function public.registrar_pagamento(uuid[], text) from public, anon;
grant execute on function public.registrar_toque_esgotado(uuid) to authenticated;
grant execute on function public.registrar_pagamento(uuid[], text) to authenticated;
revoke all on function public.configurar_atendimento(text, boolean) from public, anon;
grant execute on function public.configurar_atendimento(text, boolean) to authenticated;

-- Só o dono: como cobra o meio a meio. Vale só para os pedidos novos.
create or replace function public.configurar_meio_a_meio(p_regra text)
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
    raise exception 'Só o dono do negócio pode mudar como cobra o meio a meio.';
  end if;
  if p_regra is null or p_regra not in ('mais_caro', 'media') then
    raise exception 'Escolha como cobrar o meio a meio.';
  end if;
  update public.negocios set regra_meio_a_meio = p_regra where id = v_negocio_id;
end;
$$;

revoke all on function public.configurar_meio_a_meio(text) from public, anon;
grant execute on function public.configurar_meio_a_meio(text) to authenticated;

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
-- Excluir conta (LGPD)
-- ---------------------------------------------------------------------------
-- Apagar só o usuário no Auth deixaria negócio, produtos e pedidos sem dono.
-- O dono (admin) apaga o negócio inteiro e as contas ligadas a ele; os
-- cascades levam usuarios, produtos, pedidos e itens. Um funcionário apaga
-- só a própria conta.
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

-- ---------------------------------------------------------------------------
-- Minha conta
-- ---------------------------------------------------------------------------

-- Nome da pessoa e, para o dono, nome do negócio. Uma função só para a tela
-- "Minha conta" salvar tudo de uma vez.
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

-- ---------------------------------------------------------------------------
-- Importar o cardápio por foto (IA)
-- ---------------------------------------------------------------------------
-- A Edge Function ler-cardapio registra cada leitura aqui antes de chamar o
-- Gemini. Guarda só o negócio e a hora, nunca a foto.
create table if not exists public.leituras_cardapio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists leituras_cardapio_negocio_idx on public.leituras_cardapio (negocio_id, criado_em);
-- Só a função abaixo lê e escreve: RLS ligado e nenhuma policy.
alter table public.leituras_cardapio enable row level security;
revoke all on public.leituras_cardapio from anon, authenticated;

-- A cota grátis do Gemini é uma só para todos os negócios: cada um lê até 20
-- fotos por dia. A Edge Function chama isto antes da IA, então tentativa que
-- falha também conta.
create or replace function public.registrar_leitura_cardapio()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  -- Chamadas simultâneas do mesmo negócio esperam uma pela outra: sem isso,
  -- várias de uma vez passariam juntas pelo limite.
  perform pg_advisory_xact_lock(hashtext(v_negocio_id::text));

  if (select count(*) from public.leituras_cardapio
      where negocio_id = v_negocio_id
        and criado_em >= public.hoje_no_negocio()::timestamp at time zone 'America/Fortaleza') >= 20 then
    raise exception 'Você já usou as 20 leituras de cardápio de hoje. Amanhã dá para importar de novo.';
  end if;

  insert into public.leituras_cardapio (negocio_id) values (v_negocio_id);
  -- Só os últimos 90 dias: o bastante para o relatório (LGPD).
  delete from public.leituras_cardapio where criado_em < now() - interval '90 days';
end;
$$;

revoke all on function public.registrar_leitura_cardapio() from public, anon;
grant execute on function public.registrar_leitura_cardapio() to authenticated;

-- ---------------------------------------------------------------------------
-- Versão do banco
-- ---------------------------------------------------------------------------
-- O site confere este número ao abrir. Se o banco no ar estiver atrás do
-- código (migração esquecida), a equipe vê um aviso em vez de o sistema
-- funcionar pela metade sem ninguém perceber. Toda migração nova sobe este
-- número junto com VERSAO_DO_BANCO em src/lib/versaoDoBanco.js.
-- ---------------------------------------------------------------------------
-- Combos e promoções (2026-11-15)
-- ---------------------------------------------------------------------------

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

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261116;
$$;

revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------
-- Publica as tabelas que a Cozinha e os Pedidos escutam. O Realtime respeita
-- o RLS, então cada negócio só recebe os próprios eventos.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['produtos', 'produto_tamanhos', 'pedidos', 'itens_pedido', 'combos', 'promocoes'] loop
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
