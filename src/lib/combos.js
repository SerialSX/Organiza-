// Combos: preço fixo, partes fixas e partes à escolha (com acréscimo). Mesmas
// regras e textos de salvar_combo e gravar_combo_do_pedido no banco.
import { formatarMoeda } from './formatadores';
import { nomeDoItem } from './meioAMeio';

export const MINIMO_DE_PARTES = 2;
export const MAXIMO_DE_PARTES = 12;
export const MAXIMO_DE_OPCOES = 20;
export const LIMITE_NOME_COMBO = 80;
export const LIMITE_NOME_PARTE = 40;
export const PRECO_MINIMO_DO_COMBO = 1;
const PRECO_MAXIMO = 99999.99;
const ACRESCIMO_MAXIMO = 9999.99;

const centavos = (valor) => Math.round(Number(valor) * 100);

// Divide o preço do combo entre as partes pelo preço normal de cada uma, como
// dividir_preco no banco: em centavos, meio centavo para cima, e o que sobra
// do arredondamento fica na parte mais cara (a primeira, se empatar).
export function dividirPreco(total, bases) {
  const t = centavos(total);
  const b = bases.map(centavos);
  const soma = b.reduce((s, x) => s + x, 0);
  const n = b.length;
  // floor((2·t·b + s) / 2s) = t·b/s arredondado com meio para cima (inteiros).
  const partes = b.map((x) => (soma === 0 ? Math.floor((2 * t + n) / (2 * n)) : Math.floor((2 * t * x + soma) / (2 * soma))));
  let maior = 0;
  b.forEach((x, i) => {
    if (x > b[maior]) maior = i;
  });
  partes[maior] += t - partes.reduce((s, x) => s + x, 0);
  return partes.map((c) => c / 100);
}

// Produtos de hoje por id: { [id]: produto com tamanhos }.
function tamanhoDe(produto, tamanhoId) {
  return produto?.tamanhos?.find((t) => t.id === tamanhoId) ?? null;
}

// A opção ainda está no cardápio do jeito que o combo diz (produto e tamanho).
export function opcaoNoCardapio(opcao, porId) {
  const produto = porId[opcao.produto_id];
  if (!produto) return false;
  if (opcao.tamanho_id) return Boolean(tamanhoDe(produto, opcao.tamanho_id));
  return !produto.tamanhos?.length;
}

export function opcaoDisponivel(opcao, porId) {
  if (!opcaoNoCardapio(opcao, porId)) return false;
  const produto = porId[opcao.produto_id];
  if (!produto.disponivel) return false;
  return opcao.tamanho_id ? tamanhoDe(produto, opcao.tamanho_id).disponivel : true;
}

// "Pizza Calabresa (G)"; produto que saiu do cardápio: o nome que dá.
export function nomeDaOpcao(opcao, porId) {
  const produto = porId[opcao.produto_id];
  if (!produto) return 'Produto excluído';
  return nomeDoItem(produto.nome, tamanhoDe(produto, opcao.tamanho_id)?.nome ?? null, null);
}

// Preço normal da opção (do tamanho, quando tem).
export function precoDaOpcao(opcao, porId) {
  const produto = porId[opcao.produto_id];
  return (opcao.tamanho_id ? tamanhoDe(produto, opcao.tamanho_id)?.preco : produto?.preco) ?? 0;
}

export function ehFixa(parte) {
  return parte.opcoes.length === 1;
}

// "Bebida"; sem nome, "Escolha 1".
export function nomeDaParte(parte, indice) {
  return parte.nome || (ehFixa(parte) ? `Parte ${indice + 1}` : 'Escolha 1');
}

// O combo sai? Parte fixa esgotada: o combo inteiro esgota. Parte à escolha:
// só esgota quando todas as opções esgotaram. Opção que saiu do cardápio (ou
// mudou de tamanhos): o combo precisa ser revisto e não sai.
// { sai, mudou, esgotado: { produto, tamanho } do primeiro que impede }
export function situacaoDoCombo(combo, porId) {
  if (combo.partes.some((parte) => !parte.opcoes.some((o) => opcaoNoCardapio(o, porId)))) {
    return { sai: false, mudou: true, esgotado: null };
  }
  if (!combo.disponivel) return { sai: false, mudou: false, esgotado: null };
  for (const parte of combo.partes) {
    if (parte.opcoes.some((o) => opcaoDisponivel(o, porId))) continue;
    const opcao = parte.opcoes.find((o) => opcaoNoCardapio(o, porId));
    const produto = porId[opcao.produto_id];
    return { sai: false, mudou: false, esgotado: { produto, tamanho: tamanhoDe(produto, opcao.tamanho_id) } };
  }
  return { sai: true, mudou: false, esgotado: null };
}

