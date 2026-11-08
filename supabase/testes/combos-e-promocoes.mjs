// Combos (partes fixas e à escolha, acréscimo, meio a meio dentro do combo,
// preço dividido entre as partes, esgotado, edição) e promoções por dia e
// horário (passando da meia-noite, pausa, edição depois que acabou), no mesmo
// Postgres local (PGlite) dos outros testes.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Uso: npm run test:banco (ou node combos-e-promocoes.mjs caminho/do/schema.sql)
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
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanches da Ana"}');
  insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Lanches da Bia"}');
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
const salvarCombo = async (u, id, nome, preco, partes) =>
  (await dono(u, 'select public.salvar_combo($1, $2, $3, $4::jsonb) as id', [id, nome, preco, JSON.stringify(partes)]))[0].id;
const salvarPromocao = async (u, id, nome, dias, inicio, fim, itens) =>
  (
    await dono(u, 'select public.salvar_promocao($1, $2, $3::int[], $4::time, $5::time, $6::jsonb) as id', [
      id,
      nome,
      dias,
      inicio,
      fim,
      JSON.stringify(itens),
    ])
  )[0].id;
const itensDo = (pedidoId) =>
  db
    .query(
      `select p.nome, i.quantidade, i.preco_unitario::float as preco, i.custo_unitario::float as custo, i.combo_nome,
              i.combo_parte, i.combo_grupo, i.tamanho, i.segundo_sabor, i.promocao, i.promocao_id, i.preco_cheio::float as cheio
       from public.itens_pedido i join public.produtos p on p.id = i.produto_id
       where i.pedido_id = $1 order by i.combo_grupo nulls first, i.combo_parte, p.nome`,
      [pedidoId],
    )
    .then((r) => r.rows);
const somar = (itens) => Math.round(itens.reduce((s, i) => s + i.quantidade * i.preco, 0) * 100) / 100;

const negocio1 = (await db.query(`select negocio_id from public.usuarios where id = '${U1}'`)).rows[0].negocio_id;
const negocio2 = (await db.query(`select negocio_id from public.usuarios where id = '${U2}'`)).rows[0].negocio_id;

let burguer, batata, coca, suco, calabresa, portuguesa, alheia;
const t = {};
await ok('produtos', async () => {
  const r = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, custo, vai_para_cozinha, meio_a_meio) values
       ($1, 'X-Burguer', 20, 8, true, false), ($1, 'Batata', 12, 3, true, false),
       ($1, 'Coca', 6, 2, false, false), ($1, 'Suco', 8, 3, false, false),
       ($1, 'Pizza Calabresa', 1, null, true, true), ($1, 'Pizza Portuguesa', 1, null, true, true)
     returning id`,
    [negocio1],
  );
  [burguer, batata, coca, suco, calabresa, portuguesa] = r.map((p) => p.id);
  t.calabresa = Object.fromEntries((await salvarTamanhos(U1, calabresa, [{ nome: 'M', preco: 45, custo: 12 }, { nome: 'G', preco: 55, custo: 16 }])).map((x) => [x.nome, x.id]));
  t.portuguesa = Object.fromEntries((await salvarTamanhos(U1, portuguesa, [{ nome: 'm', preco: 48, custo: 14 }, { nome: 'g', preco: 60, custo: 21 }])).map((x) => [x.nome, x.id]));
  [{ id: alheia }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'Alheia', 10) returning id`, [negocio2]);
  await dono(U1, `select public.configurar_meio_a_meio('media')`);
});

// ---------------------------------------------------------------------------
// Cadastro do combo
// ---------------------------------------------------------------------------
const fixa = (produto_id, tamanho_id = null) => ({ opcoes: [{ produto_id, tamanho_id }] });
const casal = () => [
  fixa(burguer),
  fixa(burguer),
  fixa(batata),
  { nome: 'Bebida', opcoes: [{ produto_id: coca }, { produto_id: suco, acrescimo: 2 }] },
];

