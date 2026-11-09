// @vitest-environment jsdom
// Combos e promoções no modo demonstração. As regras devem ser as mesmas das
// funções do banco (supabase/testes/combos-e-promocoes.mjs testa o SQL); se
// mudar aqui, confira lá.
import { beforeEach, describe, expect, it } from 'vitest';
import { lerDemo, salvarDemo } from './demoStore';
import { excluirCombo, listarCombos, mudarDisponivelDoCombo, salvarCombo } from './combos';
import { apagarPromocao, listarPromocoes, mudarAtivaDaPromocao, salvarPromocao } from './promocoes';
import { buscarPedidoComValores, criarPedido, editarPedido } from './pedidos';
import { calcularRelatorio, rankingParaCsv } from './relatorios';
import { agruparItens } from '../lib/combos';

const produto = (id, nome, preco, custo = null) => ({ id, negocio_id: 'n', nome, preco, custo, disponivel: true, arquivado: false, meio_a_meio: false });
const TODO_DIA = [0, 1, 2, 3, 4, 5, 6];

let chave = 0;
function pedir(itens) {
  chave += 1;
  return criarPedido({ negocioId: 'n', usuarioId: 'u', itens, chaveEnvio: `k-${chave}` });
}
const itens = async (id) => (await buscarPedidoComValores(id)).itens;
const parte = (...ids) => ({ nome: null, opcoes: ids.map(([produto_id, acrescimo = 0]) => ({ produto_id, tamanho_id: null, acrescimo, rotulo: produto_id })) });
const escolha = (...ids) => ids.map((produto_id) => ({ produto_id, tamanho_id: null, segundo_produto_id: null }));

let comboX;
beforeEach(async () => {
  localStorage.clear();
  salvarDemo({
    produtos: [produto('x', 'X-Burguer', 18, 7), produto('bat', 'Batata frita', 15, 4), produto('refri', 'Refrigerante lata', 6, 3), produto('suco', 'Suco natural', 8, 2)],
    ingredientes: [],
    pedidos: [],
    itens_pedido: [],
  });
  comboX = await salvarCombo({ nome: 'Combo X', preco: 30, partes: [parte(['x']), parte(['bat']), { ...parte(['refri'], ['suco', 2]), nome: 'Bebida' }] });
});

describe('cadastro do combo', () => {
  it('salva com partes e opções em ordem; editar troca tudo; nome repetido não', async () => {
    const [combo] = await listarCombos();
    expect(combo).toMatchObject({ id: comboX, nome: 'Combo X', preco: 30, disponivel: true });
    expect(combo.partes.map((p) => [p.nome, p.opcoes.map((o) => [o.produto_id, o.acrescimo])])).toEqual([
      [null, [['x', 0]]],
      [null, [['bat', 0]]],
      ['Bebida', [['refri', 0], ['suco', 2]]],
    ]);
    await expect(salvarCombo({ nome: 'combo x', preco: 20, partes: [parte(['x']), parte(['bat'])] })).rejects.toThrow('Já existe um combo chamado');
    await salvarCombo({ id: comboX, nome: 'Combo X', preco: 28, partes: [parte(['x']), parte(['refri'])] });
    expect((await listarCombos())[0]).toMatchObject({ preco: 28, partes: [{ opcoes: [{ produto_id: 'x' }] }, { opcoes: [{ produto_id: 'refri' }] }] });
    await excluirCombo(comboX);
    expect(await listarCombos()).toEqual([]);
  });
});

describe('pedido com combo', () => {
  it('cada parte vira um item com a parte do preço (pelo preço normal) e o acréscimo da escolha', async () => {
    const p = await pedir([{ combo_id: comboX, partes: escolha('x', 'bat', 'suco'), quantidade: 2, observacao: 'sem cebola' }]);
    const linhas = await itens(p.id);
    // 30 dividido por 18, 15 e 8 (o suco), e o suco com mais R$ 2.
    expect(linhas.map((i) => [i.nome, i.quantidade, i.preco_unitario, i.custo_unitario, i.combo_nome, i.combo_parte])).toEqual([
      ['X-Burguer', 2, 13.17, 7, 'Combo X', 0],
      ['Batata frita', 2, 10.98, 4, 'Combo X', 1],
      ['Suco natural', 2, 7.85, 2, 'Combo X', 2],
    ]);
    const [combo] = agruparItens(linhas);
    expect(combo).toMatchObject({ combo: true, nome: 'Combo X', quantidade: 2, preco_unitario: 32, observacao: 'sem cebola' });
    expect(new Set(linhas.map((i) => i.combo_grupo)).size).toBe(1);
  });

  it('recusa com os textos do banco', async () => {
    await expect(pedir([{ combo_id: comboX, partes: escolha('x', 'bat'), quantidade: 1 }])).rejects.toThrow('O combo Combo X mudou no cardápio.');
    await expect(pedir([{ combo_id: comboX, partes: escolha('x', 'bat', 'x'), quantidade: 1 }])).rejects.toThrow('O combo Combo X mudou no cardápio.');
    salvarDemo({ ...lerDemo(), produtos: lerDemo().produtos.map((p) => (p.id === 'bat' ? { ...p, disponivel: false } : p)) });
    await expect(pedir([{ combo_id: comboX, partes: escolha('x', 'bat', 'refri'), quantidade: 1 }])).rejects.toThrow(
      'No combo Combo X, Batata frita esgotou. Revise o pedido.',
    );
    await mudarDisponivelDoCombo(comboX, false);
    await expect(pedir([{ combo_id: comboX, partes: escolha('x', 'bat', 'refri'), quantidade: 1 }])).rejects.toThrow('O combo Combo X esgotou.');
  });

  it('editar mantém o preço do combo que já estava, mesmo que o combo tenha mudado', async () => {
    const p = await pedir([{ combo_id: comboX, partes: escolha('x', 'bat', 'refri'), quantidade: 1 }]);
    await salvarCombo({ id: comboX, nome: 'Combo X', preco: 35, partes: [parte(['x']), parte(['bat']), parte(['refri'], ['suco'])] });
    const completo = await buscarPedidoComValores(p.id);
    await editarPedido(p.id, [{ combo_id: comboX, partes: escolha('x', 'bat', 'refri'), quantidade: 3 }], completo.alterado_em);
    const grupos = agruparItens(await itens(p.id));
    expect(grupos.map(c=>[c.quantidade,c.preco_unitario])).toEqual([[1,30],[2,35]]);
  });
});

