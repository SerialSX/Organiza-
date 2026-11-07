import { describe, expect, it } from 'vitest';
import { CARDAPIOS_PRONTOS, produtosQueFaltam } from './cardapiosProntos';

describe('cardápio pronto', () => {
  it('não duplica o que já foi cadastrado', () => {
    const espetaria = CARDAPIOS_PRONTOS.find((c) => c.id === 'espetaria');
    const faltam = produtosQueFaltam(espetaria, [{ nome: 'espeto de CARNE' }, { nome: 'Agua mineral' }]);
    expect(faltam.map((p) => p.nome)).not.toContain('Espeto de carne');
    expect(faltam.map((p) => p.nome)).not.toContain('Água mineral');
    expect(faltam).toHaveLength(espetaria.produtos.length - 2);
  });

  it('bebida não vai para a cozinha', () => {
    for (const cardapio of CARDAPIOS_PRONTOS) {
      for (const p of cardapio.produtos.filter((x) => /refrigerante|cerveja|água/i.test(x.nome))) {
        expect(p.vai_para_cozinha).toBe(false);
      }
    }
  });
});
