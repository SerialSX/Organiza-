// @vitest-environment jsdom
// Tamanhos no modo demonstração. As regras devem ser as mesmas das funções do
// banco (supabase/testes/tamanhos.mjs testa o SQL); se mudar aqui, confira lá.
import { beforeEach, describe, expect, it } from 'vitest';
import { lerDemo, salvarDemo } from './demoStore';
import { criarProdutos, listarProdutos, mudarDisponivelDoTamanho, salvarTamanhosDoProduto } from './produtos';
import { salvarIngredientesDoProduto, atualizarIngrediente } from './ingredientes';
import { buscarPedidoComValores, criarPedido, editarPedido, listarPedidosAbertos } from './pedidos';
import { calcularRelatorio } from './relatorios';

const pizza = { id: 'pz', negocio_id: 'n', nome: 'Pizza Calabresa', preco: 1, custo: null, disponivel: true, arquivado: false };
const suco = { id: 'suco', negocio_id: 'n', nome: 'Suco', preco: 8, custo: 2, disponivel: true, arquivado: false };
const queijo = { id: 'q', negocio_id: 'n', nome: 'Queijo', unidade: 'g', preco_compra: 40, quantidade_compra: 1000, arquivado: false };

let chave = 0;
function pedir(itens) {
  chave += 1;
  return criarPedido({ negocioId: 'n', usuarioId: 'u', itens, chaveEnvio: `k-${chave}` });
}

async function tamanhosDaPizza() {
  return (await listarProdutos()).find((p) => p.id === 'pz').tamanhos;
}

beforeEach(async () => {
  localStorage.clear();
  salvarDemo({ produtos: [pizza, suco], ingredientes: [queijo], pedidos: [], itens_pedido: [] });
  await salvarTamanhosDoProduto('pz', [
    { nome: 'P', preco: 35 },
    { nome: 'M', preco: 45 },
    { nome: 'G', preco: 55 },
  ]);
});

