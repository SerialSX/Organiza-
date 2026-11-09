import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { CANCELADO_VISIVEL_MINUTOS, MOTIVOS_CANCELAMENTO, STATUS_ABERTOS, STATUS_NA_FILA } from '../lib/pedidoStatus';
import { hojeNoNegocio } from '../lib/formatadores';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';
import { limparNomeMesa } from '../lib/mesas';
import { emAberto, aDevolver } from '../lib/fimDoDia';
import { custoMeioAMeio, nomeDoItem, precoMeioAMeio, tamanhoQueCombina } from '../lib/meioAMeio';
import { chaveDoCombo, dividirPreco } from '../lib/combos';
import { promocaoDasMetades } from '../lib/precosDoPedido';
import { precoEmPromocao } from '../lib/promocoes';

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
// Migração 2026-11-14 (meio a meio): o segundo sabor (id, tamanho e nome copiado).
const CAMPOS_DO_MEIO_A_MEIO = ', segundo_produto_id, segundo_tamanho_id, segundo_sabor';
// Migração 2026-11-15 (combos e promoções): o combo de onde veio o item e a
// promoção que deu o preço.
const CAMPOS_DO_COMBO = ', combo_id, combo_nome, combo_grupo, combo_parte, promocao_id, promocao, preco_cheio';
// Do banco mais novo para o mais antigo, as colunas extras dos itens.
const NIVEIS_DOS_ITENS = [
  CAMPOS_DO_TAMANHO + CAMPOS_DO_MEIO_A_MEIO + CAMPOS_DO_COMBO,
  CAMPOS_DO_TAMANHO + CAMPOS_DO_MEIO_A_MEIO,
  CAMPOS_DO_TAMANHO,
  '',
];
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
let nivelDosItens = 0;

// 42703 / PGRST204: coluna que não existe, ou seja, banco ainda sem a migração.
export function colunaInexistente(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /does not exist/i.test(error?.message ?? '');
}

// itens: função que monta a parte dos itens (com ou sem as colunas do tamanho,
// do meio a meio e do combo). As migrações dos itens são as mais novas: sem
// elas, tira primeiro o combo, depois o meio a meio, depois o tamanho, e só
// então desce os níveis das colunas do pedido.
async function consultarPedidos(montar, itens) {
  for (;;) {
    const resposta = await montar(`${NIVEIS_DE_CAMPOS[nivelDoBanco]}, ${itens(NIVEIS_DOS_ITENS[nivelDosItens])}`);
    if (!colunaInexistente(resposta.error)) return resposta;
    const mensagem = resposta.error?.message ?? '';
    const ultimo = NIVEIS_DOS_ITENS.length - 1;
    // Faltou a coluna do tamanho: o banco também não tem as mais novas; pula
    // direto para sem nenhuma. Faltou a do meio a meio: sem ela nem o combo.
    if (nivelDosItens < ultimo && /\btamanho/.test(mensagem)) nivelDosItens = ultimo;
    else if (nivelDosItens < ultimo - 1 && /segundo_/.test(mensagem)) nivelDosItens = ultimo - 1;
    else if (nivelDosItens < ultimo) nivelDosItens++;
    else if (nivelDoBanco < NIVEIS_DE_CAMPOS.length - 1) nivelDoBanco++;
    else return resposta;
  }
}

// O "Faltou" da cozinha no meio a meio: os ingredientes dos dois sabores. O
// segundo sabor não tem ligação direta com o item (ver a migração 2026-11-14),
// então os ingredientes dele vêm numa consulta à parte, só quando há algum.
async function comIngredientesDoSegundoSabor(pedidos) {
  const ids = [...new Set(pedidos.flatMap((p) => (p.itens_pedido ?? []).map((i) => i.segundo_produto_id).filter(Boolean)))];
  if (!ids.length) return pedidos;
  const { data, error } = await supabase
    .from('produtos')
    .select('id, produto_ingredientes ( ingrediente_id, ingredientes ( nome ) )')
    .in('id', ids);
  // Sem a lista do segundo sabor, a cozinha ainda vê o pedido e o "Faltou" do primeiro.
  if (error) return pedidos;
  const porId = new Map(data.map((p) => [p.id, p.produto_ingredientes ?? []]));
  return pedidos.map((p) => ({
    ...p,
    itens_pedido: (p.itens_pedido ?? []).map((i) =>
      i.segundo_produto_id ? { ...i, ingredientes_do_segundo: porId.get(i.segundo_produto_id) ?? [] } : i,
    ),
  }));
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
  return nomeDoItem(produto, tamanho, null);
}

