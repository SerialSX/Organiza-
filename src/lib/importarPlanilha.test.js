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

describe('coluna Tamanho', () => {
  const cabecalho = ['Produto', 'Tamanho', 'Preço', 'Vai para a cozinha?', 'Custo (se souber)'];

  it('mesmo nome com tamanhos diferentes vira um produto com tamanhos', () => {
    const { itens } = interpretarPlanilha([
      cabecalho,
      ['Pizza Calabresa', 'P', 35, 'Sim', 10],
      ['Pastel', null, 9, null, null],
      ['pizza calabresa', 'G', '55,00', 'Sim', null],
      ['Pizza Calabresa', 'P', 35, 'Sim', 10],
    ]);
    expect(itens).toHaveLength(2);
    const [pizza, pastel] = itens;
    expect(pastel).toMatchObject({ nome: 'Pastel', preco: '9,00' });
    expect(pastel.tamanhos).toBeUndefined();
    expect(pizza).toMatchObject({ linha: 2, nome: 'Pizza Calabresa', preco: '', repetidas: [5] });
    expect(pizza.tamanhos.map((t) => [t.linha, t.nome, t.preco, t.custo])).toEqual([
      [2, 'P', '35,00', '10,00'],
      [4, 'G', '55,00', ''],
    ]);
    const [grupo] = montarRevisao([pizza], []);
    expect(grupo.repetidasIguais).toEqual([5]);
    expect(precisaDeAtencao(grupo)).toBe(false);
    expect(oQueSalvar([grupo]).novos).toEqual([
      {
        grupo: grupo.id,
        nome: 'Pizza Calabresa',
        vai_para_cozinha: true,
        tamanhos: [
          { nome: 'P', preco: 35, custo: 10 },
          { nome: 'G', preco: 55, custo: null },
        ],
      },
    ]);
  });

  it('um tamanho só entra como preço único, com o tamanho no nome', () => {
    const { itens } = interpretarPlanilha([cabecalho, ['Açaí', '500 ml', 18, null, null]]);
    expect(itens[0]).toMatchObject({ nome: 'Açaí 500 ml', preco: '18,00', umTamanho: '500 ml' });
    expect(itens[0].tamanhos).toBeUndefined();
    expect(precisaDeAtencao(montarRevisao(itens, [])[0])).toBe(true);
  });

  it('tamanho repetido com outro preço e linha sem tamanho viram erro para o dono corrigir', () => {
    const { itens } = interpretarPlanilha([
      cabecalho,
      ['Pizza', 'G', 50, null, null],
      ['Pizza', 'G', 52, null, null],
      ['Pizza', null, 30, null, null],
    ]);
    const [grupo] = montarRevisao(itens, []);
    expect(precisaDeAtencao(grupo)).toBe(true);
    const [, segunda, terceira] = grupo.ocorrencias[0].tamanhos;
    const erros = errosDoItem(grupo.ocorrencias[0]);
    expect(erros[`tamanho-nome-${segunda.chave}`]).toBe('O tamanho "G" aparece duas vezes. Deixe um só.');
    expect(erros[`tamanho-nome-${terceira.chave}`]).toBe('Digite o tamanho, como P ou 500 ml.');
  });

  it('banco sem tamanhos: o tamanho vai para o nome, como antes', () => {
    const { itens } = interpretarPlanilha(
      [cabecalho, ['Pizza', 'P', 30, null, null], ['Pizza', 'G', 50, null, null]],
      { comTamanhos: false },
    );
    expect(itens.map((i) => [i.nome, i.preco])).toEqual([
      ['Pizza P', '30,00'],
      ['Pizza G', '50,00'],
    ]);
  });

  it('produto que já existe: os tamanhos de mesmo nome continuam os mesmos; preço único desliga os tamanhos', () => {
    const existente = {
      id: 'pz',
      nome: 'Pizza',
      preco: 30,
      vai_para_cozinha: true,
      tamanhos: [
        { id: 't-p', nome: 'P', preco: 30, custo: 9, disponivel: false },
        { id: 't-g', nome: 'G', preco: 50, custo: null, disponivel: true },
      ],
    };
    const comTamanhos = interpretarPlanilha([cabecalho, ['Pizza', 'p', 32, null, null], ['Pizza', 'M', 42, null, null]]).itens;
    const [grupo] = montarRevisao(comTamanhos, [existente]);
    grupo.escolha = 0;
    expect(oQueSalvar([grupo]).atualizar).toEqual([
      {
        grupo: grupo.id,
        id: 'pz',
        alteracoes: { vai_para_cozinha: true },
        tamanhos: [
          { id: 't-p', nome: 'p', preco: 32, custo: 9, disponivel: false },
          { id: null, nome: 'M', preco: 42, custo: null, disponivel: true },
        ],
      },
    ]);

    const [unico] = montarRevisao(interpretarPlanilha([cabecalho, ['Pizza', null, 40, null, null]]).itens, [existente]);
    unico.escolha = 0;
    expect(oQueSalvar([unico]).atualizar).toEqual([
      { grupo: unico.id, id: 'pz', alteracoes: { preco: 40, vai_para_cozinha: true }, tamanhos: [] },
    ]);
  });
});

