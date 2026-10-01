import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { CANCELADO_VISIVEL_MINUTOS, MOTIVOS_CANCELAMENTO, STATUS_ABERTOS, STATUS_NA_FILA } from '../lib/pedidoStatus';
import { hojeNoNegocio } from '../lib/formatadores';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';

const CAMPOS_PEDIDO = 'id, numero, dia, status, criado_em, alterado_em, pronto_em, cancelado_em, motivo_cancelamento';

// Pedidos abertos aparecem na Cozinha: só o que é preciso para preparar,
// sem preço nem custo.
const CAMPOS_ABERTOS = `${CAMPOS_PEDIDO}, itens_pedido ( id, produto_id, quantidade, observacao, faltou, produtos ( nome ) )`;
const CAMPOS_COM_VALORES = `${CAMPOS_PEDIDO}, itens_pedido ( id, produto_id, quantidade, observacao, faltou, preco_unitario, custo_unitario, produtos ( nome ) )`;

// O Supabase devolve no máximo 1000 linhas por consulta.
const TAMANHO_PAGINA = 1000;
const LIMITE_OBSERVACAO = 140;

// Erros lançados pelas funções do banco (código P0001) já vêm escritos para o usuário.
function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function numeroOuNull(valor) {
  return valor === null || valor === undefined ? null : Number(valor);
}

function limparObservacao(texto) {
  const limpo = (texto ?? '').trim();
  return limpo ? limpo.slice(0, LIMITE_OBSERVACAO) : null;
}

function normalizarItem(i, nome) {
  return {
    id: i.id,
    produto_id: i.produto_id,
    nome,
    quantidade: i.quantidade,
    observacao: i.observacao ?? null,
    faltou: Boolean(i.faltou),
    preco_unitario: numeroOuNull(i.preco_unitario),
    // undefined = item antigo do modo demonstração, sem custo gravado; o
    // relatório usa o custo do cadastro nesse caso
    custo_unitario: i.custo_unitario === undefined ? undefined : numeroOuNull(i.custo_unitario),
  };
}

function normalizarPedido(p, itens) {
  return {
    id: p.id,
    numero: p.numero ?? null,
    // Pedidos antigos do modo demonstração não têm "dia"
    dia: p.dia ?? hojeNoNegocio(new Date(p.criado_em)),
    status: p.status,
    criado_em: p.criado_em,
    alterado_em: p.alterado_em ?? null,
    pronto_em: p.pronto_em ?? null,
    cancelado_em: p.cancelado_em ?? null,
    motivo_cancelamento: p.motivo_cancelamento ?? null,
    itens,
  };
}

function normalizarSupabase(p) {
  return normalizarPedido(
    p,
    (p.itens_pedido ?? []).map((i) => normalizarItem(i, i.produtos?.nome ?? 'Produto removido')),
  );
}

function canceladoRecente(p, agora) {
  return p.status === 'cancelado' && agora - new Date(p.cancelado_em).getTime() < CANCELADO_VISIVEL_MINUTOS * 60000;
}

// ---------------------------------------------------------------------------
// Modo demonstração: mesmas regras das funções do banco (supabase/schema.sql)
// ---------------------------------------------------------------------------

function montarDemo(db, filtro, { comValores }) {
  const nomes = Object.fromEntries(db.produtos.map((p) => [p.id, p.nome]));
  return db.pedidos
    .filter(filtro)
    .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
    .map((p) =>
      normalizarPedido(
        p,
        db.itens_pedido
          .filter((i) => i.pedido_id === p.id)
          .map((i) => {
            const item = normalizarItem(i, nomes[i.produto_id] ?? 'Produto removido');
            return comValores ? item : { ...item, preco_unitario: null, custo_unitario: null };
          }),
      ),
    );
}

function falhaDemo(mensagem) {
  throw new Error(mensagem);
}

function itensDemo(db, pedidoId, itens, anteriores = {}) {
  if (!itens.length || itens.length > 100) falhaDemo('O pedido precisa ter de 1 a 100 itens.');
  return itens.map((i) => {
    const produto = db.produtos.find((p) => p.id === i.produto_id);
    const jaEstava = Boolean(produto && anteriores[produto.id]);
    if (!produto || (!jaEstava && (!produto.disponivel || produto.arquivado))) {
      falhaDemo('Um dos produtos esgotou. Revise o pedido.');
    }
    if (!(i.quantidade >= 1 && i.quantidade <= 999)) falhaDemo('A quantidade precisa ficar entre 1 e 999.');
    return {
      id: novoId(),
      pedido_id: pedidoId,
      produto_id: produto.id,
      quantidade: i.quantidade,
      observacao: limparObservacao(i.observacao),
      faltou: false,
      preco_unitario: jaEstava ? anteriores[produto.id].preco : produto.preco,
      custo_unitario: jaEstava ? anteriores[produto.id].custo : (produto.custo ?? null),
    };
  });
}

