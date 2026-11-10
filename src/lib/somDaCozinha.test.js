import { describe, expect, it } from 'vitest';
import { INTERVALO_DO_TIC_MS, dividirFila, lerFoco, somDaMudanca } from './somDaCozinha';

describe('som da cozinha', () => {
  const base = { chegouNovo: true, filaAntes: 0, outraNovidade: false, ultimoTic: null, agora: 100_000 };

  it('fila vazia e chega pedido: som forte, mesmo logo depois de outro som', () => {
    expect(somDaMudanca(base)).toBe('novo');
    expect(somDaMudanca({ ...base, ultimoTic: 99_000 })).toBe('novo');
  });

  it('com pedido na tela: tic, no máximo um a cada 30 segundos', () => {
    expect(somDaMudanca({ ...base, filaAntes: 2 })).toBe('tic');
    expect(somDaMudanca({ ...base, filaAntes: 2, ultimoTic: base.agora - 10_000 })).toBe(null);
    expect(somDaMudanca({ ...base, filaAntes: 2, ultimoTic: base.agora - INTERVALO_DO_TIC_MS })).toBe('tic');
  });

  it('alterado ou cancelado sempre avisa; sem novidade, nada toca', () => {
    expect(somDaMudanca({ ...base, chegouNovo: false, filaAntes: 3, outraNovidade: true, ultimoTic: base.agora })).toBe('aviso');
    expect(somDaMudanca({ ...base, filaAntes: 3, outraNovidade: true, ultimoTic: base.agora })).toBe('aviso');
    expect(somDaMudanca({ ...base, chegouNovo: false, filaAntes: 3 })).toBe(null);
  });
});

describe('modo foco', () => {
  const fila = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('todos (padrão) mostra a fila inteira', () => {
    expect(dividirFila(fila, 0)).toEqual({ mostrados: fila, escondidos: 0, novosEscondidos: 0 });
  });

  it('mostra os primeiros e conta o resto, com os novos ainda não vistos', () => {
    const r = dividirFila(fila, 2, new Set(['a', 'd', 'e']));
    expect(r.mostrados.map((p) => p.id)).toEqual(['a', 'b']);
    expect([r.escondidos, r.novosEscondidos]).toEqual([3, 2]);
  });

  it('valor guardado estranho volta para todos', () => {
    expect([lerFoco('2'), lerFoco(null), lerFoco('9'), lerFoco('x')]).toEqual([2, 0, 0, 0]);
  });
});
