import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { STATUS_ABERTOS } from '../lib/pedidoStatus';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';

const CAMPOS =
  'id, status, criado_em, itens_pedido ( id, produto_id, quantidade, preco_unitario, custo_unitario, produtos ( nome ) )';

// Erros lançados pelas funções do banco (código P0001) já vêm escritos para o usuário.
function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function normalizarSupabase(p) {
  return {
    id: p.id,
    status: p.status,
    criado_em: p.criado_em,
    itens: (p.itens_pedido ?? []).map((i) => ({
      id: i.id,
      produto_id: i.produto_id,
      nome: i.produtos?.nome ?? 'Produto removido',
      quantidade: i.quantidade,
      preco_unitario: Number(i.preco_unitario),
      custo_unitario: i.custo_unitario === null ? null : Number(i.custo_unitario),
    })),
  };
}

function montarDemo(db, filtro) {
  const nomes = Object.fromEntries(db.produtos.map((p) => [p.id, p.nome]));
  return db.pedidos
    .filter(filtro)
    .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
    .map((p) => ({
      id: p.id,
      status: p.status,
      criado_em: p.criado_em,
      itens: db.itens_pedido
        .filter((i) => i.pedido_id === p.id)
        .map((i) => ({ ...i, nome: nomes[i.produto_id] ?? 'Produto removido' })),
    }));
}

// itens: [{ produto_id, quantidade }]. Preço e custo vêm do cadastro do
// produto, nunca de quem lança o pedido.
export async function criarPedido({ negocioId, usuarioId, itens }) {
  if (!itens.length) throw new Error('Adicione pelo menos um produto ao pedido.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const produtos = itens.map((i) => db.produtos.find((p) => p.id === i.produto_id));
    if (produtos.some((p) => !p?.disponivel || p.arquivado)) throw new Error('Um dos produtos esgotou. Revise o pedido.');

    const pedido = {
      id: novoId(),
      negocio_id: negocioId,
      status: 'pendente',
      criado_em: new Date().toISOString(),
      criado_por: usuarioId,
    };
    const novosItens = itens.map((i, n) => ({
      id: novoId(),
      pedido_id: pedido.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unitario: produtos[n].preco,
      custo_unitario: produtos[n].custo ?? null,
    }));
    salvarDemo({ ...db, pedidos: [...db.pedidos, pedido], itens_pedido: [...db.itens_pedido, ...novosItens] });
    return pedido;
  }

  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: itens.map(({ produto_id, quantidade }) => ({ produto_id, quantidade })),
  });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível enviar o pedido.'));
  return data;
}

export async function listarPedidosAbertos() {
  if (!isSupabaseConfigured) return montarDemo(lerDemo(), (p) => STATUS_ABERTOS.includes(p.status));

  const { data, error } = await supabase
    .from('pedidos')
    .select(CAMPOS)
    .in('status', STATUS_ABERTOS)
    .order('criado_em', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os pedidos.');
  return data.map(normalizarSupabase);
}

export async function listarPedidosDoPeriodo(inicio, fim) {
  if (!isSupabaseConfigured) {
    return montarDemo(lerDemo(), (p) => {
      const t = new Date(p.criado_em);
      return t >= inicio && t < fim;
    });
  }

  const { data, error } = await supabase
    .from('pedidos')
    .select(CAMPOS)
    .gte('criado_em', inicio.toISOString())
    .lt('criado_em', fim.toISOString())
    .order('criado_em', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os pedidos do período.');
  return data.map(normalizarSupabase);
}

export async function atualizarStatusPedido(id, status) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, pedidos: db.pedidos.map((p) => (p.id === id ? { ...p, status } : p)) });
    return;
  }

  const { error } = await supabase.rpc('atualizar_status_pedido', { p_pedido_id: id, p_status: status });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível atualizar o pedido.'));
}

export function assinarPedidos(negocioId, callback) {
  if (!isSupabaseConfigured) return assinarDemo(callback);

  // itens_pedido não tem negocio_id; o RLS já limita o que chega ao cliente.
  const canal = supabase
    .channel(`pedidos-${negocioId}-${novoId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `negocio_id=eq.${negocioId}` },
      callback,
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'itens_pedido' }, callback)
    .subscribe();
  return () => supabase.removeChannel(canal);
}