function pedidoDemo(db, id) {
  const pedido = db.pedidos.find((p) => p.id === id);
  if (!pedido) falhaDemo('Pedido não encontrado.');
  return pedido;
}

function atualizarPedidoDemo(db, id, alteracoes) {
  const agora = new Date().toISOString();
  return { ...db, pedidos: db.pedidos.map((p) => (p.id === id ? { ...p, ...alteracoes, atualizado_em: agora } : p)) };
}

function itensParaEnvio(itens) {
  return itens.map(({ produto_id, quantidade, observacao }) => ({
    produto_id,
    quantidade,
    observacao: limparObservacao(observacao),
  }));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

// itens: [{ produto_id, quantidade, observacao }]. Preço e custo vêm do
// cadastro do produto, nunca de quem lança o pedido. chaveEnvio identifica
// este envio: mandar de novo com a mesma chave devolve o mesmo pedido.
export async function criarPedido({ negocioId, usuarioId, itens, chaveEnvio }) {
  if (!itens.length) throw new Error('Adicione pelo menos um produto ao pedido.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const repetido = db.pedidos.find((p) => p.chave_envio === chaveEnvio);
    if (repetido) return normalizarPedido(repetido, []);

    const dia = hojeNoNegocio();
    const usados = new Set(db.pedidos.filter((p) => p.dia === dia).map((p) => p.numero));
    let numero;
    do numero = 1000 + Math.floor(Math.random() * 9000);
    while (usados.has(numero));

    const pedido = {
      id: novoId(),
      negocio_id: negocioId,
      numero,
      dia,
      status: 'pendente',
      criado_em: new Date().toISOString(),
      criado_por: usuarioId,
      chave_envio: chaveEnvio,
    };
    const novosItens = itensDemo(db, pedido.id, itens);
    salvarDemo({ ...db, pedidos: [...db.pedidos, pedido], itens_pedido: [...db.itens_pedido, ...novosItens] });
    return normalizarPedido(pedido, []);
  }

  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: itensParaEnvio(itens),
    p_chave_envio: chaveEnvio,
  });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível enviar o pedido. Tente de novo.'));
  return normalizarPedido(data, []);
}

export async function editarPedido(id, itens) {
  if (!itens.length) throw new Error('O pedido precisa ter pelo menos um item. Para desistir, cancele o pedido.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedido = pedidoDemo(db, id);
    if (!STATUS_NA_FILA.includes(pedido.status)) {
      falhaDemo('Este pedido já ficou pronto ou foi encerrado. Lance um pedido novo.');
    }
    const anteriores = {};
    for (const i of db.itens_pedido.filter((item) => item.pedido_id === id)) {
      anteriores[i.produto_id] = { preco: i.preco_unitario, custo: i.custo_unitario ?? null };
    }
    const novosItens = itensDemo(db, id, itens, anteriores);
    const trocados = { ...db, itens_pedido: [...db.itens_pedido.filter((i) => i.pedido_id !== id), ...novosItens] };
    salvarDemo(atualizarPedidoDemo(trocados, id, { alterado_em: new Date().toISOString() }));
    return;
  }

  const { error } = await supabase.rpc('editar_pedido', { p_pedido_id: id, p_itens: itensParaEnvio(itens) });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível salvar as alterações.'));
}

export async function cancelarPedido(id, motivo) {
  if (!MOTIVOS_CANCELAMENTO.some((m) => m.id === motivo)) throw new Error('Escolha o motivo do cancelamento.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedido = pedidoDemo(db, id);
    if (['entregue', 'cancelado'].includes(pedido.status)) falhaDemo('Este pedido já foi encerrado.');
    salvarDemo(
      atualizarPedidoDemo(db, id, {
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
        motivo_cancelamento: motivo,
      }),
    );
    return;
  }

  const { error } = await supabase.rpc('cancelar_pedido', { p_pedido_id: id, p_motivo: motivo });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível cancelar o pedido.'));
}

// Os mesmos caminhos de atualizar_status_pedido no banco.
function transicaoPermitida(pedido, status) {
  const atual = pedido.status;
  return (
    (atual === 'pendente' && ['em_preparo', 'pronto'].includes(status)) ||
    (atual === 'em_preparo' && status === 'pronto') ||
    (atual === 'pronto' && ['entregue', 'pendente'].includes(status)) ||
    (pedido.dia < hojeNoNegocio() && STATUS_NA_FILA.includes(atual) && status === 'entregue')
  );
}

