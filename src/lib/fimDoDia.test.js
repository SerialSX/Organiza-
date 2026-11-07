import { describe, expect, it } from 'vitest';
import { aDevolver, diaEncerrado, emAberto, enderecoParaResolver, pendenciasDoDia, semReceber } from './fimDoDia';
import { fecharCaixa } from './caixa';
import { sugestaoDeMesas } from './mesas';
import { calcularRelatorio } from '../services/relatorios';

let seq = 0;
function pedido({
  mesa = null,
  nome = null,
  status = 'entregue',
  pago = false,
  conta = null,
  naoRecebido = false,
  devolucao = null,
  preco = 10,
  dia = '2026-11-20',
} = {}) {
  seq++;
  return {
    id: `p${seq}`,
    numero: seq,
    dia,
    mesa,
    nome_mesa: nome,
    status,
    criado_em: `2026-11-20T22:${String(seq).padStart(2, '0')}:00Z`,
    forma_pagamento: pago && !conta ? 'pix' : null,
    pago_em: pago || conta ? '2026-11-20T23:00:00Z' : null,
    conta_id: conta,
    nao_recebido_em: naoRecebido ? '2026-11-21T01:00:00Z' : null,
    devolucao,
    itens: [{ produto_id: 'x', nome: 'Espeto', quantidade: 1, preco_unitario: preco }],
  };
}

describe('o que impede encerrar o dia', () => {
  it('pedido em aberto: sem entregar ou sem receber', () => {
    expect(emAberto(pedido({ status: 'pendente', pago: true }))).toBe(true);
    expect(emAberto(pedido({ status: 'pronto', pago: true }))).toBe(true);
    expect(emAberto(pedido({ status: 'entregue' }))).toBe(true);
    expect(emAberto(pedido({ status: 'entregue', pago: true }))).toBe(false);
    expect(emAberto(pedido({ status: 'entregue', conta: 'c1' }))).toBe(false);
    expect(emAberto(pedido({ status: 'entregue', naoRecebido: true }))).toBe(false);
    expect(emAberto(pedido({ status: 'cancelado' }))).toBe(false);
    expect(emAberto(pedido({ status: 'cancelado', pago: true, devolucao: 'a_devolver' }))).toBe(false);
    expect(semReceber(pedido({ status: 'pronto' }))).toBe(true);
  });

  it('junta a mesa numa conta, separa o balcão e deixa o pago só para entregar', () => {
    const lista = [
      pedido({ mesa: 3, status: 'entregue', preco: 9 }),
      pedido({ mesa: 3, status: 'pronto', preco: 7 }),
      pedido({ mesa: 3, nome: 'Varanda', status: 'entregue', preco: 1 }),
      pedido({ status: 'entregue' }),
      pedido({ status: 'pronto', pago: true }),
      pedido({ status: 'pendente', pago: true }),
      pedido({ status: 'entregue', pago: true }),
      pedido({ status: 'cancelado' }),
      pedido({ mesa: 5, naoRecebido: true }),
    ];
    const { contas, aEntregar, total } = pendenciasDoDia(lista);
    expect(contas.map((c) => [c.mesa, c.nome, c.pedidos.length, c.total])).toEqual([
      [3, 'Varanda', 3, 17],
      [null, null, 1, 10],
    ]);
    expect(aEntregar.map((p) => p.status)).toEqual(['pronto', 'pendente']);
    expect(total).toBe(6);
  });

  it('a mesma mesa em dias diferentes são contas diferentes', () => {
    const { contas } = pendenciasDoDia([pedido({ mesa: 2, dia: '2026-11-19' }), pedido({ mesa: 2, dia: '2026-11-20' })]);
    expect(contas.length).toBe(2);
  });

  it('dia encerrado só vale enquanto nada reabriu', () => {
    const encerramento = { encerrado_em: '2026-11-21T02:00:00Z' };
    expect(diaEncerrado(encerramento, [pedido({ pago: true })])).toBe(true);
    expect(diaEncerrado(encerramento, [pedido({ pago: true }), pedido({ status: 'pendente', pago: true })])).toBe(false);
    expect(diaEncerrado(null, [])).toBe(false);
  });

  it('leva para Pedidos com o dia a resolver', () => {
    expect(enderecoParaResolver('2026-11-20')).toBe('/pedidos?resolver=2026-11-20');
  });
});

describe('devolução e não recebido no caixa e nos relatórios', () => {
  it('a devolver: pago, cancelado e ainda não devolvido (sem resposta conta como a devolver)', () => {
    expect(aDevolver(pedido({ status: 'cancelado', pago: true, devolucao: 'a_devolver' }))).toBe(true);
    expect(aDevolver(pedido({ status: 'cancelado', pago: true }))).toBe(true);
    expect(aDevolver(pedido({ status: 'cancelado', pago: true, devolucao: 'devolvido' }))).toBe(false);
    expect(aDevolver(pedido({ status: 'cancelado' }))).toBe(false);
  });

  it('caixa: não recebido fica fora do a receber e do vendido; devolvido sai do a devolver', () => {
    const caixa = fecharCaixa([
      pedido({ pago: true, preco: 20 }),
      pedido({ mesa: 4, preco: 30 }),
      pedido({ mesa: 6, naoRecebido: true, preco: 25 }),
      pedido({ status: 'cancelado', pago: true, devolucao: 'a_devolver', preco: 8 }),
      pedido({ status: 'cancelado', pago: true, devolucao: 'devolvido', preco: 5 }),
    ]);
    expect([caixa.recebido, caixa.aReceber, caixa.naoRecebido, caixa.devolver, caixa.vendido]).toEqual([20, 30, 25, 8, 50]);
    expect(caixa.naoRecebidos.length).toBe(1);
    expect(caixa.aDevolver.length).toBe(1);
    expect(caixa.pendentes.length).toBe(1);
  });

  it('relatório: não recebido fica fora do faturamento e é contado à parte', () => {
    const r = calcularRelatorio(
      [pedido({ pago: true, preco: 20 }), pedido({ naoRecebido: true, preco: 12.5 }), pedido({ naoRecebido: true, preco: 7.25 })],
      [{ id: 'x', nome: 'Espeto', custo: 4 }],
    );
    expect([r.totalPedidos, r.faturamento, r.totalNaoRecebidos, r.valorNaoRecebido]).toEqual([1, 20, 2, 19.75]);
  });
});

describe('sugestão de mais mesas', () => {
  const noite = (dia, extras) => ({ dia, extras });

  it('depois de 3 noites com mesa extra, sugere somar as extras da noite mais cheia', () => {
    expect(sugestaoDeMesas([noite('2026-11-10', 1), noite('2026-11-12', 3), noite('2026-11-14', 2)], 8)).toEqual({
      noites: 3,
      quantidade: 11,
    });
  });

  it('com menos de 3 noites, ou sem o número de mesas, não sugere', () => {
    expect(sugestaoDeMesas([noite('2026-11-10', 1), noite('2026-11-12', 3)], 8)).toBe(null);
    expect(sugestaoDeMesas([noite('a', 1), noite('b', 1), noite('c', 1)], undefined)).toBe(null);
  });

  it('não passa de 200 mesas', () => {
    expect(sugestaoDeMesas([noite('a', 5), noite('b', 5), noite('c', 5)], 198)).toEqual({ noites: 3, quantidade: 200 });
    expect(sugestaoDeMesas([noite('a', 5), noite('b', 5), noite('c', 5)], 200)).toBe(null);
  });
});
