// Meio a meio (½ Calabresa + ½ Portuguesa): regra do dono, sabores marcados,
// mesmo tamanho, preço e custo no item, edição e o "faltou" dos dois sabores,
// no mesmo Postgres local (PGlite) dos outros testes.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Uso: npm run test:banco (ou node meio-a-meio.mjs caminho/do/schema.sql)
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
console.log('schema aplicado');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Pizzaria da Ana"}');
  insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Pizzaria da Bia"}');
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
const dono = (u, sql, p) => como('authenticated', u, sql, p);
const salvarTamanhos = async (u, produtoId, tamanhos) =>
  (await dono(u, 'select public.salvar_tamanhos_do_produto($1, $2::jsonb) as t', [produtoId, JSON.stringify(tamanhos)]))[0].t;
const pedir = async (u, itens) =>
  (await dono(u, 'select * from public.criar_pedido($1::jsonb, $2)', [JSON.stringify(itens), randomUUID()]))[0];
const editar = async (u, pedido, itens) =>
  (await dono(u, 'select * from public.editar_pedido($1, $2::jsonb, $3)', [pedido.id, JSON.stringify(itens), pedido.alterado_em]))[0];
const itensDo = (pedidoId) =>
  db
    .query(
      `select tamanho, segundo_sabor, segundo_produto_id, segundo_tamanho_id, preco_unitario::float as preco, custo_unitario::float as custo
       from public.itens_pedido where pedido_id = $1 order by preco_unitario, segundo_sabor`,
      [pedidoId],
    )
    .then((r) => r.rows);
const regra = (u, r) => dono(u, 'select public.configurar_meio_a_meio($1)', [r]);
const marcar = (u, id, sim = true) => dono(u, 'update public.produtos set meio_a_meio = $2 where id = $1', [id, sim]);

const negocio1 = (await db.query(`select negocio_id from public.usuarios where id = '${U1}'`)).rows[0].negocio_id;
const negocio2 = (await db.query(`select negocio_id from public.usuarios where id = '${U2}'`)).rows[0].negocio_id;

let calabresa, portuguesa, mussarela, refri, broto1, broto2, alheia;
const t = {};
await ok('produtos e tamanhos', async () => {
  const r = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco) values
       ($1, 'Calabresa', 1), ($1, 'Portuguesa', 1), ($1, 'Mussarela', 1), ($1, 'Refrigerante', 6),
       ($1, 'Broto de frango', 20), ($1, 'Broto de milho', 24)
     returning id`,
    [negocio1],
  );
  [calabresa, portuguesa, mussarela, refri, broto1, broto2] = r.map((p) => p.id);
  const salvar = async (id, nome, lista) => {
    const ids = await salvarTamanhos(U1, id, lista);
    t[nome] = Object.fromEntries(ids.map((x) => [x.nome, x.id]));
  };
  await salvar(calabresa, 'calabresa', [{ nome: 'M', preco: 45, custo: 12 }, { nome: 'G', preco: 55, custo: 16 }]);
  await salvar(portuguesa, 'portuguesa', [{ nome: 'm', preco: 48, custo: 14 }, { nome: 'G', preco: 60, custo: 21 }]);
  // Mussarela não tem M.
  await salvar(mussarela, 'mussarela', [{ nome: 'P', preco: 33 }, { nome: 'G', preco: 52 }]);
  [{ id: alheia }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco, meio_a_meio) values ($1, 'Alheia', 50, true) returning id`, [negocio2]);
});

await ok('produto começa sem meio a meio e o negócio sem regra', async () => {
  const [{ m }] = await dono(U1, 'select meio_a_meio as m from public.produtos where id = $1', [calabresa]);
  igual(m, false, 'meio_a_meio');
  const [{ r }] = await dono(U1, 'select regra_meio_a_meio as r from public.negocios where id = $1', [negocio1]);
  igual(r, null, 'regra');
});

