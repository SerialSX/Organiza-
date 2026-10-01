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
  if (!isSupabaseConfigured) return lerDemo().produtos.filter((p) => !p.arquivado).map(normalizar).sort(porNome);

  const { data, error } = await supabase.from('produtos').select(CAMPOS).eq('arquivado', false).order('nome');
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

// Arquiva em vez de apagar: o produto sai do cardápio, mas os pedidos antigos
// e os relatórios continuam mostrando o nome dele.
export async function excluirProduto(id) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, produtos: db.produtos.map((p) => (p.id === id ? { ...p, arquivado: true } : p)) });
    return;
  }

  const { error } = await supabase.from('produtos').update({ arquivado: true }).eq('id', id);
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
    // Ao conectar e a cada reconexão: eventos de quando a internet caiu não
    // são reenviados, então recarrega a lista.
    .subscribe((status) => status === 'SUBSCRIBED' && callback());
  return () => supabase.removeChannel(canal);
}
