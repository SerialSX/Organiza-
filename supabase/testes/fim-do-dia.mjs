// Fim do dia: encerrar o dia só com tudo resolvido, "já foi entregue", "foi
// embora sem pagar" (não recebido), cancelar a conta, devolver o dinheiro de
// pedido pago e cancelado, e o dia que reabre quando entra pedido novo.
// Uso: npm run test:banco (ou node fim-do-dia.mjs caminho/do/schema.sql)
import { prepararBanco, U1, U2 } from './ajuda.mjs';

const { db, dono, visitante, negocioDe, ok, erro, igual, terminar } = await prepararBanco(process.argv[2]);
const negocio1 = await negocioDe(U1);
const negocio2 = await negocioDe(U2);

let espeto, cerveja, pastelDaBia;
await ok('produtos', async () => {
  [{ id: espeto }, { id: cerveja }] = await dono(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, vai_para_cozinha) values
      ($1, 'Espeto de carne', 9, true), ($1, 'Cerveja', 7, false) returning id`,
    [negocio1],
  );
  [{ id: pastelDaBia }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'Pastel', 8) returning id`, [negocio2]);
  await dono(U1, 'select public.configurar_mesas(8, 10)');
});

let chave = 0;
const novaChave = () => `dddddddd-0000-4000-8000-${String(++chave).padStart(12, '0')}`;
const pedir = async ({ itens = [{ produto_id: espeto, quantidade: 1 }], mesa = null, forma = null, u = U1 } = {}) =>
  (
    await dono(u, 'select * from public.criar_pedido(p_itens => $1::jsonb, p_chave_envio => $2::uuid, p_mesa => $3, p_forma_pagamento => $4)', [
      JSON.stringify(itens),
      novaChave(),
      mesa,
      forma,
    ])
  )[0];
const hoje = async (u = U1) => (await dono(u, 'select public.dia_do_negocio(public.negocio_do_usuario_atual())::text as d'))[0].d;
const encerrar = async (dia, u = U1) => (await dono(u, 'select public.encerrar_dia($1::date) as quando', [dia]))[0].quando;
const encerrado = async (dia, u = U1) =>
  (await dono(u, 'select count(*)::int as n from public.dias_encerrados where dia = $1::date', [dia]))[0].n === 1;
const pedido = async (id) => (await dono(U1, 'select * from public.pedidos where id = $1', [id]))[0];
const lista = (ids) => [ids];

// Começa com o dia limpo: nenhum pedido.
await ok('dia sem nenhum pedido encerra', async () => {
  const dia = await hoje();
  const quando = await encerrar(dia);
  if (!quando) throw new Error('sem hora do encerramento');
  igual(await encerrado(dia), true, 'encerrado');
});

await ok('encerrar de novo não dá erro e mantém a hora', async () => {
  const dia = await hoje();
  const [{ encerrado_em: antes }] = await dono(U1, 'select encerrado_em from public.dias_encerrados where dia = $1::date', [dia]);
  const depois = await encerrar(dia);
  igual(new Date(depois).getTime(), new Date(antes).getTime(), 'hora');
});

await ok('pedido novo reabre o dia encerrado', async () => {
  await pedir({ forma: 'pix' });
  igual(await encerrado(await hoje()), false, 'reaberto');
});

// ---------------------------------------------------------------------------
// Pedido da cozinha em aberto
// ---------------------------------------------------------------------------
let cozinha1, cozinha2;
await ok('dois pedidos ainda na cozinha', async () => {
  // O pedido do teste anterior também está aberto (pago, mas na cozinha).
  cozinha1 = await pedir({ forma: 'dinheiro' });
  cozinha2 = await pedir({ forma: 'credito' });
});

await erro('não encerra com pedido sem entregar (diz quantos)', 'Não dá para encerrar: 3 pedidos estão em aberto', async () => encerrar(await hoje()));

await ok('"já foi entregue" resolve um pedido que nem ficou pronto', async () => {
  const [{ n }] = await dono(U1, 'select public.marcar_entregues($1::uuid[]) as n', lista([cozinha1.id]));
  igual(n, 1, 'marcados');
  const p = await pedido(cozinha1.id);
  igual(p.status, 'entregue', 'status');
  if (!p.entregue_em) throw new Error('sem entregue_em');
});