await erro('sabor não marcado não entra', 'Calabresa não pode ser meio a meio', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 }]),
);
await ok('marca os sabores', async () => {
  for (const id of [calabresa, portuguesa, mussarela, broto1, broto2]) await marcar(U1, id);
});
await erro('segundo sabor não marcado', 'Refrigerante não pode ser meio a meio', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: refri, quantidade: 1 }]),
);
await erro('sem regra escolhida, o dono é avisado', 'Escolha em Minha conta como cobrar o meio a meio', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 }]),
);
await erro('regra inválida', 'Escolha como cobrar o meio a meio', () => regra(U1, 'metade'));
await erro('regra vazia', 'Escolha como cobrar o meio a meio', () => regra(U1, null));

let pedidoMaisCaro;
await ok('regra do mais caro: G meio a meio sai pelo preço da Portuguesa G', async () => {
  await regra(U1, 'mais_caro');
  pedidoMaisCaro = await pedir(U1, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 2 },
  ]);
  igual(await itensDo(pedidoMaisCaro.id), [
    { tamanho: 'G', segundo_sabor: 'Portuguesa', segundo_produto_id: portuguesa, segundo_tamanho_id: t.portuguesa.G, preco: 60, custo: 18.5 },
  ], 'item');
});
await ok('tamanho com maiúscula diferente combina (M com m)', async () => {
  const p = await pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.M, segundo_produto_id: portuguesa, quantidade: 1 }]);
  igual((await itensDo(p.id)).map((i) => [i.tamanho, i.segundo_tamanho_id, i.preco, i.custo]), [['M', t.portuguesa.m, 48, 13]], 'item');
});

let pedidoMedia;
await ok('regra da média: soma das metades; mudar a regra não muda o pedido feito', async () => {
  await regra(U1, 'media');
  pedidoMedia = await pedir(U1, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 },
    { produto_id: broto1, segundo_produto_id: broto2, quantidade: 1 },
  ]);
  igual((await itensDo(pedidoMedia.id)).map((i) => [i.tamanho, i.segundo_sabor, i.preco, i.custo]), [
    [null, 'Broto de milho', 22, null],
    ['G', 'Portuguesa', 57.5, 18.5],
  ], 'itens');
  igual((await itensDo(pedidoMaisCaro.id))[0].preco, 60, 'o pedido de antes continua com 60');
});
await ok('média com centavo ímpar arredonda', async () => {
  await dono(U1, `select public.salvar_tamanhos_do_produto($1, $2::jsonb)`, [
    portuguesa,
    JSON.stringify([{ id: t.portuguesa.m, nome: 'm', preco: 48.15, custo: 14 }, { id: t.portuguesa.G, nome: 'G', preco: 60, custo: 21 }]),
  ]);
  const p = await pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.M, segundo_produto_id: portuguesa, quantidade: 1 }]);
  igual((await itensDo(p.id))[0].preco, 46.58, '(45 + 48,15) / 2');
});

await erro('mesmo sabor duas vezes', 'Escolha dois sabores diferentes', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: calabresa, quantidade: 1 }]),
);
await erro('segundo sabor sem o tamanho', 'O sabor Mussarela não tem o tamanho M', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.M, segundo_produto_id: mussarela, quantidade: 1 }]),
);
await erro('um sabor com tamanhos e o outro sem', 'Os dois sabores precisam ter o mesmo tamanho', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: calabresa, quantidade: 1 }]),
);
await erro('sabor de outro negócio', 'Um dos sabores saiu do cardápio', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: alheia, quantidade: 1 }]),
);
await erro('sabor que não existe', 'Um dos sabores saiu do cardápio', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: randomUUID(), quantidade: 1 }]),
);
await erro('segundo sabor em formato errado', 'Item do pedido inválido', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: 5, quantidade: 1 }]),
);
await ok('o primeiro sabor esgotado continua com a mensagem de sempre', async () => {
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [broto1]);
});
await erro('primeiro sabor esgotado', 'Um dos produtos esgotou', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: broto2, quantidade: 1 }]),
);
await ok('segundo sabor esgotado', () => dono(U1, 'update public.produtos set disponivel = true where id = $1', [broto1]));
await ok('esgota o broto de milho', () => dono(U1, 'update public.produtos set disponivel = false where id = $1', [broto2]));
await erro('pedido guardado sem internet com sabor esgotado falha com o motivo', 'O sabor Broto de milho esgotou', () =>
  pedir(U1, [{ produto_id: broto1, segundo_produto_id: broto2, quantidade: 1 }]),
);
await ok('esgota só a G da Portuguesa', async () => {
  await dono(U1, 'update public.produtos set disponivel = true where id = $1', [broto2]);
  await dono(U1, 'update public.produto_tamanhos set disponivel = false where id = $1', [t.portuguesa.G]);
});
await erro('tamanho do segundo sabor esgotado', 'O sabor Portuguesa esgotou no tamanho G', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 }]),
);

