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
      pedido('e', { forma: 'credito', status: 'cancelado', itens: [[1, 8]] }),
    ]);
    expect(caixa.porForma).toEqual({ pix: 35, dinheiro: 20, credito: 0, debito: 0, cartao: 0 });
    expect(caixa.quantidadePorForma.pix).toBe(2);
    expect(caixa.recebido).toBe(55);
    expect(caixa.aReceber).toBe(12);
    expect(caixa.pendentes.map((p) => p.id)).toEqual(['d']);
    expect(caixa.devolver).toBe(8);
    expect(caixa.vendido).toBe(67);
  });

  it('conta da mesa: as partes entram por forma, o serviço fica fora do vendido', () => {
    const naConta = { ...pedido('m1', { mesa: 5, itens: [[2, 9]] }), pago_em: '2026-11-20T23:00:00Z', conta_id: 'c1' };
    const naConta2 = { ...pedido('m2', { mesa: 5, itens: [[1, 25]] }), pago_em: '2026-11-20T23:00:00Z', conta_id: 'c1' };
    const separado = { ...pedido('m3', { mesa: 6, itens: [[1, 10]] }), pago_em: '2026-11-20T23:00:00Z', conta_id: 'c2' };
    const caixa = fecharCaixa(
      [pedido('a', { forma: 'pix', itens: [[1, 5]] }), naConta, naConta2, separado, pedido('b', { mesa: 7, itens: [[1, 12]] })],
      [
        { id: 'c1', consumo: 43, servico: 4.3, jeito: 'dividiram', pagamentos: [{ forma: 'pix', valor: 15.77 }, { forma: 'dinheiro', valor: 15.77 }, { forma: 'credito', valor: 15.76 }] },
        { id: 'c2', consumo: 10, servico: 1, jeito: 'separado', pagamentos: [] },
      ],
    );
    expect(caixa.porForma).toEqual({ pix: 20.77, dinheiro: 15.77, credito: 15.76, debito: 0, cartao: 0 });
    expect(caixa.quantidadePorForma.pix).toBe(2);
    expect(caixa.semDetalhe).toBe(11);
    expect(caixa.contasSeparadas).toBe(1);
    expect(caixa.servico).toBe(5.3);
    expect(caixa.recebido).toBe(63.3);
    expect(caixa.aReceber).toBe(12);
    expect(caixa.pendentes.map((p) => p.id)).toEqual(['b']);
    expect(caixa.recebidos.map((p) => p.id)).toEqual(['a']);
    // 5 (balcão) + 43 + 10 (contas, sem o serviço) + 12 a receber
    expect(caixa.vendido).toBe(70);
  });

  it('soma crédito e débito separados e ainda conta o "cartão" dos pedidos antigos', () => {
    const caixa = fecharCaixa([
      pedido('a', { forma: 'credito', itens: [[1, 30]] }),
      pedido('b', { forma: 'debito', itens: [[1, 12]] }),
      pedido('c', { forma: 'cartao', itens: [[1, 8]] }),
    ]);
    expect([caixa.porForma.credito, caixa.porForma.debito, caixa.porForma.cartao]).toEqual([30, 12, 8]);
    expect(caixa.recebido).toBe(50);
    expect(caixa.pendentes).toEqual([]);
  });
});
