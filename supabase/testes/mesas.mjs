// Mesas: quantas mesas e a taxa de serviço, mesa extra com nome, passar ou
// juntar mesas, fechar a conta (um pagou, dividiram, pagaram separado) e
// desfazer o recebimento.
// Uso: npm run test:banco (ou node mesas.mjs caminho/do/schema.sql)
import { prepararBanco, U1, U2 } from './ajuda.mjs';

const { db, dono, negocioDe, ok, erro, igual, terminar } = await prepararBanco(process.argv[2]);
const negocio1 = await negocioDe(U1);
const negocio2 = await negocioDe(U2);

// ---------------------------------------------------------------------------
// Quantas mesas e a taxa de serviço
// ---------------------------------------------------------------------------
await ok('negócio novo ainda não respondeu as mesas nem a taxa', async () => {
  const [n] = await dono(U1, 'select quantidade_mesas, taxa_servico from public.negocios');
  igual([n.quantidade_mesas, n.taxa_servico], [null, null], 'respostas');
});

await ok('dono responde 8 mesas e 10% de serviço', async () => {
  await dono(U1, 'select public.configurar_mesas(8, 10)');
  const [n] = await dono(U1, 'select quantidade_mesas, taxa_servico from public.negocios');
  igual([n.quantidade_mesas, n.taxa_servico], [8, 10], 'respostas');
});

await ok('"não cobro" fica salvo como 0%', async () => {
  await dono(U2, 'select public.configurar_mesas(5, 0)');
  const [n] = await dono(U2, 'select taxa_servico from public.negocios');
  igual(n.taxa_servico, 0, 'taxa');
});

await erro('nenhuma mesa', 'entre 1 e 200', () => dono(U1, 'select public.configurar_mesas(0, 10)'));
await erro('mesas demais', 'entre 1 e 200', () => dono(U1, 'select public.configurar_mesas(201, 10)'));
await erro('taxa acima de 30%', 'entre 0% e 30%', () => dono(U1, 'select public.configurar_mesas(8, 31)'));
await erro('taxa negativa', 'entre 0% e 30%', () => dono(U1, 'select public.configurar_mesas(8, -1)'));
await erro('só o dono muda as mesas', 'Só o dono', async () => {
  await db.query(`update public.usuarios set papel = 'atendente' where id = '${U2}'`);
  try {
    await dono(U2, 'select public.configurar_mesas(3, 0)');
  } finally {
    await db.query(`update public.usuarios set papel = 'admin' where id = '${U2}'`);
  }
});
await erro('ninguém escreve as mesas direto na tabela', 'permission denied', () =>
  dono(U1, 'update public.negocios set quantidade_mesas = 50'),
);

// ---------------------------------------------------------------------------
// Pedidos nas mesas
// ---------------------------------------------------------------------------
let espeto, cerveja, pastelDaBia;
await ok('produtos', async () => {
  [{ id: espeto }, { id: cerveja }] = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, vai_para_cozinha) values
      ($1, 'Espeto de carne', 9, true), ($1, 'Cerveja', 7, false) returning id`,
    [negocio1],
  );
  [{ id: pastelDaBia }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'Pastel', 8) returning id`, [negocio2]);
});

let chave = 0;
const novaChave = () => `cccccccc-0000-4000-8000-${String(++chave).padStart(12, '0')}`;
const pedir = async (mesa, itens, nomeMesa = null, u = U1) =>
  (
    await dono(
      u,
      'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_mesa => $3, p_nome_mesa => $4)',
      [JSON.stringify(itens), novaChave(), mesa, nomeMesa],
    )
  )[0];
const fechar = async (ids, jeito, cobrar, pagamentos = null, u = U1) =>
  (
    await dono(u, 'select public.fechar_conta_mesa($1::uuid[], $2, $3, $4::jsonb) as id', [
      ids,
      jeito,
      cobrar,
      pagamentos && JSON.stringify(pagamentos),
    ])
  )[0].id;
