// @vitest-environment jsdom
// Regras do modo demonstração. Devem ser as mesmas das funções do banco
// (supabase/schema.sql); se um teste daqui mudar, confira o SQL também.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atualizarStatusPedido,
  buscarPedidoComValores,
  cancelarPedido,
  criarPedido,
  editarPedido,
  listarPedidosAbertos,
  marcarItemFaltou,
} from './pedidos';
import { lerDemo, salvarDemo } from './demoStore';

const xb = { id: 'xb', negocio_id: 'n', nome: 'X-Burguer', preco: 18.5, custo: 9, disponivel: true, arquivado: false };
const suco = { id: 'suco', negocio_id: 'n', nome: 'Suco', preco: 8, custo: null, disponivel: true, arquivado: false };

let chave = 0;
function novoPedido(itens = [{ produto_id: 'xb', quantidade: 1 }]) {
  chave += 1;
  return criarPedido({ negocioId: 'n', usuarioId: 'u', itens, chaveEnvio: `chave-${chave}` });
}

function produto(id, mudancas) {
  const db = lerDemo();
  salvarDemo({ ...db, produtos: db.produtos.map((p) => (p.id === id ? { ...p, ...mudancas } : p)) });
}

beforeEach(() => {
  localStorage.clear();
  salvarDemo({ produtos: [xb, suco], pedidos: [], itens_pedido: [] });
  vi.useRealTimers();
});

describe('criar pedido', () => {
  it('primeiro pedido do dia recebe a senha 1 e guarda a observação limpa', async () => {
    const p = await novoPedido([{ produto_id: 'xb', quantidade: 2, observacao: '  sem salada  ' }]);
    expect(p.numero).toBe(1);
    const completo = await buscarPedidoComValores(p.id);
    expect(completo.itens[0]).toMatchObject({ quantidade: 2, observacao: 'sem salada', preco_unitario: 18.5 });
  });

  it('mesma chave de envio devolve o mesmo pedido, sem duplicar', async () => {
    const a = await criarPedido({ negocioId: 'n', usuarioId: 'u', itens: [{ produto_id: 'xb', quantidade: 1 }], chaveEnvio: 'k' });
    const b = await criarPedido({ negocioId: 'n', usuarioId: 'u', itens: [{ produto_id: 'suco', quantidade: 3 }], chaveEnvio: 'k' });
    expect(b.id).toBe(a.id);
    expect(lerDemo().pedidos).toHaveLength(1);
  });

  it('senhas seguem em sequência, voltam para 1 depois do 999 e recomeçam no outro dia', async () => {
    expect([(await novoPedido()).numero, (await novoPedido()).numero]).toEqual([1, 2]);
    salvarDemo({ ...lerDemo(), contador: { ...lerDemo().contador, ultimo: 999 } });
    expect((await novoPedido()).numero).toBe(1);
    salvarDemo({ ...lerDemo(), contador: { dia: '2000-01-01', ultimo: 57 } });
    expect((await novoPedido()).numero).toBe(1);
  });

  it('recusa produto esgotado', async () => {
    produto('xb', { disponivel: false });
    await expect(novoPedido()).rejects.toThrow('esgotou');
  });
});

describe('editar pedido', () => {
  it('mantém o preço combinado e aceita item que esgotou depois', async () => {
    const p = await novoPedido();
    produto('xb', { preco: 99, disponivel: false });
    await editarPedido(p.id, [{ produto_id: 'xb', quantidade: 3 }], null);
    const editado = await buscarPedidoComValores(p.id);
    expect(editado.itens[0]).toMatchObject({ quantidade: 3, preco_unitario: 18.5 });
    expect(editado.alterado_em).not.toBeNull();
  });

  it('recusa quando outra pessoa editou antes (versão diferente)', async () => {
    const p = await novoPedido();
    await editarPedido(p.id, [{ produto_id: 'xb', quantidade: 2 }], null);
    await expect(editarPedido(p.id, [{ produto_id: 'xb', quantidade: 5 }], null)).rejects.toThrow('Outra pessoa');
  });

  it('não edita pedido pronto', async () => {
    const p = await novoPedido();
    await atualizarStatusPedido(p.id, 'pronto');
    await expect(editarPedido(p.id, [{ produto_id: 'xb', quantidade: 1 }], null)).rejects.toThrow('Lance um pedido novo');
  });
});

describe('status do pedido', () => {
  it('desfaz o pronto em até 2 minutos', async () => {
    const p = await novoPedido();
    await atualizarStatusPedido(p.id, 'pronto');
    await atualizarStatusPedido(p.id, 'pendente');
    const [aberto] = await listarPedidosAbertos();
    expect(aberto).toMatchObject({ status: 'pendente', pronto_em: null });
  });

  it('não desfaz depois de 2 minutos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
    const p = await novoPedido();
    await atualizarStatusPedido(p.id, 'pronto');
    vi.setSystemTime(new Date('2026-10-02T15:03:00Z'));
    await expect(atualizarStatusPedido(p.id, 'pendente')).rejects.toThrow('tempo para desfazer');
  });

  it('pedido de hoje não pula de novo para entregue', async () => {
    const p = await novoPedido();
    await expect(atualizarStatusPedido(p.id, 'entregue')).rejects.toThrow('mudou de status');
  });
});

describe('cancelar', () => {
  it('exige motivo válido e não cancela duas vezes', async () => {
    const p = await novoPedido();
    await expect(cancelarPedido(p.id, 'qualquer')).rejects.toThrow('motivo');
    await cancelarPedido(p.id, 'cliente_desistiu');
    await expect(cancelarPedido(p.id, 'outro')).rejects.toThrow('encerrado');
  });

  it('cancelado aparece para a cozinha por alguns minutos', async () => {
    const p = await novoPedido();
    await cancelarPedido(p.id, 'cliente_desistiu');
    const lista = await listarPedidosAbertos();
    expect(lista.map((x) => [x.id, x.status])).toEqual([[p.id, 'cancelado']]);
  });
});

describe('cozinha', () => {
  it('lista da cozinha não traz preço nem custo', async () => {
    await novoPedido();
    const [pedido] = await listarPedidosAbertos();
    expect(pedido.itens[0]).toMatchObject({ preco_unitario: null, custo_unitario: null });
  });

  it('marca e desmarca item que faltou; pedido pronto não aceita', async () => {
    const p = await novoPedido();
    const [{ itens }] = await listarPedidosAbertos();
    await marcarItemFaltou(itens[0].id, true);
    expect((await listarPedidosAbertos())[0].itens[0].faltou).toBe(true);
    await atualizarStatusPedido(p.id, 'pronto');
    await expect(marcarItemFaltou(itens[0].id, false)).rejects.toThrow('não está mais na fila');
  });
});
