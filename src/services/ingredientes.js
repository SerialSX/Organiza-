import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, novoId } from './demoStore';
import { recalcularCustoDemo, tamanhosAtivos } from './custoDemo';

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
      novo = {
        ...novo,
        produto_ingredientes: novo.produto_ingredientes.filter((pi) => pi.ingrediente_id !== id),
        tamanho_ingredientes: (novo.tamanho_ingredientes ?? []).filter((ti) => ti.ingrediente_id !== id),
      };
    }
    salvarDemo(recalcularCustoDemo(novo, usadoEm));
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

// Sem tamanhos: [{ ingrediente_id, quantidade }] na unidade do ingrediente (g, ml ou un).
// Com tamanhos: [{ ingrediente_id, por_tamanho: { [tamanho_id]: quantidade } }];
// o ingrediente pode faltar em algum tamanho (borda só na G), mas não em todos.
export async function salvarIngredientesDoProduto(produtoId, lista) {
  if (lista.length > LIMITE_POR_PRODUTO) throw new Error(`Um produto pode ter até ${LIMITE_POR_PRODUTO} ingredientes.`);
  const valida = (q) => q > 0 && q <= 100000;
  const arredondar = (q) => Math.round(q * 1000) / 1000;
  const itens = lista.map((i) => {
    if (i.por_tamanho) {
      const quantidades = Object.entries(i.por_tamanho).filter(([, q]) => q !== null && q !== undefined);
      if (!quantidades.length) falha('Diga quanto vai de cada ingrediente em pelo menos um tamanho.');
      if (quantidades.some(([, q]) => !valida(q))) falha('A quantidade de cada ingrediente precisa ser maior que zero.');
      return { ingrediente_id: i.ingrediente_id, por_tamanho: Object.fromEntries(quantidades.map(([t, q]) => [t, arredondar(q)])) };
    }
    if (!valida(i.quantidade)) falha('A quantidade de cada ingrediente precisa ser maior que zero.');
    return { ingrediente_id: i.ingrediente_id, quantidade: arredondar(i.quantidade) };
  });

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    if (!db.produtos.some((p) => p.id === produtoId)) falha('Produto não encontrado.');
    const ativos = new Set(db.ingredientes.filter((i) => !i.arquivado).map((i) => i.id));
    if (itens.some((i) => !ativos.has(i.ingrediente_id))) falha('Um dos ingredientes foi excluído. Revise a lista.');
    const tamanhos = tamanhosAtivos(db, produtoId).map((t) => t.id);
    const doProdutoTamanhos = new Set((db.produto_tamanhos ?? []).filter((t) => t.produto_id === produtoId).map((t) => t.id));
    const porTamanho = [];
    const doProduto = new Map();
    for (const i of itens) {
      if (tamanhos.length) {
        if (!i.por_tamanho) falha('Este produto tem tamanhos. Atualize a página e diga quanto vai em cada tamanho.');
        const doItem = tamanhos.filter((t) => i.por_tamanho[t] !== undefined).map((t) => ({ tamanho_id: t, ingrediente_id: i.ingrediente_id, quantidade: i.por_tamanho[t] }));
        if (!doItem.length) falha('Diga quanto vai de cada ingrediente em pelo menos um tamanho.');
        porTamanho.push(...doItem);
        doProduto.set(i.ingrediente_id, { produto_id: produtoId, ingrediente_id: i.ingrediente_id, quantidade: Math.max(...doItem.map((d) => d.quantidade)) });
      } else {
        if (i.quantidade === undefined) falha('Ingrediente inválido.');
        doProduto.set(i.ingrediente_id, { produto_id: produtoId, ...i });
      }
    }
    const semEste = (lista) => (lista ?? []).filter((ti) => !doProdutoTamanhos.has(ti.tamanho_id));
    const porChave = new Map(porTamanho.map((d) => [`${d.tamanho_id}|${d.ingrediente_id}`, d]));
    salvarDemo(
      recalcularCustoDemo(
        {
          ...db,
          produto_ingredientes: [...db.produto_ingredientes.filter((pi) => pi.produto_id !== produtoId), ...doProduto.values()],
          tamanho_ingredientes: [...semEste(db.tamanho_ingredientes), ...porChave.values()],
        },
        [produtoId],
      ),
    );
    return;
  }

  const { error } = await supabase.rpc('salvar_ingredientes_do_produto', { p_produto_id: produtoId, p_itens: itens });
  if (error) throw new Error(mensagem(error, 'Não foi possível salvar os ingredientes do produto.'));
}