// O que vem no combo, para o cartão: "X-Burguer, Batata, Coca ou Suco";
// parte com nome: "Bebida à escolha".
export function resumoDoCombo(combo, porId) {
  return combo.partes
    .map((parte) => {
      const opcoes = parte.opcoes.filter((o) => opcaoNoCardapio(o, porId));
      if (ehFixa(parte)) return nomeDaOpcao(parte.opcoes[0], porId);
      if (parte.nome) return `${parte.nome} à escolha`;
      const nomes = opcoes.map((o) => nomeDaOpcao(o, porId));
      return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} ou outra` : nomes.join(' ou ');
    })
    .join(', ');
}

// A escolha de uma opção, no formato das linhas do pedido.
export function escolhaDaOpcao(opcao, segunda = null) {
  return { produtoId: opcao.produto_id, tamanhoId: opcao.tamanho_id ?? null, segundoId: segunda?.produto_id ?? null };
}

// Tudo que pode entrar num combo ou numa promoção: cada produto sem tamanhos
// e cada tamanho dos que têm. valor: "produto|tamanho" (para o <select>).
export function opcoesDoCardapio(produtos) {
  return produtos.flatMap((p) =>
    p.tamanhos?.length
      ? p.tamanhos.map((t) => ({
          valor: `${p.id}|${t.id}`,
          produto_id: p.id,
          tamanho_id: t.id,
          rotulo: nomeDoItem(p.nome, t.nome, null),
          preco: t.preco,
        }))
      : [{ valor: `${p.id}|`, produto_id: p.id, tamanho_id: null, rotulo: p.nome, preco: p.preco }],
  );
}

// Soma das partes pelo preço normal: o "quanto o cliente economiza".
export function somaDasPartes(combo, porId) {
  return combo.partes.reduce((s, parte) => {
    const precos = parte.opcoes.filter((o) => opcaoNoCardapio(o, porId)).map((o) => precoDaOpcao(o, porId));
    return s + (precos.length ? Math.min(...precos) : 0);
  }, 0);
}

// escolhas: [{ produtoId, tamanhoId, segundoId }] na ordem das partes. A mesma
// chave do banco (gravar_combo_do_pedido e editar_pedido).
export function chaveDoCombo(comboId, escolhas) {
  return `c|${comboId}|${escolhas.map((e) => `${e.produtoId}|${e.tamanhoId ?? ''}|${e.segundoId ?? ''}`).join(';')}`;
}

// A opção escolhida em cada parte (e a da outra metade, no meio a meio: a
// opção daquele sabor que combina com a primeira, como no banco).
export function opcoesEscolhidas(combo, escolhas, porId = {}) {
  return combo.partes.map((parte, i) => {
    const e = escolhas[i];
    if (!e) return null;
    const opcao = parte.opcoes.find((o) => o.produto_id === e.produtoId && (o.tamanho_id ?? null) === (e.tamanhoId ?? null));
    if (!opcao) return null;
    const doSabor = e.segundoId ? parte.opcoes.filter((o) => o.produto_id === e.segundoId) : [];
    const segunda = doSabor.find((o) => metadesCombinam(opcao, o, porId)) ?? doSabor[0] ?? null;
    return { opcao, segunda };
  });
}

// Quanto o combo sai com estas escolhas: o preço (o da promoção, se tiver)
// mais o acréscimo de cada opção escolhida (no meio a meio, o maior dos dois).
export function precoDoCombo(precoBase, combo, escolhas, porId = {}) {
  const acrescimos = opcoesEscolhidas(combo, escolhas, porId).reduce(
    (s, e) => s + (e ? centavos(Math.max(e.opcao.acrescimo ?? 0, e.segunda?.acrescimo ?? 0)) : 0),
    0,
  );
  return (centavos(precoBase) + acrescimos) / 100;
}

// "X-Burguer, X-Burguer, Batata, Suco" (com tamanho e meio a meio).
export function textoDasEscolhas(combo, escolhas, porId) {
  return opcoesEscolhidas(combo, escolhas, porId)
    .map((e, i) => {
      if (!e) return null;
      const nome = nomeDaOpcao(e.opcao, porId);
      if (!e.segunda) return nome;
      const tamanho = tamanhoDe(porId[e.opcao.produto_id], e.opcao.tamanho_id)?.nome ?? null;
      return nomeDoItem(porId[e.opcao.produto_id]?.nome ?? nome, tamanho, porId[escolhas[i].segundoId]?.nome ?? '');
    })
    .filter(Boolean)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Itens do pedido
// ---------------------------------------------------------------------------

// Junta as partes de cada combo do pedido (mesmo combo_grupo), na ordem em que
// aparecem: [{ combo: false, item } | { combo: true, grupo, nome, quantidade,
// itens, preco_unitario, observacao }].
export function agruparItens(itens) {
  const linhas = [];
  const grupos = new Map();
  for (const item of itens ?? []) {
    if (!item.combo_grupo) {
      linhas.push({ combo: false, item });
      continue;
    }
    let grupo = grupos.get(item.combo_grupo);
    if (!grupo) {
      grupo = {
        combo: true,
        grupo: item.combo_grupo,
        combo_id: item.combo_id,
        nome: item.combo_nome,
        quantidade: item.quantidade,
        observacao: item.observacao ?? null,
        itens: [],
        preco_unitario: 0,
      };
      grupos.set(item.combo_grupo, grupo);
      linhas.push(grupo);
    }
    grupo.itens.push(item);
    grupo.preco_unitario = (centavos(grupo.preco_unitario) + centavos(item.preco_unitario ?? 0)) / 100;
  }
  for (const g of grupos.values()) g.itens.sort((a, b) => (a.combo_parte ?? 0) - (b.combo_parte ?? 0));
  return linhas;
}

// "2× Combo Casal (X-Burguer, X-Burguer, Batata, Coca), 1× Batata": a conta,
// o caixa e os resumos.
export function resumoDosItens(itens, comObservacao = false) {
  return agruparItens(itens)
    .map((l) => {
      const obs = comObservacao && (l.combo ? l.observacao : l.item.observacao);
      const texto = l.combo
        ? `${l.quantidade}× ${l.nome} (${l.itens.map((i) => i.nome).join(', ')})`
        : `${l.item.quantidade}× ${l.item.nome}`;
      return obs ? `${texto} (${obs})` : texto;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

// As mesmas conferências de salvar_combo, antes de mandar. partes:
// [{ nome, opcoes: [{ produto_id, tamanho_id, acrescimo, rotulo }] }].
export function conferirCombo({ nome, preco, partes }) {
  const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) throw new Error('Digite o nome do combo.');
  if (limpo.length > LIMITE_NOME_COMBO) throw new Error('O nome do combo pode ter no máximo 80 letras.');
  if (!(preco >= PRECO_MINIMO_DO_COMBO)) throw new Error('O preço do combo precisa ser de pelo menos R$ 1,00.');
  if (preco > PRECO_MAXIMO) throw new Error('O preço do combo pode ser de até R$ 99.999,99.');
  if (partes.length < MINIMO_DE_PARTES || partes.length > MAXIMO_DE_PARTES) throw new Error('O combo precisa ter de 2 a 12 partes.');
  for (const parte of partes) {
    if (!parte.opcoes.length || parte.opcoes.length > MAXIMO_DE_OPCOES) throw new Error('Cada parte do combo precisa ter de 1 a 20 opções.');
    if ((parte.nome ?? '').trim().length > LIMITE_NOME_PARTE) throw new Error('O nome de cada parte pode ter no máximo 40 letras.');
    const vistos = new Set();
    for (const o of parte.opcoes) {
      const acrescimo = o.acrescimo ?? 0;
      if (!(acrescimo >= 0 && acrescimo <= ACRESCIMO_MAXIMO)) throw new Error('O acréscimo precisa ficar entre R$ 0,00 e R$ 9.999,99.');
      if (acrescimo > 0 && parte.opcoes.length === 1) throw new Error('Só as opções à escolha podem ter acréscimo.');
      const chave = `${o.produto_id}|${o.tamanho_id ?? ''}`;
      if (vistos.has(chave)) throw new Error(`${o.rotulo ?? 'Um produto'} aparece duas vezes na mesma parte do combo.`);
      vistos.add(chave);
    }
  }
  return limpo;
}

// "Economia de R$ 8,00" (vazio quando o combo não sai mais barato).
export function textoDaEconomia(preco, soma) {
  const diferenca = (centavos(soma) - centavos(preco)) / 100;
  return diferenca > 0 ? `O cliente economiza ${formatarMoeda(diferenca)}` : '';
}

// ---------------------------------------------------------------------------
// Meio a meio dentro do combo
// ---------------------------------------------------------------------------

// Nome do tamanho da opção, para combinar G com G ("" sem tamanho).
function tamanhoDaOpcao(opcao, porId) {
  return (tamanhoDe(porId[opcao.produto_id], opcao.tamanho_id)?.nome ?? '').toLowerCase();
}

// A outra metade combina com a primeira: outro sabor da mesma parte, os dois
// marcados como meio a meio, com o tamanho de mesmo nome.
export function metadesCombinam(primeira, outra, porId) {
  return (
    primeira.produto_id !== outra.produto_id &&
    Boolean(porId[primeira.produto_id]?.meio_a_meio) &&
    Boolean(porId[outra.produto_id]?.meio_a_meio) &&
    tamanhoDaOpcao(primeira, porId) === tamanhoDaOpcao(outra, porId)
  );
}

// A parte aceita meio a meio: tem dois sabores que combinam entre si.
export function parteAceitaMeioAMeio(parte, porId) {
  const opcoes = parte.opcoes.filter((o) => opcaoNoCardapio(o, porId));
  return opcoes.some((a) => opcoes.some((b) => metadesCombinam(a, b, porId)));
}