export async function atualizarStatusPedido(id, status) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedido = normalizarPedido(pedidoDemo(db, id), []);
    if (pedido.status === 'pronto' && status === 'pendente' && Date.now() - new Date(pedido.pronto_em) >= 120000) {
      falhaDemo('O tempo para desfazer acabou.');
    }
    if (!transicaoPermitida(pedido, status)) falhaDemo('Este pedido já mudou de status. Atualize a tela.');
    const agora = new Date().toISOString();
    salvarDemo(
      atualizarPedidoDemo(db, id, {
        status,
        pronto_em: status === 'pronto' ? agora : status === 'pendente' ? null : pedido.pronto_em,
        ...(status === 'entregue' ? { entregue_em: agora } : {}),
      }),
    );
    return;
  }

  const { error } = await supabase.rpc('atualizar_status_pedido', { p_pedido_id: id, p_status: status });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível atualizar o pedido.'));
}

export async function marcarItemFaltou(itemId, faltou) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const item = db.itens_pedido.find((i) => i.id === itemId);
    const pedido = item && db.pedidos.find((p) => p.id === item.pedido_id);
    if (!pedido || !STATUS_NA_FILA.includes(pedido.status)) falhaDemo('Este pedido não está mais na fila.');
    const comItem = { ...db, itens_pedido: db.itens_pedido.map((i) => (i.id === itemId ? { ...i, faltou } : i)) };
    salvarDemo(atualizarPedidoDemo(comItem, pedido.id, {}));
    return;
  }

  const { error } = await supabase.rpc('marcar_item_faltou', { p_item_id: itemId, p_faltou: faltou });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível avisar o atendente.'));
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

// Pedidos abertos de qualquer dia (os de dias anteriores viram pendências) e os
// cancelados há pouco, para a cozinha ver o aviso de "não preparar".
export async function listarPedidosAbertos() {
  const agora = Date.now();

  if (!isSupabaseConfigured) {
    return montarDemo(lerDemo(), (p) => STATUS_ABERTOS.includes(p.status) || canceladoRecente(p, agora), {
      comValores: false,
    });
  }

  const desde = new Date(agora - CANCELADO_VISIVEL_MINUTOS * 60000).toISOString();
  const { data, error } = await supabase
    .from('pedidos')
    .select(CAMPOS_ABERTOS)
    .or(`status.in.(${STATUS_ABERTOS.join(',')}),and(status.eq.cancelado,cancelado_em.gte.${desde})`)
    .order('criado_em', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os pedidos.');
  return data.map(normalizarSupabase);
}

// Para editar, o atendente precisa ver o preço de cada item.
export async function buscarPedidoComValores(id) {
  if (!isSupabaseConfigured) {
    const [pedido] = montarDemo(lerDemo(), (p) => p.id === id, { comValores: true });
    if (!pedido) throw new Error('Pedido não encontrado.');
    return pedido;
  }

  const { data, error } = await supabase.from('pedidos').select(CAMPOS_COM_VALORES).eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Não foi possível abrir o pedido.');
  return normalizarSupabase(data);
}

export async function listarPedidosDoPeriodo(inicio, fim) {
  if (!isSupabaseConfigured) {
    return montarDemo(
      lerDemo(),
      (p) => {
        const t = new Date(p.criado_em);
        return t >= inicio && t < fim;
      },
      { comValores: true },
    );
  }

  const todos = [];
  for (let pagina = 0; ; pagina++) {
    const de = pagina * TAMANHO_PAGINA;
    const { data, error } = await supabase
      .from('pedidos')
      .select(CAMPOS_COM_VALORES)
      .gte('criado_em', inicio.toISOString())
      .lt('criado_em', fim.toISOString())
      // id desempata pedidos do mesmo instante, para nenhum pular de página
      .order('criado_em', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error('Não foi possível carregar os pedidos do período.');
    todos.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
  }
  return todos.map(normalizarSupabase);
}

export function assinarPedidos(negocioId, callback) {
  if (!isSupabaseConfigured) return assinarDemo(callback);

  // Toda mudança de pedido (edição de itens, "faltou", status) também atualiza
  // a linha em pedidos, então essa tabela basta para avisar as telas.
  const canal = supabase
    .channel(`pedidos-${negocioId}-${novoId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `negocio_id=eq.${negocioId}` },
      callback,
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'itens_pedido' }, callback)
    // Ao conectar e a cada reconexão: eventos de quando a internet caiu não
    // são reenviados, então recarrega a lista.
    .subscribe((status) => status === 'SUBSCRIBED' && callback());
  return () => supabase.removeChannel(canal);
}