// Os dois sabores juntos, sem repetir o que está nos dois ("queijo").
function juntarIngredientes(...listas) {
  const vistos = new Map();
  for (const i of listas.flat()) if (!vistos.has(i.id)) vistos.set(i.id, i);
  return [...vistos.values()];
}

// ingredientes: [{ id, nome }] do produto (e do segundo sabor), hoje
function normalizarItem(i, nome, ingredientes = []) {
  const tamanho = i.tamanho ?? null;
  const segundoSabor = i.segundo_sabor ?? null;
  return {
    id: i.id,
    produto_id: i.produto_id,
    // tamanho_id: o tamanho escolhido (para editar); tamanho: o nome gravado
    // no pedido, que não muda se o tamanho for renomeado ou removido.
    tamanho_id: i.tamanho_id ?? null,
    tamanho,
    produto_nome: nome,
    // Meio a meio: o segundo sabor (id para editar, nome gravado no pedido).
    segundo_produto_id: i.segundo_produto_id ?? null,
    segundo_tamanho_id: i.segundo_tamanho_id ?? null,
    segundo_sabor: segundoSabor,
    nome: nomeDoItem(nome, tamanho, segundoSabor),
    // Combo: o combo (id e nome gravado), qual combo do pedido (dois "Combo
    // Casal" são dois grupos) e a posição da parte.
    combo_id: i.combo_id ?? null,
    combo_nome: i.combo_nome ?? null,
    combo_grupo: i.combo_grupo ?? null,
    combo_parte: i.combo_parte ?? null,
    // A promoção que deu o preço (nome gravado) e o preço sem ela.
    promocao_id: i.promocao_id ?? null,
    promocao: i.promocao ?? null,
    preco_cheio: numeroOuNull(i.preco_cheio),
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
        juntarIngredientes(
          ...[i.produtos?.produto_ingredientes ?? [], i.ingredientes_do_segundo ?? []].map((lista) =>
            lista.map((pi) => ({ id: pi.ingrediente_id, nome: pi.ingredientes?.nome ?? '' })),
          ),
        ),
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
              juntarIngredientes(ingredientesDo(i.produto_id), i.segundo_produto_id ? ingredientesDo(i.segundo_produto_id) : []),
            );
            return comValores ? item : { ...item, preco_unitario: null, custo_unitario: null };
          }),
      ),
    );
}

function falhaDemo(mensagem) {
  throw Object.assign(new Error(mensagem), { code: 'P0001' });
}

// Mesma chave do editar_pedido no banco: produto, tamanho e segundo sabor.
function chaveDoItem(produtoId, tamanhoId, segundoId) {
  return `${produtoId}|${tamanhoId ?? ''}|${segundoId ?? ''}`;
}

// Segundo sabor de um item novo, com as regras do gravar_itens_pedido.
function segundoSaborDemo(db, produto, tamanho, segundo) {
  if (!produto.meio_a_meio) falhaDemo(`${produto.nome} não pode ser meio a meio. Revise o pedido.`);
  if (segundo.arquivado) falhaDemo(`O sabor ${segundo.nome} saiu do cardápio. Lance o pedido de novo.`);
  if (!segundo.meio_a_meio) falhaDemo(`${segundo.nome} não pode ser meio a meio. Revise o pedido.`);
  if (!segundo.disponivel) falhaDemo(`O sabor ${segundo.nome} esgotou. Revise o pedido.`);
  const tamanhos = (db.produto_tamanhos ?? []).filter((t) => t.produto_id === segundo.id && !t.arquivado);
  const doSegundo = tamanhoQueCombina({ tamanhos }, tamanho?.nome ?? null);
  if (doSegundo === undefined) {
    falhaDemo(
      tamanho
        ? `O sabor ${segundo.nome} não tem o tamanho ${tamanho.nome}. Revise o pedido.`
        : 'Os dois sabores precisam ter o mesmo tamanho. Revise o pedido.',
    );
  }
  if (doSegundo && !doSegundo.disponivel) falhaDemo(`O sabor ${segundo.nome} esgotou no tamanho ${tamanho.nome}. Revise o pedido.`);
  const regra = db.perfil?.regra_meio_a_meio ?? null;
  if (!regra) falhaDemo('Escolha em Minha conta como cobrar o meio a meio.');
  return { regra, tamanho: doSegundo, doCadastro: doSegundo ?? segundo };
}

