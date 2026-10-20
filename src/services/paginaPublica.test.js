// @vitest-environment jsdom
// Mesma resposta da função acompanhar_pedido do banco, no modo demonstração.
import { beforeEach, describe, expect, it } from 'vitest';
import { acompanharPedido, buscarPaginaPublica, salvarConfiguracaoPagina } from './paginaPublica';
import { salvarDemo } from './demoStore';
import { hojeNoNegocio } from '../lib/formatadores';

const agora = Date.now();
const min = 60000;

function pedido(numero, minutosAtras, status, extra = {}) {
  return {
    id: `p${numero}`,
    numero,
    dia: hojeNoNegocio(),
    status,
    criado_em: new Date(agora - minutosAtras * min).toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
  salvarDemo({
    produtos: [],
    pedidos: [
      pedido(11, 30, 'entregue', { pronto_em: new Date(agora - 20 * min).toISOString() }),
      pedido(22, 25, 'pronto', { pronto_em: new Date(agora - 5 * min).toISOString() }),
      pedido(31, 9, 'pendente'),
      pedido(32, 5, 'pendente'),
    ],
    itens_pedido: [{ id: 'i1', pedido_id: 'p32', produto_id: 'x', quantidade: 1, faltou: true }],
  });
});

describe('página do cliente (modo demonstração)', () => {
  it('mostra posição na fila e tempo médio dos últimos prontos', async () => {
    const r = await acompanharPedido('demonstracao', 32);
    // a senha 11 levou 10 min, a 22 levou 20 min
    expect(r).toEqual({ encontrado: true, status: 'pendente', posicao: 2, tempo_medio_min: 15, faltou: true });
  });

  it('número inexistente não é encontrado', async () => {
    expect(await acompanharPedido('demonstracao', 999)).toEqual({ encontrado: false });
  });

  it('endereço errado não abre a página', async () => {
    expect(await buscarPaginaPublica('outro-codigo')).toBeNull();
  });

  it('página desligada some, e o nome personalizado aparece', async () => {
    await salvarConfiguracaoPagina({ nomePublico: 'Lanche da Ana', ativa: true });
    expect(await buscarPaginaPublica('demonstracao')).toEqual({ nome: 'Lanche da Ana' });
    await salvarConfiguracaoPagina({ nomePublico: 'Lanche da Ana', ativa: false });
    expect(await buscarPaginaPublica('demonstracao')).toBeNull();
    expect(await acompanharPedido('demonstracao', 31)).toEqual({ encontrado: false });
  });
});
