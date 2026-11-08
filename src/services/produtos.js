import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';
import { produtosQueFaltam } from '../lib/cardapiosProntos';
import { recalcularCustoDemo, sincronizarDemo, tamanhosAtivos } from './custoDemo';
import { conferirTamanhos } from '../lib/tamanhos';

// Com a lista de ingredientes (quanto vai de cada um), usada no custo e no
// "faltou" da cozinha.
const CAMPOS_BASE =
  'id, nome, preco, custo, disponivel, vai_para_cozinha, criado_em, produto_ingredientes ( ingrediente_id, quantidade )';
// Migração 2026-11-13 (tamanhos): cada tamanho com preço, custo, esgotado e
// quanto vai de cada ingrediente.
const CAMPOS_DOS_TAMANHOS =
  ', produto_tamanhos ( id, nome, preco, custo, disponivel, arquivado, ordem, criado_em, tamanho_ingredientes ( ingrediente_id, quantidade ) )';

// null: ainda não sabe; false: banco sem a migração dos tamanhos (as telas
// escondem os tamanhos e seguem como antes); true: tem.
let bancoTemTamanhos = isSupabaseConfigured ? null : true;

export function aceitaTamanhos() {
  return bancoTemTamanhos !== false;
}

// Tabela ou relação que o banco ainda não tem.
function semTabelaDeTamanhos(error) {
  return (
    ['PGRST200', '42P01', '42703', 'PGRST204'].includes(error?.code) ||
    /produto_tamanhos|tamanho/i.test(`${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`)
  );
}

async function consultarProdutos(arquivado) {
  for (;;) {
    const comTamanhos = bancoTemTamanhos !== false;
    const { data, error } = await supabase
      .from('produtos')
      .select(CAMPOS_BASE + (comTamanhos ? CAMPOS_DOS_TAMANHOS : ''))
      .eq('arquivado', arquivado)
      .order('nome');
    if (error && comTamanhos && semTabelaDeTamanhos(error)) {
      bancoTemTamanhos = false;
      continue;
    }
    if (!error && comTamanhos) bancoTemTamanhos = true;
    return { data, error };
  }
}

const numeroOuNull = (v) => (v === null || v === undefined ? null : Number(v));

function normalizarTamanho(t) {
  return {
    id: t.id,
    nome: t.nome,
    preco: Number(t.preco),
    custo: numeroOuNull(t.custo),
    disponivel: t.disponivel ?? true,
    ingredientes: (t.tamanho_ingredientes ?? []).map((i) => ({ ingrediente_id: i.ingrediente_id, quantidade: Number(i.quantidade) })),
  };
}

function normalizar({ produto_ingredientes: lista, produto_tamanhos: tamanhos, ...p }) {
  return {
    ...p,
    preco: Number(p.preco),
    custo: numeroOuNull(p.custo),
    vai_para_cozinha: p.vai_para_cozinha ?? true,
    ingredientes: (lista ?? []).map((i) => ({ ingrediente_id: i.ingrediente_id, quantidade: Number(i.quantidade) })),
    // Só os que estão no cardápio, na ordem do cadastro. Vazio: preço único.
    tamanhos: (tamanhos ?? [])
      .filter((t) => !t.arquivado)
      .sort((a, b) => a.ordem - b.ordem || String(a.criado_em).localeCompare(String(b.criado_em)))
      .map(normalizarTamanho),
  };
}

// No modo demonstração as listas ficam à parte, como no banco.
function comListaDemo(db) {
  return (p) => ({
    ...p,
    produto_ingredientes: (db.produto_ingredientes ?? []).filter((pi) => pi.produto_id === p.id),
    produto_tamanhos: tamanhosAtivos(db, p.id).map((t) => ({
      ...t,
      tamanho_ingredientes: (db.tamanho_ingredientes ?? []).filter((ti) => ti.tamanho_id === t.id),
    })),
  });
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

// Erros lançados pelas funções do banco (código P0001) já vêm escritos para o usuário.
function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(texto) {
  throw new Error(texto);
}

export async function listarProdutos() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return db.produtos.filter((p) => !p.arquivado).map(comListaDemo(db)).map(normalizar).sort(porNome);
  }

  const { data, error } = await consultarProdutos(false);
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
    .select(CAMPOS_BASE)
    .single();
  if (error) throw new Error('Não foi possível salvar o produto.');
  return normalizar(data);
}

