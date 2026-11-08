import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { CANCELADO_VISIVEL_MINUTOS, MOTIVOS_CANCELAMENTO, STATUS_ABERTOS, STATUS_NA_FILA } from '../lib/pedidoStatus';
import { hojeNoNegocio } from '../lib/formatadores';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';
import { limparNomeMesa } from '../lib/mesas';
import { emAberto } from '../lib/fimDoDia';

const CAMPOS_PEDIDO_BASE =
  'id, numero, mesa, dia, status, criado_em, alterado_em, pronto_em, cancelado_em, motivo_cancelamento, identificacao, forma_pagamento, pago_em';
// Migração 2026-11-11 (mesas): nome da mesa extra e a conta em que foi pago.
const CAMPOS_DAS_MESAS = ', nome_mesa, conta_id';
// Migração 2026-11-12 (fim do dia): "foi embora sem pagar" e a devolução do
// dinheiro de pedido pago e cancelado.
const CAMPOS_DO_FIM_DO_DIA = ', nao_recebido_em, devolucao, devolvido_em';
// Do banco mais novo para o mais antigo: cada nível tem as colunas de uma
// migração a menos.
const NIVEIS_DE_CAMPOS = [
  CAMPOS_PEDIDO_BASE + CAMPOS_DAS_MESAS + CAMPOS_DO_FIM_DO_DIA,
  CAMPOS_PEDIDO_BASE + CAMPOS_DAS_MESAS,
  CAMPOS_PEDIDO_BASE,
];

// Pedidos abertos aparecem na Cozinha: só o que é preciso para preparar,
// sem preço nem custo. Os ingredientes do produto são as opções do "Faltou".
const CAMPOS_ITEM = 'id, produto_id, quantidade, observacao, faltou, faltou_ingredientes';
// Migração 2026-11-13 (tamanhos): o tamanho escolhido (id e nome copiado).
const CAMPOS_DO_TAMANHO = ', tamanho_id, tamanho';
const PRODUTO_DO_ITEM = 'produtos ( nome, vai_para_cozinha, produto_ingredientes ( ingrediente_id, ingredientes ( nome ) ) )';
const ITENS_ABERTOS = (t) => `itens_pedido ( ${CAMPOS_ITEM}${t}, ${PRODUTO_DO_ITEM} )`;
const ITENS_COM_VALORES = (t) => `itens_pedido ( ${CAMPOS_ITEM}${t}, preco_unitario, custo_unitario, ${PRODUTO_DO_ITEM} )`;
// Caixa, contas das mesas e relatórios: sem a lista de ingredientes de cada
// produto (só a Cozinha e a edição usam), que pesa em todo pedido do dia.
const ITENS_DO_PERIODO = (t) =>
  `itens_pedido ( ${CAMPOS_ITEM}${t}, preco_unitario, custo_unitario, produtos ( nome, vai_para_cozinha ) )`;

// Banco ainda sem uma migração: pede só as colunas que ele tem, para a fila,
// a cozinha e o caixa continuarem funcionando (o aviso de banco desatualizado
// aparece para a equipe).
let nivelDoBanco = 0;
let itensComTamanho = true;

// 42703 / PGRST204: coluna que não existe, ou seja, banco ainda sem a migração.
export function colunaInexistente(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /does not exist/i.test(error?.message ?? '');
}

// itens: função que monta a parte dos itens (com ou sem as colunas do tamanho).
// A migração dos tamanhos é a mais nova: sem ela, tira primeiro o tamanho e
// só depois desce os níveis das colunas do pedido.
async function consultarPedidos(montar, itens) {
  for (;;) {
    const resposta = await montar(`${NIVEIS_DE_CAMPOS[nivelDoBanco]}, ${itens(itensComTamanho ? CAMPOS_DO_TAMANHO : '')}`);
    if (!colunaInexistente(resposta.error)) return resposta;
    if (itensComTamanho) itensComTamanho = false;
    else if (nivelDoBanco < NIVEIS_DE_CAMPOS.length - 1) nivelDoBanco++;
    else return resposta;
  }
}

