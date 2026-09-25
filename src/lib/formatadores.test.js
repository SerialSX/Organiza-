import { describe, expect, it } from 'vitest';
import { codigoPedido, formatarEspera, lerValor, minutosDesde, valorParaCampo } from './formatadores';

describe('lerValor', () => {
  it.each([
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['R$ 12,50', 12.5],
    ['1.234,56', 1234.56],
    ['7', 7],
    ['1.500', 1500],
    ['2.000.000', 2000000],
  ])('lê "%s" como %d', (texto, esperado) => {
    expect(lerValor(texto)).toBe(esperado);
  });

  it('retorna NaN para texto vazio ou sem número', () => {
    expect(lerValor('')).toBeNaN();
    expect(lerValor('abc')).toBeNaN();
  });
});

describe('valorParaCampo', () => {
  it('mostra com vírgula e duas casas', () => {
    expect(valorParaCampo(9)).toBe('9,00');
    expect(valorParaCampo(null)).toBe('');
  });
});

describe('tempo de espera', () => {
  it('conta minutos inteiros desde a criação', () => {
    const agora = Date.parse('2026-09-24T12:20:30Z');
    expect(minutosDesde('2026-09-24T12:00:00Z', agora)).toBe(20);
  });

  it('formata minutos e horas', () => {
    expect(formatarEspera(0)).toBe('agora');
    expect(formatarEspera(14)).toBe('14 min');
    expect(formatarEspera(60)).toBe('1h');
    expect(formatarEspera(75)).toBe('1h 15min');
  });
});

describe('codigoPedido', () => {
  it('usa os 4 primeiros caracteres do id em maiúsculas', () => {
    expect(codigoPedido('a9c2f1e0-0000-0000-0000-000000000000')).toBe('#A9C2');
  });
});
