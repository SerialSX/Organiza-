import { describe, expect, it } from 'vitest';
import { interpretarPlanilha, montarRevisao, oQueSalvar, precisaDeAtencao, errosDoItem, pareceBebida } from './importarPlanilha';

describe('interpretarPlanilha', () => {
  it('lê o modelo preenchido, com custo e "Vai para a cozinha?"', () => {
    const { itens, temCusto } = interpretarPlanilha([
      ['Produto', 'Preço', 'Vai para a cozinha?', 'Custo (se souber)'],
      ['Pastel de carne', 9, 'Sim', 3.5],
      ['Caldo de cana', '6,00', 'não', null],
      ['Coca lata', 'R$ 6', null, null],
      [null, null, null, null],
    ]);
    expect(temCusto).toBe(true);
    expect(itens).toEqual([
      { linha: 2, nome: 'Pastel de carne', preco: '9,00', custo: '3,50', vaiParaCozinha: true, cozinhaAdivinhada: false, nomeLongo: false },
      { linha: 3, nome: 'Caldo de cana', preco: '6,00', custo: '', vaiParaCozinha: false, cozinhaAdivinhada: false, nomeLongo: false },
      { linha: 4, nome: 'Coca lata', preco: '6,00', custo: '', vaiParaCozinha: false, cozinhaAdivinhada: true, nomeLongo: false },
    ]);
  });

  it('acha o cabeçalho mesmo com título em cima e outros nomes de coluna', () => {
    const { itens, temCusto } = interpretarPlanilha([
      ['Cardápio da Ana'],
      [],
      ['Código', 'Descrição', 'Valor unitário'],
      [1, 'X-Burguer', 18],
      [2, 'X-Salada', 'a combinar'],
    ]);
    expect(temCusto).toBe(false);
    expect(itens.map((i) => [i.linha, i.nome, i.preco])).toEqual([
      [4, 'X-Burguer', '18,00'],
      [5, 'X-Salada', 'a combinar'],
    ]);
  });

  it('sem cabeçalho: nome é o primeiro texto, preço o primeiro valor depois', () => {
    const { itens } = interpretarPlanilha([
      ['Refri 2L', '12,00'],
      [3, 'Espeto de carne', 'R$ 9,00'],
      ['Baião de dois', null],
    ]);
    expect(itens.map((i) => [i.nome, i.preco, i.vaiParaCozinha])).toEqual([
      ['Refri 2L', '12,00', false],
      ['Espeto de carne', '9,00', true],
      ['Baião de dois', '', true],
    ]);
  });

  it('planilha vazia ou grande demais explica o que fazer', () => {
    expect(() => interpretarPlanilha([['Produto', 'Preço']])).toThrow(/Não achei produtos/);
    const muitas = [['Produto', 'Preço'], ...Array.from({ length: 301 }, (_, i) => [`Item ${i}`, 5])];
    expect(() => interpretarPlanilha(muitas)).toThrow(/limite é 300/);
  });
});

describe('pareceBebida', () => {
  it('bebida embalada não vai para a cozinha; suco natural e comida vão', () => {
    for (const n of ['Refrigerante lata', 'Água mineral', 'Cerveja Skol 350ml', 'Guaraná 2 litros', 'Chopp']) expect(pareceBebida(n)).toBe(true);
    for (const n of ['Suco de laranja', 'Pastel de chocolate', 'X-Tudo', 'Tapioca']) expect(pareceBebida(n)).toBe(false);
  });
});

describe('montarRevisao e oQueSalvar', () => {
  const item = (linha, nome, preco, extra = {}) => ({
    linha,
    nome,
    preco,
    custo: '',
    vaiParaCozinha: true,
    cozinhaAdivinhada: true,
    nomeLongo: false,
    ...extra,
  });
  const produtos = [{ id: 'p1', nome: 'Pastel de Carne', preco: 8, vai_para_cozinha: true }, { id: 'p2', nome: 'Água', preco: 3, vai_para_cozinha: false }];

  it('junta repetidas iguais, pede escolha nas diferentes e mantém o que já existe', () => {
    const grupos = montarRevisao(
      [
        item(2, 'X-Tudo', '28,00'),
        item(3, 'x-tudo ', '28,00'),
        item(4, 'Batata', '15,00'),
        item(5, 'batata', '17,00'),
        item(6, 'pastel de carne', '9,00'),
        item(7, 'Agua', '4,00', { vaiParaCozinha: true }),
        item(8, 'Coxinha', '7,00'),
      ],
      produtos,
    );
    expect(grupos.map((g) => [g.ocorrencias.map((o) => o.linha), g.repetidasIguais, g.existente?.id ?? null, g.escolha])).toEqual([
      [[2], [3], null, 0],
      [[4, 5], [], null, null],
      [[6], [], 'p1', 'manter'],
      [[7], [], 'p2', 'manter'],
      [[8], [], null, 0],
    ]);
    // Planilha sem a coluna da cozinha não muda o que o produto já tinha.
    expect(grupos[3].ocorrencias[0].vaiParaCozinha).toBe(false);
    expect(grupos.map(precisaDeAtencao)).toEqual([false, true, true, true, false]);

    grupos[1].escolha = 1;
    grupos[2].escolha = 0;
    grupos[4].escolha = 'nenhuma';
    expect(oQueSalvar(grupos)).toEqual({
      novos: [
        { grupo: grupos[0].id, nome: 'X-Tudo', preco: 28, vai_para_cozinha: true, custo: null },
        { grupo: grupos[1].id, nome: 'batata', preco: 17, vai_para_cozinha: true, custo: null },
      ],
      atualizar: [{ grupo: grupos[2].id, id: 'p1', alteracoes: { preco: 9, vai_para_cozinha: true } }],
    });
  });

  it('linha sem preço ou com valor errado precisa de atenção e mostra o erro', () => {
    const [semPreco] = montarRevisao([item(2, 'Tapioca', '')], []);
    expect(precisaDeAtencao(semPreco)).toBe(true);
    expect(errosDoItem(item(2, 'Tapioca', ''))).toEqual({ preco: 'Digite um preço maior que zero, como 12,50.' });
    expect(errosDoItem(item(2, '', '100000'))).toEqual({ nome: 'Digite o nome do produto.', preco: 'Esse preço está alto demais. Confira.' });
    expect(errosDoItem(item(2, 'X', '5', { custo: 'muito' }))).toEqual({ custo: 'Digite um valor como 6,00 ou deixe em branco.' });
  });
});