// Função do banco que não existe com esses parâmetros: banco ainda sem a migração.
export function funcaoInexistente(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

// O Supabase devolve no máximo 1000 linhas por consulta.
const TAMANHO_PAGINA = 1000;
const LIMITE_OBSERVACAO = 140;

// Só se anota a forma quando o dinheiro entrou de verdade.
export const FORMAS_DE_PAGAMENTO = [
  { id: 'pix', rotulo: 'Pix' },
  { id: 'dinheiro', rotulo: 'Dinheiro' },
  { id: 'credito', rotulo: 'Crédito' },
  { id: 'debito', rotulo: 'Débito' },
];

const FORMAS = new Set(FORMAS_DE_PAGAMENTO.map((f) => f.id));
// Mesmo texto do banco: pagamento novo em "cartão" não é mais aceito.
const ERRO_CARTAO = 'Cartão agora é anotado como crédito ou débito. Lance o pedido de novo escolhendo um dos dois.';

// 'cartao' só existe em pedidos pagos antes de separar crédito e débito.
export const ROTULO_FORMA = { ...Object.fromEntries(FORMAS_DE_PAGAMENTO.map((f) => [f.id, f.rotulo])), cartao: 'Cartão' };

const LIMITE_IDENTIFICACAO = 30;

// Mesmos textos do banco (editar_pedido e cancelar_pedido).
const ERRO_PAGO_NA_CONTA_VALOR =
  'Este pedido já foi pago na conta da mesa. Para mudar o valor, desfaça o recebimento da conta no Caixa.';
const ERRO_PAGO_NA_CONTA_CANCELAR =
  'Este pedido já foi pago na conta da mesa. Para cancelar, desfaça o recebimento da conta no Caixa.';
const ERRO_NAO_RECEBIDO_CANCELAR = 'Este pedido está como não recebido. Para cancelar, desfaça o "não recebido" no Caixa.';

export function limparIdentificacao(texto) {
  const limpo = (texto ?? '').trim().replace(/\s+/g, ' ');
  return limpo ? limpo.slice(0, LIMITE_IDENTIFICACAO) : null;
}

// Erros lançados pelas funções do banco (código P0001) já vêm escritos para o usuário.
function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

// A internet caiu no meio do envio: o pedido não chegou ao banco (ou não deu
// para saber). Quem chama guarda o pedido para mandar de novo com a mesma
// chave, que não duplica.
export class SemInternet extends Error {
  constructor() {
    super('Sem internet. O pedido foi guardado e sai sozinho quando a conexão voltar.');
    this.semInternet = true;
  }
}

function ehFalhaDeRede(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !error?.code && /fetch|network|load failed|timeout/i.test(error?.message ?? '');
}

function numeroOuNull(valor) {
  return valor === null || valor === undefined ? null : Number(valor);
}

function limparObservacao(texto) {
  const limpo = (texto ?? '').trim();
  return limpo ? limpo.slice(0, LIMITE_OBSERVACAO) : null;
}

// Mesa onde o cliente está (consumo no salão). null: retirada no balcão,
// chamada pela senha. Mesma regra de criar_pedido/editar_pedido no banco.
function conferirMesa(mesa) {
  if (mesa === null || mesa === undefined) return null;
  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 999) throw new Error('O número da mesa precisa ficar entre 1 e 999.');
  return mesa;
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

// "Pizza Calabresa (G)": o que aparece na conta, no caixa e nos resumos.
export function nomeComTamanho(produto, tamanho) {
  return tamanho ? `${produto} (${tamanho})` : produto;
}

// ingredientes: [{ id, nome }] do produto, hoje
function normalizarItem(i, nome, ingredientes = []) {
  const tamanho = i.tamanho ?? null;
  return {
    id: i.id,
    produto_id: i.produto_id,
    // tamanho_id: o tamanho escolhido (para editar); tamanho: o nome gravado
    // no pedido, que não muda se o tamanho for renomeado ou removido.
    tamanho_id: i.tamanho_id ?? null,
    tamanho,
    produto_nome: nome,
    nome: nomeComTamanho(nome, tamanho),
    quantidade: i.quantidade,
    observacao: i.observacao ?? null,
    faltou: Boolean(i.faltou),
    faltou_ingredientes: i.faltou_ingredientes ?? [],
    // Bebida e o que já sai pronto não aparecem na fila da cozinha.
    vai_para_cozinha: i.vai_para_cozinha ?? true,
    ingredientes: [...ingredientes].sort(porNome),
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
    mesa: p.mesa ?? null,
    // Pedidos antigos do modo demonstração não têm "dia"
    dia: p.dia ?? hojeNoNegocio(new Date(p.criado_em)),
    status: p.status,
    criado_em: p.criado_em,
    alterado_em: p.alterado_em ?? null,
    pronto_em: p.pronto_em ?? null,
    cancelado_em: p.cancelado_em ?? null,
    motivo_cancelamento: p.motivo_cancelamento ?? null,
    identificacao: p.identificacao ?? null,
    forma_pagamento: p.forma_pagamento ?? null,
    pago_em: p.pago_em ?? null,
    nome_mesa: p.nome_mesa ?? null,
    conta_id: p.conta_id ?? null,
    nao_recebido_em: p.nao_recebido_em ?? null,
    devolucao: p.devolucao ?? null,
    devolvido_em: p.devolvido_em ?? null,
    itens,
  };
}

function normalizarSupabase(p) {
  return normalizarPedido(
    p,
    (p.itens_pedido ?? []).map((i) =>
      normalizarItem(
        { ...i, vai_para_cozinha: i.produtos?.vai_para_cozinha },
        i.produtos?.nome ?? 'Produto removido',
        (i.produtos?.produto_ingredientes ?? []).map((pi) => ({ id: pi.ingrediente_id, nome: pi.ingredientes?.nome ?? '' })),
      ),
    ),
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
  const paraCozinha = Object.fromEntries(db.produtos.map((p) => [p.id, p.vai_para_cozinha ?? true]));
  const nomesIngredientes = Object.fromEntries((db.ingredientes ?? []).map((i) => [i.id, i.nome]));
  const ingredientesDo = (produtoId) =>
    (db.produto_ingredientes ?? [])
      .filter((pi) => pi.produto_id === produtoId)
      .map((pi) => ({ id: pi.ingrediente_id, nome: nomesIngredientes[pi.ingrediente_id] ?? '' }));
  return db.pedidos
    .filter(filtro)
    .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
    .map((p) =>
      normalizarPedido(
        p,
        db.itens_pedido
          .filter((i) => i.pedido_id === p.id)
          .map((i) => {
            const item = normalizarItem(
              { ...i, vai_para_cozinha: paraCozinha[i.produto_id] },
              nomes[i.produto_id] ?? 'Produto removido',
              ingredientesDo(i.produto_id),
            );
            return comValores ? item : { ...item, preco_unitario: null, custo_unitario: null };
          }),
      ),
    );
}

function falhaDemo(mensagem) {
  throw new Error(mensagem);
}

// Mesma chave do editar_pedido no banco: produto e tamanho.
function chaveDoItem(produtoId, tamanhoId) {
  return `${produtoId}|${tamanhoId ?? ''}`;
}

// Mesmas regras (e textos) do gravar_itens_pedido no banco.
function itensDemo(db, pedidoId, itens, anteriores = {}) {
  if (!itens.length || itens.length > 100) falhaDemo('O pedido precisa ter de 1 a 100 itens.');
  const tamanhos = db.produto_tamanhos ?? [];
  return itens.map((i) => {
    if (!(i.quantidade >= 1 && i.quantidade <= 999)) falhaDemo('A quantidade precisa ficar entre 1 e 999.');
    const produto = db.produtos.find((p) => p.id === i.produto_id);
    if (!produto) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
    const tamanho = i.tamanho_id ? tamanhos.find((t) => t.id === i.tamanho_id && t.produto_id === produto.id) : null;
    if (i.tamanho_id && !tamanho) falhaDemo('Um dos tamanhos saiu do cardápio. Lance o pedido de novo.');
    const anterior = anteriores[chaveDoItem(produto.id, tamanho?.id)];
    if (!anterior) {
      if (!produto.disponivel || produto.arquivado) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
      if (!tamanho && tamanhos.some((t) => t.produto_id === produto.id && !t.arquivado)) {
        falhaDemo(`Escolha o tamanho de ${produto.nome}. Revise o pedido.`);
      }
      if (tamanho?.arquivado) falhaDemo(`O tamanho ${tamanho.nome} de ${produto.nome} saiu do cardápio. Lance o pedido de novo.`);
      if (tamanho && !tamanho.disponivel) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
    }
    const doCadastro = tamanho ?? produto;
    return {
      id: novoId(),
      pedido_id: pedidoId,
      produto_id: produto.id,
      tamanho_id: tamanho?.id ?? null,
      tamanho: anterior ? (anterior.tamanho ?? tamanho?.nome ?? null) : (tamanho?.nome ?? null),
      quantidade: i.quantidade,
      observacao: limparObservacao(i.observacao),
      faltou: false,
      faltou_ingredientes: [],
      preco_unitario: anterior ? anterior.preco : doCadastro.preco,
      custo_unitario: anterior ? anterior.custo : (doCadastro.custo ?? null),
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

// tamanho_id só vai quando existe: o banco sem a migração dos tamanhos não
// conhece a chave e segue aceitando os pedidos de sempre.
function itensParaEnvio(itens) {
  return itens.map(({ produto_id, tamanho_id, quantidade, observacao }) => ({
    produto_id,
    ...(tamanho_id ? { tamanho_id } : {}),
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
// mesa: número da mesa, ou null para retirada no balcão.
// identificacao: nome do cliente para chamar (opcional).
// formaPagamento: como o cliente pagou, quando paga na hora (balcão).
// nomeMesa: nome da mesa extra ("Varanda"); só vale com mesa.
export async function criarPedido({
  negocioId,
  usuarioId,
  itens,
  chaveEnvio,
  mesa = null,
  identificacao = null,
  formaPagamento = null,
  nomeMesa = null,
}) {
  if (!itens.length) throw new Error('Adicione pelo menos um produto ao pedido.');
  const mesaDoPedido = conferirMesa(mesa);
  const nomeDaMesaExtra = mesaDoPedido ? limparNomeMesa(nomeMesa) : null;
  // Pedido guardado sem internet numa versão antiga do site pode chegar com
  // "Cartão": a fila de envio mostra o erro para lançar de novo.
  if (formaPagamento === 'cartao') throw new Error(ERRO_CARTAO);
  if (formaPagamento && !FORMAS.has(formaPagamento)) throw new Error('Forma de pagamento inválida.');
  const nomeOuMesa = limparIdentificacao(identificacao);

  if (!isSupabaseConfigured) {
    // Na demonstração os dados ficam no navegador, mas o pedido respeita o
    // "sem internet" do aparelho: dá para mostrar a fila de envio ao vivo.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new SemInternet();
    const db = lerDemo();
    const repetido = db.pedidos.find((p) => p.chave_envio === chaveEnvio);
    if (repetido) return normalizarPedido(repetido, []);

    // Mesma regra do contador_pedidos do banco: 1 no primeiro pedido do dia,
    // depois soma 1 e volta para 1 depois do 999.
    const dia = hojeNoNegocio();
    const anterior = db.contador?.dia === dia ? db.contador.ultimo : 0;
    const numero = (anterior % 999) + 1;
    db.contador = { dia, ultimo: numero };

    const pedido = {
      id: novoId(),
      negocio_id: negocioId,
      numero,
      mesa: mesaDoPedido,
      nome_mesa: nomeDaMesaExtra,
      conta_id: null,
      dia,
      status: 'pendente',
      criado_em: new Date().toISOString(),
      criado_por: usuarioId,
      chave_envio: chaveEnvio,
      identificacao: nomeOuMesa,
      forma_pagamento: formaPagamento,
      pago_em: formaPagamento ? new Date().toISOString() : null,
    };
    const novosItens = itensDemo(db, pedido.id, itens);
    // Mesma regra do banco: só bebida (o que não vai para a cozinha) já nasce pronto.
    const precisaCozinha = novosItens.some((i) => db.produtos.find((p) => p.id === i.produto_id)?.vai_para_cozinha ?? true);
    if (!precisaCozinha) Object.assign(pedido, { status: 'pronto', pronto_em: pedido.criado_em });
    salvarDemo({ ...db, pedidos: [...db.pedidos, pedido], itens_pedido: [...db.itens_pedido, ...novosItens] });
    return normalizarPedido(pedido, []);
  }

  let resposta;
  try {
    resposta = await supabase.rpc('criar_pedido', {
      p_itens: itensParaEnvio(itens),
      p_chave_envio: chaveEnvio,
      p_mesa: mesaDoPedido,
      p_identificacao: nomeOuMesa,
      p_forma_pagamento: formaPagamento,
      // Banco sem a migração das mesas não conhece o parâmetro: só manda
      // quando há nome (mesa extra), que só aparece com o mapa das mesas.
      ...(nomeDaMesaExtra ? { p_nome_mesa: nomeDaMesaExtra } : {}),
    });
  } catch (e) {
    if (ehFalhaDeRede(e)) throw new SemInternet();
    throw e;
  }
  const { data, error } = resposta;
  if (error && ehFalhaDeRede(error)) throw new SemInternet();
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível enviar o pedido. Tente de novo.'));
  return normalizarPedido(data, []);
}

// versao: o alterado_em do pedido quando a edição começou. Se outra pessoa
// salvou no meio-tempo, a edição é recusada para não apagar a dela.
// mesa: como o pedido fica depois de salvar (null: balcão).
// nomeMesa: nome da mesa extra; sem ele, quem fica na mesma mesa mantém o nome.
export async function editarPedido(id, itens, versao, mesa = null, nomeMesa = null) {
  if (!itens.length) throw new Error('O pedido precisa ter pelo menos um item. Para desistir, cancele o pedido.');
  const mesaDoPedido = conferirMesa(mesa);
  const nomeDaMesaExtra = limparNomeMesa(nomeMesa);

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedido = pedidoDemo(db, id);
    if (!STATUS_NA_FILA.includes(pedido.status)) {
      falhaDemo('Este pedido já ficou pronto ou foi encerrado. Lance um pedido novo.');
    }
    if ((pedido.alterado_em ?? null) !== (versao ?? null)) {
      falhaDemo('Outra pessoa alterou este pedido agora há pouco. Abra o pedido de novo para ver como ficou.');
    }
    const anteriores = {};
    for (const i of db.itens_pedido.filter((item) => item.pedido_id === id)) {
      anteriores[chaveDoItem(i.produto_id, i.tamanho_id)] = {
        preco: i.preco_unitario,
        custo: i.custo_unitario ?? null,
        tamanho: i.tamanho ?? null,
      };
    }
    const novosItens = itensDemo(db, id, itens, anteriores);
    const somar = (lista) => lista.reduce((s, i) => s + i.quantidade * (i.preco_unitario ?? 0), 0);
    const mudouValor = Math.round(somar(novosItens) * 100) !== Math.round(somar(db.itens_pedido.filter((i) => i.pedido_id === id)) * 100);
    // Mesma regra do editar_pedido: pago na conta da mesa não muda de valor
    // nem de mesa sem desfazer a conta.
    if (pedido.conta_id && mudouValor) falhaDemo(ERRO_PAGO_NA_CONTA_VALOR);
    const precisaCozinha = novosItens.some((i) => db.produtos.find((p) => p.id === i.produto_id)?.vai_para_cozinha ?? true);
    const agora = new Date().toISOString();
    const trocados = { ...db, itens_pedido: [...db.itens_pedido.filter((i) => i.pedido_id !== id), ...novosItens] };
    const nomeQueFica = pedido.conta_id
      ? (pedido.nome_mesa ?? null)
      : !mesaDoPedido
        ? null
        : (nomeDaMesaExtra ?? (mesaDoPedido === pedido.mesa ? (pedido.nome_mesa ?? null) : null));
    salvarDemo(
      atualizarPedidoDemo(trocados, id, {
        alterado_em: agora,
        mesa: pedido.conta_id ? pedido.mesa : mesaDoPedido,
        nome_mesa: nomeQueFica,
        // Mesmas regras do editar_pedido: pago com outro valor volta para "a
        // receber"; só bebida sai da fila da cozinha.
        ...(mudouValor ? { forma_pagamento: null, pago_em: null } : {}),
        ...(precisaCozinha ? {} : { status: 'pronto', pronto_em: agora }),
      }),
    );
    return;
  }

  const { error } = await supabase.rpc('editar_pedido', {
    p_pedido_id: id,
    p_itens: itensParaEnvio(itens),
    p_versao: versao ?? null,
    ...(mesaDoPedido ? { p_mesa: mesaDoPedido } : {}),
    ...(mesaDoPedido && nomeDaMesaExtra ? { p_nome_mesa: nomeDaMesaExtra } : {}),
  });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível salvar as alterações.'));
}

export const DEVOLUCOES = ['devolvido', 'a_devolver'];

// devolucao: pedido já pago, o dinheiro voltou para o cliente ('devolvido') ou
// ainda vai voltar ('a_devolver', fica no Caixa até tocar em "Devolvi").
// Mesmas regras de cancelar_pedido no banco.
export async function cancelarPedido(id, motivo, devolucao = null) {
  if (!MOTIVOS_CANCELAMENTO.some((m) => m.id === motivo)) throw new Error('Escolha o motivo do cancelamento.');
  if (devolucao && !DEVOLUCOES.includes(devolucao)) throw new Error('Diga se você já devolveu o dinheiro ao cliente.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedido = pedidoDemo(db, id);
    if (pedido.conta_id) falhaDemo(ERRO_PAGO_NA_CONTA_CANCELAR);
    if (pedido.nao_recebido_em) falhaDemo(ERRO_NAO_RECEBIDO_CANCELAR);
    if (pedido.status === 'cancelado' || (pedido.status === 'entregue' && pedido.pago_em)) falhaDemo('Este pedido já foi encerrado.');
    const agora = new Date().toISOString();
    const comoFica = pedido.pago_em ? (devolucao ?? 'a_devolver') : null;
    salvarDemo(
      atualizarPedidoDemo(db, id, {
        status: 'cancelado',
        cancelado_em: agora,
        motivo_cancelamento: motivo,
        devolucao: comoFica,
        devolvido_em: comoFica === 'devolvido' ? agora : null,
      }),
    );
    return;
  }

  const { error } = await supabase.rpc('cancelar_pedido', {
    p_pedido_id: id,
    p_motivo: motivo,
    ...(devolucao ? { p_devolucao: devolucao } : {}),
  });
  // Banco ainda sem a pergunta da devolução: cancela como antes (o Caixa
  // mostra o valor a devolver).
  if (error && devolucao && funcaoInexistente(error)) {
    const { error: deNovo } = await supabase.rpc('cancelar_pedido', { p_pedido_id: id, p_motivo: motivo });
    if (deNovo) throw new Error(mensagemDoBanco(deNovo, 'Não foi possível cancelar o pedido.'));
    return;
  }
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

// "Faltou queijo": a cozinha diz qual ingrediente do item não tem. O nome fica
// gravado no item, então renomear o ingrediente depois não muda o aviso.
export async function marcarIngredienteFaltou(itemId, ingredienteId, faltou) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const item = db.itens_pedido.find((i) => i.id === itemId);
    const pedido = item && db.pedidos.find((p) => p.id === item.pedido_id);
    if (!pedido || !STATUS_NA_FILA.includes(pedido.status)) falhaDemo('Este pedido não está mais na fila.');
    const naLista = (db.produto_ingredientes ?? []).some(
      (pi) => pi.produto_id === item.produto_id && pi.ingrediente_id === ingredienteId,
    );
    const nome = (db.ingredientes ?? []).find((i) => i.id === ingredienteId)?.nome;
    if (!naLista || !nome) falhaDemo('Este ingrediente não está mais no produto. Atualize a tela.');
    const atuais = item.faltou_ingredientes ?? [];
    const novos = faltou ? (atuais.includes(nome) ? atuais : [...atuais, nome]) : atuais.filter((n) => n !== nome);
    const comItem = {
      ...db,
      itens_pedido: db.itens_pedido.map((i) => (i.id === itemId ? { ...i, faltou_ingredientes: novos } : i)),
    };
    salvarDemo(atualizarPedidoDemo(comItem, pedido.id, {}));
    return;
  }

  const { error } = await supabase.rpc('marcar_ingrediente_faltou', {
    p_item_id: itemId,
    p_ingrediente_id: ingredienteId,
    p_faltou: faltou,
  });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível avisar o atendente.'));
}

// Recebe um ou mais pedidos de uma vez (a conta da mesa). forma null desfaz.
export async function registrarPagamento(ids, forma) {
  if (!ids.length) return 0;
  if (forma === 'cartao') throw new Error('Cartão agora é anotado como crédito ou débito. Escolha um dos dois.');
  if (forma && !FORMAS.has(forma)) throw new Error('Forma de pagamento inválida.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const agora = new Date().toISOString();
    let quantos = 0;
    const pedidos = db.pedidos.map((p) => {
      if (!ids.includes(p.id) || p.status === 'cancelado' || p.conta_id || p.nao_recebido_em || (forma && p.pago_em)) return p;
      quantos++;
      return { ...p, forma_pagamento: forma, pago_em: forma ? agora : null, atualizado_em: agora };
    });
    salvarDemo({ ...db, pedidos });
    return quantos;
  }

  const { data, error } = await supabase.rpc('registrar_pagamento', { p_pedido_ids: ids, p_forma: forma });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível registrar o pagamento.'));
  return data;
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
  const { data, error } = await consultarPedidos(
    (campos) =>
      supabase
        .from('pedidos')
        .select(campos)
        .or(`status.in.(${STATUS_ABERTOS.join(',')}),and(status.eq.cancelado,cancelado_em.gte.${desde})`)
        .order('criado_em', { ascending: true }),
    ITENS_ABERTOS,
  );
  if (error) throw new Error('Não foi possível carregar os pedidos.');
  return data.map(normalizarSupabase);
}

// Pendências do dia anterior: pedidos de dias antes de hoje (até 60 dias) que
// ainda não foram entregues ou recebidos. Nada é cancelado sozinho na virada
// do dia: o dono resolve cada um.
const DIAS_DE_PENDENCIAS = 60;

export async function listarPendenciasAnteriores() {
  const hoje = hojeNoNegocio();
  if (!isSupabaseConfigured) {
    return montarDemo(lerDemo(), (p) => p.dia && p.dia < hoje && emAberto(p), { comValores: true });
  }

  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_DE_PENDENCIAS);
  const { data, error } = await consultarPedidos(
    (campos) =>
      supabase
        .from('pedidos')
        .select(campos)
        .lt('dia', hoje)
        .gte('dia', inicio.toISOString().slice(0, 10))
        .neq('status', 'cancelado')
        // Banco sem a migração do fim do dia não tem o "não recebido".
        .or(
          campos.includes('nao_recebido_em')
            ? `status.in.(${STATUS_ABERTOS.join(',')}),and(pago_em.is.null,nao_recebido_em.is.null)`
            : `status.in.(${STATUS_ABERTOS.join(',')}),pago_em.is.null`,
        )
        .order('criado_em', { ascending: true })
        .limit(500),
    ITENS_DO_PERIODO,
  );
  if (error) throw new Error('Não foi possível carregar as pendências.');
  return data.map(normalizarSupabase);
}

// Para editar, o atendente precisa ver o preço de cada item.
export async function buscarPedidoComValores(id) {
  if (!isSupabaseConfigured) {
    const [pedido] = montarDemo(lerDemo(), (p) => p.id === id, { comValores: true });
    if (!pedido) throw new Error('Pedido não encontrado.');
    return pedido;
  }

  const { data, error } = await consultarPedidos(
    (campos) => supabase.from('pedidos').select(campos).eq('id', id).maybeSingle(),
    ITENS_COM_VALORES,
  );
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
    const { data, error } = await consultarPedidos(
      (campos) =>
        supabase
          .from('pedidos')
          .select(campos)
          .gte('criado_em', inicio.toISOString())
          .lt('criado_em', fim.toISOString())
          // id desempata pedidos do mesmo instante, para nenhum pular de página
          .order('criado_em', { ascending: true })
          .order('id', { ascending: true })
          .range(de, de + TAMANHO_PAGINA - 1),
      ITENS_DO_PERIODO,
    );
    if (error) throw new Error('Não foi possível carregar os pedidos do período.');
    todos.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
  }
  return todos.map(normalizarSupabase);
}

// aoMudarConexao(true|false): o tempo real caiu ou voltou. Sem ele, a tela não
// sabe que parou de receber pedidos novos.
export function assinarPedidos(negocioId, callback, aoMudarConexao) {
  if (!isSupabaseConfigured) return assinarDemo(callback);

  // Toda mudança de pedido (criação, edição de itens, "faltou", status,
  // pagamento) termina atualizando a linha em pedidos depois dos itens, então
  // essa tabela basta para avisar as telas.
  const canal = supabase
    .channel(`pedidos-${negocioId}-${novoId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `negocio_id=eq.${negocioId}` },
      callback,
    )
    // Ao conectar e a cada reconexão: eventos de quando a internet caiu não
    // são reenviados, então recarrega a lista.
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        aoMudarConexao?.(true);
        callback();
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        aoMudarConexao?.(false);
      }
    });
  return () => supabase.removeChannel(canal);
}
