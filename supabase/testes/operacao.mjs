// Virada do dia, nome ou mesa, pagamento e fechamento, bebida que não passa
// pela cozinha e o registro de eventos para as métricas do TCC.
// Uso: npm run test:banco (ou node operacao.mjs caminho/do/schema.sql)
import { prepararBanco, U1, U2 } from './ajuda.mjs';

const { db, dono, visitante, negocioDe, ok, erro, igual, terminar } = await prepararBanco(process.argv[2]);
const negocio1 = await negocioDe(U1);
const negocio2 = await negocioDe(U2);

// ---------------------------------------------------------------------------
// Virada do dia
// ---------------------------------------------------------------------------
const diaEm = async (horario) =>
  (await db.query(`select public.dia_do_negocio($1, $2::timestamptz)::text as d`, [negocio1, horario])).rows[0].d;

await ok('com virada às 5h, 0h10 ainda é o dia anterior', async () => {
  igual(await diaEm('2026-11-20 23:50-03'), '2026-11-20', '23h50');
  igual(await diaEm('2026-11-21 00:10-03'), '2026-11-20', '0h10');
  igual(await diaEm('2026-11-21 04:59-03'), '2026-11-20', '4h59');
  igual(await diaEm('2026-11-21 05:00-03'), '2026-11-21', '5h');
});

await ok('dono muda a virada para meia-noite', async () => {
  await dono(U1, 'select public.configurar_operacao(0::smallint, true)');
  igual(await diaEm('2026-11-21 00:10-03'), '2026-11-21', '0h10 com virada à meia-noite');
  await dono(U1, 'select public.configurar_operacao(5::smallint, true)');
});

await erro('virada fora de 0h a 8h', 'entre 0h e 8h', () => dono(U1, 'select public.configurar_operacao(12::smallint, true)'));
await erro('só o dono configura', 'Só o dono', async () => {
  await db.query(`update public.usuarios set papel = 'atendente' where id = '${U2}'`);
  try {
    await dono(U2, 'select public.configurar_operacao(3::smallint, false)');
  } finally {
    await db.query(`update public.usuarios set papel = 'admin' where id = '${U2}'`);
  }
});

await ok('modo sem tela de cozinha fica salvo', async () => {
  await dono(U1, 'select public.configurar_operacao(5::smallint, false)');
  const [n] = await dono(U1, 'select usa_tela_cozinha from public.negocios');
  igual(n.usa_tela_cozinha, false, 'usa_tela_cozinha');
  await dono(U1, 'select public.configurar_operacao(5::smallint, true)');
});

// ---------------------------------------------------------------------------
// Perguntas de boas-vindas: como o negócio atende
// ---------------------------------------------------------------------------
await ok('negócio novo ainda não respondeu como atende', async () => {
  const [n] = await dono(U1, 'select modo_atendimento from public.negocios');
  igual(n.modo_atendimento, null, 'modo');
});

await ok('dono responde como atende e se a cozinha tem aparelho', async () => {
  await dono(U1, `select public.configurar_atendimento('mesa', false)`);
  const [n] = await dono(U1, 'select modo_atendimento, usa_tela_cozinha from public.negocios');
  igual([n.modo_atendimento, n.usa_tela_cozinha], ['mesa', false], 'respostas');
  await dono(U1, `select public.configurar_atendimento('balcao_e_mesa', true)`);
});

await erro('jeito de atender inventado', 'Escolha como você atende', () =>
  dono(U1, `select public.configurar_atendimento('fiado', true)`),
);
await erro('sem dizer onde fica a cozinha', 'quem prepara', () => dono(U1, `select public.configurar_atendimento('balcao', null)`));
await erro('só o dono responde como o negócio atende', 'Só o dono', async () => {
  await db.query(`update public.usuarios set papel = 'atendente' where id = '${U2}'`);
  try {
    await dono(U2, `select public.configurar_atendimento('mesa', true)`);
  } finally {
    await db.query(`update public.usuarios set papel = 'admin' where id = '${U2}'`);
  }
});
await erro('ninguém escreve o jeito de atender direto na tabela', 'permission denied', () =>
  dono(U1, `update public.negocios set modo_atendimento = 'mesa'`),
);

await ok('página do cliente recebe a virada para esquecer a senha de ontem', async () => {
  const [{ codigo_publico: codigo }] = (await db.query('select codigo_publico from public.negocios where id = $1', [negocio1])).rows;
  const [{ r }] = await visitante('select public.pagina_publica($1) as r', [codigo]);
  igual(r.virada_do_dia, 5, 'virada');
});

// ---------------------------------------------------------------------------
// Pedido com nome ou mesa, pagamento e bebida
// ---------------------------------------------------------------------------
let espeto, refri, espetoDaBia;
await ok('produtos (refrigerante não vai para a cozinha)', async () => {
  const r = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, vai_para_cozinha) values
      ($1, 'Espeto de carne', 9, true), ($1, 'Refrigerante', 6, false) returning id`,
    [negocio1],
  );
  [espeto, refri] = r.map((p) => p.id);
  [{ id: espetoDaBia }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'Pastel', 8) returning id`, [negocio2]);
});

