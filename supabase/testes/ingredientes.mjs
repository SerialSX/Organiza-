// Ingredientes, custo estimado pela lista de ingredientes e "faltou" por
// ingrediente, no mesmo Postgres local (PGlite) dos outros testes.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Uso: npm run test:banco (ou node ingredientes.mjs caminho/do/schema.sql)
process.on('unhandledRejection', (e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

const schema = readFileSync(process.argv[2] ?? new URL('../schema.sql', import.meta.url), 'utf8').replace(/create extension if not exists pgcrypto;/, '');
const db = new PGlite();
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
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
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
    select set_config('request.headers', '{"cf-connecting-ip": "200.1.1.1"}', false);
    set role ${papel};`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const dono = (u, sql, p) => como('authenticated', u, sql, p);
const custo = async (produtoId) =>
  Number((await dono(U1, 'select custo from public.produtos where id = $1', [produtoId]))[0].custo);
const salvarLista = (u, produtoId, itens) =>
  dono(u, 'select public.salvar_ingredientes_do_produto($1, $2::jsonb)', [produtoId, JSON.stringify(itens)]);

const negocio = async (u) =>
  (await db.query(`select negocio_id from public.usuarios where id = '${u}'`)).rows[0].negocio_id;
const negocio1 = await negocio(U1);
const negocio2 = await negocio(U2);

let carne, pao, queijo, xb, batata;

await ok('cadastra ingredientes com e sem preço', async () => {
  const r = await dono(
    U1,
    `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values
      ($1, 'Carne moída', 'g', 40, 1000), ($1, 'Pão', 'un', 12, 12), ($1, 'Queijo', 'g', null, null)
     returning id`,
    [negocio1],
  );
  [carne, pao, queijo] = r.map((i) => i.id);
});

await erro('nome repetido não entra', 'ingredientes_nome_unico_idx', () =>
  dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade) values ($1, ' queijo ', 'g')`, [negocio1]),
);
await erro('preço sem a quantidade da compra', 'check', () =>
  dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra) values ($1, 'Sal', 'g', 3)`, [negocio1]),
);
await erro('ingrediente não muda de negócio', 'permission denied', () =>
  dono(U1, 'update public.ingredientes set negocio_id = $1 where id = $2', [negocio2, carne]),
);
await erro('outro negócio não cadastra ingrediente no meu', 'row-level security', () =>
  dono(U2, `insert into public.ingredientes (negocio_id, nome, unidade) values ($1, 'Intruso', 'g')`, [negocio1]),
);
await ok('outro negócio não vê meus ingredientes', async () => {
  igual((await dono(U2, 'select count(*)::int as n from public.ingredientes'))[0].n, 0, 'visíveis');
});

await ok('produtos', async () => {
  const r = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, custo) values ($1, 'X-Burguer', 18.5, 9), ($1, 'Batata', 15, 6) returning id`,
    [negocio1],
  );
  [xb, batata] = r.map((p) => p.id);
});

await ok('custo calculado pelos ingredientes', async () => {
  // 120 g × R$ 40/kg = 4,80 + 1 pão × R$ 12/12 = 1,00
  await salvarLista(U1, xb, [
    { ingrediente_id: carne, quantidade: 120 },
    { ingrediente_id: pao, quantidade: 1 },
  ]);
  igual(await custo(xb), 5.8, 'custo');
});

await ok('ingrediente sem preço não muda o custo', async () => {
  await salvarLista(U1, xb, [
    { ingrediente_id: carne, quantidade: 120 },
    { ingrediente_id: pao, quantidade: 1 },
    { ingrediente_id: queijo, quantidade: 30 },
  ]);
  igual(await custo(xb), 5.8, 'custo');
});

await ok('produto só com ingrediente sem preço mantém o custo digitado', async () => {
  await salvarLista(U1, batata, [{ ingrediente_id: queijo, quantidade: 20 }]);
  igual(await custo(batata), 6, 'custo');
});

await ok('mudar o preço de um ingrediente atualiza os produtos', async () => {
  await dono(U1, 'update public.ingredientes set preco_compra = 50 where id = $1', [carne]);
  igual(await custo(xb), 7, 'custo');
});

await ok('pedido grava o custo calculado', async () => {
  const [p] = await dono(U1, 'select * from public.criar_pedido($1::jsonb, $2::uuid)', [
    JSON.stringify([{ produto_id: xb, quantidade: 1 }]),
    'aaaaaaaa-0000-4000-8000-000000000001',
  ]);
  const [i] = await dono(U1, 'select custo_unitario::float as c from public.itens_pedido where pedido_id = $1', [p.id]);
  igual(i.c, 7, 'custo no pedido');
});

