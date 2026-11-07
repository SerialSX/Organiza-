// Preparação comum dos testes do banco: um Postgres local (PGlite) com um
// Supabase "de mentira" (schema auth, papéis anon/authenticated), o
// schema.sql aplicado e dois donos de negócio cadastrados.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const U1 = '11111111-1111-4111-8111-111111111111';
export const U2 = '22222222-2222-4222-8222-222222222222';

export async function prepararBanco(caminhoDoSchema) {
  process.on('unhandledRejection', (e) => {
    console.error('ERRO:', e.message);
    process.exit(1);
  });

  const schema = readFileSync(caminhoDoSchema ?? new URL('../schema.sql', import.meta.url), 'utf8').replace(
    /create extension if not exists pgcrypto;/,
    '',
  );
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(schema);
  console.log('schema aplicado');
  await db.exec(`
    insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanche da Ana"}');
    insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Pastel da Bia"}');
  `);

  let falhas = 0;

  async function como(papel, usuario, sql, params) {
    await db.exec(`reset role;
      select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false);
      select set_config('request.headers', '{"cf-connecting-ip": "200.1.1.1"}', false);
      set role ${papel};`);
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec('reset role;');
    }
  }

  return {
    db,
    dono: (u, sql, p) => como('authenticated', u, sql, p),
    visitante: (sql, p) => como('anon', null, sql, p),
    negocioDe: async (u) => (await db.query(`select negocio_id from public.usuarios where id = '${u}'`)).rows[0].negocio_id,
    async ok(nome, fn) {
      try {
        await fn();
        console.log('ok   ', nome);
      } catch (e) {
        falhas++;
        console.log('FALHA', nome, '->', e.message);
      }
    },
    async erro(nome, esperado, fn) {
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
    },
    igual(a, b, msg) {
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
    },
    terminar() {
      if (falhas) {
        console.log(`\n${falhas} falha(s)`);
        process.exit(1);
      }
      console.log('\nTudo certo');
    },
  };
}