await erro('combo sem nome', 'Digite o nome do combo', () => salvarCombo(U1, null, '  ', 30, casal()));
await erro('combo abaixo de R$ 1,00', 'pelo menos R$ 1,00', () => salvarCombo(U1, null, 'Combo', 0.99, casal()));
await erro('combo com uma parte só', 'de 2 a 12 partes', () => salvarCombo(U1, null, 'Combo', 30, [fixa(burguer)]));
await erro('combo com 13 partes', 'de 2 a 12 partes', () => salvarCombo(U1, null, 'Combo', 30, Array.from({ length: 13 }, () => fixa(burguer))));
await erro('parte sem opção', 'de 1 a 20 opções', () => salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), { opcoes: [] }]));
await erro('produto de outro negócio', 'Um dos produtos do combo foi excluído', () => salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), fixa(alheia)]));
await erro('produto com tamanhos sem dizer o tamanho', 'Escolha o tamanho de Pizza Calabresa no combo', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), fixa(calabresa)]),
);
await erro('tamanho de outro produto', 'Um dos tamanhos de Pizza Calabresa saiu do cardápio', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), fixa(calabresa, t.portuguesa.g)]),
);
await erro('tamanho em produto de preço único', 'Um dos tamanhos de X-Burguer saiu do cardápio', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer, t.calabresa.G), fixa(batata)]),
);
await erro('acréscimo em parte fixa', 'Só as opções à escolha podem ter acréscimo', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), { opcoes: [{ produto_id: batata, acrescimo: 1 }] }]),
);
await erro('acréscimo negativo', 'O acréscimo precisa ficar entre', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), { opcoes: [{ produto_id: coca }, { produto_id: suco, acrescimo: -1 }] }]),
);
await erro('a mesma opção duas vezes na parte', 'Coca aparece duas vezes', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), { opcoes: [{ produto_id: coca }, { produto_id: coca }] }]),
);
await erro('parte em formato errado', 'Parte do combo inválida', () =>
  salvarCombo(U1, null, 'Combo', 30, [fixa(burguer), { opcoes: [{ produto_id: 5 }] }]),
);
await erro('quem não está ligado a um negócio', 'não está ligada a um negócio', () =>
  como('authenticated', randomUUID(), `select public.salvar_combo(null, 'X', 30, '[]'::jsonb)`),
);
await erro('sem login não salva combo', 'permission denied', () => como('anon', null, `select public.salvar_combo(null, 'X', 30, '[]'::jsonb)`));

let comboCasal, comboPizza;
await ok('salva o combo com partes fixas e à escolha', async () => {
  comboCasal = await salvarCombo(U1, null, '  Combo   Casal ', 50, casal());
  const partes = await dono(
    U1,
    `select cp.ordem, cp.nome, count(o.*)::int as opcoes, sum(o.acrescimo)::float as acrescimos
     from public.combo_partes cp join public.combo_opcoes o on o.parte_id = cp.id
     where cp.combo_id = $1 group by cp.ordem, cp.nome order by cp.ordem`,
    [comboCasal],
  );
  igual(partes, [
    { ordem: 0, nome: null, opcoes: 1, acrescimos: 0 },
    { ordem: 1, nome: null, opcoes: 1, acrescimos: 0 },
    { ordem: 2, nome: null, opcoes: 1, acrescimos: 0 },
    { ordem: 3, nome: 'Bebida', opcoes: 2, acrescimos: 2 },
  ], 'partes');
  const [{ nome }] = await dono(U1, 'select nome from public.combos where id = $1', [comboCasal]);
  igual(nome, 'Combo Casal', 'nome sem espaços sobrando');
});
await erro('dois combos com o mesmo nome', 'Já existe um combo chamado combo casal', () => salvarCombo(U1, null, 'combo casal', 40, casal()));
await ok('salvar de novo com o mesmo nome (editar) pode', async () => {
  igual(await salvarCombo(U1, comboCasal, 'Combo Casal', 50, casal()), comboCasal, 'mesmo id');
});
await ok('combo de pizza G com refri', async () => {
  comboPizza = await salvarCombo(U1, null, 'Pizza + Coca', 60, [
    { nome: 'Pizza G', opcoes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G }, { produto_id: portuguesa, tamanho_id: t.portuguesa.g }] },
    fixa(coca),
  ]);
});
await ok('outro negócio não vê nem mexe no combo', async () => {
  igual((await dono(U2, 'select id from public.combos')).length, 0, 'combos vistos');
  igual((await dono(U2, 'select id from public.combo_opcoes')).length, 0, 'opções vistas');
  await dono(U2, 'update public.combos set arquivado = true where id = $1', [comboCasal]);
  const [{ arquivado }] = await dono(U1, 'select arquivado from public.combos where id = $1', [comboCasal]);
  igual(arquivado, false, 'continua no cardápio');
});
await erro('outro negócio não edita o combo', 'Este combo foi excluído', () => salvarCombo(U2, comboCasal, 'Meu', 10, [fixa(alheia), fixa(alheia)]));
await erro('ninguém escreve direto nas partes', 'permission denied', () =>
  dono(U1, `insert into public.combo_partes (combo_id, negocio_id, ordem) values ($1, $2, 5)`, [comboCasal, negocio1]),
);
await erro('nem muda o preço do combo direto', 'permission denied', () => dono(U1, 'update public.combos set preco = 1 where id = $1', [comboCasal]));