await erro('trocar a unidade de ingrediente que está em produto', 'trocar a unidade', () =>
  dono(U1, `update public.ingredientes set unidade = 'ml' where id = $1`, [carne]),
);
await erro('quantidade zero', 'maior que zero', () => salvarLista(U1, xb, [{ ingrediente_id: carne, quantidade: 0 }]));
await erro('mais de 30 ingredientes', 'até 30', () =>
  salvarLista(U1, xb, Array.from({ length: 31 }, () => ({ ingrediente_id: carne, quantidade: 1 }))),
);
await erro('lista não é escrita direto na tabela', 'permission denied', () =>
  dono(U1, 'insert into public.produto_ingredientes values ($1, $2, $3, 1)', [xb, carne, negocio1]),
);

let ingredienteDaBia;
await ok('outro negócio', async () => {
  [{ id: ingredienteDaBia }] = await dono(
    U2,
    `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Massa', 'g', 10, 1000) returning id`,
    [negocio2],
  );
});
await erro('não usa ingrediente de outro negócio', 'foi excluído', () =>
  salvarLista(U1, xb, [{ ingrediente_id: ingredienteDaBia, quantidade: 1 }]),
);
await erro('não mexe na lista de produto de outro negócio', 'não encontrado', () =>
  salvarLista(U2, xb, [{ ingrediente_id: ingredienteDaBia, quantidade: 1 }]),
);
await ok('outro negócio não vê a lista dos meus produtos', async () => {
  igual((await dono(U2, 'select count(*)::int as n from public.produto_ingredientes'))[0].n, 0, 'visíveis');
});

// ---------------------------------------------------------------------------
// Faltou um ingrediente
// ---------------------------------------------------------------------------
let pedido, item;
await ok('pedido na fila', async () => {
  [pedido] = await dono(U1, 'select * from public.criar_pedido($1::jsonb, $2::uuid)', [
    JSON.stringify([{ produto_id: xb, quantidade: 2 }]),
    'aaaaaaaa-0000-4000-8000-000000000002',
  ]);
  [{ id: item }] = await dono(U1, 'select id from public.itens_pedido where pedido_id = $1', [pedido.id]);
});

const faltas = async () =>
  (await dono(U1, 'select faltou_ingredientes as f from public.itens_pedido where id = $1', [item]))[0].f;
const marcar = (u, ingrediente, faltou) =>
  dono(u, 'select public.marcar_ingrediente_faltou($1, $2, $3)', [item, ingrediente, faltou]);

await ok('cozinha avisa que faltou queijo', async () => {
  await marcar(U1, queijo, true);
  await marcar(U1, queijo, true);
  igual(await faltas(), ['Queijo'], 'faltas sem repetir');
});
await ok('cliente vê o aviso na página do QR', async () => {
  const [{ codigo_publico: codigo }] = await db.query('select codigo_publico from public.negocios where id = $1', [negocio1]).then((r) => r.rows);
  const [{ r }] = await como('anon', null, 'select public.acompanhar_pedido($1, $2) as r', [codigo, pedido.numero]);
  igual(r.faltou, true, 'faltou');
});
await ok('tocar de novo desfaz o aviso', async () => {
  await marcar(U1, queijo, false);
  igual(await faltas(), [], 'faltas');
});
await erro('ingrediente que não está no produto', 'não está mais no produto', () => marcar(U1, ingredienteDaBia, true));
await erro('outro negócio não marca falta no meu pedido', 'não está mais na fila', () => marcar(U2, queijo, true));
await ok('o nome fica no histórico mesmo se o ingrediente for renomeado', async () => {
  await marcar(U1, pao, true);
  await dono(U1, `update public.ingredientes set nome = 'Pão brioche' where id = $1`, [pao]);
  igual(await faltas(), ['Pão'], 'faltas');
});

await ok('excluir ingrediente tira dos produtos e refaz o custo', async () => {
  await dono(U1, 'update public.ingredientes set arquivado = true where id = $1', [pao]);
  const lista = await dono(U1, 'select ingrediente_id from public.produto_ingredientes where produto_id = $1', [xb]);
  igual(lista.length, 2, 'ingredientes restantes');
  igual(await custo(xb), 6, 'custo sem o pão');
});
await ok('depois de excluir, o nome pode ser usado de novo', async () => {
  await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade) values ($1, 'Pão brioche', 'un')`, [negocio1]);
});
await erro('pedido pronto não recebe aviso de falta', 'não está mais na fila', async () => {
  await dono(U1, `select public.atualizar_status_pedido($1, 'pronto')`, [pedido.id]);
  await marcar(U1, queijo, true);
});

await ok('versão do banco visível para o site, até sem login', async () => {
  const [{ v }] = await como('anon', null, 'select public.versao_do_banco() as v');
  const { VERSAO_DO_BANCO } = await import('../../src/lib/versaoDoBanco.js');
  igual(v, VERSAO_DO_BANCO, 'versão do banco igual à que o site espera');
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nTudo certo');
