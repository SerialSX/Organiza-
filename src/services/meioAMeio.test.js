// @vitest-environment jsdom
// Meio a meio no modo demonstração. As regras devem ser as mesmas das funções
// do banco (supabase/testes/meio-a-meio.mjs testa o SQL); se mudar aqui, confira lá.
import { beforeEach, describe, expect, it } from 'vitest';
import { lerDemo, salvarDemo } from './demoStore';
import { criarProdutos, listarProdutos, mudarDisponivelDoTamanho, salvarTamanhosDoProduto } from './produtos';
import { salvarIngredientesDoProduto } from './ingredientes';
import { buscarPedidoComValores, criarPedido, editarPedido, listarPedidosAbertos, marcarIngredienteFaltou } from './pedidos';
import { calcularRelatorio, rankingParaCsv } from './relatorios';

const produto = (id, nome, extra = {}) => ({ id, negocio_id: 'n', nome, preco: 1, custo: null, disponivel: true, arquivado: false, meio_a_meio: true, ...extra });
const queijo = { id: 'q', negocio_id: 'n', nome: 'Queijo', unidade: 'g', preco_compra: 40, quantidade_compra: 1000, arquivado: false };
const presunto = { id: 'pr', negocio_id: 'n', nome: 'Presunto', unidade: 'g', preco_compra: 30, quantidade_compra: 1000, arquivado: false };

let chave = 0;
function pedir(itens) {
  chave += 1;
  return criarPedido({ negocioId: 'n', usuarioId: 'u', itens, chaveEnvio: `k-${chave}` });
}
const regra = (r) => salvarDemo({ ...lerDemo(), perfil: { ...(lerDemo().perfil ?? {}), regra_meio_a_meio: r } });
const t = {};

beforeEach(async () => {
  localStorage.clear();
  salvarDemo({
    produtos: [
      produto('cal', 'Calabresa'),
      produto('por', 'Portuguesa'),
      produto('mus', 'Mussarela'),
      produto('atum', 'Atum', { meio_a_meio: false }),
      produto('b1', 'Broto de frango', { preco: 20, custo: 6 }),
      produto('b2', 'Broto de milho', { preco: 24, custo: 8 }),
    ],
    ingredientes: [queijo, presunto],
    pedidos: [],
    itens_pedido: [],
  });
  for (const [id, lista] of [
    ['cal', [{ nome: 'M', preco: 45, custo: 12 }, { nome: 'G', preco: 55, custo: 16 }]],
    ['por', [{ nome: 'm', preco: 48, custo: 14 }, { nome: 'G', preco: 60, custo: 21 }]],
    ['mus', [{ nome: 'P', preco: 33 }, { nome: 'G', preco: 52 }]],
    ['atum', [{ nome: 'P', preco: 30 }, { nome: 'G', preco: 50 }]],
  ]) {
    t[id] = Object.fromEntries((await salvarTamanhosDoProduto(id, lista)).map((x) => [x.nome, x.id]));
  }
  regra('mais_caro');
});

const itens = async (id) => (await buscarPedidoComValores(id)).itens;

