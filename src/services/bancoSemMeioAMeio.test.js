import { beforeEach, describe, expect, it, vi } from 'vitest';

// Banco no ar com os tamanhos (2026-11-13), mas ainda sem a migração
// 2026-11-14 (meio a meio): as telas continuam funcionando, sem o meio a meio.

// Respostas do Supabase, uma por consulta, na ordem.
const respostas = [];
const selects = [];
const escritas = [];
const rpcs = [];

function consulta() {
  const q = {
    select: (campos) => {
      selects.push(campos);
      return q;
    },
    insert: (dados) => {
      escritas.push({ tipo: 'insert', dados });
      return q;
    },
    update: (dados) => {
      escritas.push({ tipo: 'update', dados });
      return q;
    },
    eq: () => q,
    in: () => q,
    or: () => q,
    order: () => q,
    single: () => q,
    then: (ok, falha) => Promise.resolve(respostas.shift()).then(ok, falha),
  };
  return q;
}

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => consulta(),
    rpc: async (nome, args) => {
      rpcs.push({ nome, args });
      return respostas.shift();
    },
  },
}));

const { listarProdutos, aceitaMeioAMeio, aceitaTamanhos, criarProduto, atualizarProduto } = await import('./produtos');
const { listarPedidosAbertos, criarPedido } = await import('./pedidos');

beforeEach(() => {
  respostas.length = 0;
  selects.length = 0;
  escritas.length = 0;
  rpcs.length = 0;
});

describe('banco sem a migração do meio a meio', () => {
  it('produtos: pede de novo sem o meio a meio, mas com os tamanhos', async () => {
    expect(aceitaMeioAMeio()).toBe(true);
    respostas.push({ data: null, error: { code: '42703', message: 'column produtos.meio_a_meio does not exist' } });
    respostas.push({ data: [{ id: 'p1', nome: 'Pizza', preco: '40.00', custo: null, disponivel: true, produto_ingredientes: [], produto_tamanhos: [] }], error: null });
    const produtos = await listarProdutos();
    expect(produtos).toEqual([expect.objectContaining({ nome: 'Pizza', meio_a_meio: false })]);
    expect(selects[0]).toContain('meio_a_meio');
    expect(selects[1]).not.toContain('meio_a_meio');
    expect(selects[1]).toContain('produto_tamanhos');
    expect(aceitaMeioAMeio()).toBe(false);
    expect(aceitaTamanhos()).toBe(true);
  });

  it('produto novo e editado não mandam a coluna que o banco não tem', async () => {
    respostas.push({ data: { id: 'x', nome: 'Suco', preco: 8, custo: null, disponivel: true, produto_ingredientes: [] }, error: null });
    await criarProduto('n', { nome: 'Suco', preco: 8, meio_a_meio: false });
    expect(escritas[0].dados).not.toHaveProperty('meio_a_meio');
    respostas.push({ data: null, error: null });
    await atualizarProduto('x', { nome: 'Suco', meio_a_meio: false });
    expect(escritas[1].dados).toEqual({ nome: 'Suco' });
    // Ligar o meio a meio num banco sem a migração avisa, em vez de falhar calado.
    await expect(atualizarProduto('x', { meio_a_meio: true })).rejects.toThrow('ainda não aceita o meio a meio');
  });

  it('pedidos: tira primeiro as colunas do meio a meio e mantém as do tamanho', async () => {
    respostas.push({ data: null, error: { code: '42703', message: 'column itens_pedido_1.segundo_produto_id does not exist' } });
    respostas.push({ data: [], error: null });
    await listarPedidosAbertos();
    expect(selects[0]).toContain('segundo_produto_id');
    expect(selects[1]).not.toContain('segundo_produto_id');
    expect(selects[1]).toContain('tamanho_id');
    expect(selects[1]).toContain('nome_mesa');
  });

  it('pedido sem meio a meio não manda a chave segundo_produto_id', async () => {
    respostas.push({ data: { id: 'x', numero: 1, status: 'pendente', criado_em: new Date().toISOString() }, error: null });
    await criarPedido({
      negocioId: 'n',
      usuarioId: 'u',
      itens: [{ produto_id: 'p1', tamanho_id: 't1', segundo_produto_id: null, quantidade: 1 }],
      chaveEnvio: 'k',
    });
    expect(rpcs[0].args.p_itens).toEqual([{ produto_id: 'p1', tamanho_id: 't1', quantidade: 1, observacao: null }]);
  });
});
