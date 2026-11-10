// Tamanhos de produto (P, M, G): cadastro, custo por tamanho, esgotado,
// pedido com tamanho e edição, no mesmo Postgres local (PGlite) dos outros testes.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Uso: npm run test:banco (ou node tamanhos.mjs caminho/do/schema.sql)
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
const dono = (u, sql, p) => como('authenticated', u, sql, p);
const salvarTamanhos = async (u, produtoId, tamanhos) =>
  (await dono(u, 'select public.salvar_tamanhos_do_produto($1, $2::jsonb) as t', [produtoId, JSON.stringify(tamanhos)]))[0].t;
const salvarLista = (u, produtoId, itens) =>
  dono(u, 'select public.salvar_ingredientes_do_produto($1, $2::jsonb)', [produtoId, JSON.stringify(itens)]);
const pedir = async (u, itens) =>
  (await dono(u, 'select * from public.criar_pedido($1::jsonb, $2)', [JSON.stringify(itens), randomUUID()]))[0];
const itensDo = (pedidoId) =>
  db.query('select tamanho, tamanho_id, preco_unitario::float as preco, custo_unitario::float as custo from public.itens_pedido where pedido_id = $1 order by preco_unitario', [pedidoId]).then((r) => r.rows);
const tamanhosDe = (produtoId) =>
  db.query('select nome, preco::float as preco, custo::float as custo, disponivel, arquivado from public.produto_tamanhos where produto_id = $1 order by arquivado, ordem, nome', [produtoId]).then((r) => r.rows);
const produto = (id) => db.query('select preco::float as preco, custo::float as custo from public.produtos where id = $1', [id]).then((r) => r.rows[0]);

const negocio1 = (await db.query(`select negocio_id from public.usuarios where id = '${U1}'`)).rows[0].negocio_id;