// Cardápio pronto e planilha: vários de uma vez (tudo ou nada), sem repetir
// nome que já existe. Tentar de novo depois de uma falha não duplica.
// Cada produto pode vir com tamanhos: [{ nome, preco, custo }].
export async function criarProdutos(negocioId, lista) {
  const novos = produtosQueFaltam({ produtos: lista }, await listarProdutos()).map((p) => ({
    nome: p.nome,
    preco: p.preco ?? null,
    custo: p.custo ?? null,
    disponivel: true,
    vai_para_cozinha: p.vai_para_cozinha ?? true,
    tamanhos: (p.tamanhos ?? []).map((t) => ({ nome: t.nome, preco: t.preco, custo: t.custo ?? null })),
  }));
  if (!novos.length) return 0;
  for (const p of novos) {
    if (p.tamanhos.length) conferirTamanhos(p.tamanhos, p.nome);
    else if (!(p.preco > 0)) falha(`Digite o preço de ${p.nome}.`);
  }
  const comTamanhos = novos.some((p) => p.tamanhos.length);

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const agora = new Date().toISOString();
    const produtos = [];
    const tamanhos = [];
    for (const { tamanhos: doProduto, ...p } of novos) {
      const id = novoId();
      produtos.push({ ...p, preco: p.preco ?? 0, id, negocio_id: negocioId, criado_em: agora });
      doProduto.forEach((t, ordem) =>
        tamanhos.push({ ...t, id: novoId(), produto_id: id, negocio_id: negocioId, disponivel: true, arquivado: false, ordem, criado_em: agora }),
      );
    }
    let novo = { ...db, produtos: [...db.produtos, ...produtos], produto_tamanhos: [...(db.produto_tamanhos ?? []), ...tamanhos] };
    for (const p of produtos) novo = sincronizarDemo(novo, p.id);
    salvarDemo(novo);
    return produtos.length;
  }

  if (comTamanhos) {
    // Banco sem a migração dos tamanhos: as telas não oferecem tamanhos, mas
    // por garantia o erro diz o que fazer em vez de cadastrar pela metade.
    if (!aceitaTamanhos()) falha('O banco de dados ainda não aceita tamanhos. Avise quem cuida do sistema.');
    const { data, error } = await supabase.rpc('criar_produtos_com_tamanhos', {
      p_produtos: novos.map((p) => ({
        nome: p.nome,
        vai_para_cozinha: p.vai_para_cozinha,
        ...(p.tamanhos.length ? { tamanhos: p.tamanhos } : { preco: p.preco, custo: p.custo }),
      })),
    });
    if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível cadastrar o cardápio.'));
    return data;
  }

  const { error } = await supabase
    .from('produtos')
    .insert(
      novos.map((p) => ({
        nome: p.nome,
        preco: p.preco,
        custo: p.custo,
        disponivel: true,
        vai_para_cozinha: p.vai_para_cozinha,
        negocio_id: negocioId,
      })),
    );
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