// Promoções do modo demonstração, no formato de listarPromocoes.
function promocoesDemo(db) {
  return (db.promocoes ?? []).map((p) => ({
    ...p,
    itens: (db.promocao_itens ?? []).filter((i) => i.promocao_id === p.id),
  }));
}

// Mesma regra de momento_da_promocao: quando o aparelho fez o pedido, até 12
// horas atrás; senão, agora.
function momentoDemo(item) {
  const agora = Date.now();
  const t = Date.parse(item.promocao_em ?? '');
  if (Number.isNaN(t) || t < agora - 12 * 3600000 || t > agora + 5 * 60000) return new Date(agora);
  return new Date(Math.min(t, agora));
}

const DO_COMBO_VAZIO = { combo_id: null, combo_nome: null, combo_grupo: null, combo_parte: null };

// Um combo do pedido, com as regras (e textos) de gravar_combo_do_pedido.
function comboDemo(db, pedidoId, item, anteriores) {
  if (!(item.quantidade >= 1 && item.quantidade <= 999)) falhaDemo('A quantidade precisa ficar entre 1 e 999.');
  const combo = (db.combos ?? []).find((c) => c.id === item.combo_id);
  if (!combo) falhaDemo('Um dos combos saiu do cardápio. Lance o pedido de novo.');
  const escolhas = item.partes.map((p) => ({ produtoId: p.produto_id, tamanhoId: p.tamanho_id ?? null, segundoId: p.segundo_produto_id ?? null }));
  const grupo = novoId();
  const base = {
    pedido_id: pedidoId,
    quantidade: item.quantidade,
    observacao: limparObservacao(item.observacao),
    faltou: false,
    faltou_ingredientes: [],
    combo_id: combo.id,
    combo_grupo: grupo,
  };
  const anterior = anteriores[chaveDoCombo(combo.id, escolhas)];
  if (anterior) {
    return anterior.linhas.map((l) => ({ ...base, ...l, id: novoId(), combo_nome: anterior.nome }));
  }
  if (combo.arquivado) falhaDemo(`O combo ${combo.nome} saiu do cardápio. Lance o pedido de novo.`);
  if (!combo.disponivel) falhaDemo(`O combo ${combo.nome} esgotou. Revise o pedido.`);
  const partes = (db.combo_partes ?? []).filter((p) => p.combo_id === combo.id).sort((a, b) => a.ordem - b.ordem);
  const mudou = () => falhaDemo(`O combo ${combo.nome} mudou no cardápio. Lance o pedido de novo.`);
  if (partes.length !== escolhas.length) mudou();
  const tamanhos = db.produto_tamanhos ?? [];
  const linhas = partes.map((parte, i) => {
    const e = escolhas[i];
    const opcoes = (db.combo_opcoes ?? []).filter((o) => o.parte_id === parte.id);
    const opcao = opcoes.find((o) => o.produto_id === e.produtoId && (o.tamanho_id ?? null) === e.tamanhoId);
    if (!opcao) mudou();
    const produto = db.produtos.find((p) => p.id === opcao.produto_id);
    if (!produto || produto.arquivado) mudou();
    if (!produto.disponivel) falhaDemo(`No combo ${combo.nome}, ${produto.nome} esgotou. Revise o pedido.`);
    const tamanho = opcao.tamanho_id ? tamanhos.find((t) => t.id === opcao.tamanho_id) : null;
    if (opcao.tamanho_id && (!tamanho || tamanho.arquivado)) mudou();
    if (tamanho && !tamanho.disponivel) falhaDemo(`No combo ${combo.nome}, ${produto.nome} ${tamanho.nome} esgotou. Revise o pedido.`);
    if (!tamanho && tamanhos.some((t) => t.produto_id === produto.id && !t.arquivado)) mudou();
    let preco = (tamanho ?? produto).preco;
    let custo = (tamanho ?? produto).custo ?? null;
    let acrescimo = opcao.acrescimo ?? 0;
    let segundo = null;
    let tamanho2 = null;
    if (e.segundoId) {
      if (e.segundoId === produto.id) falhaDemo('Escolha dois sabores diferentes para o meio a meio.');
      const opcao2 = opcoes.find((o) => {
        if (o.produto_id !== e.segundoId) return false;
        const t2 = o.tamanho_id ? tamanhos.find((t) => t.id === o.tamanho_id) : null;
        return tamanho ? t2?.nome.toLowerCase() === tamanho.nome.toLowerCase() : !o.tamanho_id;
      });
      if (!opcao2) falhaDemo(`No combo ${combo.nome}, os dois sabores precisam ser opções da mesma parte e do mesmo tamanho. Revise o pedido.`);
      segundo = db.produtos.find((p) => p.id === opcao2.produto_id);
      if (!produto.meio_a_meio) falhaDemo(`${produto.nome} não pode ser meio a meio. Revise o pedido.`);
      if (!segundo.meio_a_meio) falhaDemo(`${segundo.nome} não pode ser meio a meio. Revise o pedido.`);
      if (segundo.arquivado) falhaDemo(`O sabor ${segundo.nome} saiu do cardápio. Lance o pedido de novo.`);
      if (!segundo.disponivel) falhaDemo(`O sabor ${segundo.nome} esgotou. Revise o pedido.`);
      tamanho2 = opcao2.tamanho_id ? tamanhos.find((t) => t.id === opcao2.tamanho_id) : null;
      if (tamanho2?.arquivado) mudou();
      if (tamanho2 && !tamanho2.disponivel) falhaDemo(`O sabor ${segundo.nome} esgotou no tamanho ${tamanho2.nome}. Revise o pedido.`);
      const doSegundo = tamanho2 ?? segundo;
      custo = custoMeioAMeio(custo, doSegundo.custo ?? null);
      preco = precoMeioAMeio('media', preco, doSegundo.preco);
      acrescimo = Math.max(acrescimo, opcao2.acrescimo ?? 0);
    }
    return {
      base: preco,
      acrescimo,
      linha: {
        produto_id: produto.id,
        tamanho_id: tamanho?.id ?? null,
        tamanho: tamanho?.nome ?? null,
        segundo_produto_id: segundo?.id ?? null,
        segundo_tamanho_id: tamanho2?.id ?? null,
        segundo_sabor: segundo?.nome ?? null,
        custo_unitario: custo,
        combo_parte: i,
      },
    };
  });
  const promo = precoEmPromocao(promocoesDemo(db), { comboId: combo.id }, combo.preco, momentoDemo(item));
  const total = promo ? promo.preco : combo.preco;
  const bases = linhas.map((l) => l.base);
  const divisao = dividirPreco(total, bases);
  const cheia = promo ? dividirPreco(combo.preco, bases) : null;
  return linhas.map((l, i) => ({
    ...base,
    ...l.linha,
    id: novoId(),
    combo_nome: combo.nome,
    preco_unitario: Math.round((divisao[i] + l.acrescimo) * 100) / 100,
    promocao_id: promo?.promocao.id ?? null,
    promocao: promo?.promocao.nome ?? null,
    preco_cheio: cheia ? Math.round((cheia[i] + l.acrescimo) * 100) / 100 : null,
  }));
}

