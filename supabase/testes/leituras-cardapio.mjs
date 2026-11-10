// Leitura do cardápio por foto: limite diário e permissões, no mesmo Postgres
// local (PGlite) dos outros testes.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

// Uso: npm run test:banco (ou node leituras-cardapio.mjs caminho/do/schema.sql)
process.on('unhandledRejection', (e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

const schema = readFileSync(process.argv[2] ?? new URL('../schema.sql', import.meta.url), 'utf8').replace(/create extension if not exists pgcrypto;/, '');
// No Supabase o pgcrypto fica no schema extensions (senha de auth.users).
const db = new PGlite({ extensions: { pgcrypto } });
let falhas = 0;

async function ok(nome, fn) {
  try {
    await fn();
    console.log('ok   ', nome);
  } catch (e) {
    falhas++;
    console.log('FALHA', nome, '->', e.message);
  }
}
async function erro(nome, esperado, fn) {
  try {
    await fn();
    falhas++;
    console.log('FALHA', nome, '-> deveria ter dado erro');
  } catch (e) {
    if (e.message.includes(esperado)) console.log('ok   ', nome, `(erro: ${e.message})`);
    else {
      falhas++;
      console.log('FALHA', nome, '-> erro diferente:', e.message);
    }
  }
}

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, encrypted_password text);
  create schema extensions;
  create extension pgcrypto schema extensions;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(schema);
console.log('schema aplicado');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanche da Ana"}');
  insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Pastel da Bia"}');
`);

async function como(papel, usuario, sql, params) {
  await db.exec(`reset role;
    select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false);
    set role ${papel};`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const registrar = (u) => como('authenticated', u, 'select public.registrar_leitura_cardapio()');
const [{ negocio_id: negocio1 }] = (await db.query(`select negocio_id from public.usuarios where id = '${U1}'`)).rows;

await erro('visitante não registra leitura', 'permission denied', () => como('anon', null, 'select public.registrar_leitura_cardapio()'));
await erro('a tabela não é lida direto', 'permission denied', () => como('authenticated', U1, 'select * from public.leituras_cardapio'));
await erro('nem escrita direto', 'permission denied', () =>
  como('authenticated', U1, 'insert into public.leituras_cardapio (negocio_id) values ($1)', [negocio1]),
);

await ok('leituras de ontem não contam e as de mais de 90 dias são apagadas', async () => {
  await db.query(
    `insert into public.leituras_cardapio (negocio_id, criado_em) values ($1, now() - interval '1 day'), ($1, now() - interval '100 days')`,
    [negocio1],
  );
  for (let i = 0; i < 20; i++) await registrar(U1);
  const [{ n }] = (await db.query(`select count(*)::int as n from public.leituras_cardapio where criado_em < now() - interval '90 days'`)).rows;
  if (n !== 0) throw new Error(`${n} leitura(s) antiga(s) ficaram`);
});
await erro('a 21ª leitura do dia é barrada', 'leituras de cardápio de hoje', () => registrar(U1));
await ok('o limite é de cada negócio', () => registrar(U2));

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nTudo certo');