// ---------------------------------------------------------------------------
// Combo no pedido
// ---------------------------------------------------------------------------
const pedidoDoCasal = (bebida, quantidade = 1) => ({
  combo_id: comboCasal,
  quantidade,
  partes: [{ produto_id: burguer }, { produto_id: burguer }, { produto_id: batata }, { produto_id: bebida }],
});

let pedidoCasal;
await ok('cada parte vira um item, com o preço do combo dividido pelo preço normal', async () => {
  pedidoCasal = await pedir(U1, [pedidoDoCasal(coca, 2)]);
  const itens = await itensDo(pedidoCasal.id);
  igual(itens.map((i) => [i.nome, i.quantidade, i.preco, i.custo, i.combo_nome, i.combo_parte]), [
    // 20 + 20 + 12 + 6 = 58. 50 × 20/58 = 17,24 (+ o centavo que sobrou, na mais cara).
    ['X-Burguer', 2, 17.25, 8, 'Combo Casal', 0],
    ['X-Burguer', 2, 17.24, 8, 'Combo Casal', 1],
    ['Batata', 2, 10.34, 3, 'Combo Casal', 2],
    ['Coca', 2, 5.17, 2, 'Combo Casal', 3],
  ], 'itens');
  igual(new Set(itens.map((i) => i.combo_grupo)).size, 1, 'um grupo só');
  igual(somar(itens), 100, 'total = 2 × 50');
  igual(pedidoCasal.status, 'pendente', 'tem o que preparar');
});
await ok('opção com acréscimo soma no item dela', async () => {
  const p = await pedir(U1, [pedidoDoCasal(suco)]);
  const itens = await itensDo(p.id);
  // 20 + 20 + 12 + 8 = 60: 16,67 16,67 10 6,67 = 50,01, o centavo a mais sai da primeira.
  igual(itens.map((i) => i.preco), [16.66, 16.67, 10, 8.67], 'preços');
  igual(somar(itens), 52, '50 + 2 do suco');
});
await ok('dois combos iguais no mesmo pedido são dois grupos', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca), pedidoDoCasal(suco), { produto_id: batata, quantidade: 1 }]);
  const itens = await itensDo(p.id);
  igual(itens.length, 9, 'itens');
  igual(new Set(itens.filter((i) => i.combo_grupo).map((i) => i.combo_grupo)).size, 2, 'grupos');
  igual(itens[0], { ...itens[0], nome: 'Batata', preco: 12, combo_nome: null, combo_parte: null }, 'batata avulsa no preço normal');
});
await ok('combo só com bebida e o que sai pronto nasce pronto', async () => {
  const soBebida = await salvarCombo(U1, null, 'Dupla de bebidas', 12, [fixa(coca), fixa(suco)]);
  const p = await pedir(U1, [{ combo_id: soBebida, quantidade: 1, partes: [{ produto_id: coca }, { produto_id: suco }] }]);
  igual(p.status, 'pronto', 'status');
  await dono(U1, 'update public.combos set arquivado = true where id = $1', [soBebida]);
});

