import { describe, expect, it } from 'vitest';
import { contasAbertas, fecharCaixa } from './caixa';

function pedido(id, { mesa = null, identificacao = null, forma = null, status = 'entregue', itens = [[1, 10]] } = {}) {
  return {
    id,
    mesa,
    identificacao,
    status,
    forma_pagamento: forma,
    pago_em: forma ? '2026-11-20T22:00:00Z' : null,
    itens: itens.map(([quantidade, preco_unitario]) => ({ quantidade, preco_unitario })),
  };
}

describe('contas abertas das mesas', () => {
  it('soma os pedidos não pagos de cada mesa, em ordem de número', () => {
    const contas = contasAbertas([
      pedido('a', { mesa: 4, itens: [[2, 9]] }),
      pedido('b', { mesa: 4, identificacao: 'Carlos', itens: [[3, 6]] }),
      pedido('c', { mesa: 10 }),
      pedido('d', { mesa: 2, forma: 'pix' }),
      pedido('e', { mesa: 3, status: 'cancelado' }),
      pedido('f', { identificacao: 'Ana' }),
    ]);
    expect(contas.map((c) => [c.identificacao, c.pedidos.length, c.total])).toEqual([
      ['Mesa 4', 2, 36],
      ['Mesa 10', 1, 10],
    ]);
  });
});

describe('fechamento do caixa', () => {
  it('separa por forma, o que falta receber e o cancelado que já tinha sido pago', () => {
    const caixa = fecharCaixa([
      pedido('a', { forma: 'pix', itens: [[2, 15]] }),
      pedido('b', { forma: 'dinheiro', itens: [[1, 20]] }),
      pedido('c', { forma: 'pix', itens: [[1, 5]] }),
      pedido('d', { itens: [[1, 12]] }),
      pedido('e', { forma: 'cartao', status: 'cancelado', itens: [[1, 8]] }),
    ]);
    expect(caixa.porForma).toEqual({ pix: 35, dinheiro: 20, cartao: 0 });
    expect(caixa.quantidadePorForma.pix).toBe(2);
    expect(caixa.recebido).toBe(55);
    expect(caixa.aReceber).toBe(12);
    expect(caixa.pendentes.map((p) => p.id)).toEqual(['d']);
    expect(caixa.devolver).toBe(8);
    expect(caixa.vendido).toBe(67);
  });
});
