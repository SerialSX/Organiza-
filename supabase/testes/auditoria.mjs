// Testes das correções da auditoria de segurança (2026-11-17). Roda o
// supabase/schema.sql num Postgres local (PGlite) com um Supabase "de mentira".
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

process.on('unhandledRejection', (e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

const schema = readFileSync(process.argv[2] ?? new URL('../schema.sql', import.meta.url), 'utf8').replace(/create extension if not exists pgcrypto;/, '');
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
function igual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
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

const U1 = '11111111-1111-4111-8111-111111111111';
const U1B = '33333333-3333-4333-8333-333333333333';
await db.exec(`
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanche da Ana"}');
  update auth.users set encrypted_password = extensions.crypt('senha-da-a', extensions.gen_salt('bf'));
`);

async function como(usuario, sql, params, ip = '203.0.113.7') {
  const papel = usuario ? 'authenticated' : 'anon';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false);
    select set_config('request.headers', '{"cf-connecting-ip":"${ip}"}', false); set role ${papel};`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}

const [{ codigo_publico: codigo, id: negocio }] = (await db.query(`select id, codigo_publico from public.negocios`)).rows;
await db.exec(`update public.negocios set pagina_ativa = true where id = '${negocio}'`);
const [{ id: produto }] = await como(U1, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'X-Burguer', 20) returning id`, [negocio]);
await como(U1, `select public.criar_pedido($1::jsonb, gen_random_uuid())`, [JSON.stringify([{ produto_id: produto, quantidade: 1 }])]);

await ok('versão do banco igual à do site', async () => {
  const site = readFileSync(new URL('../../src/lib/versaoDoBanco.js', import.meta.url), 'utf8').match(/\d{8}/)[0];
  const [{ v }] = await como(null, 'select public.versao_do_banco() as v');
  igual(String(v), site, 'versão');
});

await ok('erros de endereços inventados no mesmo IP não bloqueiam quem acompanha a senha certa', async () => {
  for (let i = 0; i < 10; i++) await como(null, `select public.pagina_publica($1)`, [`lixo-${i}`]);
  for (let i = 0; i < 10; i++) await como(null, `select public.pagina_publica($1)`, ['lixo-repetido']).catch(() => {});
  const [{ r }] = await como(null, `select public.acompanhar_pedido($1, 1) as r`, [codigo]);
  igual(r.encontrado, true, 'pedido encontrado');
});

await erro('quem erra 10 senhas no mesmo endereço continua bloqueado', 'Muitas consultas', async () => {
  for (let n = 900; n < 911; n++) await como(null, `select public.acompanhar_pedido($1, $2)`, [codigo, n], '198.51.100.20');
});

await ok('IPv6 do mesmo /64 conta como um aparelho só', async () => {
  const chave = async (ip) => (await como(null, `select public.pagina_publica('x')`, [], ip).then(() => db.query(`select count(distinct chave)::int n from public.limite_consultas where consultas > 0`))).rows[0].n;
  const antes = await chave('2001:db8:1:1::1');
  const depois = await chave('2001:db8:1:1::2');
  igual(depois, antes, 'chaves distintas');
});

await erro('anon não chama as funções internas do limite', 'permission denied', () => como(null, `select public.registrar_consulta(false, 'x')`));

await erro('produtos: a API não grava criado_em direto', 'permission denied', () =>
  como(U1, `update public.produtos set criado_em = now() - interval '1 year' where id = $1`, [produto]),
);
await erro('produtos: preço NaN recusado', 'produtos_preco_numero', () =>
  como(U1, `update public.produtos set preco = 'NaN' where id = $1`, [produto]),
);
await ok('produtos: a tela ainda edita nome, preço e disponível', async () => {
  await como(U1, `update public.produtos set nome = 'X-Salada', preco = 22, disponivel = false where id = $1`, [produto]);
});

await ok('cota da leitura por IA não zera ao excluir e recriar a conta', async () => {
  for (let i = 0; i < 20; i++) await como(U1, `select public.registrar_leitura_cardapio()`);
  const [{ r }] = await como(U1, `select public.excluir_minha_conta('senha-da-a') as r`);
  igual(r, 'excluida', 'exclusão');
  await db.exec(`insert into auth.users values ('${U1B}', 'A@a.com', '{"nome":"Ana","nome_negocio":"De novo"}')`);
  let barrou = false;
  await como(U1B, `select public.registrar_leitura_cardapio()`).catch((e) => (barrou = e.message.includes('20 leituras')));
  igual(barrou, true, 'nova conta com o mesmo e-mail barrada');
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