await erro('faltou uma parte', 'O combo Combo Casal mudou no cardápio', () =>
  pedir(U1, [{ combo_id: comboCasal, quantidade: 1, partes: [{ produto_id: burguer }, { produto_id: burguer }, { produto_id: batata }] }]),
);
await erro('opção que não é daquela parte', 'O combo Combo Casal mudou no cardápio', () =>
  pedir(U1, [{ combo_id: comboCasal, quantidade: 1, partes: [{ produto_id: suco }, { produto_id: burguer }, { produto_id: batata }, { produto_id: coca }] }]),
);
await erro('combo de outro negócio', 'Um dos combos saiu do cardápio', () => pedir(U2, [pedidoDoCasal(coca)]));
await erro('combo em formato errado', 'Item do pedido inválido', () => pedir(U1, [{ combo_id: comboCasal, quantidade: 1, partes: 'tudo' }]));
await erro('quantidade do combo fora do limite', 'A quantidade precisa ficar entre 1 e 999', () => pedir(U1, [pedidoDoCasal(coca, 1000)]));
await ok('parte fixa esgotada: o combo não entra', async () => {
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [batata]);
  await erro('  batata esgotada', 'No combo Combo Casal, Batata esgotou', () => pedir(U1, [pedidoDoCasal(coca)]));
  await dono(U1, 'update public.produtos set disponivel = true where id = $1', [batata]);
});
await ok('opção esgotada: só ela não entra, as outras sim', async () => {
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [coca]);
  await erro('  coca esgotada', 'No combo Combo Casal, Coca esgotou', () => pedir(U1, [pedidoDoCasal(coca)]));
  await pedir(U1, [pedidoDoCasal(suco)]);
  await dono(U1, 'update public.produtos set disponivel = true where id = $1', [coca]);
});
await ok('combo desligado (esgotado) não entra', async () => {
  await dono(U1, 'update public.combos set disponivel = false where id = $1', [comboCasal]);
  await erro('  combo esgotado', 'O combo Combo Casal esgotou', () => pedir(U1, [pedidoDoCasal(coca)]));
  await dono(U1, 'update public.combos set disponivel = true where id = $1', [comboCasal]);
});
await ok('tamanho esgotado na parte', async () => {
  await dono(U1, 'update public.produto_tamanhos set disponivel = false where id = $1', [t.calabresa.G]);
  await erro('  G esgotada', 'No combo Pizza + Coca, Pizza Calabresa G esgotou', () =>
    pedir(U1, [{ combo_id: comboPizza, quantidade: 1, partes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G }, { produto_id: coca }] }]),
  );
  await dono(U1, 'update public.produto_tamanhos set disponivel = true where id = $1', [t.calabresa.G]);
});

// ---------------------------------------------------------------------------
// Meio a meio dentro do combo
// ---------------------------------------------------------------------------
await ok('pizza G meio a meio no combo: o preço do combo não muda', async () => {
  const p = await pedir(U1, [
    { combo_id: comboPizza, quantidade: 1, partes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa }, { produto_id: coca }] },
  ]);
  const itens = await itensDo(p.id);
  // Base da pizza: (55 + 60) / 2 = 57,5. 60 × 57,5 / 63,5 = 54,33; coca 5,67.
  igual(itens.map((i) => [i.nome, i.tamanho, i.segundo_sabor, i.preco, i.custo]), [
    ['Pizza Calabresa', 'G', 'Pizza Portuguesa', 54.33, 18.5],
    ['Coca', null, null, 5.67, 2],
  ], 'itens');
  igual(somar(itens), 60, 'total');
});
await erro('a outra metade precisa ser opção da mesma parte', 'precisam ser opções da mesma parte e do mesmo tamanho', () =>
  pedir(U1, [{ combo_id: comboPizza, quantidade: 1, partes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: burguer }, { produto_id: coca }] }]),
);
await erro('o mesmo sabor nas duas metades', 'Escolha dois sabores diferentes', () =>
  pedir(U1, [{ combo_id: comboPizza, quantidade: 1, partes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: calabresa }, { produto_id: coca }] }]),
);
await ok('sabor desmarcado do meio a meio não entra como metade', async () => {
  await dono(U1, 'update public.produtos set meio_a_meio = false where id = $1', [portuguesa]);
  await erro('  desmarcado', 'Pizza Portuguesa não pode ser meio a meio', () =>
    pedir(U1, [{ combo_id: comboPizza, quantidade: 1, partes: [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa }, { produto_id: coca }] }]),
  );
  await dono(U1, 'update public.produtos set meio_a_meio = true where id = $1', [portuguesa]);
});

