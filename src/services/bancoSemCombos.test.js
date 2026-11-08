import { beforeEach, describe, expect, it, vi } from 'vitest';

// Banco no ar com o meio a meio (2026-11-14), mas ainda sem a migração
// 2026-11-15 (combos e promoções): as telas continuam como antes, sem eles.

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
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

const { listarCombos, aceitaCombos, salvarCombo, assinarCombos } = await import('./combos');
const { listarPromocoes } = await import('./promocoes');
const { listarPedidosAbertos, criarPedido } = await import('./pedidos');

beforeEach(() => {
  respostas.length = 0;
  selects.length = 0;
  rpcs.length = 0;
});

describe('banco sem a migração dos combos e promoções', () => {
  it('combos: a tabela não existe, a lista fica vazia e as promoções nem perguntam', async () => {
    expect(aceitaCombos()).toBe(true);
    respostas.push({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.combos' in the schema cache" } });
    expect(await listarCombos()).toEqual([]);
    expect(aceitaCombos()).toBe(false);
    const antes = selects.length;
    expect(await listarPromocoes()).toEqual([]);
    expect(selects.length).toBe(antes);
    // Nem assina o tempo real das tabelas que não existem.
    expect(typeof assinarCombos('n', () => {})).toBe('function');
  });

  it('salvar um combo avisa, em vez de falhar calado', async () => {
    respostas.push({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.salvar_combo' } });
    await expect(
      salvarCombo({
        nome: 'Combo',
        preco: 20,
        partes: [
          { nome: null, opcoes: [{ produto_id: 'a', tamanho_id: null, acrescimo: 0 }] },
          { nome: null, opcoes: [{ produto_id: 'b', tamanho_id: null, acrescimo: 0 }] },
        ],
      }),
    ).rejects.toThrow('ainda não aceita combos');
  });

  it('pedidos: tira primeiro as colunas do combo e mantém as do meio a meio', async () => {
    respostas.push({ data: null, error: { code: '42703', message: 'column itens_pedido_1.combo_id does not exist' } });
    respostas.push({ data: [], error: null });
    await listarPedidosAbertos();
    expect(selects[0]).toContain('combo_grupo');
    expect(selects[1]).not.toContain('combo_grupo');
    expect(selects[1]).not.toContain('preco_cheio');
    expect(selects[1]).toContain('segundo_produto_id');
    expect(selects[1]).toContain('tamanho_id');
  });

  it('pedido sem combo nem promoção não manda as chaves novas', async () => {
    respostas.push({ data: { id: 'x', numero: 1, status: 'pendente', criado_em: new Date().toISOString() }, error: null });
    await criarPedido({
      negocioId: 'n',
      usuarioId: 'u',
      itens: [{ produto_id: 'p1', tamanho_id: null, segundo_produto_id: null, quantidade: 1, promocao_em: null }],
      chaveEnvio: 'k',
    });
    expect(rpcs[0].args.p_itens).toEqual([{ produto_id: 'p1', quantidade: 1, observacao: null }]);
  });
});