// Troca de uma vez os tamanhos do produto, na ordem da lista: [{ id (dos que
// já existem), nome, preco, custo, disponivel }]. Quem sai da lista é
// arquivado (pedidos antigos continuam com o nome). Lista vazia: o produto
// volta a ter preço único (salve o preço do produto logo depois).
// Devolve [{ id, nome }] para ligar os ingredientes de cada tamanho.
export async function salvarTamanhosDoProduto(produtoId, lista) {
  const tamanhos = lista.map((t) => ({
    ...(t.id ? { id: t.id } : {}),
    nome: t.nome.trim().replace(/\s+/g, ' '),
    preco: Math.round(t.preco * 100) / 100,
    custo: t.custo === null || t.custo === undefined ? null : Math.round(t.custo * 100) / 100,
    disponivel: t.disponivel ?? true,
  }));
  if (tamanhos.length) conferirTamanhos(tamanhos);

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const produto = db.produtos.find((p) => p.id === produtoId);
    if (!produto) falha('Produto não encontrado.');
    const todos = db.produto_tamanhos ?? [];
    const ficam = new Set(tamanhos.filter((t) => t.id).map((t) => t.id));
    const atuais = new Map(tamanhosAtivos(db, produtoId).map((t) => [t.id, t]));
    if ([...ficam].some((id) => !atuais.has(id))) falha('Um dos tamanhos foi removido em outro aparelho. Abra o produto de novo.');
    const agora = new Date().toISOString();
    const saem = new Set([...atuais.keys()].filter((id) => !ficam.has(id)));
    const salvos = tamanhos.map((t, ordem) =>
      t.id
        ? { ...atuais.get(t.id), ...t, ordem }
        : { ...t, id: novoId(), produto_id: produtoId, negocio_id: produto.negocio_id, arquivado: false, ordem, criado_em: agora },
    );
    const porId = new Map(salvos.map((t) => [t.id, t]));
    const produto_tamanhos = [
      ...todos.map((t) => (saem.has(t.id) ? { ...t, arquivado: true } : (porId.get(t.id) ?? t))),
      ...salvos.filter((t) => !atuais.has(t.id)),
    ];
    const tamanho_ingredientes = (db.tamanho_ingredientes ?? []).filter((ti) => !saem.has(ti.tamanho_id));
    salvarDemo(recalcularCustoDemo({ ...db, produto_tamanhos, tamanho_ingredientes }, [produtoId]));
    return salvos.map(({ id, nome }) => ({ id, nome }));
  }

  const { data, error } = await supabase.rpc('salvar_tamanhos_do_produto', { p_produto_id: produtoId, p_tamanhos: tamanhos });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      bancoTemTamanhos = false;
      falha('O banco de dados ainda não aceita tamanhos. Avise quem cuida do sistema.');
    }
    falha(mensagemDoBanco(error, 'Não foi possível salvar os tamanhos.'));
  }
  return data ?? [];
}

// Esgotado de um tamanho só ("acabou a G"). O esgotado do produto vale para todos.
export async function mudarDisponivelDoTamanho(tamanhoId, disponivel) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({
      ...db,
      produto_tamanhos: (db.produto_tamanhos ?? []).map((t) => (t.id === tamanhoId ? { ...t, disponivel } : t)),
    });
    return;
  }

  const { error } = await supabase.from('produto_tamanhos').update({ disponivel }).eq('id', tamanhoId);
  if (error) throw new Error('Não foi possível atualizar o tamanho.');
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

  // Nome único: supabase.channel() reaproveita canais de mesmo nome, e duas
  // telas assinando juntas se atrapalhariam.
  const canal = supabase
    .channel(`produtos-${negocioId}-${novoId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'produtos', filter: `negocio_id=eq.${negocioId}` },
      callback,
    )
    // Ao conectar e a cada reconexão: eventos de quando a internet caiu não
    // são reenviados, então recarrega a lista.
    .subscribe((status) => status === 'SUBSCRIBED' && callback());
  // Esgotado de um tamanho. Canal à parte: num banco sem a migração dos
  // tamanhos, um erro aqui não derruba o aviso dos produtos.
  const canalDosTamanhos =
    bancoTemTamanhos === false
      ? null
      : supabase
          .channel(`produto-tamanhos-${negocioId}-${novoId()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'produto_tamanhos', filter: `negocio_id=eq.${negocioId}` },
            callback,
          )
          .subscribe();
  return () => {
    supabase.removeChannel(canal);
    if (canalDosTamanhos) supabase.removeChannel(canalDosTamanhos);
  };
}

// Produtos "excluídos" (arquivados): o dono pode devolver ao cardápio.
export async function listarProdutosArquivados() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return db.produtos.filter((p) => p.arquivado).map(comListaDemo(db)).map(normalizar).sort(porNome);
  }

  const { data, error } = await consultarProdutos(true);
  if (error) throw new Error('Não foi possível carregar os produtos excluídos.');
  return data.map(normalizar);
}

export async function devolverAoCardapio(id) {
  await atualizarProduto(id, { arquivado: false });
}