// ---------------------------------------------------------------------------
// Edição do pedido com combo
// ---------------------------------------------------------------------------
await ok('editar: o mesmo combo com as mesmas escolhas mantém o preço, mesmo com o combo mudado', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca)]);
  await salvarCombo(U1, comboCasal, 'Combo Casal', 70, casal());
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [batata]);
  const editado = await editar(U1, p, [pedidoDoCasal(coca, 3), { produto_id: coca, quantidade: 1 }]);
  const itens = await itensDo(editado.id);
  igual(itens.map((i) => [i.nome, i.quantidade, i.preco]), [
    ['Coca', 1, 6],
    ['X-Burguer', 3, 17.25],
    ['X-Burguer', 3, 17.24],
    ['Batata', 3, 10.34],
    ['Coca', 3, 5.17],
  ], 'itens');
  igual(itens[1].combo_nome, 'Combo Casal', 'nome do combo');
  await dono(U1, 'update public.produtos set disponivel = true where id = $1', [batata]);
});
await ok('editar: trocar a bebida é combo novo, com o preço de hoje', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca)]);
  const editado = await editar(U1, p, [pedidoDoCasal(suco)]);
  igual(somar(await itensDo(editado.id)), 72, '70 de hoje + 2 do suco');
});
await ok('editar: combo excluído depois continua no pedido que já tinha', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca)]);
  await dono(U1, 'update public.combos set arquivado = true where id = $1', [comboCasal]);
  await erro('  combo novo não entra', 'O combo Combo Casal saiu do cardápio', () => pedir(U1, [pedidoDoCasal(coca)]));
  const editado = await editar(U1, p, [pedidoDoCasal(coca, 2)]);
  igual(somar(await itensDo(editado.id)), 140, '2 × 70');
  await dono(U1, 'update public.combos set arquivado = false where id = $1', [comboCasal]);
});
await ok('editar: o item avulso não pega o preço da parte do combo', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca)]);
  const editado = await editar(U1, p, [pedidoDoCasal(coca), { produto_id: burguer, quantidade: 1 }]);
  const avulso = (await itensDo(editado.id)).find((i) => !i.combo_nome);
  igual([avulso.nome, avulso.preco], ['X-Burguer', 20], 'avulso no preço normal');
});
await ok('a cozinha marca que faltou uma parte do combo', async () => {
  const p = await pedir(U1, [pedidoDoCasal(coca)]);
  const [{ id }] = await db.query(`select id from public.itens_pedido where pedido_id = $1 and combo_parte = 2`, [p.id]).then((r) => r.rows);
  await dono(U1, 'select public.marcar_item_faltou($1, true)', [id]);
  const [{ faltou }] = await db.query('select faltou from public.itens_pedido where id = $1', [id]).then((r) => r.rows);
  igual(faltou, true, 'faltou');
});

// ---------------------------------------------------------------------------
// Promoções: quando valem
// ---------------------------------------------------------------------------
// 10/11/2026 é terça; 13/11, sexta; 14/11, sábado.
const vale = async (dias, inicio, fim, quando) =>
  (await db.query('select public.promocao_vale($1::smallint[], $2::time, $3::time, 5, $4::timestamptz) as v', [dias, inicio, fim, quando])).rows[0].v;
await ok('dia todo: o dia de trabalho inteiro, até as 5h do dia seguinte', async () => {
  igual(await vale([2], null, null, '2026-11-10T12:00:00-03:00'), true, 'terça ao meio-dia');
  igual(await vale([2], null, null, '2026-11-11T03:00:00-03:00'), true, 'quarta às 3h ainda é terça');
  igual(await vale([2], null, null, '2026-11-11T05:00:00-03:00'), false, 'quarta às 5h já é quarta');
  igual(await vale([2], null, null, '2026-11-10T04:59:00-03:00'), false, 'terça às 4h59 ainda é segunda');
});
await ok('happy hour das 17h às 19h, de segunda a sexta', async () => {
  const semana = [1, 2, 3, 4, 5];
  igual(await vale(semana, '17:00', '19:00', '2026-11-10T17:00:00-03:00'), true, '17h');
  igual(await vale(semana, '17:00', '19:00', '2026-11-10T18:59:59-03:00'), true, '18h59');
  igual(await vale(semana, '17:00', '19:00', '2026-11-10T19:00:00-03:00'), false, '19h já acabou');
  igual(await vale(semana, '17:00', '19:00', '2026-11-10T16:59:00-03:00'), false, '16h59');
  igual(await vale(semana, '17:00', '19:00', '2026-11-14T18:00:00-03:00'), false, 'sábado');
});
await ok('sexta das 22h às 2h: passa da meia-noite', async () => {
  igual(await vale([5], '22:00', '02:00', '2026-11-13T23:00:00-03:00'), true, 'sexta 23h');
  igual(await vale([5], '22:00', '02:00', '2026-11-14T01:30:00-03:00'), true, 'sábado 1h30');
  igual(await vale([5], '22:00', '02:00', '2026-11-14T02:00:00-03:00'), false, 'sábado 2h');
  igual(await vale([5], '22:00', '02:00', '2026-11-13T21:59:00-03:00'), false, 'sexta 21h59');
  igual(await vale([5], '22:00', '02:00', '2026-11-14T23:00:00-03:00'), false, 'sábado 23h');
  igual(await vale([5], '22:00', '02:00', '2026-11-13T01:00:00-03:00'), false, 'sexta 1h é a noite de quinta');
});
await ok('o horário é o de Fortaleza, venha o instante de onde vier', async () => {
  igual(await vale([1, 2, 3, 4, 5], '17:00', '19:00', '2026-11-10T20:30:00Z'), true, '20h30 UTC = 17h30');
});
await ok('quando o aparelho fez o pedido: até 12 horas atrás', async () => {
  const momento = async (item) => (await db.query('select public.momento_da_promocao($1::jsonb) as m, now() as agora', [JSON.stringify(item)])).rows[0];
  const antes = new Date(Date.now() - 2 * 3600000).toISOString();
  const r1 = await momento({ promocao_em: antes });
  igual(new Date(r1.m).toISOString(), antes, '2 horas atrás vale');
  const r2 = await momento({ promocao_em: new Date(Date.now() - 13 * 3600000).toISOString() });
  igual(r2.m.getTime(), r2.agora.getTime(), '13 horas atrás: agora');
  const r3 = await momento({ promocao_em: 'ontem' });
  igual(r3.m.getTime(), r3.agora.getTime(), 'texto errado: agora');
  const r4 = await momento({ promocao_em: new Date(Date.now() + 3600000).toISOString() });
  igual(r4.m.getTime(), r4.agora.getTime(), 'no futuro: agora');
  const r5 = await momento({});
  igual(r5.m.getTime(), r5.agora.getTime(), 'sem: agora');
});