let pizza, pastel, mussarela, borda, P, M, G;
await ok('produtos', async () => {
  const r = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco) values ($1, 'Pizza Calabresa', 40), ($1, 'Pastel', 9) returning id`,
    [negocio1],
  );
  [pizza, pastel] = r.map((p) => p.id);
});

await ok('cadastra P, M e G; o produto fica com o preço do primeiro', async () => {
  const t = await salvarTamanhos(U1, pizza, [
    { nome: 'P', preco: 32, custo: 10 },
    { nome: ' M ', preco: 42, custo: null },
    { nome: 'G', preco: 52.499, custo: null },
  ]);
  igual(t.map((x) => x.nome), ['P', 'M', 'G'], 'nomes na ordem');
  [P, M, G] = t.map((x) => x.id);
  igual(await tamanhosDe(pizza), [
    { nome: 'P', preco: 32, custo: 10, disponivel: true, arquivado: false },
    { nome: 'M', preco: 42, custo: null, disponivel: true, arquivado: false },
    { nome: 'G', preco: 52.5, custo: null, disponivel: true, arquivado: false },
  ], 'tamanhos');
  igual(await produto(pizza), { preco: 32, custo: 10 }, 'produto acompanha o P');
});

await erro('um tamanho só não é tamanho', 'Com um tamanho só', () => salvarTamanhos(U1, pastel, [{ nome: 'Único', preco: 9 }]));
await erro('no máximo 8 tamanhos', 'até 8 tamanhos', () =>
  salvarTamanhos(U1, pastel, Array.from({ length: 9 }, (_, i) => ({ nome: `T${i}`, preco: 9 }))),
);
await erro('nome repetido', 'Dois tamanhos com o nome "p"', () =>
  salvarTamanhos(U1, pastel, [{ nome: 'P', preco: 9 }, { nome: 'p', preco: 10 }]),
);
await erro('tamanho sem preço', 'Digite o preço de cada tamanho', () =>
  salvarTamanhos(U1, pastel, [{ nome: 'P', preco: 0 }, { nome: 'G', preco: 10 }]),
);
await erro('nome comprido', 'de 1 a 20 letras', () =>
  salvarTamanhos(U1, pastel, [{ nome: 'x'.repeat(21), preco: 9 }, { nome: 'G', preco: 10 }]),
);
await ok('erro não deixa nada pela metade', async () => igual(await tamanhosDe(pastel), [], 'pastel sem tamanhos'));

await erro('outro negócio não mexe nos meus tamanhos', 'Produto não encontrado', () =>
  salvarTamanhos(U2, pizza, [{ nome: 'P', preco: 1 }, { nome: 'G', preco: 2 }]),
);
await ok('outro negócio não vê nem esgota meus tamanhos', async () => {
  igual((await dono(U2, 'select count(*)::int as n from public.produto_tamanhos'))[0].n, 0, 'visíveis');
  await dono(U2, 'update public.produto_tamanhos set disponivel = false where id = $1', [G]);
  igual((await tamanhosDe(pizza))[2].disponivel, true, 'G continua disponível');
});
await erro('tamanho não muda de preço por fora da função', 'permission denied', () =>
  dono(U1, 'update public.produto_tamanhos set preco = 1 where id = $1', [G]),
);
await erro('tamanho não é criado por fora da função', 'permission denied', () =>
  dono(U1, `insert into public.produto_tamanhos (produto_id, negocio_id, nome, preco) values ($1, $2, 'GG', 60)`, [pizza, negocio1]),
);

await ok('ingredientes por tamanho: custo de cada um sai sozinho', async () => {
  const [{ id }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Mussarela', 'g', 40, 1000) returning id`, [negocio1]);
  mussarela = id;
  const [{ id: b }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade, preco_compra, quantidade_compra) values ($1, 'Borda', 'un', 5, 1) returning id`, [negocio1]);
  borda = b;
  await salvarLista(U1, pizza, [
    { ingrediente_id: mussarela, por_tamanho: { [P]: 100, [M]: 150, [G]: 200 } },
    { ingrediente_id: borda, por_tamanho: { [G]: 1 } },
  ]);
  igual((await tamanhosDe(pizza)).map((t) => t.custo), [4, 6, 13], 'P 4,00 · M 6,00 · G 8,00 + borda 5,00');
  igual(await produto(pizza), { preco: 32, custo: 4 }, 'produto acompanha o P');
  const lista = await db.query('select quantidade::float as q from public.produto_ingredientes where produto_id = $1 order by q', [pizza]);
  igual(lista.rows.map((r) => r.q), [1, 200], 'lista do produto (para o "faltou")');
});
await erro('produto com tamanhos pede a quantidade por tamanho', 'quanto vai em cada tamanho', () =>
  salvarLista(U1, pizza, [{ ingrediente_id: mussarela, quantidade: 100 }]),
);
await erro('ingrediente em nenhum tamanho', 'pelo menos um tamanho', () =>
  salvarLista(U1, pizza, [{ ingrediente_id: mussarela, por_tamanho: {} }]),
);
await ok('mudou o preço do ingrediente: o custo de cada tamanho muda junto', async () => {
  await dono(U1, 'update public.ingredientes set preco_compra = 60 where id = $1', [mussarela]);
  igual((await tamanhosDe(pizza)).map((t) => t.custo), [6, 9, 17], 'custos novos');
});

let pedidoG;
await erro('produto com tamanhos não entra sem o tamanho', 'Escolha o tamanho de Pizza Calabresa', () =>
  pedir(U1, [{ produto_id: pizza, quantidade: 1 }]),
);
await ok('pedido com G: preço, custo e nome do tamanho copiados', async () => {
  pedidoG = await pedir(U1, [
    { produto_id: pizza, tamanho_id: G, quantidade: 1 },
    { produto_id: pastel, quantidade: 2 },
  ]);
  igual(await itensDo(pedidoG.id), [
    { tamanho: null, tamanho_id: null, preco: 9, custo: null },
    { tamanho: 'G', tamanho_id: G, preco: 52.5, custo: 17 },
  ], 'itens');
});
await erro('tamanho de outro produto', 'saiu do cardápio', () =>
  pedir(U1, [{ produto_id: pastel, tamanho_id: G, quantidade: 1 }]),
);
await ok('tamanho esgotado não entra; os outros sim', async () => {
  await dono(U1, 'update public.produto_tamanhos set disponivel = false where id = $1', [G]);
  await pedir(U1, [{ produto_id: pizza, tamanho_id: P, quantidade: 1 }]);
});
await erro('G esgotada', 'esgotou', () => pedir(U1, [{ produto_id: pizza, tamanho_id: G, quantidade: 1 }]));
await ok('produto esgotado desliga todos os tamanhos', async () => {
  await dono(U1, 'update public.produto_tamanhos set disponivel = true where id = $1', [G]);
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [pizza]);
});
await erro('P com a pizza esgotada', 'esgotou', () => pedir(U1, [{ produto_id: pizza, tamanho_id: P, quantidade: 1 }]));
await ok('volta a pizza', () => dono(U1, 'update public.produtos set disponivel = true where id = $1', [pizza]));

await ok('editar mantém o preço combinado do G, mesmo com o preço novo', async () => {
  await salvarTamanhos(U1, pizza, [
    { id: P, nome: 'P', preco: 32 },
    { id: M, nome: 'M', preco: 42 },
    { id: G, nome: 'Grande', preco: 60 },
  ]);
  const [v] = await db.query('select alterado_em from public.pedidos where id = $1', [pedidoG.id]).then((r) => r.rows);
  await dono(U1, 'select public.editar_pedido($1, $2::jsonb, $3)', [
    pedidoG.id,
    JSON.stringify([{ produto_id: pizza, tamanho_id: G, quantidade: 2 }, { produto_id: pastel, quantidade: 2 }]),
    v.alterado_em,
  ]);
  igual(await itensDo(pedidoG.id), [
    { tamanho: null, tamanho_id: null, preco: 9, custo: null },
    { tamanho: 'G', tamanho_id: G, preco: 52.5, custo: 17 },
  ], 'G com o preço e o nome de quando foi lançada');
});
await ok('trocar G por P no pedido usa o preço do P', async () => {
  const [v] = await db.query('select alterado_em from public.pedidos where id = $1', [pedidoG.id]).then((r) => r.rows);
  await dono(U1, 'select public.editar_pedido($1, $2::jsonb, $3)', [pedidoG.id, JSON.stringify([{ produto_id: pizza, tamanho_id: P, quantidade: 1 }]), v.alterado_em]);
  igual(await itensDo(pedidoG.id), [{ tamanho: 'P', tamanho_id: P, preco: 32, custo: 6 }], 'P');
});

await ok('trocar os nomes de lugar (P vira G e G vira P) não esbarra no nome único', async () => {
  await salvarTamanhos(U1, pizza, [
    { id: P, nome: 'Grande', preco: 32 },
    { id: M, nome: 'M', preco: 42 },
    { id: G, nome: 'P', preco: 60 },
  ]);
  await salvarTamanhos(U1, pizza, [
    { id: P, nome: 'P', preco: 32 },
    { id: M, nome: 'M', preco: 42 },
    { id: G, nome: 'G', preco: 60 },
  ]);
  igual((await tamanhosDe(pizza)).map((t) => t.nome), ['P', 'M', 'G'], 'nomes');
});

let pedidoM;
await ok('tirar o M: pedido aberto com M continua e pode ser editado', async () => {
  pedidoM = await pedir(U1, [{ produto_id: pizza, tamanho_id: M, quantidade: 1 }]);
  const t = await salvarTamanhos(U1, pizza, [
    { id: P, nome: 'P', preco: 32 },
    { id: G, nome: 'G', preco: 60 },
  ]);
  igual(t.map((x) => x.nome), ['P', 'G'], 'ativos');
  igual((await tamanhosDe(pizza)).filter((x) => x.arquivado).map((x) => x.nome), ['M'], 'M arquivado');
  const [v] = await db.query('select alterado_em from public.pedidos where id = $1', [pedidoM.id]).then((r) => r.rows);
  await dono(U1, 'select public.editar_pedido($1, $2::jsonb, $3)', [pedidoM.id, JSON.stringify([{ produto_id: pizza, tamanho_id: M, quantidade: 3 }]), v.alterado_em]);
  igual((await itensDo(pedidoM.id)).map((i) => [i.tamanho, i.preco]), [['M', 42]], 'M mantido');
});
await erro('pedido novo com o M que saiu (guardado sem internet, por exemplo)', 'O tamanho M de Pizza Calabresa saiu do cardápio', () =>
  pedir(U1, [{ produto_id: pizza, tamanho_id: M, quantidade: 1 }]),
);
await ok('dá para criar um M de novo com o mesmo nome', async () => {
  const t = await salvarTamanhos(U1, pizza, [
    { id: P, nome: 'P', preco: 32 },
    { nome: 'M', preco: 45 },
    { id: G, nome: 'G', preco: 60 },
  ]);
  igual(t.map((x) => x.nome), ['P', 'M', 'G'], 'ativos');
});

await ok('a cozinha avisa o ingrediente que faltou num item com tamanho', async () => {
  const p = await pedir(U1, [{ produto_id: pizza, tamanho_id: G, quantidade: 1 }]);
  const [{ id: item }] = (await db.query('select id from public.itens_pedido where pedido_id = $1', [p.id])).rows;
  await dono(U1, 'select public.marcar_ingrediente_faltou($1, $2, true)', [item, borda]);
  const [{ f }] = (await db.query('select faltou_ingredientes as f from public.itens_pedido where id = $1', [item])).rows;
  igual(f, ['Borda'], 'faltou');
});

await ok('excluir um ingrediente tira ele dos tamanhos', async () => {
  await dono(U1, 'update public.ingredientes set arquivado = true where id = $1', [borda]);
  const n = await db.query('select count(*)::int as n from public.tamanho_ingredientes where ingrediente_id = $1', [borda]);
  igual(n.rows[0].n, 0, 'linhas da borda');
});

await ok('desligar os tamanhos: volta a ter um preço só', async () => {
  igual(await salvarTamanhos(U1, pizza, []), [], 'nenhum ativo');
  await dono(U1, 'update public.produtos set preco = 45 where id = $1', [pizza]);
  await salvarLista(U1, pizza, [{ ingrediente_id: mussarela, quantidade: 150 }]);
  const p = await pedir(U1, [{ produto_id: pizza, quantidade: 1 }]);
  igual((await itensDo(p.id)).map((i) => [i.tamanho, i.preco, i.custo]), [[null, 45, 9]], 'sem tamanho');
});

const criarVarios = async (u, lista) =>
  (await dono(u, 'select public.criar_produtos_com_tamanhos($1::jsonb) as n', [JSON.stringify(lista)]))[0].n;

await ok('cardápio de pizzaria de uma vez: produtos com e sem tamanhos', async () => {
  const n = await criarVarios(U2, [
    { nome: 'Pizza Mussarela', tamanhos: [{ nome: 'P', preco: 30 }, { nome: 'G', preco: 50, custo: 12 }] },
    { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
    { nome: ' pizza  mussarela ', tamanhos: [{ nome: 'P', preco: 1 }, { nome: 'G', preco: 2 }] },
  ]);
  igual(n, 2, 'repetido na lista entra uma vez');
  const r = await dono(U2, `select p.nome, p.preco::float as preco, p.vai_para_cozinha as cozinha,
      (select json_agg(t.nome order by t.ordem) from public.produto_tamanhos t where t.produto_id = p.id) as tamanhos
    from public.produtos p order by p.nome`);
  igual(r, [
    { nome: 'Pizza Mussarela', preco: 30, cozinha: true, tamanhos: ['P', 'G'] },
    { nome: 'Refrigerante lata', preco: 6, cozinha: false, tamanhos: null },
  ], 'produtos');
});
await ok('tocar de novo não duplica', async () => {
  igual(await criarVarios(U2, [{ nome: 'PIZZA MUSSARELA', tamanhos: [{ nome: 'P', preco: 1 }, { nome: 'G', preco: 2 }] }]), 0, 'criados');
});
await erro('um erro no meio não deixa nada pela metade', 'Digite o preço de cada tamanho de Pizza Portuguesa', () =>
  criarVarios(U2, [
    { nome: 'Pizza Frango', tamanhos: [{ nome: 'P', preco: 30 }, { nome: 'G', preco: 50 }] },
    { nome: 'Pizza Portuguesa', tamanhos: [{ nome: 'P', preco: 0 }, { nome: 'G', preco: 50 }] },
  ]),
);
await ok('nada da lista com erro entrou', async () => {
  igual((await dono(U2, `select count(*)::int as n from public.produtos where nome = 'Pizza Frango'`))[0].n, 0, 'Pizza Frango');
});
await erro('tamanho repetido no mesmo produto', 'dois tamanhos com o nome', () =>
  criarVarios(U2, [{ nome: 'Açaí', tamanhos: [{ nome: '300 ml', preco: 10 }, { nome: '300 ML', preco: 12 }] }]),
);
await erro('produto sem tamanho precisa de preço', 'Digite o preço de Pastel', () => criarVarios(U2, [{ nome: 'Pastel' }]));

await ok('versão do banco igual à que o site espera', async () => {
  const [{ v }] = await como('anon', null, 'select public.versao_do_banco() as v');
  const { VERSAO_DO_BANCO } = await import('../../src/lib/versaoDoBanco.js');
  igual(v, VERSAO_DO_BANCO, 'versão');
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nTudo certo');