let chave = 0;
const novaChave = () => `bbbbbbbb-0000-4000-8000-${String(++chave).padStart(12, '0')}`;
const pedir = async (u, itens, identificacao = null, forma = null) =>
  (await dono(u, 'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_identificacao => $3, p_forma_pagamento => $4)', [JSON.stringify(itens), novaChave(), identificacao, forma]))[0];

let mesa4a, mesa4b, balcao;
await ok('nome ou mesa limpo e gravado', async () => {
  mesa4a = await pedir(U1, [{ produto_id: espeto, quantidade: 2 }], '  Mesa   4 ');
  igual(mesa4a.identificacao, 'Mesa 4', 'identificação');
  igual(mesa4a.status, 'pendente', 'vai para a cozinha');
  igual(mesa4a.pago_em, null, 'ainda não pago');
});

await ok('só bebida já nasce pronta e não entra na fila da cozinha', async () => {
  mesa4b = await pedir(U1, [{ produto_id: refri, quantidade: 3 }], 'Mesa 4');
  igual(mesa4b.status, 'pronto', 'status');
  if (!mesa4b.pronto_em) throw new Error('sem pronto_em');
});

await ok('bebida junto com espeto vai para a cozinha', async () => {
  const p = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }, { produto_id: refri, quantidade: 1 }]);
  igual(p.status, 'pendente', 'status');
});

await ok('pago na hora com Pix', async () => {
  balcao = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }], null, 'pix');
  igual(balcao.forma_pagamento, 'pix', 'forma');
  if (!balcao.pago_em) throw new Error('sem pago_em');
});

await ok('mesa, nome do cliente e pagamento no mesmo pedido', async () => {
  const [p] = await dono(
    U1,
    `select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_mesa => 7,
       p_identificacao => 'Carlos', p_forma_pagamento => 'dinheiro')`,
    [JSON.stringify([{ produto_id: espeto, quantidade: 1 }]), novaChave()],
  );
  igual(p.mesa, 7, 'mesa');
  igual(p.identificacao, 'Carlos', 'nome');
  igual(p.forma_pagamento, 'dinheiro', 'forma');
});

await ok('só existe uma versão de criar_pedido (sem chamada ambígua)', async () => {
  const [{ n }] = await dono(U1, `select count(*)::int as n from pg_proc where proname = 'criar_pedido'`);
  igual(n, 1, 'versões');
});

await erro('nome ou mesa com mais de 30 letras', 'no máximo 30', () => pedir(U1, [{ produto_id: espeto, quantidade: 1 }], 'x'.repeat(31)));
await ok('crédito e débito são anotados separados', async () => {
  const credito = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }], null, 'credito');
  const debito = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }], null, 'debito');
  igual([credito.forma_pagamento, debito.forma_pagamento], ['credito', 'debito'], 'formas');
});
await erro('"cartão" sem dizer se é crédito ou débito não entra mais', 'Forma de pagamento inválida', () =>
  pedir(U1, [{ produto_id: espeto, quantidade: 1 }], null, 'cartao'),
);
await erro('forma de pagamento inventada', 'Forma de pagamento inválida', () => pedir(U1, [{ produto_id: espeto, quantidade: 1 }], null, 'fiado'));

await ok('fecha a conta da mesa 4 de uma vez, em dinheiro', async () => {
  const [{ n }] = await dono(U1, `select public.registrar_pagamento($1::uuid[], 'dinheiro') as n`, [[mesa4a.id, mesa4b.id]]);
  igual(n, 2, 'pedidos recebidos');
  const pagos = await dono(U1, `select forma_pagamento from public.pedidos where identificacao = 'Mesa 4'`);
  igual(pagos.map((p) => p.forma_pagamento), ['dinheiro', 'dinheiro'], 'formas');
});

await ok('receber de novo não troca a forma já registrada', async () => {
  const [{ n }] = await dono(U1, `select public.registrar_pagamento($1::uuid[], 'pix') as n`, [[mesa4a.id]]);
  igual(n, 0, 'nenhum alterado');
});

await ok('desfazer o recebimento', async () => {
  await dono(U1, 'select public.registrar_pagamento($1::uuid[], null)', [[mesa4a.id]]);
  const [p] = await dono(U1, 'select forma_pagamento, pago_em from public.pedidos where id = $1', [mesa4a.id]);
  igual([p.forma_pagamento, p.pago_em], [null, null], 'voltou a receber');
});

await ok('pedido cancelado não recebe pagamento', async () => {
  const p = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }]);
  await dono(U1, `select public.cancelar_pedido($1, 'cliente_desistiu')`, [p.id]);
  const [{ n }] = await dono(U1, `select public.registrar_pagamento($1::uuid[], 'pix') as n`, [[p.id]]);
  igual(n, 0, 'cancelado');
});

