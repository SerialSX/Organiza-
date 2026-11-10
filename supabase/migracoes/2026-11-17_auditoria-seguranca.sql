-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-11-15_combos-e-promocoes.sql (sobe a versão do banco para
-- 20261117). Quem cria um projeto novo roda só o supabase/schema.sql.
--
-- Correções da auditoria de segurança de 09/11/2026 (skill security-audit):
-- 1. Página pública: 10 erros de um aparelho não bloqueiam mais todos os
--    clientes do mesmo IP; chave por /64 no IPv6; limpeza com índice.
-- 2. Leitura de cardápio por IA: cota não zera ao excluir e recriar a conta;
--    teto diário do sistema.
-- 3. excluir_minha_conta: contagem de senhas erradas sem corrida.
-- 4. produtos: grants só nas colunas que a tela grava; preço NaN recusado.
-- 5. limpar_nome_mesa sem execute para authenticated.
--
-- ATENÇÃO: se a migração 2026-11-16 (PR da etapa 10) ainda não rodou, rode-a
-- ANTES desta: as duas mexem na versão do banco.
begin;

-- 1. Página pública (QR code): limite de consultas -------------------------------
-- Antes, 10 erros de QUALQUER aparelho do mesmo IP (Wi-Fi da loja, internet
-- móvel com IP compartilhado) bloqueavam o acompanhamento de todos os clientes
-- desse IP por 10 minutos. Agora os erros contam por IP + endereço consultado:
-- quem digita endereços inventados não atrapalha quem acompanha a senha certa.
-- O teto por minuto subiu de 60 para 300 (cada celular consulta 6 vezes por
-- minuto; 60 travava a partir de 10 clientes na mesma rede).
create index if not exists limite_consultas_minuto_idx on public.limite_consultas (minuto);

-- IPv6: cada aparelho recebe um /64 inteiro, então a chave usa o /64 (antes,
-- trocar o fim do endereço criava outra chave). O x-forwarded-for é escrito
-- pelo cliente: só vale o último endereço, que é o que o proxy acrescentou.
create or replace function public.chave_do_aparelho()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text;
  v_endereco inet;
begin
  v_ip := coalesce(
    nullif(trim(v_h ->> 'cf-connecting-ip'), ''),
    nullif(trim(v_h ->> 'x-real-ip'), ''),
    nullif(trim(regexp_replace(coalesce(v_h ->> 'x-forwarded-for', ''), '^.*,', '')), '')
  );
  if v_ip is null then
    return md5('sem-ip');
  end if;
  begin
    v_endereco := v_ip::inet;
    if family(v_endereco) = 6 then
      v_endereco := network(set_masklen(v_endereco, 64));
    end if;
    return md5(host(v_endereco));
  exception when others then
    return md5(v_ip);
  end;
end;
$$;

