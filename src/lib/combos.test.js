import { describe, expect, it } from 'vitest';
import { formatarMoeda } from './formatadores';
import {
  agruparItens,
  chaveDoCombo,
  conferirCombo,
  dividirPreco,
  metadesCombinam,
  opcoesDoCardapio,
  parteAceitaMeioAMeio,
  precoDoCombo,
  resumoDoCombo,
  resumoDosItens,
  situacaoDoCombo,
  somaDasPartes,
  textoDasEscolhas,
  textoDaEconomia,
} from './combos';

const produto = (id, nome, preco, extra = {}) => ({ id, nome, preco, disponivel: true, tamanhos: [], meio_a_meio: false, ...extra });
const pizza = (id, nome, g) =>
  produto(id, nome, 0, { meio_a_meio: true, tamanhos: [{ id: `${id}-g`, nome: 'G', preco: g, disponivel: true }] });

const porId = Object.fromEntries(
  [
    produto('x', 'X-Burguer', 18),
    produto('bat', 'Batata frita', 15),
    produto('refri', 'Refrigerante lata', 6),
    produto('suco', 'Suco natural', 8),
    pizza('cal', 'Pizza Calabresa', 55),
    pizza('por', 'Pizza Portuguesa', 58),
  ].map((p) => [p.id, p]),
);

const opcao = (id, produto_id, extra = {}) => ({ id, produto_id, tamanho_id: null, acrescimo: 0, ...extra });
const comboX = {
  id: 'cx',
  nome: 'Combo X',
  preco: 30,
  disponivel: true,
  partes: [
    { id: 'p1', nome: null, opcoes: [opcao('o1', 'x')] },
    { id: 'p2', nome: null, opcoes: [opcao('o2', 'bat')] },
    { id: 'p3', nome: 'Bebida', opcoes: [opcao('o3', 'refri'), opcao('o4', 'suco', { acrescimo: 2 })] },
  ],
};
const comboPizza = {
  id: 'cp',
  nome: 'Pizza + Refri',
  preco: 60,
  disponivel: true,
  partes: [
    { id: 'q1', nome: 'Pizza G', opcoes: [opcao('a', 'cal', { tamanho_id: 'cal-g' }), opcao('b', 'por', { tamanho_id: 'por-g', acrescimo: 3 })] },
    { id: 'q2', nome: null, opcoes: [opcao('c', 'refri')] },
  ],
};

describe('dividirPreco', () => {
  it('divide pelo preço normal de cada parte, em centavos, e o resto fica na mais cara', () => {
    expect(dividirPreco(30, [18, 15, 6])).toEqual([13.84, 11.54, 4.62]);
    expect(dividirPreco(30, [18, 15, 6]).reduce((s, x) => s + x * 100, 0)).toBe(3000);
  });

  it('partes sem preço: divide igual, o resto na primeira', () => {
    expect(dividirPreco(10, [0, 0, 0])).toEqual([3.34, 3.33, 3.33]);
  });

  it('empate no mais caro: o resto vai para a primeira', () => {
    expect(dividirPreco(1, [1, 1, 1])).toEqual([0.34, 0.33, 0.33]);
  });
});

describe('situacaoDoCombo', () => {
  it('sai quando tudo está no cardápio', () => {
    expect(situacaoDoCombo(comboX, porId)).toEqual({ sai: true, mudou: false, esgotado: null });
  });

  it('parte fixa esgotada esgota o combo; numa escolha, só quando todas esgotaram', () => {
    const semBatata = { ...porId, bat: { ...porId.bat, disponivel: false } };
    expect(situacaoDoCombo(comboX, semBatata)).toMatchObject({ sai: false, esgotado: { produto: { id: 'bat' } } });
    const semSuco = { ...porId, suco: { ...porId.suco, disponivel: false } };
    expect(situacaoDoCombo(comboX, semSuco).sai).toBe(true);
    const semBebida = { ...semSuco, refri: { ...porId.refri, disponivel: false } };
    expect(situacaoDoCombo(comboX, semBebida)).toMatchObject({ sai: false, esgotado: { produto: { id: 'refri' } } });
  });

  it('produto que saiu do cardápio: o combo precisa ser revisto', () => {
    const semBatata = Object.fromEntries(Object.entries(porId).filter(([id]) => id !== 'bat'));
    expect(situacaoDoCombo(comboX, semBatata)).toEqual({ sai: false, mudou: true, esgotado: null });
  });

  it('desligado pelo dono não sai', () => {
    expect(situacaoDoCombo({ ...comboX, disponivel: false }, porId)).toEqual({ sai: false, mudou: false, esgotado: null });
  });
});

