-- Migração para o Supabase que já está no ar. Rodar UMA vez no SQL Editor,
-- DEPOIS de 2026-10-29_mesa-no-pedido.sql.
-- Quem cria um projeto novo roda só o supabase/schema.sql, que já tem tudo isto.
--
-- Importar o cardápio por foto (IA): a Edge Function ler-cardapio registra cada
-- leitura antes de chamar o Gemini, para limitar o uso da cota grátis.
-- 1. Tabela leituras_cardapio (só o negócio e a hora: nunca a foto).
-- 2. registrar_leitura_cardapio(): até 20 leituras por negócio por dia.
-- 3. versao_do_banco() passa para 20261107.
begin;

do $$
begin
  if public.versao_do_banco() < 20261029 then
    raise exception 'Rode antes supabase/migracoes/2026-10-29_mesa-no-pedido.sql';
  end if;
end;
$$;

-- 1. Tabela ----------------------------------------------------------------------
create table if not exists public.leituras_cardapio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists leituras_cardapio_negocio_idx on public.leituras_cardapio (negocio_id, criado_em);
-- Só a função abaixo lê e escreve: RLS ligado e nenhuma policy.
alter table public.leituras_cardapio enable row level security;
revoke all on public.leituras_cardapio from anon, authenticated;

-- 2. Função -----------------------------------------------------------------------
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

-- 3. Versão do banco --------------------------------------------------------------
create or replace function public.versao_do_banco()
returns int
language sql
immutable
set search_path = ''
as $$
  select 20261107;
$$;

revoke all on function public.versao_do_banco() from public;
grant execute on function public.versao_do_banco() to anon, authenticated;

commit;
