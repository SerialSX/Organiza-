import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';
import { produtosQueFaltam } from '../lib/cardapiosProntos';

// Com a lista de ingredientes (quanto vai de cada um), usada no custo e no
// "faltou" da cozinha.
const CAMPOS =
  'id, nome, preco, custo, disponivel, vai_para_cozinha, criado_em, produto_ingredientes ( ingrediente_id, quantidade )';

function normalizar({ produto_ingredientes: lista, ...p }) {
  return {
    ...p,
    preco: Number(p.preco),
    custo: p.custo === null || p.custo === undefined ? null : Number(p.custo),
    vai_para_cozinha: p.vai_para_cozinha ?? true,
    ingredientes: (lista ?? []).map((i) => ({ ingrediente_id: i.ingrediente_id, quantidade: Number(i.quantidade) })),
  };
}

// No modo demonstração a lista fica à parte, como no banco.
function comListaDemo(db) {
  return (p) => ({ ...p, produto_ingredientes: (db.produto_ingredientes ?? []).filter((pi) => pi.produto_id === p.id) });
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

export async function listarProdutos() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return db.produtos.filter((p) => !p.arquivado).map(comListaDemo(db)).map(normalizar).sort(porNome);
  }

  const { data, error } = await supabase.from('produtos').select(CAMPOS).eq('arquivado', false).order('nome');
  if (error) throw new Error('Não foi possível carregar os produtos.');
  return data.map(normalizar);
}

export async function criarProduto(negocioId, { nome, preco, custo, vai_para_cozinha = true }) {
  const novo = { nome: nome.trim(), preco, custo: custo ?? null, disponivel: true, vai_para_cozinha };

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const produto = { ...novo, id: novoId(), negocio_id: negocioId, criado_em: new Date().toISOString() };
    salvarDemo({ ...db, produtos: [...db.produtos, produto] });
    return normalizar(produto);
  }

  const { data, error } = await supabase
    .from('produtos')
    .insert({ ...novo, negocio_id: negocioId })
    .select(CAMPOS)
    .single();
  if (error) throw new Error('Não foi possível salvar o produto.');
  return normalizar(data);
}

// Cardápio pronto e planilha: vários de uma vez (tudo ou nada), sem repetir
// nome que já existe. Tentar de novo depois de uma falha não duplica.
export async function criarProdutos(negocioId, lista) {
  const novos = produtosQueFaltam({ produtos: lista }, await listarProdutos()).map((p) => ({
    nome: p.nome,
    preco: p.preco,
    custo: p.custo ?? null,
    disponivel: true,
    vai_para_cozinha: p.vai_para_cozinha ?? true,
  }));
  if (!novos.length) return 0;

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const criados = novos.map((p) => ({ ...p, id: novoId(), negocio_id: negocioId, criado_em: new Date().toISOString() }));
    salvarDemo({ ...db, produtos: [...db.produtos, ...criados] });
    return criados.length;
  }

  const { error } = await supabase.from('produtos').insert(novos.map((p) => ({ ...p, negocio_id: negocioId })));
  if (error) throw new Error('Não foi possível cadastrar o cardápio.');
  return novos.length;
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

// Tocaram num produto esgotado na tela de pedidos: a venda que teria saído
// errada. Métrica do TCC; se falhar (sem internet), não atrapalha o atendente.
export async function registrarToqueEsgotado(produtoId) {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.rpc('registrar_toque_esgotado', { p_produto_id: produtoId });
  } catch {
    // só métrica
  }
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

// Produtos "excluídos" (arquivados): o dono pode devolver ao cardápio.
export async function listarProdutosArquivados() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return db.produtos.filter((p) => p.arquivado).map(comListaDemo(db)).map(normalizar).sort(porNome);
  }

  const { data, error } = await supabase.from('produtos').select(CAMPOS).eq('arquivado', true).order('nome');
  if (error) throw new Error('Não foi possível carregar os produtos excluídos.');
  return data.map(normalizar);
}

export async function devolverAoCardapio(id) {
  await atualizarProduto(id, { arquivado: false });
}
