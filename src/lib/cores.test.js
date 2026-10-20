import { describe, expect, it } from 'vitest';
import { corDeTexto } from './cores';

describe('corDeTexto', () => {
  it('troca a cor de destaque pela versão de texto', () => {
    expect(corDeTexto('var(--color-accent-pedidos)')).toBe('var(--texto-pedidos)');
    expect(corDeTexto('var(--color-brand-orange)')).toBe('var(--texto-laranja)');
  });
});
