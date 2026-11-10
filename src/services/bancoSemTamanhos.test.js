import { beforeEach, describe, expect, it, vi } from 'vitest';

// Banco no ar ainda sem a migração 2026-11-13 (tamanhos): as telas continuam
// funcionando como antes, sem os tamanhos.

// Respostas do Supabase, uma por consulta, na ordem.
const respostas = [];
const selects = [];
const rpcs = [];

function consulta() {
  const q = {
    select: (campos) => {
      selects.push(campos);
      return q;
    },
    eq: () => q,
    or: () => q,
    order: () => q,
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

const { listarProdutos, aceitaTamanhos } = await import('./produtos');
const { listarPedidosAbertos, criarPedido } = await import('./pedidos');

beforeEach(() => {
  respostas.length = 0;
  selects.length = 0;
  rpcs.length = 0;
});

describe('banco sem a migração dos tamanhos', () => {
  it('produtos: pede de novo sem os tamanhos e esconde os tamanhos das telas', async () => {
    expect(aceitaTamanhos()).toBe(true);
    respostas.push({
      data: null,
      error: { code: 'PGRST200', message: "Could not find a relationship between 'produtos' and 'produto_tamanhos' in the schema cache" },
    });
    respostas.push({ data: [{ id: 'p1', nome: 'X-Burguer', preco: '18.00', custo: null, disponivel: true, produto_ingredientes: [] }], error: null });
    const produtos = await listarProdutos();
    expect(produtos).toEqual([expect.objectContaining({ nome: 'X-Burguer', preco: 18, tamanhos: [] })]);
    expect(selects[0]).toContain('produto_tamanhos');
    expect(selects[1]).not.toContain('produto_tamanhos');
    expect(aceitaTamanhos()).toBe(false);
    // Daqui em diante já pede sem os tamanhos.
    respostas.push({ data: [], error: null });
    await listarProdutos();
    expect(selects[2]).not.toContain('produto_tamanhos');
  });

  it('pedidos: tira primeiro as colunas do tamanho, e só depois as das outras migrações', async () => {
    respostas.push({ data: null, error: { code: '42703', message: 'column itens_pedido_1.tamanho_id does not exist' } });
    respostas.push({ data: [], error: null });
    await listarPedidosAbertos();
    expect(selects[0]).toContain('tamanho_id');
    expect(selects[1]).not.toContain('tamanho_id');
    // As colunas do fim do dia e das mesas continuam.
    expect(selects[1]).toContain('nao_recebido_em');
    expect(selects[1]).toContain('nome_mesa');
  });

  it('pedido sem tamanho não manda a chave tamanho_id (o banco antigo não conhece)', async () => {
    respostas.push({ data: { id: 'x', numero: 1, status: 'pendente', criado_em: new Date().toISOString() }, error: null });
    await criarPedido({ negocioId: 'n', usuarioId: 'u', itens: [{ produto_id: 'p1', tamanho_id: null, quantidade: 1 }], chaveEnvio: 'k' });
    expect(rpcs[0].args.p_itens).toEqual([{ produto_id: 'p1', quantidade: 1, observacao: null }]);
  });
});