await ok('editar mantém o preço combinado, mesmo com o sabor esgotado e a regra mudada', async () => {
  await regra(U1, 'mais_caro');
  const depois = await editar(U1, pedidoMedia, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 3 },
    { produto_id: broto1, segundo_produto_id: broto2, quantidade: 1 },
  ]);
  pedidoMedia = depois;
  igual((await itensDo(depois.id)).map((i) => [i.segundo_sabor, i.segundo_tamanho_id, i.preco, i.custo]), [
    ['Broto de milho', null, 22, null],
    ['Portuguesa', t.portuguesa.G, 57.5, 18.5],
  ], 'itens');
});
await ok('trocar um sabor é item novo, com o preço de hoje', async () => {
  await dono(U1, 'update public.produto_tamanhos set disponivel = true where id = $1', [t.portuguesa.G]);
  const depois = await editar(U1, pedidoMedia, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: mussarela, quantidade: 1 },
  ]);
  pedidoMedia = depois;
  igual((await itensDo(depois.id)).map((i) => [i.segundo_sabor, i.preco, i.custo]), [['Mussarela', 55, null]], 'item');
});
await ok('sabor renomeado: o item guarda o nome de quando foi pedido', async () => {
  await dono(U1, `update public.produtos set nome = 'Muçarela' where id = $1`, [mussarela]);
  const depois = await editar(U1, pedidoMedia, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: mussarela, quantidade: 2 },
  ]);
  pedidoMedia = depois;
  igual((await itensDo(depois.id)).map((i) => i.segundo_sabor), ['Mussarela'], 'nome');
});
await ok('sabor arquivado continua no pedido aberto que já tinha ele', async () => {
  await dono(U1, 'update public.produtos set arquivado = true where id = $1', [mussarela]);
  const depois = await editar(U1, pedidoMedia, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: mussarela, quantidade: 1 },
  ]);
  pedidoMedia = depois;
  igual((await itensDo(depois.id)).length, 1, 'item');
});
await erro('sabor arquivado não entra em pedido novo', 'O sabor Muçarela saiu do cardápio', () =>
  pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: mussarela, quantidade: 1 }]),
);
await ok('desmarcar o meio a meio não mexe no pedido aberto', async () => {
  await marcar(U1, calabresa, false);
  const depois = await editar(U1, pedidoMaisCaro, [
    { produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 },
  ]);
  pedidoMaisCaro = depois;
  igual((await itensDo(depois.id))[0].preco, 60, 'preço');
  await marcar(U1, calabresa, true);
});

