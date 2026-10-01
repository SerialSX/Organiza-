import { describe, expect, it } from 'vitest';
import { separarPedidos } from './fila';

// 24/09/2026 15:00 em Fortaleza (UTC-3)
const agora = new Date('2026-09-24T18:00:00Z');

function pedido(id, status, extra = {}) {
  return { id, status, dia: '2026-09-24', criado_em: '2026-09-24T14:00:00Z', pronto_em: null, itens: [], ...extra };
}

describe('separarPedidos', () => {
  const grupos = separarPedidos(
    [
      pedido('novo', 'pendente'),
      pedido('preparando', 'em_preparo'),
      pedido('pronto-agora', 'pronto', { pronto_em: '2026-09-24T17:30:00Z' }),
      pedido('pronto-esquecido', 'pronto', { pronto_em: '2026-09-24T15:00:00Z' }),
      pedido('de-ontem', 'pendente', { dia: '2026-09-23' }),
      pedido('cancelado', 'cancelado'),
    ],
    agora,
  );
  const ids = (lista) => lista.map((p) => p.id);

  it('fila da cozinha só tem o que falta fazer hoje', () => {
    expect(ids(grupos.fila)).toEqual(['novo', 'preparando']);
  });

  it('pronto há menos de 2 horas fica com o atendente', () => {
    expect(ids(grupos.prontos)).toEqual(['pronto-agora']);
  });

  it('pronto esquecido e pedido de ontem viram pendência', () => {
    expect(ids(grupos.pendencias)).toEqual(['pronto-esquecido', 'de-ontem']);
  });

  it('cancelado fica separado', () => {
    expect(ids(grupos.cancelados)).toEqual(['cancelado']);
  });
});
