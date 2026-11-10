import { describe, expect, it } from 'vitest';
import { algumTamanhoDisponivel, conferirTamanhos, faixaDePreco, tamanhoDisponivel } from './tamanhos';
import { CARDAPIOS_PRONTOS } from './cardapiosProntos';
import {
  comTamanhosDesligados,
  comTamanhosLigados,
  FORM_VAZIO,
  preencherNomes,
  validarProduto,
} from './formularioProduto';

const t = (nome, preco, extra = {}) => ({ nome, preco, disponivel: true, ...extra });

describe('conferirTamanhos (mesmos textos do banco)', () => {
  it('aceita de 2 a 8, recusa 1 e mais de 8', () => {
    expect(() => conferirTamanhos([t('P', 30), t('G', 50)])).not.toThrow();
    expect(() => conferirTamanhos([t('P', 30)])).toThrow('Com um tamanho só, use o preço do produto');
    expect(() => conferirTamanhos(Array.from({ length: 9 }, (_, i) => t(`T${i}`, 10)))).toThrow('até 8 tamanhos');
  });

  it('recusa nome repetido (sem ligar para maiúscula e espaço), sem preço e nome longo', () => {
    expect(() => conferirTamanhos([t('300 ml', 10), t(' 300  ML ', 12)])).toThrow('Dois tamanhos com o nome "300 ML"');
    expect(() => conferirTamanhos([t('P', 0), t('G', 50)])).toThrow('Digite o preço de cada tamanho.');
    expect(() => conferirTamanhos([t('x'.repeat(21), 10), t('G', 50)])).toThrow('de 1 a 20 letras');
  });

  it('com o nome do produto diz qual está errado', () => {
    expect(() => conferirTamanhos([t('P', 30)], 'Pizza')).toThrow('Pizza precisa ter de 2 a 8 tamanhos.');
    expect(() => conferirTamanhos([t('P', 30), t('p', 40)], 'Pizza')).toThrow('Pizza tem dois tamanhos com o nome "p".');
  });
});

describe('esgotado e preço', () => {
  const pizza = { nome: 'Pizza', preco: 30, disponivel: true, tamanhos: [t('P', 30), t('G', 50, { disponivel: false })] };

  it('o esgotado do produto vale para todos os tamanhos', () => {
    expect(tamanhoDisponivel(pizza, pizza.tamanhos[0])).toBe(true);
    expect(tamanhoDisponivel(pizza, pizza.tamanhos[1])).toBe(false);
    expect(algumTamanhoDisponivel(pizza)).toBe(true);
    expect(algumTamanhoDisponivel({ ...pizza, disponivel: false })).toBe(false);
    expect(algumTamanhoDisponivel({ ...pizza, tamanhos: pizza.tamanhos.map((x) => ({ ...x, disponivel: false })) })).toBe(false);
  });

  it('mostra a faixa de preço', () => {
    expect(faixaDePreco(pizza)).toBe('R$ 30,00 a R$ 50,00');
    expect(faixaDePreco({ preco: 8, tamanhos: [] })).toBe('R$ 8,00');
  });

  it('o cardápio pronto de pizzaria tem tamanhos válidos', () => {
    const pizzaria = CARDAPIOS_PRONTOS.find((c) => c.id === 'pizzaria');
    expect(pizzaria.comTamanhos).toBe(true);
    for (const p of pizzaria.produtos.filter((x) => x.tamanhos)) {
      expect(() => conferirTamanhos(p.tamanhos, p.nome)).not.toThrow();
      expect(p.tamanhos.map((x) => x.nome)).toEqual(['P', 'M', 'G']);
    }
  });
});

