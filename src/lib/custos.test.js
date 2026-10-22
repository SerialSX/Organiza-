import { describe, expect, it } from 'vitest';
import { compraParaBanco, compraParaCampos, descreverCompra, estimarCusto, formatarQuantidade } from './custos';

const carne = { id: 'c', nome: 'Carne', unidade: 'g', preco_compra: 40, quantidade_compra: 1000 };
const pao = { id: 'p', nome: 'Pão', unidade: 'un', preco_compra: 12, quantidade_compra: 12 };
const queijo = { id: 'q', nome: 'Queijo', unidade: 'g', preco_compra: null, quantidade_compra: null };
const porId = { c: carne, p: pao, q: queijo };

describe('compra', () => {
  it('guarda kg e L na unidade base', () => {
    expect(compraParaBanco({ preco: 45, quantidade: 1, unidadeCompra: 'kg' })).toEqual({
      unidade: 'g',
      preco_compra: 45,
      quantidade_compra: 1000,
    });
    expect(compraParaBanco({ preco: 8.5, quantidade: 1.5, unidadeCompra: 'L' }).quantidade_compra).toBe(1500);
  });

  it('sem preço, a compra fica vazia', () => {
    expect(compraParaBanco({ preco: null, quantidade: NaN, unidadeCompra: 'kg' })).toEqual({
      unidade: 'g',
      preco_compra: null,
      quantidade_compra: null,
    });
  });

  it('volta para kg quando dá', () => {
    expect(compraParaCampos(carne)).toEqual({ quantidade: '1', unidadeCompra: 'kg' });
    expect(compraParaCampos({ ...carne, quantidade_compra: 500 })).toEqual({ quantidade: '500', unidadeCompra: 'g' });
    expect(compraParaCampos(queijo)).toEqual({ quantidade: '', unidadeCompra: 'kg' });
  });

  it('descreve do jeito que o dono fala', () => {
    expect(descreverCompra(carne)).toBe('R$ 40,00 o kg');
    expect(descreverCompra(pao)).toBe('R$ 12,00 por 12 un');
    expect(descreverCompra(queijo)).toBe('Sem preço');
  });

  it('formata quantidade com vírgula', () => {
    expect(formatarQuantidade(1.5, 'un')).toBe('1,5 un');
  });
});

describe('estimarCusto', () => {
  it('soma os ingredientes com preço', () => {
    const r = estimarCusto(
      [
        { ingrediente_id: 'c', quantidade: 120 },
        { ingrediente_id: 'p', quantidade: 1 },
        { ingrediente_id: 'q', quantidade: 30 },
      ],
      porId,
    );
    expect(r).toEqual({ total: 5.8, semPreco: ['Queijo'] });
  });

  it('sem nenhum preço, não há estimativa', () => {
    expect(estimarCusto([{ ingrediente_id: 'q', quantidade: 30 }], porId).total).toBeNull();
    expect(estimarCusto([], porId).total).toBeNull();
  });
});