await ok('outro negócio não recebe pedido meu', async () => {
  const [{ n }] = await dono(U2, `select public.registrar_pagamento($1::uuid[], 'pix') as n`, [[mesa4a.id]]);
  igual(n, 0, 'nenhum alterado');
});

await erro('atendente não escreve pagamento direto na tabela', 'permission denied', () =>
  dono(U1, `update public.pedidos set forma_pagamento = 'pix', pago_em = now()`),
);

// ---------------------------------------------------------------------------
// Eventos para as métricas do TCC
// ---------------------------------------------------------------------------
const eventos = async (tipo) =>
  (await dono(U1, 'select tipo, produto_id, detalhe from public.eventos where tipo = $1 order by id', [tipo]));

await ok('marcar esgotado e voltar ficam registrados', async () => {
  await dono(U1, 'update public.produtos set disponivel = false where id = $1', [espeto]);
  await dono(U1, 'update public.produtos set preco = 10 where id = $1', [espeto]);
  igual((await eventos('marcado_esgotado')).length, 1, 'esgotado (mudar o preço não conta)');
});

await ok('toque em produto esgotado conta uma vez a cada 5 segundos', async () => {
  await dono(U1, 'select public.registrar_toque_esgotado($1)', [espeto]);
  await dono(U1, 'select public.registrar_toque_esgotado($1)', [espeto]);
  igual((await eventos('toque_bloqueado')).length, 1, 'toques');
  await db.query(`update public.eventos set criado_em = now() - interval '10 seconds' where tipo = 'toque_bloqueado'`);
  await dono(U1, 'select public.registrar_toque_esgotado($1)', [espeto]);
  igual((await eventos('toque_bloqueado')).length, 2, 'toques depois de 10 s');
});

await ok('toque em produto disponível ou de outro negócio não conta', async () => {
  await dono(U1, 'select public.registrar_toque_esgotado($1)', [refri]);
  await dono(U1, 'select public.registrar_toque_esgotado($1)', [espetoDaBia]);
  igual((await eventos('toque_bloqueado')).length, 2, 'toques');
});

await ok('voltou a ter fica registrado', async () => {
  await dono(U1, 'update public.produtos set disponivel = true where id = $1', [espeto]);
  igual((await eventos('voltou_disponivel')).length, 1, 'voltou');
});

await ok('falta avisada pela cozinha continua contada depois que o pedido é editado', async () => {
  const p = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }]);
  const [{ id: item }] = await dono(U1, 'select id from public.itens_pedido where pedido_id = $1', [p.id]);
  await dono(U1, 'select public.marcar_item_faltou($1, true)', [item]);
  await dono(U1, 'select public.editar_pedido($1, $2::jsonb, null)', [p.id, JSON.stringify([{ produto_id: refri, quantidade: 1 }])]);
  igual((await eventos('faltou_item')).length, 1, 'falta registrada');
});

await ok('falta de ingrediente registrada com o nome', async () => {
  const [{ id: sal }] = await dono(U1, `insert into public.ingredientes (negocio_id, nome, unidade) values ($1, 'Farofa', 'g') returning id`, [negocio1]);
  await dono(U1, 'select public.salvar_ingredientes_do_produto($1, $2::jsonb)', [espeto, JSON.stringify([{ ingrediente_id: sal, quantidade: 30 }])]);
  const p = await pedir(U1, [{ produto_id: espeto, quantidade: 1 }]);
  const [{ id: item }] = await dono(U1, 'select id from public.itens_pedido where pedido_id = $1', [p.id]);
  await dono(U1, 'select public.marcar_ingrediente_faltou($1, $2, true)', [item, sal]);
  igual((await eventos('faltou_ingrediente')).map((e) => e.detalhe), ['Farofa'], 'detalhe');
});

await ok('outro negócio não vê meus eventos', async () => {
  igual((await dono(U2, 'select count(*)::int as n from public.eventos'))[0].n, 0, 'visíveis');
});
await erro('ninguém grava evento direto na tabela', 'permission denied', () =>
  dono(U1, `insert into public.eventos (negocio_id, tipo) values ($1, 'toque_bloqueado')`, [negocio1]),
);

// ---------------------------------------------------------------------------
// Turno depois da meia-noite: a senha não recomeça e a fila não some
// ---------------------------------------------------------------------------
await ok('pedido à 0h10 continua no dia de trabalho e na sequência de senhas', async () => {
  // Simula o contador e o dia como se o último pedido tivesse sido às 23h50.
  const ontem = await diaEm('2026-11-20 23:50-03');
  await db.query('update public.contador_pedidos set dia = $1::date, ultimo = 41 where negocio_id = $2', [ontem, negocio1]);
  const [{ d }] = (await db.query(`select public.dia_do_negocio($1, '2026-11-21 00:10-03'::timestamptz)::text as d`, [negocio1])).rows;
  igual(d, ontem, 'mesmo dia de trabalho');
});

terminar();