describe('formulário de produto com tamanhos', () => {
  const queijo = { id: 'q', nome: 'Queijo', unidade: 'g', preco_compra: 40, quantidade_compra: 1000 };
  const oregano = { id: 'o', nome: 'Orégano', unidade: 'g', preco_compra: null, quantidade_compra: null };
  const porId = { q: queijo, o: oregano };

  function formComTamanhos() {
    const ligado = comTamanhosLigados({ ...FORM_VAZIO, nome: 'Pizza', lista: [{ ingrediente_id: 'q', quantidade: '100' }] });
    const tamanhos = preencherNomes(ligado.tamanhos, ['P', 'M', 'G']).map((x, i) => ({ ...x, preco: ['30', '40', '50,5'][i] }));
    return { ...ligado, tamanhos };
  }

  it('ligar os tamanhos copia a quantidade para todos', () => {
    const f = formComTamanhos();
    expect(f.tamanhos.map((x) => x.nome)).toEqual(['P', 'M', 'G']);
    // P e M vieram das 2 linhas que já existiam; G é linha nova, em branco.
    expect(Object.values(f.lista[0].por)).toEqual(['100', '100']);
  });

  it('custo de cada tamanho sai dos ingredientes; preço do produto é o do primeiro', () => {
    const f = formComTamanhos();
    const [p, m, g] = f.tamanhos;
    f.lista = [{ ingrediente_id: 'q', por: { [p.chave]: '100', [m.chave]: '150', [g.chave]: '200' } }];
    const { dados } = validarProduto(f, porId);
    expect(dados.tamanhos.map((x) => [x.nome, x.preco, x.custo])).toEqual([
      ['P', 30, 4],
      ['M', 40, 6],
      ['G', 50.5, 8],
    ]);
    expect([dados.preco, dados.custo]).toEqual([30, 4]);
    expect(dados.lista).toEqual([{ ingrediente_id: 'q', porChave: { [p.chave]: 100, [m.chave]: 150, [g.chave]: 200 } }]);
  });

  it('ingrediente pode faltar num tamanho, mas não em todos', () => {
    const f = formComTamanhos();
    const [, , g] = f.tamanhos;
    f.lista = [
      { ingrediente_id: 'q', por: { [g.chave]: '50' } },
      { ingrediente_id: 'o', por: {} },
    ];
    expect(validarProduto(f, porId).erros.lista).toMatch(/pelo menos um tamanho/);
    f.lista = [{ ingrediente_id: 'q', por: { [g.chave]: '50' } }];
    const { dados } = validarProduto(f, porId);
    // Sem queijo, P e M não têm custo pelos ingredientes: fica o digitado (vazio).
    expect(dados.tamanhos.map((x) => x.custo)).toEqual([null, null, 2]);
  });

  it('erros por tamanho: nome vazio, repetido e preço', () => {
    const f = formComTamanhos();
    f.tamanhos = [
      { ...f.tamanhos[0], nome: '' },
      { ...f.tamanhos[1], nome: 'G' },
      { ...f.tamanhos[2], nome: 'g', preco: '' },
    ];
    const { erros } = validarProduto(f, porId);
    expect(erros[`tamanho-nome-${f.tamanhos[0].chave}`]).toMatch(/Digite o nome/);
    expect(erros[`tamanho-nome-${f.tamanhos[2].chave}`]).toMatch(/Já tem um tamanho/);
    expect(erros[`tamanho-preco-${f.tamanhos[2].chave}`]).toMatch(/preço/);
  });

  it('um tamanho só não salva', () => {
    const f = formComTamanhos();
    f.tamanhos = f.tamanhos.slice(0, 1);
    expect(validarProduto(f, porId).erros.tamanhos).toMatch(/pelo menos 2/);
  });

  it('desligar os tamanhos de um produto salvo pede o preço único de novo', () => {
    const f = formComTamanhos();
    const [p] = f.tamanhos;
    f.lista = [{ ingrediente_id: 'q', quantidade: '100', por: { [p.chave]: '120' } }];
    const sem = comTamanhosDesligados({ ...f, preco: '30' }, true);
    expect(sem).toMatchObject({ comTamanhos: false, tamanhos: [], preco: '' });
    expect(sem.lista).toEqual([{ ingrediente_id: 'q', quantidade: '120' }]);
    expect(validarProduto(sem, porId).erros.preco).toBeTruthy();
  });
});