const conta = async (id) =>
  (
    await dono(
      U1,
      `select mesa, nome_mesa, consumo::float8, taxa_servico, servico::float8, jeito,
         (select coalesce(json_agg(json_build_object('forma', forma, 'valor', valor::float8) order by valor desc, forma), '[]')
          from public.pagamentos_conta where conta_id = c.id) as partes
       from public.contas_mesa c where id = $1`,
      [id],
    )
  )[0];
const pedido = async (id) => (await dono(U1, 'select * from public.pedidos where id = $1', [id]))[0];

let m3a, m3b;
await ok('dois pedidos na mesa 3 (espeto e cerveja)', async () => {
  m3a = await pedir(3, [{ produto_id: espeto, quantidade: 2 }]);
  m3b = await pedir(3, [{ produto_id: cerveja, quantidade: 1 }]);
  igual([m3a.mesa, m3a.nome_mesa, m3b.status], [3, null, 'pronto'], 'pedidos');
});

let extra;
await ok('mesa extra guarda o nome, limpo', async () => {
  extra = await pedir(9, [{ produto_id: espeto, quantidade: 1 }], '  Varanda   do  fundo ');
  igual([extra.mesa, extra.nome_mesa], [9, 'Varanda do fundo'], 'mesa extra');
});

await ok('nome de mesa sem mesa não é gravado', async () => {
  const p = await dono(U1, 'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_nome_mesa => $3)', [
    JSON.stringify([{ produto_id: espeto, quantidade: 1 }]),
    novaChave(),
    'Varanda',
  ]);
  igual([p[0].mesa, p[0].nome_mesa], [null, null], 'balcão');
});

await erro('nome de mesa com mais de 20 letras', 'no máximo 20', () => pedir(10, [{ produto_id: espeto, quantidade: 1 }], 'x'.repeat(21)));

await ok('só existe uma versão de criar_pedido e de editar_pedido', async () => {
  const [{ n }] = await dono(U1, `select count(*)::int as n from pg_proc where proname in ('criar_pedido', 'editar_pedido')`);
  igual(n, 2, 'versões');
});

await ok('editar sem dizer o nome mantém o nome da mesa extra', async () => {
  const [e] = await dono(U1, 'select * from public.editar_pedido($1, $2::jsonb, null, 9)', [
    extra.id,
    JSON.stringify([{ produto_id: espeto, quantidade: 2 }]),
  ]);
  igual(e.nome_mesa, 'Varanda do fundo', 'nome');
  extra = e;
});

await ok('editar para o balcão apaga o nome da mesa', async () => {
  const p = await pedir(11, [{ produto_id: espeto, quantidade: 1 }], 'Calçada');
  const [e] = await dono(U1, 'select * from public.editar_pedido($1, $2::jsonb, null, null)', [p.id, JSON.stringify([{ produto_id: espeto, quantidade: 1 }])]);
  igual([e.mesa, e.nome_mesa], [null, null], 'balcão');
});

await ok('editar para outra mesa sem nome deixa a mesa sem nome', async () => {
  const p = await pedir(12, [{ produto_id: espeto, quantidade: 1 }], 'Calçada');
  const [e] = await dono(U1, 'select * from public.editar_pedido($1, $2::jsonb, null, 2)', [p.id, JSON.stringify([{ produto_id: espeto, quantidade: 1 }])]);
  igual([e.mesa, e.nome_mesa], [2, null], 'mesa 2');
  await dono(U1, `select public.cancelar_pedido($1, 'erro_lancamento')`, [p.id]);
});

// ---------------------------------------------------------------------------
// Passar para outra mesa e juntar mesas
// ---------------------------------------------------------------------------
await ok('passa a mesa 3 inteira para a mesa 5 (livre)', async () => {
  const [{ n }] = await dono(U1, 'select public.passar_mesa($1::uuid[], 5) as n', [[m3a.id, m3b.id]]);
  igual(n, 2, 'pedidos passados');
  const a = await pedido(m3a.id);
  igual(a.mesa, 5, 'mesa nova');
  if (a.alterado_em === m3a.alterado_em) throw new Error('alterado_em não mudou');
  m3a = a;
  m3b = await pedido(m3b.id);
});