await ok('"já foi entregue" não mexe em pedido já encerrado nem de outro negócio', async () => {
  const daBia = await pedir({ itens: [{ produto_id: pastelDaBia, quantidade: 1 }], forma: 'pix', u: U2 });
  const [{ n }] = await dono(U1, 'select public.marcar_entregues($1::uuid[]) as n', lista([cozinha1.id, daBia.id]));
  igual(n, 0, 'marcados');
  igual((await dono(U2, 'select status from public.pedidos where id = $1', [daBia.id]))[0].status, 'pendente', 'pedido da Bia');
});

await erro('não encerra com 1 pedido aberto (singular)', 'Não dá para encerrar: 1 pedido está em aberto', async () => {
  const abertos = await dono(U1, `select id from public.pedidos where status in ('pendente', 'em_preparo', 'pronto') and id <> $1`, [cozinha2.id]);
  await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista(abertos.map((p) => p.id)));
  await encerrar(await hoje());
});

// ---------------------------------------------------------------------------
// Pedido pago e cancelado: devolveu o dinheiro?
// ---------------------------------------------------------------------------
await ok('cancelar pedido pago dizendo que devolveu: fica devolvido', async () => {
  await dono(U1, `select public.cancelar_pedido($1, 'cliente_desistiu', 'devolvido')`, [cozinha2.id]);
  const p = await pedido(cozinha2.id);
  igual([p.status, p.devolucao], ['cancelado', 'devolvido'], 'pedido');
  if (!p.devolvido_em) throw new Error('sem devolvido_em');
  if (!p.pago_em) throw new Error('perdeu o pago_em');
});

let aDevolver;
await ok('"ainda vou devolver" fica a devolver', async () => {
  aDevolver = await pedir({ forma: 'pix' });
  await dono(U1, `select public.cancelar_pedido($1, 'erro_lancamento', 'a_devolver')`, [aDevolver.id]);
  const p = await pedido(aDevolver.id);
  igual([p.devolucao, p.devolvido_em], ['a_devolver', null], 'pedido');
});

await ok('cancelado sem responder (site anterior) fica a devolver', async () => {
  const p0 = await pedir({ forma: 'dinheiro' });
  await dono(U1, `select public.cancelar_pedido($1, 'outro')`, [p0.id]);
  igual((await pedido(p0.id)).devolucao, 'a_devolver', 'devolução');
});

await ok('pedido sem pagar cancelado não tem devolução', async () => {
  const p0 = await pedir();
  await dono(U1, `select public.cancelar_pedido($1, 'outro', 'devolvido')`, [p0.id]);
  const p = await pedido(p0.id);
  igual([p.devolucao, p.devolvido_em], [null, null], 'devolução');
});

await erro('resposta da devolução inventada', 'devolveu o dinheiro', async () => {
  const p0 = await pedir({ forma: 'pix' });
  await dono(U1, `select public.cancelar_pedido($1, 'outro', 'talvez')`, [p0.id]);
});

await ok('"Devolvi" marca o dinheiro como devolvido', async () => {
  await dono(U1, 'select public.marcar_devolvido($1)', [aDevolver.id]);
  const p = await pedido(aDevolver.id);
  igual(p.devolucao, 'devolvido', 'devolução');
  if (!p.devolvido_em) throw new Error('sem devolvido_em');
});

await erro('"Devolvi" duas vezes', 'já foi marcado como devolvido', () => dono(U1, 'select public.marcar_devolvido($1)', [aDevolver.id]));
await erro('"Devolvi" em pedido de outro negócio', 'já foi marcado como devolvido', () => dono(U2, 'select public.marcar_devolvido($1)', [aDevolver.id]));

await ok('pedido pago antes desta versão (sem resposta) também pode ser marcado como devolvido', async () => {
  const p0 = await pedir({ forma: 'pix' });
  await dono(U1, `select public.cancelar_pedido($1, 'outro', 'devolvido')`, [p0.id]);
  await db.query(`update public.pedidos set devolucao = null, devolvido_em = null where id = $1`, [p0.id]);
  await dono(U1, 'select public.marcar_devolvido($1)', [p0.id]);
  igual((await pedido(p0.id)).devolucao, 'devolvido', 'devolução');
});