describe('promoções', () => {
  it('produto e combo em promoção: preço mais baixo, nome e preço cheio guardados; pausada não vale', async () => {
    const id = await salvarPromocao({
      nome: 'Dia do X',
      dias: TODO_DIA,
      diaTodo: true,
      itens: [
        { produto_id: 'x', tamanho_id: null, preco: 15, nome: 'X-Burguer', normal: 18 },
        { combo_id: comboX, preco: 25, nome: 'Combo X', normal: 30, combo: true },
      ],
    });
    expect((await listarPromocoes())[0]).toMatchObject({ id, nome: 'Dia do X', ativa: true, hora_inicio: null });
    const p = await pedir([
      { produto_id: 'x', quantidade: 2 },
      { combo_id: comboX, partes: escolha('x', 'bat', 'refri'), quantidade: 1 },
    ]);
    const linhas = await itens(p.id);
    expect(linhas[0]).toMatchObject({ preco_unitario: 15, preco_cheio: 18, promocao: 'Dia do X', promocao_id: id });
    const [, combo] = agruparItens(linhas);
    expect(combo.preco_unitario).toBe(25);
    expect(combo.itens.every((i) => i.promocao === 'Dia do X')).toBe(true);

    const relatorio = calcularRelatorio([await buscarPedidoComValores(p.id)], lerDemo().produtos);
    // Desconto: 2 × (18 − 15) no avulso e 30 − 25 no combo.
    expect(relatorio.promocoes).toEqual([expect.objectContaining({ nome: 'Dia do X', vendas: 3, faturamento: 55, desconto: 11 })]);
    expect(relatorio.descontoDasPromocoes).toBe(11);
    expect(relatorio.combos).toEqual([expect.objectContaining({ nome: 'Combo X', quantidade: 1, faturamento: 25 })]);
    const x = relatorio.ranking.find((r) => r.produto_id === 'x');
    expect(x).toMatchObject({ quantidade: 3, emCombo: 1 });
    const csv = rankingParaCsv(relatorio.ranking, relatorio.combos, relatorio.promocoes);
    expect(csv).toContain('Em combo');
    expect(csv).toContain('Combo X;1;25,00;');
    expect(csv).toContain('Dia do X;3;55,00;11,00');

    // Editar depois que pausou mantém o preço da promoção.
    await mudarAtivaDaPromocao(id, false);
    const completo = await buscarPedidoComValores(p.id);
    await editarPedido(p.id, [{ produto_id: 'x', quantidade: 3 }], completo.alterado_em);
    expect((await itens(p.id)).map(i=>[i.quantidade,i.preco_unitario])).toEqual([[2,15],[1,18]]);
    const novo = await pedir([{ produto_id: 'x', quantidade: 1 }]);
    expect((await itens(novo.id))[0]).toMatchObject({ preco_unitario: 18, promocao: null });

    // Apagar de vez: o pedido guarda o nome e o preço.
    await apagarPromocao(id);
    expect(await listarPromocoes()).toEqual([]);
    expect((await itens(p.id))[0]).toMatchObject({ preco_unitario: 15, promocao: 'Dia do X', promocao_id: null });
  });

  it('pedido guardado sem internet usa a promoção do momento em que foi feito', async () => {
    await salvarPromocao({ nome: 'Dia do X', dias: TODO_DIA, diaTodo: true, itens: [{ produto_id: 'x', tamanho_id: null, preco: 15, nome: 'X-Burguer', normal: 18 }] });
    const [promo] = await listarPromocoes();
    await mudarAtivaDaPromocao(promo.id, false);
    // Pausada não vale em momento nenhum, nem no de uma hora atrás.
    const p = await pedir([{ produto_id: 'x', quantidade: 1, promocao_em: new Date(Date.now() - 3600000).toISOString() }]);
    expect((await itens(p.id))[0].preco_unitario).toBe(18);
    // Momento antigo demais (mais de 12 horas) vale o de agora.
    await mudarAtivaDaPromocao(promo.id, true);
    const q = await pedir([{ produto_id: 'x', quantidade: 1, promocao_em: '2020-01-01T12:00:00Z' }]);
    expect((await itens(q.id))[0].preco_unitario).toBe(15);
  });

  it('recusa com os textos do banco', async () => {
    const base = { nome: 'P', dias: [2], diaTodo: false, inicio: '17:00', fim: '19:00' };
    await expect(salvarPromocao({ ...base, itens: [{ produto_id: 'x', preco: 18, nome: 'X-Burguer', normal: 18 }] })).rejects.toThrow(
      'precisa ser menor que o normal',
    );
    await expect(salvarPromocao({ ...base, inicio: '03:00', itens: [{ produto_id: 'x', preco: 15, nome: 'X-Burguer', normal: 18 }] })).rejects.toThrow(
      'A promoção precisa começar a partir das 5h.',
    );
  });
});