await ok('editar com a versão antiga depois de passar a mesa é recusado', async () => {
  try {
    await dono(U1, 'select public.editar_pedido($1, $2::jsonb, null, 3)', [m3a.id, JSON.stringify([{ produto_id: espeto, quantidade: 1 }])]);
  } catch (e) {
    if (e.message.includes('Outra pessoa alterou')) return;
    throw e;
  }
  throw new Error('deveria recusar');
});

let m6;
await ok('junta a mesa extra na mesa 5 (as duas contas viram uma)', async () => {
  m6 = extra;
  const [{ n }] = await dono(U1, 'select public.passar_mesa($1::uuid[], 5) as n', [[extra.id]]);
  igual(n, 1, 'passados');
  const p = await pedido(extra.id);
  igual([p.mesa, p.nome_mesa], [5, null], 'na mesa 5, sem o nome da extra');
});

await erro('passar para mesa inválida', 'entre 1 e 999', () => dono(U1, 'select public.passar_mesa($1::uuid[], 0)', [[m3a.id]]));
await ok('pedido do balcão ou de outro negócio não é passado', async () => {
  const [p] = await dono(U1, 'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid)', [
    JSON.stringify([{ produto_id: espeto, quantidade: 1 }]),
    novaChave(),
  ]);
  const [{ n }] = await dono(U1, 'select public.passar_mesa($1::uuid[], 5) as n', [[p.id]]);
  igual(n, 0, 'balcão');
  const [{ n: n2 }] = await dono(U2, 'select public.passar_mesa($1::uuid[], 1) as n', [[m3a.id]]);
  igual(n2, 0, 'outro negócio');
});

// ---------------------------------------------------------------------------
// Fechar a conta
// ---------------------------------------------------------------------------
// Mesa 5: 2 espetos (18) + 1 cerveja (7) + 2 espetos da extra (18) = 43; 10% = 4,30.
let conta5;
await erro('soma das partes diferente do total', 'não bate', () =>
  fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true, [{ forma: 'pix', valor: 43 }]),
);
await erro('um pagou sem dizer a forma', 'Escolha como o cliente pagou', () => fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true));
await erro('forma inventada numa parte', 'Escolha como foi paga', () =>
  fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true, [{ forma: 'fiado', valor: 47.3 }]),
);
await erro('"cartão" antigo não serve na conta da mesa', 'Escolha como foi paga', () =>
  fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true, [{ forma: 'cartao', valor: 47.3 }]),
);
await erro('valor com mais de dois decimais', 'Valor inválido', () =>
  fechar([m3a.id, m3b.id, m6.id], 'dividiram', true, [
    { forma: 'pix', valor: 23.655 },
    { forma: 'pix', valor: 23.645 },
  ]),
);
await erro('valor que não é número', 'Valor inválido', () =>
  fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true, [{ forma: 'pix', valor: 'muito' }]),
);
await erro('jeito inventado', 'Escolha como pagaram', () => fechar([m3a.id], 'fiado', true));
await erro('pagaram separado não leva partes', 'não anote as partes', () =>
  fechar([m3a.id], 'separado', true, [{ forma: 'pix', valor: 19.8 }]),
);
await erro('pedidos de mesas diferentes', 'mesma mesa', async () => {
  const outra = await pedir(7, [{ produto_id: espeto, quantidade: 1 }]);
  await fechar([m3a.id, outra.id], 'separado', false);
});