let queijo, presunto;
await ok('faltou: aceita ingrediente de qualquer um dos sabores', async () => {
  [{ id: queijo }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Queijo', 'g', 40, 1000) returning id`, [negocio1]);
  [{ id: presunto }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Presunto', 'g', 30, 1000) returning id`, [negocio1]);
  await dono(U1, 'select public.salvar_ingredientes_do_produto($1, $2::jsonb)', [
    calabresa,
    JSON.stringify([{ ingrediente_id: queijo, por_tamanho: { [t.calabresa.M]: 100, [t.calabresa.G]: 150 } }]),
  ]);
  await dono(U1, 'select public.salvar_ingredientes_do_produto($1, $2::jsonb)', [
    portuguesa,
    JSON.stringify([
      { ingrediente_id: queijo, por_tamanho: { [t.portuguesa.m]: 100, [t.portuguesa.G]: 150 } },
      { ingrediente_id: presunto, por_tamanho: { [t.portuguesa.m]: 50, [t.portuguesa.G]: 80 } },
    ]),
  ]);
  const p = await pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 }]);
  const [{ id: item }] = (await db.query('select id from public.itens_pedido where pedido_id = $1', [p.id])).rows;
  await dono(U1, 'select public.marcar_ingrediente_faltou($1, $2, true)', [item, presunto]);
  await dono(U1, 'select public.marcar_ingrediente_faltou($1, $2, true)', [item, queijo]);
  const [{ f }] = (await db.query('select faltou_ingredientes as f from public.itens_pedido where id = $1', [item])).rows;
  igual(f, ['Presunto', 'Queijo'], 'faltou');
  const eventos = await db.query(
    `select produto_id, detalhe from public.eventos where pedido_id = $1 and tipo = 'faltou_ingrediente' order by detalhe`,
    [p.id],
  );
  igual(eventos.rows, [{ produto_id: portuguesa, detalhe: 'Presunto' }, { produto_id: calabresa, detalhe: 'Queijo' }], 'eventos pelo sabor');
  // Ingrediente que não está em nenhum dos dois.
  const [{ id: tomate }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Tomate', 'g', 8, 1000) returning id`, [negocio1]);
  try {
    await dono(U1, 'select public.marcar_ingrediente_faltou($1, $2, true)', [item, tomate]);
    throw new Error('deveria recusar o tomate');
  } catch (e) {
    if (!e.message.includes('não está mais no produto')) throw e;
  }
});

await erro('só o dono escolhe a regra', 'Só o dono do negócio', async () => {
  const U3 = '33333333-3333-4333-8333-333333333333';
  await db.exec(`insert into auth.users values ('${U3}', 'c@c.com', '{"nome":"Caio"}')`);
  await db.query(`insert into public.usuarios (id, negocio_id, nome, papel) values ($1, $2, 'Caio', 'atendente') on conflict (id) do update set negocio_id = excluded.negocio_id, papel = 'atendente'`, [U3, negocio1]);
  await regra(U3, 'media');
});
await erro('sem login não escolhe a regra', 'permission denied', () => como('anon', null, `select public.configurar_meio_a_meio('media')`));
await ok('regra do outro negócio não muda', async () => {
  const [{ r }] = await dono(U2, 'select regra_meio_a_meio as r from public.negocios where id = $1', [negocio2]);
  igual(r, null, 'regra do negócio 2');
});

await ok('cardápio pronto cria os sabores já marcados', async () => {
  const [{ n }] = await dono(U2, 'select public.criar_produtos_com_tamanhos($1::jsonb) as n', [
    JSON.stringify([
      { nome: 'Pizza Atum', meio_a_meio: true, tamanhos: [{ nome: 'P', preco: 30 }, { nome: 'G', preco: 50 }] },
      { nome: 'Guaraná', preco: 6, vai_para_cozinha: false },
    ]),
  ]);
  igual(n, 2, 'criados');
  const r = await dono(U2, `select nome, meio_a_meio as m from public.produtos where nome in ('Pizza Atum', 'Guaraná') order by nome`);
  igual(r, [{ nome: 'Guaraná', m: false }, { nome: 'Pizza Atum', m: true }], 'marcados');
});
await erro('meio_a_meio em formato errado', 'Produto inválido', () =>
  dono(U2, 'select public.criar_produtos_com_tamanhos($1::jsonb)', [JSON.stringify([{ nome: 'X', preco: 5, meio_a_meio: 'sim' }])]),
);

await ok('versão do banco igual à que o site espera', async () => {
  const [{ v }] = await como('anon', null, 'select public.versao_do_banco() as v');
  const { VERSAO_DO_BANCO } = await import('../../src/lib/versaoDoBanco.js');
  igual(v, VERSAO_DO_BANCO, 'versão');
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