describe('cadastro', () => {
  it('salva na ordem e o produto fica com o preço do primeiro', async () => {
    const produto = (await listarProdutos()).find((p) => p.id === 'pz');
    expect(produto.tamanhos.map((t) => [t.nome, t.preco])).toEqual([
      ['P', 35],
      ['M', 45],
      ['G', 55],
    ]);
    expect(produto.preco).toBe(35);
    expect(suco.tamanhos).toBeUndefined();
    expect((await listarProdutos()).find((p) => p.id === 'suco').tamanhos).toEqual([]);
  });

  it('trocar P com G de lugar não esbarra no nome; tirar um arquiva', async () => {
    const [p, m, g] = await tamanhosDaPizza();
    await salvarTamanhosDoProduto('pz', [
      { id: g.id, nome: 'P', preco: 30 },
      { id: p.id, nome: 'G', preco: 60 },
    ]);
    const agora = await tamanhosDaPizza();
    expect(agora.map((t) => [t.id, t.nome, t.preco])).toEqual([
      [g.id, 'P', 30],
      [p.id, 'G', 60],
    ]);
    expect(lerDemo().produto_tamanhos.find((t) => t.id === m.id).arquivado).toBe(true);
  });

  it('recusa um tamanho só e nome repetido', async () => {
    await expect(salvarTamanhosDoProduto('pz', [{ nome: 'P', preco: 1 }])).rejects.toThrow('Com um tamanho só');
    await expect(
      salvarTamanhosDoProduto('pz', [
        { nome: 'G', preco: 1 },
        { nome: 'g', preco: 2 },
      ]),
    ).rejects.toThrow('Dois tamanhos com o nome');
  });

  it('custo de cada tamanho pelos ingredientes, e muda junto com o preço do queijo', async () => {
    const [p, m, g] = await tamanhosDaPizza();
    await salvarIngredientesDoProduto('pz', [{ ingrediente_id: 'q', por_tamanho: { [p.id]: 100, [m.id]: 150, [g.id]: 200 } }]);
    let produto = (await listarProdutos()).find((x) => x.id === 'pz');
    expect(produto.tamanhos.map((t) => t.custo)).toEqual([4, 6, 8]);
    expect(produto.custo).toBe(4);
    // A lista do produto (para o "faltou") fica com a maior quantidade.
    expect(produto.ingredientes).toEqual([{ ingrediente_id: 'q', quantidade: 200 }]);
    await atualizarIngrediente('q', { preco_compra: 80 });
    produto = (await listarProdutos()).find((x) => x.id === 'pz');
    expect(produto.tamanhos.map((t) => t.custo)).toEqual([8, 12, 16]);
  });

  it('produto com tamanhos exige a quantidade por tamanho', async () => {
    await expect(salvarIngredientesDoProduto('pz', [{ ingrediente_id: 'q', quantidade: 100 }])).rejects.toThrow(
      'Este produto tem tamanhos',
    );
  });

  it('cardápio pronto cria produto com tamanhos e sem, de uma vez', async () => {
    const criados = await criarProdutos('n', [
      {
        nome: 'Pizza Mussarela',
        tamanhos: [
          { nome: 'P', preco: 33 },
          { nome: 'G', preco: 52 },
        ],
      },
      { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
      { nome: 'suco', preco: 9 },
    ]);
    expect(criados).toBe(2);
    const mussarela = (await listarProdutos()).find((p) => p.nome === 'Pizza Mussarela');
    expect([mussarela.preco, mussarela.tamanhos.map((t) => t.nome)]).toEqual([33, ['P', 'G']]);
  });
});

describe('pedido', () => {
  it('produto com tamanhos precisa do tamanho; cada tamanho com o seu preço', async () => {
    const [p, , g] = await tamanhosDaPizza();
    await expect(pedir([{ produto_id: 'pz', quantidade: 1 }])).rejects.toThrow('Escolha o tamanho de Pizza Calabresa');
    const pedido = await pedir([
      { produto_id: 'pz', tamanho_id: g.id, quantidade: 2 },
      { produto_id: 'pz', tamanho_id: p.id, quantidade: 1 },
    ]);
    const completo = await buscarPedidoComValores(pedido.id);
    expect(completo.itens.map((i) => [i.nome, i.produto_nome, i.tamanho, i.preco_unitario])).toEqual([
      ['Pizza Calabresa (G)', 'Pizza Calabresa', 'G', 55],
      ['Pizza Calabresa (P)', 'Pizza Calabresa', 'P', 35],
    ]);
    // A cozinha recebe o tamanho (para o selo grande), sem preço.
    const [naCozinha] = await listarPedidosAbertos();
    expect(naCozinha.itens[0]).toMatchObject({ tamanho: 'G', preco_unitario: null });
  });

  it('tamanho esgotado não entra; o produto esgotado esgota todos', async () => {
    const [p, , g] = await tamanhosDaPizza();
    await mudarDisponivelDoTamanho(g.id, false);
    await expect(pedir([{ produto_id: 'pz', tamanho_id: g.id, quantidade: 1 }])).rejects.toThrow('esgotou');
    await expect(pedir([{ produto_id: 'pz', tamanho_id: p.id, quantidade: 1 }])).resolves.toBeTruthy();
    salvarDemo({ ...lerDemo(), produtos: lerDemo().produtos.map((x) => (x.id === 'pz' ? { ...x, disponivel: false } : x)) });
    await expect(pedir([{ produto_id: 'pz', tamanho_id: p.id, quantidade: 1 }])).rejects.toThrow('esgotou');
  });

  it('pedido guardado sem internet com tamanho que saiu do cardápio falha com o motivo', async () => {
    const [p, m, g] = await tamanhosDaPizza();
    await salvarTamanhosDoProduto('pz', [
      { id: p.id, nome: 'P', preco: 35 },
      { id: g.id, nome: 'G', preco: 55 },
    ]);
    await expect(pedir([{ produto_id: 'pz', tamanho_id: m.id, quantidade: 1 }])).rejects.toThrow(
      'O tamanho M de Pizza Calabresa saiu do cardápio. Lance o pedido de novo.',
    );
  });

  it('editar mantém o preço combinado e o nome do tamanho; trocar P por G é item novo com o preço da G', async () => {
    const [p, , g] = await tamanhosDaPizza();
    const pedido = await pedir([{ produto_id: 'pz', tamanho_id: p.id, quantidade: 1 }]);
    // Depois do pedido, a P sobe de preço e muda de nome.
    await salvarTamanhosDoProduto('pz', [
      { id: p.id, nome: 'Pequena', preco: 40 },
      { id: g.id, nome: 'G', preco: 55 },
    ]);
    let completo = await buscarPedidoComValores(pedido.id);
    await editarPedido(pedido.id, [{ produto_id: 'pz', tamanho_id: p.id, quantidade: 2 }], completo.alterado_em);
    completo = await buscarPedidoComValores(pedido.id);
    expect(completo.itens.map((i) => [i.tamanho, i.quantidade, i.preco_unitario])).toEqual([['P', 1, 35], ['Pequena', 1, 40]]);
    await editarPedido(pedido.id, [{ produto_id: 'pz', tamanho_id: g.id, quantidade: 2 }], completo.alterado_em);
    completo = await buscarPedidoComValores(pedido.id);
    expect(completo.itens.map((i) => [i.tamanho, i.preco_unitario])).toEqual([['G', 55]]);
  });

  it('tamanho que saiu do cardápio continua no pedido aberto que já tinha ele', async () => {
    const [p, m, g] = await tamanhosDaPizza();
    const pedido = await pedir([{ produto_id: 'pz', tamanho_id: m.id, quantidade: 1 }]);
    await salvarTamanhosDoProduto('pz', [
      { id: p.id, nome: 'P', preco: 35 },
      { id: g.id, nome: 'G', preco: 55 },
    ]);
    const completo = await buscarPedidoComValores(pedido.id);
    await expect(editarPedido(pedido.id, [{ produto_id: 'pz', tamanho_id: m.id, quantidade: 3 }], completo.alterado_em)).rejects.toThrow('saiu do cardápio');
    await editarPedido(pedido.id, [{ produto_id: 'pz', tamanho_id: m.id, quantidade: 1 }], completo.alterado_em);
    expect((await buscarPedidoComValores(pedido.id)).itens.map((i) => [i.nome, i.quantidade, i.preco_unitario])).toEqual([
      ['Pizza Calabresa (M)', 1, 45],
    ]);
  });
});

describe('relatório', () => {
  it('conta por produto com o detalhe de cada tamanho e o lucro pelo custo de cada um', async () => {
    const [p, m, g] = await tamanhosDaPizza();
    await salvarIngredientesDoProduto('pz', [{ ingrediente_id: 'q', por_tamanho: { [p.id]: 100, [m.id]: 150, [g.id]: 200 } }]);
    await pedir([
      { produto_id: 'pz', tamanho_id: g.id, quantidade: 3 },
      { produto_id: 'pz', tamanho_id: p.id, quantidade: 1 },
      { produto_id: 'suco', quantidade: 2 },
    ]);
    await pedir([{ produto_id: 'pz', tamanho_id: m.id, quantidade: 2 }]);
    const pedidos = (await listarPedidosAbertos()).map((x) => x.id);
    const completos = await Promise.all(pedidos.map(buscarPedidoComValores));
    const { ranking } = calcularRelatorio(completos, await listarProdutos());
    const daPizza = ranking.find((r) => r.produto_id === 'pz');
    expect(daPizza).toMatchObject({ nome: 'Pizza Calabresa', quantidade: 6, detalheTamanhos: 'P 1 · M 2 · G 3' });
    // 3 × (55 − 8) + 1 × (35 − 4) + 2 × (45 − 6)
    expect(daPizza.lucro).toBe(3 * 47 + 31 + 2 * 39);
    expect(ranking.find((r) => r.produto_id === 'suco').detalheTamanhos).toBe('');
  });
});