// Mesmas regras (e textos) do gravar_itens_pedido no banco.
function itensDemo(db, pedidoId, itens, anteriores = {}) {
  if (!itens.length || itens.length > 100) falhaDemo('O pedido precisa ter de 1 a 100 itens.');
  const tamanhos = db.produto_tamanhos ?? [];
  const promocoes = promocoesDemo(db);
  return itens.flatMap((i) => {
    const chave = i.combo_id
      ? chaveDoCombo(i.combo_id, (i.partes ?? []).map(p=>({produtoId:p.produto_id,tamanhoId:p.tamanho_id,segundoId:p.segundo_produto_id})))
      : chaveDoItem(i.produto_id,i.tamanho_id,i.segundo_produto_id);
    const lotes = anteriores[chave]?.lotes;
    if (lotes) {
      if (!(i.quantidade >= 1 && i.quantidade <= 999)) falhaDemo('A quantidade precisa ficar entre 1 e 999.');
      let falta = i.quantidade;
      const linhas = [];
      for (const lote of lotes) {
        const usar = Math.min(falta,lote.quantidade);
        if (usar > 0) linhas.push(...itensDemo(db,pedidoId,[{...i,quantidade:usar}],{[chave]:lote}));
        lote.quantidade -= usar;
        falta -= usar;
      }
      if (falta > 0) linhas.push(...itensDemo(db,pedidoId,[{...i,quantidade:falta}]));
      return linhas;
    }
    if (i.combo_id) return comboDemo(db, pedidoId, i, anteriores);
    if (!(i.quantidade >= 1 && i.quantidade <= 999)) falhaDemo('A quantidade precisa ficar entre 1 e 999.');
    const produto = db.produtos.find((p) => p.id === i.produto_id);
    if (!produto) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
    const tamanho = i.tamanho_id ? tamanhos.find((t) => t.id === i.tamanho_id && t.produto_id === produto.id) : null;
    if (i.tamanho_id && !tamanho) falhaDemo('Um dos tamanhos saiu do cardápio. Lance o pedido de novo.');
    const segundo = i.segundo_produto_id ? db.produtos.find((p) => p.id === i.segundo_produto_id) : null;
    if (i.segundo_produto_id && !segundo) falhaDemo('Um dos sabores saiu do cardápio. Lance o pedido de novo.');
    if (segundo && segundo.id === produto.id) falhaDemo('Escolha dois sabores diferentes para o meio a meio.');
    const anterior = anteriores[chaveDoItem(produto.id, tamanho?.id, segundo?.id)];
    if (!anterior) {
      if (!produto.disponivel || produto.arquivado) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
      if (!tamanho && tamanhos.some((t) => t.produto_id === produto.id && !t.arquivado)) {
        falhaDemo(`Escolha o tamanho de ${produto.nome}. Revise o pedido.`);
      }
      if (tamanho?.arquivado) falhaDemo(`O tamanho ${tamanho.nome} de ${produto.nome} saiu do cardápio. Lance o pedido de novo.`);
      if (tamanho && !tamanho.disponivel) falhaDemo('Um dos produtos esgotou. Revise o pedido.');
    }
    const doCadastro = tamanho ?? produto;
    const meio = segundo && !anterior ? segundoSaborDemo(db, produto, tamanho, segundo) : null;
    let preco = anterior ? anterior.preco : doCadastro.preco;
    let custo = anterior ? anterior.custo : (doCadastro.custo ?? null);
    // A promoção que deu o preço: a que já estava no item, ou a que vale agora.
    let promocao = anterior ? { id: anterior.promocao_id ?? null, nome: anterior.promocao ?? null } : null;
    let precoCheio = anterior ? (anterior.preco_cheio ?? null) : null;
    if (!anterior) {
      const momento = momentoDemo(i);
      const promo1 = precoEmPromocao(promocoes, { produtoId: produto.id, tamanhoId: tamanho?.id ?? null }, doCadastro.preco, momento);
      if (meio) {
        const promo2 = precoEmPromocao(
          promocoes,
          { produtoId: segundo.id, tamanhoId: meio.tamanho?.id ?? null },
          meio.doCadastro.preco,
          momento,
        );
        const cheio = precoMeioAMeio(meio.regra, doCadastro.preco, meio.doCadastro.preco);
        preco = precoMeioAMeio(meio.regra, promo1?.preco ?? doCadastro.preco, promo2?.preco ?? meio.doCadastro.preco);
        custo = custoMeioAMeio(doCadastro.custo ?? null, meio.doCadastro.custo ?? null);
        const usada = promocaoDasMetades(meio.regra,
          {normal:doCadastro.preco,preco:promo1?.preco ?? doCadastro.preco,promocao:promo1},
          {normal:meio.doCadastro.preco,preco:promo2?.preco ?? meio.doCadastro.preco,promocao:promo2});
        if (preco < cheio && usada) {
          precoCheio = cheio;
          promocao = usada.promocao;
        }
      } else if (promo1) {
        precoCheio = preco;
        preco = promo1.preco;
        promocao = promo1.promocao;
      }
    }
    return {
      ...DO_COMBO_VAZIO,
      promocao_id: promocao?.id ?? null,
      promocao: promocao?.nome ?? null,
      preco_cheio: precoCheio,
      id: novoId(),
      pedido_id: pedidoId,
      produto_id: produto.id,
      tamanho_id: tamanho?.id ?? null,
      tamanho: anterior ? (anterior.tamanho ?? tamanho?.nome ?? null) : (tamanho?.nome ?? null),
      segundo_produto_id: segundo?.id ?? null,
      segundo_tamanho_id: segundo ? (anterior ? (anterior.segundo_tamanho_id ?? null) : (meio.tamanho?.id ?? null)) : null,
      segundo_sabor: segundo ? (anterior ? (anterior.segundo_sabor ?? segundo.nome) : segundo.nome) : null,
      quantidade: i.quantidade,
      observacao: limparObservacao(i.observacao),
      faltou: anterior?.faltou ?? false,
      faltou_ingredientes: anterior?.faltou_ingredientes ?? [],
      preco_unitario: preco,
      custo_unitario: custo,
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

// tamanho_id, segundo_produto_id e promocao_em só vão quando existem: o banco
// sem as migrações não conhece as chaves e segue aceitando os pedidos de
// sempre. Combo: { combo_id, quantidade, observacao, partes: [{ produto_id,
// tamanho_id, segundo_produto_id }] }.
function itensParaEnvio(itens) {
  return itens.map(({ produto_id, tamanho_id, segundo_produto_id, combo_id, partes, quantidade, observacao, promocao_em }) => ({
    ...(combo_id
      ? {
          combo_id,
          partes: partes.map((p) => ({
            produto_id: p.produto_id,
            ...(p.tamanho_id ? { tamanho_id: p.tamanho_id } : {}),
            ...(p.segundo_produto_id ? { segundo_produto_id: p.segundo_produto_id } : {}),
          })),
        }
      : {
          produto_id,
          ...(tamanho_id ? { tamanho_id } : {}),
          ...(segundo_produto_id ? { segundo_produto_id } : {}),
        }),
    quantidade,
    observacao: limparObservacao(observacao),
    ...(promocao_em ? { promocao_em } : {}),
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
async function enviarComLimite(chamada) {
  const controller = new AbortController();
  const requisicao = typeof chamada.abortSignal === 'function' ? chamada.abortSignal(controller.signal) : chamada;
  let timer;
  try {
    return await Promise.race([
      requisicao,
      new Promise((_, rejeitar) => {
        timer = setTimeout(() => { rejeitar(new SemInternet()); controller.abort(); }, 15000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

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
    resposta = await enviarComLimite(supabase.rpc('criar_pedido', {
      p_itens: itensParaEnvio(itens),
      p_chave_envio: chaveEnvio,
      p_mesa: mesaDoPedido,
      p_identificacao: nomeOuMesa,
      p_forma_pagamento: formaPagamento,
      // Banco sem a migração das mesas não conhece o parâmetro: só manda
      // quando há nome (mesa extra), que só aparece com o mapa das mesas.
      ...(nomeDaMesaExtra ? { p_nome_mesa: nomeDaMesaExtra } : {}),
    }));
  } catch (e) {
    if (ehFalhaDeRede(e)) throw new SemInternet();
    throw e;
  }
  const { data, error } = resposta;
  if (error && ehFalhaDeRede(error)) throw new SemInternet();
  if (error) throw Object.assign(new Error(mensagemDoBanco(error, 'Não foi possível enviar o pedido. Tente de novo.')), { code: error.code });
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
    // Mesmas chaves do editar_pedido: os itens fora de combo por produto,
    // tamanho e segundo sabor; os combos pelo combo e pelas escolhas.
    const anteriores = {};
    const guardarAnterior = (chave, lote) => {
      (anteriores[chave] ??= { lotes: [] }).lotes.push(lote);
      anteriores[chave].lotes.sort((a,b) => (a.preco ?? a.linhas.reduce((s,l)=>s+l.preco_unitario,0)) - (b.preco ?? b.linhas.reduce((s,l)=>s+l.preco_unitario,0)));
    };
    const doPedido = db.itens_pedido.filter((item) => item.pedido_id === id);
    for (const i of doPedido.filter((item) => !item.combo_grupo)) {
      guardarAnterior(chaveDoItem(i.produto_id, i.tamanho_id, i.segundo_produto_id), {
        quantidade: i.quantidade,
        faltou: i.faltou,
        faltou_ingredientes: i.faltou_ingredientes,
        preco: i.preco_unitario,
        custo: i.custo_unitario ?? null,
        tamanho: i.tamanho ?? null,
        segundo_tamanho_id: i.segundo_tamanho_id ?? null,
        segundo_sabor: i.segundo_sabor ?? null,
        promocao_id: i.promocao_id ?? null,
        promocao: i.promocao ?? null,
        preco_cheio: i.preco_cheio ?? null,
      });
    }
    for (const grupo of new Set(doPedido.filter((i) => i.combo_grupo).map((i) => i.combo_grupo))) {
      const partes = doPedido.filter((i) => i.combo_grupo === grupo).sort((a, b) => a.combo_parte - b.combo_parte);
      const chave = chaveDoCombo(
        partes[0].combo_id,
        partes.map((p) => ({ produtoId: p.produto_id, tamanhoId: p.tamanho_id, segundoId: p.segundo_produto_id })),
      );
      guardarAnterior(chave, {
        quantidade: partes[0].quantidade,
        nome: partes[0].combo_nome,
        linhas: partes.map((p) => ({
          produto_id: p.produto_id,
          tamanho_id: p.tamanho_id ?? null,
          tamanho: p.tamanho ?? null,
          segundo_produto_id: p.segundo_produto_id ?? null,
          segundo_tamanho_id: p.segundo_tamanho_id ?? null,
          segundo_sabor: p.segundo_sabor ?? null,
          preco_unitario: p.preco_unitario,
          custo_unitario: p.custo_unitario ?? null,
          promocao_id: p.promocao_id ?? null,
          promocao: p.promocao ?? null,
          preco_cheio: p.preco_cheio ?? null,
          combo_parte: p.combo_parte,
          faltou: p.faltou,
          faltou_ingredientes: p.faltou_ingredientes,
        })),
      });
    }
    const novosItens = itensDemo(db, id, itens.map(i => ({...i, promocao_em: null})), anteriores);
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
    // Meio a meio: vale ingrediente de qualquer um dos dois sabores.
    const naLista = (db.produto_ingredientes ?? []).some(
      (pi) =>
        (pi.produto_id === item.produto_id || (item.segundo_produto_id && pi.produto_id === item.segundo_produto_id)) &&
        pi.ingrediente_id === ingredienteId,
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
  return (await comIngredientesDoSegundoSabor(data)).map(normalizarSupabase);
}

// Pendências do dia anterior: pedidos de dias antes de hoje (até 60 dias) que
// ainda não foram entregues ou recebidos. Nada é cancelado sozinho na virada
// do dia: o dono resolve cada um.
const DIAS_DE_PENDENCIAS = 60;

export async function listarPendenciasAnteriores() {
  const hoje = hojeNoNegocio();
  if (!isSupabaseConfigured) {
    return montarDemo(lerDemo(), (p) => p.dia && p.dia < hoje && (emAberto(p) || aDevolver(p)), { comValores: true });
  }

  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_DE_PENDENCIAS);
  const { data, error } = await consultarPedidos(
    (campos) =>
      supabase
        .from('pedidos')
        .select(campos)
        .lt('dia', hoje)

        // Banco sem a migração do fim do dia não tem o "não recebido".
        .or(
          campos.includes('nao_recebido_em')
            ? `and(dia.gte.${inicio.toISOString().slice(0, 10)},status.neq.cancelado,or(status.in.(${STATUS_ABERTOS.join(',')}),and(pago_em.is.null,nao_recebido_em.is.null))),and(status.eq.cancelado,pago_em.not.is.null,conta_id.is.null,or(devolucao.eq.a_devolver,devolucao.is.null))`
            : `and(dia.gte.${inicio.toISOString().slice(0, 10)},status.neq.cancelado,or(status.in.(${STATUS_ABERTOS.join(',')}),pago_em.is.null))`,
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
  const [comLista] = await comIngredientesDoSegundoSabor([data]);
  return normalizarSupabase(comLista);
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
  if (!isSupabaseConfigured) {
    aoMudarConexao?.(true);
    return assinarDemo(callback);
  }

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
        // Também na primeira conexão: um pedido feito entre a carga da tela e
        // a conexão do canal não gera evento.
        callback();
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        aoMudarConexao?.(false);
      }
    });
  return () => supabase.removeChannel(canal);
}