await erro('pedido entregue e pago não é cancelado', 'já foi encerrado', async () => {
  const p0 = await pedir({ itens: [{ produto_id: cerveja, quantidade: 1 }], forma: 'pix' });
  await dono(U1, `select public.atualizar_status_pedido($1, 'entregue')`, [p0.id]);
  await dono(U1, `select public.cancelar_pedido($1, 'outro', 'devolvido')`, [p0.id]);
});

await ok('devolução não fica em pedido que não foi cancelado (regra da tabela)', async () => {
  const p0 = await pedir({ forma: 'pix' });
  await erro('devolução em pedido aberto', 'pedidos_fim_do_dia_coerente', () =>
    db.query(`update public.pedidos set devolucao = 'a_devolver' where id = $1`, [p0.id]),
  );
  await erro('devolvido sem a hora', 'pedidos_fim_do_dia_coerente', async () => {
    await dono(U1, `select public.cancelar_pedido($1, 'outro', 'a_devolver')`, [p0.id]);
    await db.query(`update public.pedidos set devolucao = 'devolvido' where id = $1`, [p0.id]);
  });
});

await ok('o dinheiro a devolver não impede encerrar o dia', async () => {
  const abertos = await dono(U1, `select id from public.pedidos where status in ('pendente', 'em_preparo', 'pronto')`);
  if (abertos.length) await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista(abertos.map((p) => p.id)));
  if (!(await encerrar(await hoje()))) throw new Error('não encerrou');
});

// ---------------------------------------------------------------------------
// Conta da mesa sem receber
// ---------------------------------------------------------------------------
let m3a, m3b, m5;
await ok('mesa 3 com dois pedidos e mesa 5 com um, servidos e sem pagar', async () => {
  m3a = await pedir({ mesa: 3 });
  m3b = await pedir({ mesa: 3, itens: [{ produto_id: cerveja, quantidade: 2 }] });
  m5 = await pedir({ mesa: 5 });
  await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista([m3a.id, m3b.id, m5.id]));
});

await erro('não encerra com conta de mesa sem receber', 'Não dá para encerrar: 3 pedidos estão em aberto', async () => encerrar(await hoje()));

await ok('"foi embora sem pagar" tira a conta das abertas', async () => {
  const [{ n }] = await dono(U1, 'select public.marcar_nao_recebido($1::uuid[]) as n', lista([m3a.id, m3b.id]));
  igual(n, 2, 'marcados');
  const p = await pedido(m3a.id);
  if (!p.nao_recebido_em) throw new Error('sem nao_recebido_em');
  igual([p.pago_em, p.status], [null, 'entregue'], 'pedido');
});

await ok('"foi embora sem pagar" de pedido que ainda estava na cozinha conta como entregue', async () => {
  const p0 = await pedir({ mesa: 6 });
  await dono(U1, 'select public.marcar_nao_recebido($1::uuid[])', lista([p0.id]));
  igual((await pedido(p0.id)).status, 'entregue', 'status');
});

await ok('"foi embora sem pagar" não mexe em pedido pago, cancelado ou de outro negócio', async () => {
  const pago = await pedir({ forma: 'pix' });
  const cancelado = await pedir();
  await dono(U1, `select public.cancelar_pedido($1, 'outro')`, [cancelado.id]);
  const daBia = await pedir({ itens: [{ produto_id: pastelDaBia, quantidade: 1 }], u: U2 });
  const [{ n }] = await dono(U1, 'select public.marcar_nao_recebido($1::uuid[]) as n', lista([pago.id, cancelado.id, daBia.id, m3a.id]));
  igual(n, 0, 'marcados');
  await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista([pago.id]));
});

await erro('conta não recebida não é recebida sem desfazer antes', 'mudou', () =>
  dono(U1, `select public.fechar_conta_mesa($1::uuid[], 'separado', false)`, lista([m3a.id, m3b.id])),
);
await ok('conta não recebida não recebe pagamento avulso nem passa de mesa', async () => {
  const [{ n }] = await dono(U1, `select public.registrar_pagamento($1::uuid[], 'pix') as n`, lista([m3a.id]));
  igual(n, 0, 'recebidos');
  const [{ n: passados }] = await dono(U1, 'select public.passar_mesa($1::uuid[], 7) as n', lista([m3a.id]));
  igual(passados, 0, 'passados');
});
await erro('conta não recebida não é cancelada sem desfazer antes', 'não recebido', () =>
  dono(U1, `select public.cancelar_pedido($1, 'outro')`, [m3a.id]),
);