await ok('dividiram em 3 com taxa: consumo e serviço calculados pelo banco', async () => {
  conta5 = await fechar([m3a.id, m3b.id, m6.id], 'dividiram', true, [
    { forma: 'pix', valor: 15.77 },
    { forma: 'dinheiro', valor: 15.77 },
    { forma: 'credito', valor: 15.76 },
  ]);
  const c = await conta(conta5);
  igual([c.mesa, c.consumo, c.taxa_servico, c.servico, c.jeito], [5, 43, 10, 4.3, 'dividiram'], 'conta');
  igual(c.partes.length, 3, 'partes');
  const p = await pedido(m3a.id);
  igual([p.conta_id, p.forma_pagamento, !!p.pago_em], [conta5, null, true], 'pedido pago na conta');
});

await erro('fechar a mesma conta de novo (outro aparelho)', 'Esta conta mudou', () =>
  fechar([m3a.id, m3b.id, m6.id], 'um_pagou', true, [{ forma: 'pix', valor: 47.3 }]),
);
await ok('registrar_pagamento não mexe em pedido pago na conta', async () => {
  const [{ n }] = await dono(U1, 'select public.registrar_pagamento($1::uuid[], null) as n', [[m3a.id]]);
  igual(n, 0, 'desfazer pelo pedido');
  const [{ n: n2 }] = await dono(U1, `select public.registrar_pagamento($1::uuid[], 'pix') as n`, [[m3a.id]]);
  igual(n2, 0, 'receber de novo');
});
await ok('passar mesa não mexe em pedido já pago', async () => {
  const [{ n }] = await dono(U1, 'select public.passar_mesa($1::uuid[], 2) as n', [[m3a.id]]);
  igual(n, 0, 'passados');
});
await erro('editar o valor de pedido pago na conta', 'desfaça o recebimento da conta', () =>
  dono(U1, 'select public.editar_pedido($1, $2::jsonb, $3, 5)', [m3a.id, JSON.stringify([{ produto_id: espeto, quantidade: 3 }]), m3a.alterado_em]),
);
await ok('editar pedido pago na conta sem mudar o valor não troca a mesa nem o pagamento', async () => {
  const atual = await pedido(m3a.id);
  const [e] = await dono(U1, 'select * from public.editar_pedido($1, $2::jsonb, $3, 1)', [
    m3a.id,
    JSON.stringify([{ produto_id: espeto, quantidade: 2, observacao: 'bem passado' }]),
    atual.alterado_em,
  ]);
  igual([e.mesa, e.conta_id, !!e.pago_em], [5, conta5, true], 'continua na conta');
  m3a = e;
});
await erro('cancelar pedido pago na conta', 'desfaça o recebimento da conta', () =>
  dono(U1, `select public.cancelar_pedido($1, 'cliente_desistiu')`, [m3a.id]),
);
await erro('ninguém escreve conta direto na tabela', 'permission denied', () =>
  dono(U1, `insert into public.contas_mesa (negocio_id, dia, mesa, consumo, jeito) values ($1, current_date, 1, 0, 'separado')`, [negocio1]),
);
await erro('ninguém escreve pagamento de conta direto na tabela', 'permission denied', () =>
  dono(U1, `insert into public.pagamentos_conta (conta_id, negocio_id, forma, valor) values ($1, $2, 'pix', 1)`, [conta5, negocio1]),
);
await ok('outro negócio não vê minhas contas nem os pagamentos', async () => {
  const [{ n }] = await dono(U2, 'select (select count(*) from public.contas_mesa) + (select count(*) from public.pagamentos_conta) as n');
  igual(Number(n), 0, 'visíveis');
});
await erro('outro negócio não fecha conta minha', 'não foi encontrado', () =>
  fechar([m3a.id], 'separado', false, null, U2),
);
await erro('outro negócio não desfaz conta minha', 'já foi desfeita', () =>
  dono(U2, 'select public.desfazer_conta_mesa($1)', [conta5]),
);