// ---------------------------------------------------------------------------
// Promoções: cadastro
// ---------------------------------------------------------------------------
const todos = [0, 1, 2, 3, 4, 5, 6];
await erro('promoção sem nome', 'Digite o nome da promoção', () => salvarPromocao(U1, null, ' ', todos, null, null, [{ produto_id: burguer, preco: 15 }]));
await erro('sem dia', 'Escolha pelo menos um dia', () => salvarPromocao(U1, null, 'P', [], null, null, [{ produto_id: burguer, preco: 15 }]));
await erro('dia que não existe', 'Escolha pelo menos um dia', () => salvarPromocao(U1, null, 'P', [7], null, null, [{ produto_id: burguer, preco: 15 }]));
await erro('só a hora de começar', 'Diga a hora de começar e a de terminar', () => salvarPromocao(U1, null, 'P', todos, '17:00', null, [{ produto_id: burguer, preco: 15 }]));
await erro('começa e termina na mesma hora', 'precisa ser diferente', () => salvarPromocao(U1, null, 'P', todos, '17:00', '17:00', [{ produto_id: burguer, preco: 15 }]));
await erro('começa antes das 5h', 'precisa começar a partir das 5h', () => salvarPromocao(U1, null, 'P', todos, '03:00', '06:00', [{ produto_id: burguer, preco: 15 }]));
await erro('passa da meia-noite e vai além das 5h', 'pode ir até as 5h', () => salvarPromocao(U1, null, 'P', todos, '22:00', '06:00', [{ produto_id: burguer, preco: 15 }]));
await erro('sem itens', 'de 1 a 50 itens', () => salvarPromocao(U1, null, 'P', todos, null, null, []));
await erro('preço igual ao normal', 'O preço de X-Burguer na promoção precisa ser menor que o normal (R$ 20,00)', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: burguer, preco: 20 }]),
);
await erro('preço zero', 'Digite o preço de X-Burguer na promoção', () => salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: burguer, preco: 0 }]));
await erro('produto com tamanhos sem dizer o tamanho', 'Escolha o tamanho de Pizza Calabresa na promoção', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: calabresa, preco: 10 }]),
);
await erro('tamanho com preço acima do normal', 'O preço de Pizza Calabresa (G) na promoção precisa ser menor que o normal (R$ 55,00)', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, preco: 56 }]),
);
await erro('o mesmo item duas vezes', 'X-Burguer aparece duas vezes', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: burguer, preco: 15 }, { produto_id: burguer, preco: 14 }]),
);
await erro('combo abaixo de R$ 1,00 na promoção', 'precisa ser de pelo menos R$ 1,00', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ combo_id: comboCasal, preco: 0.5 }]),
);
await erro('produto de outro negócio', 'Um dos produtos da promoção foi excluído', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: alheia, preco: 5 }]),
);
await erro('produto e combo no mesmo item', 'Item da promoção inválido', () =>
  salvarPromocao(U1, null, 'P', todos, null, null, [{ produto_id: burguer, combo_id: comboCasal, preco: 5 }]),
);
await erro('sem login não salva promoção', 'permission denied', () =>
  como('anon', null, `select public.salvar_promocao(null, 'P', '{1}', null, null, '[]'::jsonb)`),
);

