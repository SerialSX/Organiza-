import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { estimarCusto } from '../lib/custos';
import { lerDemo, salvarDemo, novoId } from './demoStore';

const CAMPOS = 'id, nome, unidade, preco_compra, quantidade_compra, arquivado';
const LIMITE_POR_PRODUTO = 30;

function normalizar(i) {
  const numero = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    id: i.id,
    nome: i.nome,
    unidade: i.unidade,
    preco_compra: numero(i.preco_compra),
    quantidade_compra: numero(i.quantidade_compra),
    arquivado: Boolean(i.arquivado),
  };
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

function mensagem(error, padrao) {
  if (error.code === '23505') return 'Já existe um ingrediente com esse nome.';
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(texto) {
  throw new Error(texto);
}

// ---------------------------------------------------------------------------
// Modo demonstração: mesmas regras das funções do banco (supabase/schema.sql)
// ---------------------------------------------------------------------------

function nomeRepetido(db, nome, id) {
  const chave = nome.trim().toLowerCase();
  return db.ingredientes.some((i) => !i.arquivado && i.id !== id && i.nome.trim().toLowerCase() === chave);
}

// recalcular_custo_do_produto: só muda o custo de quem tem ingrediente com preço.
function recalcularDemo(db, produtoIds) {
  const porId = Object.fromEntries(db.ingredientes.map((i) => [i.id, normalizar(i)]));
  const produtos = db.produtos.map((p) => {
    if (!produtoIds.includes(p.id)) return p;
    const lista = db.produto_ingredientes.filter((pi) => pi.produto_id === p.id);
    const { total } = estimarCusto(lista, porId);
    return total === null ? p : { ...p, custo: total };
  });
  return { ...db, produtos };
}

function produtosQueUsam(db, ingredienteId) {
  return db.produto_ingredientes.filter((pi) => pi.ingrediente_id === ingredienteId).map((pi) => pi.produto_id);
}

// ---------------------------------------------------------------------------

export async function listarIngredientes() {
  if (!isSupabaseConfigured) return lerDemo().ingredientes.filter((i) => !i.arquivado).map(normalizar).sort(porNome);

  const { data, error } = await supabase.from('ingredientes').select(CAMPOS).eq('arquivado', false).order('nome');
  if (error) throw new Error('Não foi possível carregar os ingredientes.');
  return data.map(normalizar);
}

// dados: { nome, unidade, preco_compra, quantidade_compra } (ver compraParaBanco)
export async function criarIngrediente(negocioId, dados) {
  const novo = { ...dados, nome: dados.nome.trim() };

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    if (nomeRepetido(db, novo.nome)) falha('Já existe um ingrediente com esse nome.');
    const ingrediente = { ...novo, id: novoId(), negocio_id: negocioId, arquivado: false };
    salvarDemo({ ...db, ingredientes: [...db.ingredientes, ingrediente] });
    return normalizar(ingrediente);
  }

  const { data, error } = await supabase
    .from('ingredientes')
    .insert({ ...novo, negocio_id: negocioId })
    .select(CAMPOS)
    .single();
  if (error) throw new Error(mensagem(error, 'Não foi possível salvar o ingrediente.'));
  return normalizar(data);
}

export async function atualizarIngrediente(id, dados) {
  const alteracoes = dados.nome === undefined ? dados : { ...dados, nome: dados.nome.trim() };

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const atual = db.ingredientes.find((i) => i.id === id);
    if (!atual) falha('Ingrediente não encontrado.');
    if (alteracoes.nome !== undefined && nomeRepetido(db, alteracoes.nome, id)) falha('Já existe um ingrediente com esse nome.');
    const usadoEm = produtosQueUsam(db, id);
    if (alteracoes.unidade && alteracoes.unidade !== atual.unidade && usadoEm.length) {
      falha('Este ingrediente está em produtos. Para trocar a unidade, exclua e cadastre de novo.');
    }
    let novo = { ...db, ingredientes: db.ingredientes.map((i) => (i.id === id ? { ...i, ...alteracoes } : i)) };
    if (alteracoes.arquivado) {
      novo = { ...novo, produto_ingredientes: novo.produto_ingredientes.filter((pi) => pi.ingrediente_id !== id) };
    }
    salvarDemo(recalcularDemo(novo, usadoEm));
    return;
  }

  const { error } = await supabase.from('ingredientes').update(alteracoes).eq('id', id);
  if (error) throw new Error(mensagem(error, 'Não foi possível salvar o ingrediente.'));
}

// Arquiva: some da lista e sai dos produtos. Os avisos de "faltou" antigos
// guardam o nome, então o histórico não muda.
export async function excluirIngrediente(id) {
  await atualizarIngrediente(id, { arquivado: true });
}

// lista: [{ ingrediente_id, quantidade }] na unidade do ingrediente (g, ml ou un).
export async function salvarIngredientesDoProduto(produtoId, lista) {
  if (lista.length > LIMITE_POR_PRODUTO) throw new Error(`Um produto pode ter até ${LIMITE_POR_PRODUTO} ingredientes.`);
  if (lista.some((i) => !(i.quantidade > 0 && i.quantidade <= 100000))) {
    throw new Error('A quantidade de cada ingrediente precisa ser maior que zero.');
  }
  const itens = lista.map((i) => ({ ingrediente_id: i.ingrediente_id, quantidade: Math.round(i.quantidade * 1000) / 1000 }));

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    if (!db.produtos.some((p) => p.id === produtoId)) falha('Produto não encontrado.');
    const ativos = new Set(db.ingredientes.filter((i) => !i.arquivado).map((i) => i.id));
    if (itens.some((i) => !ativos.has(i.ingrediente_id))) falha('Um dos ingredientes foi excluído. Revise a lista.');
    const outros = db.produto_ingredientes.filter((pi) => pi.produto_id !== produtoId);
    const doProduto = [...new Map(itens.map((i) => [i.ingrediente_id, { produto_id: produtoId, ...i }])).values()];
    salvarDemo(recalcularDemo({ ...db, produto_ingredientes: [...outros, ...doProduto] }, [produtoId]));
    return;
  }

  const { error } = await supabase.rpc('salvar_ingredientes_do_produto', { p_produto_id: produtoId, p_itens: itens });
  if (error) throw new Error(mensagem(error, 'Não foi possível salvar os ingredientes do produto.'));
}