describe('pedido meio a meio', () => {
  it('mais caro: G sai pelo preço da Portuguesa G; custo é metade de cada; o nome junta os dois', async () => {
    const p = await pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 2 }]);
    const [item] = await itens(p.id);
    expect(item).toMatchObject({
      nome: 'G: ½ Calabresa + ½ Portuguesa',
      tamanho: 'G',
      segundo_sabor: 'Portuguesa',
      segundo_produto_id: 'por',
      segundo_tamanho_id: t.por.G,
      preco_unitario: 60,
      custo_unitario: 18.5,
    });
  });

  it('média, com e sem tamanho; mudar a regra não muda o pedido feito', async () => {
    const antes = await pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 }]);
    regra('media');
    const p = await pedir([
      { produto_id: 'cal', tamanho_id: t.cal.M, segundo_produto_id: 'por', quantidade: 1 },
      { produto_id: 'b1', segundo_produto_id: 'b2', quantidade: 1 },
    ]);
    expect((await itens(p.id)).map((i) => [i.nome, i.preco_unitario, i.custo_unitario])).toEqual([
      ['M: ½ Calabresa + ½ Portuguesa', 46.5, 13],
      ['½ Broto de frango + ½ Broto de milho', 22, 7],
    ]);
    expect((await itens(antes.id))[0].preco_unitario).toBe(60);
  });

  it('recusa com as mesmas mensagens do banco', async () => {
    await expect(pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'cal', quantidade: 1 }])).rejects.toThrow(
      'Escolha dois sabores diferentes',
    );
    await expect(pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'atum', quantidade: 1 }])).rejects.toThrow(
      'Atum não pode ser meio a meio',
    );
    await expect(pedir([{ produto_id: 'atum', tamanho_id: t.atum.G, segundo_produto_id: 'cal', quantidade: 1 }])).rejects.toThrow(
      'Atum não pode ser meio a meio',
    );
    await expect(pedir([{ produto_id: 'cal', tamanho_id: t.cal.M, segundo_produto_id: 'mus', quantidade: 1 }])).rejects.toThrow(
      'O sabor Mussarela não tem o tamanho M',
    );
    await expect(pedir([{ produto_id: 'b1', segundo_produto_id: 'cal', quantidade: 1 }])).rejects.toThrow(
      'Os dois sabores precisam ter o mesmo tamanho',
    );
    await expect(pedir([{ produto_id: 'b1', segundo_produto_id: 'nao-existe', quantidade: 1 }])).rejects.toThrow(
      'Um dos sabores saiu do cardápio',
    );
    regra(null);
    await expect(pedir([{ produto_id: 'b1', segundo_produto_id: 'b2', quantidade: 1 }])).rejects.toThrow(
      'Escolha em Minha conta como cobrar o meio a meio',
    );
  });

  it('sabor esgotado (o produto ou só o tamanho) falha com o motivo, como o pedido guardado sem internet', async () => {
    salvarDemo({ ...lerDemo(), produtos: lerDemo().produtos.map((p) => (p.id === 'b2' ? { ...p, disponivel: false } : p)) });
    await expect(pedir([{ produto_id: 'b1', segundo_produto_id: 'b2', quantidade: 1 }])).rejects.toThrow('O sabor Broto de milho esgotou');
    await mudarDisponivelDoTamanho(t.por.G, false);
    await expect(pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 }])).rejects.toThrow(
      'O sabor Portuguesa esgotou no tamanho G',
    );
  });

  it('editar mantém o preço combinado mesmo esgotado e com a regra mudada; trocar o sabor é item novo', async () => {
    const p = await pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 }]);
    await mudarDisponivelDoTamanho(t.por.G, false);
    regra('media');
    let completo = await buscarPedidoComValores(p.id);
    await expect(editarPedido(p.id, [{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 3 }], completo.alterado_em)).rejects.toThrow('esgotou');
    await editarPedido(p.id, [{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 }], completo.alterado_em);
    completo = await buscarPedidoComValores(p.id);
    expect(completo.itens.map((i) => [i.quantidade, i.preco_unitario, i.segundo_tamanho_id])).toEqual([[1, 60, t.por.G]]);
    await editarPedido(p.id, [{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'mus', quantidade: 1 }], completo.alterado_em);
    completo = await buscarPedidoComValores(p.id);
    expect(completo.itens.map((i) => [i.segundo_sabor, i.preco_unitario, i.custo_unitario])).toEqual([['Mussarela', 53.5, null]]);
  });

  it('a cozinha vê os ingredientes dos dois sabores e marca o que faltou de qualquer um', async () => {
    await salvarIngredientesDoProduto('cal', [{ ingrediente_id: 'q', por_tamanho: { [t.cal.M]: 100, [t.cal.G]: 150 } }]);
    await salvarIngredientesDoProduto('por', [
      { ingrediente_id: 'q', por_tamanho: { [t.por.m]: 100, [t.por.G]: 150 } },
      { ingrediente_id: 'pr', por_tamanho: { [t.por.m]: 50, [t.por.G]: 80 } },
    ]);
    await pedir([{ produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 }]);
    const [pedido] = await listarPedidosAbertos();
    const [item] = pedido.itens;
    expect(item.ingredientes.map((i) => i.nome)).toEqual(['Presunto', 'Queijo']);
    expect(item.preco_unitario).toBeNull();
    await marcarIngredienteFaltou(item.id, 'pr', true);
    const [depois] = await listarPedidosAbertos();
    expect(depois.itens[0].faltou_ingredientes).toEqual(['Presunto']);
  });
});

describe('relatório', () => {
  it('cada sabor conta meia, com metade do faturamento e do lucro', async () => {
    await pedir([
      { produto_id: 'cal', tamanho_id: t.cal.G, segundo_produto_id: 'por', quantidade: 1 },
      { produto_id: 'cal', tamanho_id: t.cal.G, quantidade: 1 },
    ]);
    const pedidos = await Promise.all((await listarPedidosAbertos()).map((p) => buscarPedidoComValores(p.id)));
    const { ranking, faturamento, lucroEstimado } = calcularRelatorio(pedidos, await listarProdutos());
    const cal = ranking.find((r) => r.produto_id === 'cal');
    const por = ranking.find((r) => r.produto_id === 'por');
    // Meio a meio: 60 de venda, 18,50 de custo. Calabresa G inteira: 55 e 16.
    expect(cal).toMatchObject({ quantidade: 1.5, faturamento: 30 + 55, lucro: (60 - 18.5) / 2 + (55 - 16), detalheTamanhos: 'G 1,5' });
    expect(por).toMatchObject({ nome: 'Portuguesa', quantidade: 0.5, faturamento: 30, lucro: (60 - 18.5) / 2, detalheTamanhos: 'G 0,5' });
    expect(faturamento).toBe(115);
    expect(lucroEstimado).toBe(60 - 18.5 + 55 - 16);
    expect(rankingParaCsv(ranking)).toContain('Calabresa;1,5;G 1,5;85,00;');
  });
});

describe('cadastro', () => {
  it('cardápio pronto e produto novo guardam o "Pode ser meio a meio"', async () => {
    await criarProdutos('n', [
      { nome: 'Pizza Atum', meio_a_meio: true, tamanhos: [{ nome: 'P', preco: 30 }, { nome: 'G', preco: 50 }] },
      { nome: 'Guaraná', preco: 6, vai_para_cozinha: false },
    ]);
    const lista = await listarProdutos();
    expect(lista.find((p) => p.nome === 'Pizza Atum').meio_a_meio).toBe(true);
    expect(lista.find((p) => p.nome === 'Guaraná').meio_a_meio).toBe(false);
  });
});