await ok('"cancelar a conta" cancela todos os pedidos da mesa de uma vez', async () => {
  const [{ n }] = await dono(U1, `select public.cancelar_conta($1::uuid[], 'erro_lancamento') as n`, lista([m5.id]));
  igual(n, 1, 'cancelados');
  const p = await pedido(m5.id);
  igual([p.status, p.motivo_cancelamento, p.devolucao], ['cancelado', 'erro_lancamento', null], 'pedido');
});

await erro('"cancelar a conta" recusa se alguém já pagou', 'já foi recebido', async () => {
  const a = await pedir({ mesa: 2 });
  const b = await pedir({ mesa: 2 });
  await dono(U1, `select public.registrar_pagamento($1::uuid[], 'pix')`, lista([b.id]));
  try {
    await dono(U1, `select public.cancelar_conta($1::uuid[], 'outro')`, lista([a.id, b.id]));
  } finally {
    igual((await pedido(a.id)).status, 'pendente', 'o outro não foi cancelado');
    await dono(U1, `select public.cancelar_conta($1::uuid[], 'outro')`, lista([a.id]));
    await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista([b.id]));
  }
});
await erro('"cancelar a conta" sem motivo', 'motivo', () => dono(U1, `select public.cancelar_conta($1::uuid[], null)`, lista([m3a.id])));
await ok('"cancelar a conta" não mexe em pedido de outro negócio', async () => {
  const daBia = await pedir({ itens: [{ produto_id: pastelDaBia, quantidade: 1 }], mesa: 1, u: U2 });
  const [{ n }] = await dono(U1, `select public.cancelar_conta($1::uuid[], 'outro') as n`, lista([daBia.id]));
  igual(n, 0, 'cancelados');
});

await ok('com tudo resolvido, o dia encerra', async () => {
  if (!(await encerrar(await hoje()))) throw new Error('não encerrou');
  igual(await encerrado(await hoje()), true, 'encerrado');
});

await ok('desfazer o "não recebido" reabre a conta e o dia', async () => {
  const [{ n }] = await dono(U1, 'select public.desfazer_nao_recebido($1::uuid[]) as n', lista([m3a.id, m3b.id]));
  igual(n, 2, 'desfeitos');
  igual((await pedido(m3a.id)).nao_recebido_em, null, 'nao_recebido_em');
  igual(await encerrado(await hoje()), false, 'dia reaberto');
});

await ok('a conta reaberta fecha normalmente, e o que estava pronto vira entregue', async () => {
  const pronto = await pedir({ mesa: 3, itens: [{ produto_id: cerveja, quantidade: 1 }] });
  igual(pronto.status, 'pronto', 'cerveja nasce pronta');
  await dono(U1, `select public.fechar_conta_mesa($1::uuid[], 'separado', true)`, lista([m3a.id, m3b.id, pronto.id]));
  igual((await pedido(pronto.id)).status, 'entregue', 'status do pronto');
  igual((await pedido(m3a.id)).status, 'entregue', 'status do entregue');
});

await ok('desfazer o recebimento de uma conta reabre o dia encerrado', async () => {
  await encerrar(await hoje());
  const [{ conta_id: conta }] = await dono(U1, 'select conta_id from public.pedidos where id = $1', [m3a.id]);
  const daConta = await dono(U1, 'select id from public.pedidos where conta_id = $1', [conta]);
  await dono(U1, 'select public.desfazer_conta_mesa($1)', [conta]);
  igual(await encerrado(await hoje()), false, 'dia reaberto');
  await dono(U1, `select public.fechar_conta_mesa($1::uuid[], 'separado', true)`, lista(daConta.map((p) => p.id)));
});

await ok('desfazer um pagamento do balcão reabre o dia encerrado', async () => {
  const p0 = await pedir({ forma: 'credito', itens: [{ produto_id: cerveja, quantidade: 1 }] });
  await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista([p0.id]));
  await encerrar(await hoje());
  await dono(U1, 'select public.registrar_pagamento($1::uuid[], null)', lista([p0.id]));
  igual(await encerrado(await hoje()), false, 'dia reaberto');
  await dono(U1, `select public.registrar_pagamento($1::uuid[], 'credito')`, lista([p0.id]));
  await encerrar(await hoje());
});