describe('preço e texto das escolhas', () => {
  const comSuco = [
    { produtoId: 'x', tamanhoId: null, segundoId: null },
    { produtoId: 'bat', tamanhoId: null, segundoId: null },
    { produtoId: 'suco', tamanhoId: null, segundoId: null },
  ];

  it('soma o acréscimo da opção escolhida ao preço (o da promoção, se tiver)', () => {
    expect(precoDoCombo(30, comboX, comSuco, porId)).toBe(32);
    expect(precoDoCombo(25.5, comboX, comSuco, porId)).toBe(27.5);
    expect(textoDasEscolhas(comboX, comSuco, porId)).toBe('X-Burguer, Batata frita, Suco natural');
  });

  it('meio a meio dentro do combo: os dois sabores G, o maior acréscimo', () => {
    const meio = [
      { produtoId: 'cal', tamanhoId: 'cal-g', segundoId: 'por' },
      { produtoId: 'refri', tamanhoId: null, segundoId: null },
    ];
    expect(parteAceitaMeioAMeio(comboPizza.partes[0], porId)).toBe(true);
    expect(metadesCombinam(comboPizza.partes[0].opcoes[0], comboPizza.partes[0].opcoes[1], porId)).toBe(true);
    expect(precoDoCombo(60, comboPizza, meio, porId)).toBe(63);
    expect(textoDasEscolhas(comboPizza, meio, porId)).toBe('G: ½ Pizza Calabresa + ½ Pizza Portuguesa, Refrigerante lata');
  });

  it('a chave junta combo e escolhas (igual à do banco)', () => {
    expect(chaveDoCombo('cx', comSuco)).toBe('c|cx|x||;bat||;suco||');
  });
});

describe('cadastro', () => {
  it('resumo, soma das partes e economia', () => {
    expect(resumoDoCombo(comboX, porId)).toBe('X-Burguer, Batata frita, Bebida à escolha');
    expect(resumoDoCombo({ ...comboX, partes: [comboX.partes[0], { ...comboX.partes[2], nome: null }] }, porId)).toBe(
      'X-Burguer, Refrigerante lata ou Suco natural',
    );
    expect(somaDasPartes(comboX, porId)).toBe(39);
    expect(textoDaEconomia(30, 39)).toBe(`O cliente economiza ${formatarMoeda(9)}`);
    expect(textoDaEconomia(39, 39)).toBe('');
  });

  it('lista do cardápio: tamanho por tamanho', () => {
    expect(opcoesDoCardapio([porId.x, porId.cal]).map((o) => [o.valor, o.rotulo, o.preco])).toEqual([
      ['x|', 'X-Burguer', 18],
      ['cal|cal-g', 'Pizza Calabresa (G)', 55],
    ]);
  });

  it('confere com os textos do banco', () => {
    const partes = comboX.partes.map((p) => ({ nome: p.nome, opcoes: p.opcoes }));
    expect(conferirCombo({ nome: '  Combo   X ', preco: 30, partes })).toBe('Combo X');
    expect(() => conferirCombo({ nome: '', preco: 30, partes })).toThrow('Digite o nome do combo.');
    expect(() => conferirCombo({ nome: 'C', preco: 0.5, partes })).toThrow('pelo menos R$ 1,00');
    expect(() => conferirCombo({ nome: 'C', preco: 30, partes: partes.slice(0, 1) })).toThrow('de 2 a 12 partes');
    const comAcrescimoNaFixa = [{ nome: null, opcoes: [opcao('z', 'x', { acrescimo: 1 })] }, partes[1]];
    expect(() => conferirCombo({ nome: 'C', preco: 30, partes: comAcrescimoNaFixa })).toThrow('Só as opções à escolha podem ter acréscimo.');
    const repetida = [{ nome: null, opcoes: [opcao('a', 'x', { rotulo: 'X-Burguer' }), opcao('b', 'x', { rotulo: 'X-Burguer' })] }, partes[1]];
    expect(() => conferirCombo({ nome: 'C', preco: 30, partes: repetida })).toThrow('X-Burguer aparece duas vezes na mesma parte do combo.');
  });
});

describe('itens do pedido', () => {
  const itens = [
    { nome: 'Batata frita', quantidade: 1, preco_unitario: 15, combo_grupo: null },
    { nome: 'Batata frita', quantidade: 2, preco_unitario: 11.54, combo_grupo: 'g', combo_id: 'cx', combo_nome: 'Combo X', combo_parte: 1 },
    { nome: 'X-Burguer', quantidade: 2, preco_unitario: 13.84, combo_grupo: 'g', combo_id: 'cx', combo_nome: 'Combo X', combo_parte: 0 },
    { nome: 'Suco natural', quantidade: 2, preco_unitario: 6.62, combo_grupo: 'g', combo_id: 'cx', combo_nome: 'Combo X', combo_parte: 2 },
  ];

  it('junta as partes de cada combo, na ordem das partes, com o preço do combo', () => {
    const [solto, combo] = agruparItens(itens);
    expect(solto).toMatchObject({ combo: false, item: { nome: 'Batata frita' } });
    expect(combo).toMatchObject({ combo: true, nome: 'Combo X', quantidade: 2, preco_unitario: 32 });
    expect(combo.itens.map((i) => i.nome)).toEqual(['X-Burguer', 'Batata frita', 'Suco natural']);
  });

  it('resumo para conta e caixa', () => {
    expect(resumoDosItens(itens)).toBe('1× Batata frita, 2× Combo X (X-Burguer, Batata frita, Suco natural)');
  });
});
