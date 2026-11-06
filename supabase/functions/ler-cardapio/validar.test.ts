import { describe, expect, it } from 'vitest';
import { validarItens } from './validar.ts';

describe('validarItens', () => {
  it('limpa nomes, arredonda preços e descarta o que não serve', () => {
    expect(
      validarItens([
        { nome: '  X-Burguer\u200b  especial ', preco: 18.499 },
        { nome: '=HYPERLINK("x")', preco: 12.5 },
        { nome: 'Sem preço', preco: null },
        { nome: 'Caro demais', preco: 10000 },
        { nome: 'Preço em texto', preco: '12,50' },
        { nome: 'x-burguer especial', preco: 1 },
        { nome: '', preco: 1 },
        { nome: 'a'.repeat(121), preco: 1 },
        { preco: 1 },
        'texto solto',
      ]),
    ).toEqual([
      { nome: 'X-Burguer especial', preco: 18.5 },
      { nome: 'HYPERLINK("x")', preco: 12.5 },
      { nome: 'Sem preço', preco: null },
      { nome: 'Caro demais', preco: null },
      { nome: 'Preço em texto', preco: null },
    ]);
  });

  it('corta em 100 itens e só aceita lista', () => {
    expect(validarItens(Array.from({ length: 150 }, (_, i) => ({ nome: `Item ${i}`, preco: 1 })))).toHaveLength(100);
    expect(validarItens({ nome: 'x', preco: 1 })).toEqual([]);
  });
});