// ---------------------------------------------------------------------------
// Pendências do dia anterior
// ---------------------------------------------------------------------------
await ok('às 5h o dia vira sozinho: o pedido aberto de ontem continua aberto (nada é cancelado)', async () => {
  const p0 = await pedir({ mesa: 4 });
  const ontem = (await db.query(`select ($1::date - 1)::text as d`, [await hoje()])).rows[0].d;
  await db.query('update public.pedidos set dia = $1::date where id = $2', [ontem, p0.id]);
  igual((await pedido(p0.id)).status, 'pendente', 'status');
  igual(await encerrado(ontem), false, 'ontem não encerrado');
  await erro('ontem não encerra com a pendência', 'Não dá para encerrar: 1 pedido', () => encerrar(ontem));
  await dono(U1, 'select public.marcar_entregues($1::uuid[])', lista([p0.id]));
  await erro('ontem ainda tem a conta sem receber', 'Não dá para encerrar: 1 pedido', () => encerrar(ontem));
  await dono(U1, `select public.fechar_conta_mesa($1::uuid[], 'um_pagou', false, $2::jsonb)`, [[p0.id], JSON.stringify([{ forma: 'pix', valor: 9 }])]);
  if (!(await encerrar(ontem))) throw new Error('ontem não encerrou');
});

await erro('não encerra um dia que ainda não começou', 'ainda não começou', async () => {
  const amanha = (await db.query(`select ($1::date + 1)::text as d`, [await hoje()])).rows[0].d;
  await encerrar(amanha);
});
await erro('não encerra sem dizer o dia', 'ainda não começou', () => encerrar(null));

// ---------------------------------------------------------------------------
// Isolamento e permissões
// ---------------------------------------------------------------------------
await ok('cada negócio encerra o próprio dia', async () => {
  igual(await encerrado(await hoje(U2), U2), false, 'Bia não encerrou');
  const abertos = await dono(U2, `select id from public.pedidos where status <> 'cancelado'`);
  await dono(U2, 'select public.marcar_entregues($1::uuid[])', lista(abertos.map((p) => p.id)));
  await dono(U2, 'select public.marcar_nao_recebido($1::uuid[])', lista(abertos.map((p) => p.id)));
  await encerrar(await hoje(U2), U2);
  const daBia = await dono(U2, 'select negocio_id from public.dias_encerrados');
  igual(daBia.map((d) => d.negocio_id), [negocio2], 'Bia só vê o dela');
});
await erro('ninguém escreve o encerramento direto na tabela', 'permission denied', async () =>
  dono(U1, 'insert into public.dias_encerrados (negocio_id, dia) values ($1, $2::date)', [negocio1, await hoje()]),
);
await erro('ninguém apaga o encerramento direto na tabela', 'permission denied', () => dono(U1, 'delete from public.dias_encerrados'));
await erro('ninguém marca "não recebido" direto na tabela', 'permission denied', () =>
  dono(U1, 'update public.pedidos set nao_recebido_em = now()'),
);
await erro('visitante não encerra o dia', 'permission denied', async () => visitante('select public.encerrar_dia(current_date)'));
await erro('visitante não marca entregue', 'permission denied', () => visitante('select public.marcar_entregues($1::uuid[])', lista([m3a.id])));
await erro('visitante não marca não recebido', 'permission denied', () => visitante('select public.marcar_nao_recebido($1::uuid[])', lista([m3a.id])));
await erro('visitante não cancela conta', 'permission denied', () => visitante(`select public.cancelar_conta($1::uuid[], 'outro')`, lista([m3a.id])));
await erro('visitante não marca devolvido', 'permission denied', () => visitante('select public.marcar_devolvido($1)', [aDevolver.id]));
await erro('ninguém chama o gatilho de reabrir o dia', 'permission denied', () => dono(U1, 'select public.reabrir_dia_do_pedido()'));
await erro('de 1 a 200 pedidos', 'de 1 a 200', () => dono(U1, 'select public.marcar_entregues($1::uuid[])', [[]]));

await ok('só existe uma versão de cancelar_pedido (sem chamada ambígua)', async () => {
  const [{ n }] = await dono(U1, `select count(*)::int as n from pg_proc where proname = 'cancelar_pedido'`);
  igual(n, 1, 'versões');
});

terminar();
