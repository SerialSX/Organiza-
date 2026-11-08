import { describe, expect, it } from 'vitest';
import { custoMeioAMeio, nomeDoItem, precoMeioAMeio, regraValida, saboresParaCombinar, tamanhoQueCombina } from './meioAMeio';

const tamanhos = (lista) => lista.map(([nome, preco, disponivel = true], i) => ({ id: `${nome}-${i}`, nome, preco, disponivel }));
const calabresa = { id: 'c', nome: 'Calabresa', meio_a_meio: true, disponivel: true, tamanhos: tamanhos([['M', 45], ['G', 55]]) };
const portuguesa = { id: 'p', nome: 'Portuguesa', meio_a_meio: true, disponivel: true, tamanhos: tamanhos([['m', 48], ['G', 60, false]]) };
const mussarela = { id: 'm', nome: 'Mussarela', meio_a_meio: true, disponivel: false, tamanhos: tamanhos([['G', 52]]) };
const atum = { id: 'a', nome: 'Atum', meio_a_meio: false, disponivel: true, tamanhos: tamanhos([['G', 50]]) };
const broto = { id: 'b', nome: 'Broto', meio_a_meio: true, disponivel: true, preco: 20, tamanhos: [] };
const broto2 = { id: 'b2', nome: 'Broto de milho', meio_a_meio: true, disponivel: true, preco: 24, tamanhos: [] };
const todos = [calabresa, portuguesa, mussarela, atum, broto, broto2];

describe('preço do meio a meio (o mesmo do banco)', () => {
  it('mais caro e média', () => {
    expect(precoMeioAMeio('mais_caro', 55, 60)).toBe(60);
    expect(precoMeioAMeio('media', 55, 60)).toBe(57.5);
  });
  it('média arredonda meio centavo para cima, como o round do Postgres', () => {
    expect(precoMeioAMeio('media', 45, 48.15)).toBe(46.58);
    expect(precoMeioAMeio('media', 0.01, 0.02)).toBe(0.02);
  });
  it('custo: metade de cada; sem o custo de um, fica sem saber', () => {
    expect(custoMeioAMeio(16, 21)).toBe(18.5);
    expect(custoMeioAMeio(16, null)).toBeNull();
    expect(custoMeioAMeio(undefined, 3)).toBeNull();
  });
  it('só as duas regras valem', () => {
    expect(regraValida('mais_caro')).toBe(true);
    expect(regraValida('media')).toBe(true);
    expect(regraValida('metade')).toBe(false);
    expect(regraValida(null)).toBe(false);
  });
});

describe('quais sabores combinam', () => {
  it('mesmo tamanho, sem ligar para maiúscula', () => {
    expect(tamanhoQueCombina(portuguesa, 'M').nome).toBe('m');
    expect(tamanhoQueCombina(mussarela, 'M')).toBeUndefined();
    expect(tamanhoQueCombina(broto, null)).toBeNull();
    expect(tamanhoQueCombina(calabresa, null)).toBeUndefined();
  });
  it('G: os marcados com G, esgotado riscado; desmarcado e o próprio sabor ficam de fora', () => {
    const lista = saboresParaCombinar(todos, calabresa, calabresa.tamanhos[1]);
    expect(lista.map((s) => [s.produto.nome, s.preco, s.disponivel])).toEqual([
      ['Mussarela', 52, false],
      ['Portuguesa', 60, false],
    ]);
  });
  it('M: só a Portuguesa tem', () => {
    expect(saboresParaCombinar(todos, calabresa, calabresa.tamanhos[0]).map((s) => [s.produto.nome, s.preco, s.disponivel])).toEqual([
      ['Portuguesa', 48, true],
    ]);
  });
  it('sem tamanhos: combina com os outros sem tamanhos', () => {
    expect(saboresParaCombinar(todos, broto, null).map((s) => s.produto.nome)).toEqual(['Broto de milho']);
  });
});

describe('nome do item', () => {
  it('meio a meio com e sem tamanho; e o de sempre', () => {
    expect(nomeDoItem('Calabresa', 'G', 'Portuguesa')).toBe('G: ½ Calabresa + ½ Portuguesa');
    expect(nomeDoItem('Broto', null, 'Broto de milho')).toBe('½ Broto + ½ Broto de milho');
    expect(nomeDoItem('Pizza Calabresa', 'G', null)).toBe('Pizza Calabresa (G)');
    expect(nomeDoItem('Suco', null, null)).toBe('Suco');
  });
});
