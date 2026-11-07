import { describe, expect, it } from 'vitest';
import { atendeNaMesa, atendeNoBalcao, destinoInicial, modoDoNegocio, precisaResponderBoasVindas } from './atendimento';

describe('como o negócio atende', () => {
  it('só o dono que ainda não respondeu vê as perguntas', () => {
    expect(precisaResponderBoasVindas({ papel: 'admin', modo_atendimento: null })).toBe(true);
    expect(precisaResponderBoasVindas({ papel: 'admin', modo_atendimento: 'mesa' })).toBe(false);
    expect(precisaResponderBoasVindas({ papel: 'atendente', modo_atendimento: null })).toBe(false);
    // Banco sem a migração: não prende ninguém numa pergunta que não salvaria.
    expect(precisaResponderBoasVindas({ papel: 'admin' })).toBe(false);
  });

  it('sem resposta, segue com balcão e mesa como antes', () => {
    expect(modoDoNegocio({ modo_atendimento: null })).toBe('balcao_e_mesa');
    expect(modoDoNegocio({ modo_atendimento: 'fiado' })).toBe('balcao_e_mesa');
    expect(modoDoNegocio({ modo_atendimento: 'mesa' })).toBe('mesa');
  });

  it('cada jeito mostra só o que usa', () => {
    expect([atendeNoBalcao('balcao'), atendeNaMesa('balcao')]).toEqual([true, false]);
    expect([atendeNoBalcao('mesa'), atendeNaMesa('mesa')]).toEqual([false, true]);
    expect([atendeNoBalcao('balcao_e_mesa'), atendeNaMesa('balcao_e_mesa')]).toEqual([true, true]);
    expect(destinoInicial('mesa').tipo).toBe('mesa');
    expect(destinoInicial('balcao_e_mesa').tipo).toBe('balcao');
  });
});