await ok('desfazer o recebimento: pedidos voltam abertos na mesa e a conta some', async () => {
  await dono(U1, 'select public.desfazer_conta_mesa($1)', [conta5]);
  const p = await pedido(m3a.id);
  igual([p.conta_id, p.pago_em, p.mesa], [null, null, 5], 'pedido aberto');
  const [{ n }] = await dono(U1, 'select (select count(*) from public.contas_mesa) + (select count(*) from public.pagamentos_conta) as n');
  igual(Number(n), 0, 'conta e partes apagadas');
});
await erro('desfazer de novo', 'já foi desfeita', () => dono(U1, 'select public.desfazer_conta_mesa($1)', [conta5]));

await ok('um pagou tudo, cliente não quis pagar o serviço', async () => {
  const id = await fechar([m3a.id, m3b.id, m6.id], 'um_pagou', false, [{ forma: 'debito', valor: 43 }]);
  const c = await conta(id);
  igual([c.consumo, c.taxa_servico, c.servico, c.partes], [43, 0, 0, [{ forma: 'debito', valor: 43 }]], 'conta');
  await dono(U1, 'select public.desfazer_conta_mesa($1)', [id]);
});

await ok('pagaram separado: fica paga, sem forma e sem partes', async () => {
  const id = await fechar([m3a.id, m3b.id, m6.id], 'separado', true);
  const c = await conta(id);
  igual([c.jeito, c.servico, c.partes], ['separado', 4.3, []], 'conta');
  const p = await pedido(m3b.id);
  igual([p.forma_pagamento, !!p.pago_em], [null, true], 'pedido');
  await dono(U1, 'select public.desfazer_conta_mesa($1)', [id]);
});

await ok('fecha só o pedido de um grupo e deixa o resto aberto na mesa', async () => {
  const id = await fechar([m3b.id], 'um_pagou', true, [{ forma: 'pix', valor: 7.7 }]);
  const c = await conta(id);
  igual([c.consumo, c.servico], [7, 0.7], 'conta do grupo');
  igual((await pedido(m3a.id)).pago_em, null, 'outro grupo continua aberto');
});

await ok('taxa arredondada para o centavo', async () => {
  await dono(U1, 'select public.configurar_mesas(8, 12)');
  // 1 espeto = 9; 12% = 1,08.
  const p = await pedir(8, [{ produto_id: espeto, quantidade: 1 }]);
  const id = await fechar([p.id], 'um_pagou', true, [{ forma: 'dinheiro', valor: 10.08 }]);
  igual((await conta(id)).servico, 1.08, 'serviço');
});

await ok('negócio que não cobra serviço: taxa zero mesmo pedindo para cobrar', async () => {
  const [p] = await dono(U2, 'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_mesa => 1)', [
    JSON.stringify([{ produto_id: pastelDaBia, quantidade: 2 }]),
    novaChave(),
  ]);
  const id = await fechar([p.id], 'um_pagou', true, [{ forma: 'pix', valor: 16 }], U2);
  const [c] = await dono(U2, 'select servico::float8, taxa_servico from public.contas_mesa where id = $1', [id]);
  igual([c.servico, c.taxa_servico], [0, 0], 'sem taxa');
});

await ok('pedido cancelado não entra na conta', async () => {
  const p = await pedir(4, [{ produto_id: espeto, quantidade: 1 }]);
  await dono(U1, `select public.cancelar_pedido($1, 'cliente_desistiu')`, [p.id]);
  try {
    await fechar([p.id], 'separado', false);
  } catch (e) {
    if (e.message.includes('Esta conta mudou')) return;
    throw e;
  }
  throw new Error('deveria recusar');
});

await erro('pedido pago no balcão não entra na conta', 'Esta conta mudou', async () => {
  const [p] = await dono(
    U1,
    `select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_mesa => 4, p_forma_pagamento => 'pix')`,
    [JSON.stringify([{ produto_id: espeto, quantidade: 1 }]), novaChave()],
  );
  await fechar([p.id], 'separado', false);
});

terminar();