describe('coluna Meio a meio?', () => {
  const cabecalho = ['Produto', 'Tamanho', 'Preço', 'Vai para a cozinha?', 'Custo (se souber)', 'Meio a meio?'];

  it('lê Sim, Não e em branco; basta uma linha do produto dizer Sim', () => {
    const { itens } = interpretarPlanilha([
      cabecalho,
      ['Pizza Calabresa', 'P', 35, 'Sim', null, 'Sim'],
      ['Pizza Calabresa', 'G', 55, 'Sim', null, null],
      ['Pastel', null, 9, 'Sim', null, 'Não'],
      ['Tapioca', null, 8, 'Sim', null, null],
    ]);
    expect(itens.map((i) => [i.nome, i.meioAMeio])).toEqual([
      ['Pizza Calabresa', true],
      ['Pastel', false],
      ['Tapioca', null],
    ]);
  });

  it('planilha sem a coluna, ou banco sem o meio a meio: nem aparece', () => {
    const [semColuna] = interpretarPlanilha([cabecalho.slice(0, 5), ['Pastel', null, 9, 'Sim', null]]).itens;
    expect(semColuna).not.toHaveProperty('meioAMeio');
    const [bancoAntigo] = interpretarPlanilha([cabecalho, ['Pizza', null, 40, 'Sim', null, 'Sim']], { comMeioAMeio: false }).itens;
    expect(bancoAntigo).not.toHaveProperty('meioAMeio');
  });

  it('novo marcado entra com meio_a_meio; em branco não manda; existente em branco fica como está', () => {
    const { itens } = interpretarPlanilha([
      cabecalho,
      ['Pizza Calabresa', 'P', 35, 'Sim', null, 'Sim'],
      ['Pizza Calabresa', 'G', 55, 'Sim', null, 'Sim'],
      ['Tapioca', null, 8, 'Sim', null, null],
      ['Pizza Atum', null, 50, 'Sim', null, null],
      ['Pastel', null, 9, 'Sim', null, 'Não'],
    ]);
    const existentes = [
      { id: 'at', nome: 'Pizza Atum', preco: 45, vai_para_cozinha: true, meio_a_meio: true, tamanhos: [] },
      { id: 'pa', nome: 'Pastel', preco: 8, vai_para_cozinha: true, meio_a_meio: true, tamanhos: [] },
    ];
    const grupos = montarRevisao(itens, existentes).map((g) => ({ ...g, escolha: 0 }));
    const { novos, atualizar } = oQueSalvar(grupos);
    expect(novos.map((n) => [n.nome, n.meio_a_meio])).toEqual([
      ['Pizza Calabresa', true],
      ['Tapioca', undefined],
    ]);
    expect(atualizar.map((a) => [a.id, a.alteracoes.meio_a_meio])).toEqual([
      ['at', true],
      ['pa', false],
    ]);
  });
});

it.each([
  [['Produto','Preço de custo','Preço de venda'],['X-Burguer',8,20]],
  [['Produto','Valor de custo','Valor de venda'],['X-Burguer',8,20]],
])('TEL-02: distingue custo de venda em %j',(cabecalho,linha)=>{
  expect(interpretarPlanilha([cabecalho,linha]).itens[0]).toMatchObject({nome:'X-Burguer',preco:'20,00',custo:'8,00'});
});
it('TEL-02: prefere descrição a item numérico',()=>{
  expect(interpretarPlanilha([['Item','Descrição','Preço'],[1,'X-Burguer',20]]).itens[0].nome).toBe('X-Burguer');
});
it('TEL-02: não usa coluna de nome inteiramente numérica',()=>{
  expect(interpretarPlanilha([['Nome','Descrição','Preço'],[123,'X-Burguer',20]]).itens[0].nome).toBe('X-Burguer');
});