// ---------------------------------------------------------------------------
// Promoções no pedido
// ---------------------------------------------------------------------------
let promocao;
await ok('promoção que vale agora: o item sai pelo preço dela e guarda o normal', async () => {
  promocao = await salvarPromocao(U1, null, 'Semana do lanche', [6, 0, 1, 2, 3, 4, 5, 5], null, null, [
    { produto_id: burguer, preco: 15 },
    { produto_id: calabresa, tamanho_id: t.calabresa.G, preco: 45 },
    { combo_id: comboCasal, preco: 60 },
  ]);
  const [{ dias }] = await dono(U1, 'select dias from public.promocoes where id = $1', [promocao]);
  igual(dias, todos, 'dias sem repetir e em ordem');
  const p = await pedir(U1, [{ produto_id: burguer, quantidade: 2 }, { produto_id: batata, quantidade: 1 }]);
  const itens = await itensDo(p.id);
  igual(itens.map((i) => [i.nome, i.preco, i.cheio, i.promocao]), [
    ['Batata', 12, null, null],
    ['X-Burguer', 15, 20, 'Semana do lanche'],
  ], 'itens');
});
await ok('combo na promoção: o preço dela é que se divide, e o normal fica guardado', async () => {
  const itens = await itensDo((await pedir(U1, [pedidoDoCasal(suco)])).id);
  igual(somar(itens), 62, '60 + 2 do suco');
  igual(Math.round(itens.reduce((s, i) => s + i.cheio, 0) * 100) / 100, 72, 'sem a promoção: 70 + 2');
  igual(new Set(itens.map((i) => i.promocao)), new Set(['Semana do lanche']), 'promoção');
  igual(itens.every((i) => i.promocao === 'Semana do lanche'), true, 'todas as partes');
});
await ok('meio a meio: a metade em promoção entra pelo preço dela', async () => {
  const p = await pedir(U1, [{ produto_id: calabresa, tamanho_id: t.calabresa.G, segundo_produto_id: portuguesa, quantidade: 1 }]);
  const [item] = await itensDo(p.id);
  // Média: (45 + 60) / 2 = 52,5; sem a promoção, (55 + 60) / 2 = 57,5.
  igual([item.preco, item.cheio, item.promocao], [52.5, 57.5, 'Semana do lanche'], 'item');
});
await ok('a promoção mais barata ganha quando duas valem juntas', async () => {
  const outra = await salvarPromocao(U1, null, 'Relâmpago', todos, null, null, [{ produto_id: burguer, preco: 13 }]);
  const [item] = await itensDo((await pedir(U1, [{ produto_id: burguer, quantidade: 1 }])).id);
  igual([item.preco, item.promocao], [13, 'Relâmpago'], 'item');
  await dono(U1, 'delete from public.promocoes where id = $1', [outra]);
});
await ok('promoção que não vale nesta hora não muda o preço', async () => {
  // Um dia que não é hoje (no dia de trabalho de Fortaleza).
  const [{ hoje }] = (await db.query(`select extract(dow from (now() at time zone 'America/Fortaleza') - interval '5 hours')::int as hoje`)).rows;
  const fora = await salvarPromocao(U1, null, 'Outro dia', [(hoje + 3) % 7], null, null, [{ produto_id: batata, preco: 9 }]);
  const [item] = await itensDo((await pedir(U1, [{ produto_id: batata, quantidade: 1 }])).id);
  igual([item.preco, item.promocao], [12, null], 'batata normal');
  await dono(U1, 'delete from public.promocoes where id = $1', [fora]);
});
await ok('preço normal que caiu abaixo da promoção: vale o mais barato', async () => {
  await dono(U1, 'update public.produtos set preco = 14 where id = $1', [burguer]);
  const [item] = await itensDo((await pedir(U1, [{ produto_id: burguer, quantidade: 1 }])).id);
  igual([item.preco, item.promocao, item.cheio], [14, null, null], 'normal');
  await dono(U1, 'update public.produtos set preco = 20 where id = $1', [burguer]);
});

