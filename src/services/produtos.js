import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';

const CAMPOS = 'id, nome, preco, custo, disponivel, criado_em';

function normalizar(p) {
  return {
    ...p,
    preco: Number(p.preco),
    custo: p.custo === null || p.custo === undefined ? null : Number(p.custo),
  };
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

export async function listarProdutos() {
  if (!isSupabaseConfigured) return lerDemo().produtos.map(normalizar).sort(porNome);

  const { data, error } = await supabase.from('produtos').select(CAMPOS).order('nome');
  if (error) throw new Error('Não foi possível carregar os produtos.');
  return data.map(normalizar);
}

export async function criarProduto(negocioId, { nome, preco, custo }) {
  const novo = { nome: nome.trim(), preco, custo: custo ?? null, disponivel: true };

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const produto = { ...novo, id: novoId(), negocio_id: negocioId, criado_em: new Date().toISOString() };
    salvarDemo({ ...db, produtos: [...db.produtos, produto] });
    return produto;
  }

  const { data, error } = await supabase
    .from('produtos')
    .insert({ ...novo, negocio_id: negocioId })
    .select(CAMPOS)
    .single();
  if (error) throw new Error('Não foi possível salvar o produto.');
  return normalizar(data);
}

export async function atualizarProduto(id, alteracoes) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, produtos: db.produtos.map((p) => (p.id === id ? { ...p, ...alteracoes } : p)) });
    return;
  }

  const { error } = await supabase.from('produtos').update(alteracoes).eq('id', id);
  if (error) throw new Error('Não foi possível atualizar o produto.');
}

const MSG_EM_USO =
  'Este produto já aparece em pedidos e não pode ser excluído. Marque como esgotado para tirar do cardápio.';

export async function excluirProduto(id) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    if (db.itens_pedido.some((i) => i.produto_id === id)) throw new Error(MSG_EM_USO);
    salvarDemo({ ...db, produtos: db.produtos.filter((p) => p.id !== id) });
    return;
  }

  const { error } = await supabase.from('produtos').delete().eq('id', id);
  // 23503 = violação de chave estrangeira (produto referenciado em itens_pedido)
  if (error?.code === '23503') throw new Error(MSG_EM_USO);
  if (error) throw new Error('Não foi possível excluir o produto.');
}

export function assinarProdutos(negocioId, callback) {
  if (!isSupabaseConfigured) return assinarDemo(callback);

  const canal = supabase
    // Nome único: supabase.channel() reaproveita canais de mesmo nome, e duas
    // telas assinando juntas se atrapalhariam.
    .channel(`produtos-${negocioId}-${novoId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'produtos', filter: `negocio_id=eq.${negocioId}` },
      callback,
    )
    // O Realtime não aplica filtro em DELETE. O evento traz só o id e serve
    // apenas de gatilho: a recarga passa pelo RLS e só vê o próprio negócio.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'produtos' }, callback)
    .subscribe();
  return () => supabase.removeChannel(canal);
}