create or replace function public.conferir_limite_consultas(p_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := public.chave_do_aparelho();
  v_chave_erros text := md5(v_chave || '|' || coalesce(p_codigo, ''));
  v_neste_minuto int;
  v_erros int;
begin
  -- Consultas simultâneas do mesmo aparelho esperam uma pela outra: sem isso,
  -- várias passavam juntas pela conferência antes de qualquer uma ser contada.
  perform pg_advisory_xact_lock(hashtext(v_chave));

  select coalesce(sum(consultas), 0) into v_neste_minuto
  from public.limite_consultas
  where chave = v_chave and minuto = date_trunc('minute', now());

  select coalesce(sum(erros), 0) into v_erros
  from public.limite_consultas
  where chave = v_chave_erros and minuto > now() - interval '10 minutes';

  if v_neste_minuto >= 300 or v_erros >= 10 then
    raise exception 'Muitas consultas seguidas. Espere um minuto e tente de novo.';
  end if;
end;
$$;

create or replace function public.registrar_consulta(p_errou boolean, p_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := public.chave_do_aparelho();
begin
  insert into public.limite_consultas as l (chave, minuto, consultas, erros)
  values (v_chave, date_trunc('minute', now()), 1, 0)
  on conflict (chave, minuto) do update set consultas = l.consultas + 1;

  if p_errou then
    insert into public.limite_consultas as l (chave, minuto, consultas, erros)
    values (md5(v_chave || '|' || coalesce(p_codigo, '')), date_trunc('minute', now()), 0, 1)
    on conflict (chave, minuto) do update set erros = l.erros + 1;
  end if;

  -- Usa o índice em minuto (antes percorria a tabela inteira a cada consulta).
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
  perform public.conferir_limite_consultas(p_codigo);

  select coalesce(nome_publico, nome), virada_do_dia into v_nome, v_virada
  from public.negocios
  where codigo_publico = p_codigo and pagina_ativa;

  perform public.registrar_consulta(v_nome is null, p_codigo);
  if v_nome is null then
    return null;
  end if;
  return json_build_object('nome', v_nome, 'virada_do_dia', v_virada);
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
  v_hoje date;
  v_pedido public.pedidos;
  v_posicao int;
  v_tempo_medio int;
  v_faltou boolean;
begin
  perform public.conferir_limite_consultas(p_codigo);

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

  perform public.registrar_consulta(v_pedido.id is null, p_codigo);
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

drop function if exists public.conferir_limite_consultas();
drop function if exists public.registrar_consulta(boolean);
revoke all on function public.chave_do_aparelho() from public, anon, authenticated;
revoke all on function public.conferir_limite_consultas(text) from public, anon, authenticated;
revoke all on function public.registrar_consulta(boolean, text) from public, anon, authenticated;
revoke all on function public.pagina_publica(text) from public;
revoke all on function public.acompanhar_pedido(text, int) from public;
grant execute on function public.pagina_publica(text) to anon, authenticated;
grant execute on function public.acompanhar_pedido(text, int) to anon, authenticated;

-- 2. Leitura de cardápio por IA: cota que não zera ---------------------------------
-- Excluir a conta apagava as leituras do dia (cascade) e o mesmo e-mail ganhava
-- mais 20; e cada conta nova grátis somava 20 à cota do Gemini, que é uma só.
-- Agora a leitura fica guardada (sem o negócio) após a exclusão, conta também
-- pelo e-mail (só o hash) e há um teto diário para o sistema todo.
alter table public.leituras_cardapio alter column negocio_id drop not null;
alter table public.leituras_cardapio drop constraint if exists leituras_cardapio_negocio_id_fkey;
alter table public.leituras_cardapio
  add constraint leituras_cardapio_negocio_id_fkey
  foreign key (negocio_id) references public.negocios (id) on delete set null;
alter table public.leituras_cardapio add column if not exists conta text;
create index if not exists leituras_cardapio_conta_idx on public.leituras_cardapio (conta, criado_em);
create index if not exists leituras_cardapio_criado_idx on public.leituras_cardapio (criado_em);

create or replace function public.registrar_leitura_cardapio()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid := public.negocio_do_usuario_atual();
  v_conta text;
  v_inicio timestamptz := public.hoje_no_negocio()::timestamp at time zone 'America/Fortaleza';
begin
  if v_negocio_id is null then
    raise exception 'Sua conta ainda não está ligada a um negócio.';
  end if;
  select md5(lower(email)) into v_conta from auth.users where id = (select auth.uid());
  perform pg_advisory_xact_lock(hashtext('leitura-cardapio'));

  if (select count(*) from public.leituras_cardapio
      where (negocio_id = v_negocio_id or (v_conta is not null and conta = v_conta))
        and criado_em >= v_inicio) >= 20 then
    raise exception 'Você já usou as 20 leituras de cardápio de hoje. Amanhã dá para importar de novo.';
  end if;
  if (select count(*) from public.leituras_cardapio where criado_em >= v_inicio) >= 400 then
    raise exception 'A leitura por foto atingiu o limite de hoje do sistema. Amanhã dá para importar de novo, ou use a planilha.';
  end if;

  insert into public.leituras_cardapio (negocio_id, conta) values (v_negocio_id, v_conta);
  delete from public.leituras_cardapio where criado_em < now() - interval '90 days';
end;
$$;

revoke all on function public.registrar_leitura_cardapio() from public, anon;
grant execute on function public.registrar_leitura_cardapio() to authenticated;

-- 3. Excluir a conta: tentativas de senha contadas sem corrida ------------------------
-- Várias chamadas simultâneas com senha errada passavam juntas pela conta de
-- 5 tentativas em 15 minutos. Agora cada usuário espera a chamada anterior.
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
  perform pg_advisory_xact_lock(hashtext('excluir-conta:' || v_usuario_id::text));

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

-- 4. Produtos: só as colunas que a tela grava -----------------------------------------
-- O grant era da tabela inteira: dava para gravar id, criado_em e preço 'NaN'
-- direto pela API, pulando as regras das funções do banco.
revoke insert, update on public.produtos from authenticated;
grant insert (negocio_id, nome, preco, custo, disponivel, vai_para_cozinha, meio_a_meio, arquivado)
  on public.produtos to authenticated;
grant update (nome, preco, custo, disponivel, vai_para_cozinha, meio_a_meio, arquivado)
  on public.produtos to authenticated;
-- NaN passa no "preco >= 0" (o Postgres ordena NaN acima de todo número).
alter table public.produtos drop constraint if exists produtos_preco_numero;
alter table public.produtos
  add constraint produtos_preco_numero
  check (preco <> 'NaN'::numeric and (custo is null or custo <> 'NaN'::numeric)) not valid;

-- 5. Função auxiliar sem uso direto pelo app.
revoke all on function public.limpar_nome_mesa(text) from authenticated;

create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261117;
$$;

revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;

commit;