let pedidoNaPromocao;
await ok('pausar: volta ao preço normal na hora', async () => {
  pedidoNaPromocao = await pedir(U1, [{ produto_id: burguer, quantidade: 1 }]);
  await dono(U1, 'update public.promocoes set ativa = false where id = $1', [promocao]);
  const [item] = await itensDo((await pedir(U1, [{ produto_id: burguer, quantidade: 1 }])).id);
  igual([item.preco, item.promocao], [20, null], 'normal');
});
await ok('editar depois que a promoção acabou: o que já estava mantém o preço dela', async () => {
  const editado = await editar(U1, pedidoNaPromocao, [{ produto_id: burguer, quantidade: 3 }, { produto_id: batata, quantidade: 1 }]);
  const itens = await itensDo(editado.id);
  igual(itens.map((i) => [i.nome, i.quantidade, i.preco, i.promocao]), [
    ['Batata', 1, 12, null],
    ['X-Burguer', 3, 15, 'Semana do lanche'],
  ], 'itens');
});
await ok('apagar a promoção: os pedidos guardam o nome dela', async () => {
  await dono(U1, 'delete from public.promocoes where id = $1', [promocao]);
  const itens = await itensDo(pedidoNaPromocao.id);
  const burg = itens.find((i) => i.nome === 'X-Burguer');
  igual([burg.promocao, burg.promocao_id, burg.preco], ['Semana do lanche', null, 15], 'item');
  const [{ alterado_em }] = await db.query('select alterado_em from public.pedidos where id = $1', [pedidoNaPromocao.id]).then((r) => r.rows);
  const deNovo = await editar(U1, { ...pedidoNaPromocao, alterado_em }, [{ produto_id: burguer, quantidade: 1 }]);
  const [item] = await itensDo(deNovo.id);
  igual([item.preco, item.promocao], [15, 'Semana do lanche'], 'editar de novo mantém');
});
await ok('happy hour guardado sem internet sai com o preço combinado', async () => {
  // Uma promoção que valeu de 3 a 2 horas atrás (no relógio de Fortaleza).
  const agora = new Date();
  const hora = (h) => {
    const d = new Date(agora.getTime() - h * 3600000);
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Fortaleza' }).format(d);
  };
  const inicio = hora(3);
  // Só testa quando a janela cai no mesmo dia de trabalho, depois das 5h.
  if (inicio < '05:00' || hora(2) < inicio) return console.log('      (pulado: perto da virada do dia)');
  const id = await salvarPromocao(U1, null, 'Happy hour', todos, inicio, hora(2), [{ produto_id: suco, preco: 5 }]);
  const quando = new Date(agora.getTime() - 2.5 * 3600000).toISOString();
  const [guardado] = await itensDo((await pedir(U1, [{ produto_id: suco, quantidade: 1, promocao_em: quando }])).id);
  igual([guardado.preco, guardado.promocao], [5, 'Happy hour'], 'feito na promoção');
  const [agoraItem] = await itensDo((await pedir(U1, [{ produto_id: suco, quantidade: 1 }])).id);
  igual(agoraItem.preco, 8, 'feito agora');
  await dono(U1, 'delete from public.promocoes where id = $1', [id]);
});
await ok('outro negócio não vê, não pausa e não apaga a promoção', async () => {
  const id = await salvarPromocao(U1, null, 'Só da Ana', todos, null, null, [{ produto_id: batata, preco: 10 }]);
  igual((await dono(U2, 'select id from public.promocoes')).length, 0, 'vistas');
  igual((await dono(U2, 'select id from public.promocao_itens')).length, 0, 'itens vistos');
  await dono(U2, 'update public.promocoes set ativa = false where id = $1', [id]);
  await dono(U2, 'delete from public.promocoes where id = $1', [id]);
  const [{ ativa }] = await dono(U1, 'select ativa from public.promocoes where id = $1', [id]);
  igual(ativa, true, 'continua ligada');
});
await erro('outro negócio não edita a promoção', 'Esta promoção foi apagada', async () => {
  const [{ id }] = await dono(U1, `select id from public.promocoes where nome = 'Só da Ana'`);
  await salvarPromocao(U2, id, 'Minha', todos, null, null, [{ produto_id: alheia, preco: 5 }]);
});
await erro('ninguém muda o preço da promoção direto', 'permission denied', () => dono(U1, 'update public.promocao_itens set preco = 1'));
await erro('combo excluído não entra na promoção', 'Um dos combos da promoção foi excluído', async () => {
  const id = await salvarCombo(U1, null, 'Combo velho', 30, [fixa(burguer), fixa(batata)]);
  await dono(U1, 'update public.combos set arquivado = true where id = $1', [id]);
  await salvarPromocao(U1, null, 'P', todos, null, null, [{ combo_id: id, preco: 20 }]);
});

await ok('versão do banco igual à que o site espera', async () => {
  const [{ v }] = await como('anon', null, 'select public.versao_do_banco() as v');
  const { VERSAO_DO_BANCO } = await import('../../src/lib/versaoDoBanco.js');
  igual(v, VERSAO_DO_BANCO, 'versão');
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
