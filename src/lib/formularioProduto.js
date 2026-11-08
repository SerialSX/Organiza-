// Regras do formulário de produto (com e sem tamanhos). Os valores chegam
// como o texto dos campos ("12,50") e saem prontos para os serviços.
import { estimarCusto } from './custos';
import { lerValor } from './formatadores';
import { LIMITE_NOME_TAMANHO, MAXIMO_DE_TAMANHOS, MINIMO_DE_TAMANHOS, limparNomeTamanho } from './tamanhos';

const LIMITE_INGREDIENTES = 30;
const PRECO_MAXIMO = 99999.99;

export const FORM_VAZIO = { nome: '', preco: '', custo: '', lista: [], vaiParaCozinha: true, comTamanhos: false, tamanhos: [] };

let contador = 0;
// Chave da linha de um tamanho no formulário (o novo ainda não tem id do banco).
export function novaChave() {
  contador += 1;
  return `novo-${contador}`;
}

export function tamanhoVazio() {
  return { chave: novaChave(), nome: '', preco: '', custo: '', disponivel: true };
}

const arredondar = (v) => Math.round(v * 100) / 100;
const quantidadeValida = (q) => q > 0 && q <= 100000;

export function custoDigitado(texto) {
  return texto.trim() === '' ? null : lerValor(texto);
}

// Sem tamanhos: [{ ingrediente_id, quantidade }].
export function listaNumerica(lista) {
  return lista.map((l) => ({ ingrediente_id: l.ingrediente_id, quantidade: lerValor(l.quantidade) }));
}

// Quanto vai de cada ingrediente num tamanho (só o que foi preenchido).
function linhasDoTamanho(lista, chave) {
  return lista
    .map((l) => ({ ingrediente_id: l.ingrediente_id, quantidade: lerValor(l.por?.[chave] ?? '') }))
    .filter((l) => l.quantidade > 0);
}

// Custo de cada tamanho pelos ingredientes: { [chave]: valor ou null (nenhum ingrediente com preço nele) }.
export function custosDosTamanhos(form, porId) {
  return Object.fromEntries(form.tamanhos.map((t) => [t.chave, estimarCusto(linhasDoTamanho(form.lista, t.chave), porId).total]));
}

function validarTamanhos(form, estimados, erros) {
  const tamanhos = [];
  const vistos = new Set();
  if (form.tamanhos.length < MINIMO_DE_TAMANHOS) erros.tamanhos = 'Cadastre pelo menos 2 tamanhos, ou desmarque "Tem tamanhos?".';
  if (form.tamanhos.length > MAXIMO_DE_TAMANHOS) erros.tamanhos = `Um produto pode ter até ${MAXIMO_DE_TAMANHOS} tamanhos.`;
  for (const t of form.tamanhos) {
    const nome = limparNomeTamanho(t.nome);
    const preco = lerValor(t.preco);
    const custo = estimados[t.chave] ?? custoDigitado(t.custo);
    if (!nome) erros[`tamanho-nome-${t.chave}`] = 'Digite o nome do tamanho, como P ou 500 ml.';
    else if (nome.length > LIMITE_NOME_TAMANHO) erros[`tamanho-nome-${t.chave}`] = `Use até ${LIMITE_NOME_TAMANHO} letras no nome do tamanho.`;
    else if (vistos.has(nome.toLowerCase())) erros[`tamanho-nome-${t.chave}`] = 'Já tem um tamanho com esse nome.';
    vistos.add(nome.toLowerCase());
    if (!(preco > 0 && preco <= PRECO_MAXIMO)) erros[`tamanho-preco-${t.chave}`] = 'Digite o preço do tamanho, como 45,00.';
    if (custo !== null && !(custo >= 0 && custo <= PRECO_MAXIMO)) {
      erros[`tamanho-custo-${t.chave}`] = 'Digite o custo como 12,00 ou deixe em branco.';
    }
    tamanhos.push({
      chave: t.chave,
      id: t.id ?? null,
      nome,
      preco: arredondar(preco),
      custo: custo === null ? null : arredondar(custo),
      disponivel: t.disponivel ?? true,
    });
  }
  return tamanhos;
}

// porId: ingredientes por id (para o custo estimado).
// Devolve { erros } ou { dados: { nome, vai_para_cozinha, preco, custo, tamanhos, lista } }:
// sem tamanhos, tamanhos é null e lista é [{ ingrediente_id, quantidade }];
// com tamanhos, lista é [{ ingrediente_id, porChave: { [chave]: quantidade } }]
// e preco/custo são os do primeiro tamanho.
export function validarProduto(form, porId) {
  const erros = {};
  const nome = form.nome.trim();
  if (!nome) erros.nome = 'Digite o nome do produto.';
  if (form.lista.length > LIMITE_INGREDIENTES) erros.lista = `Um produto pode ter até ${LIMITE_INGREDIENTES} ingredientes.`;
  const base = { nome, vai_para_cozinha: form.vaiParaCozinha !== false };

  if (form.comTamanhos) {
    const tamanhos = validarTamanhos(form, custosDosTamanhos(form, porId), erros);
    const lista = form.lista.map((l) => {
      const porChave = {};
      for (const t of form.tamanhos) {
        const texto = (l.por?.[t.chave] ?? '').trim();
        if (texto !== '') porChave[t.chave] = lerValor(texto);
      }
      return { ingrediente_id: l.ingrediente_id, porChave };
    });
    if (lista.some((l) => Object.values(l.porChave).some((q) => !quantidadeValida(q)))) {
      erros.lista ??= 'Diga quanto vai de cada ingrediente, como 120 (g) ou 1 (un).';
    } else if (lista.some((l) => !Object.keys(l.porChave).length)) {
      erros.lista ??= 'Cada ingrediente precisa da quantidade em pelo menos um tamanho. Deixe em branco só onde ele não vai.';
    }
    if (Object.keys(erros).length) return { erros };
    const [primeiro] = tamanhos;
    return { dados: { ...base, preco: primeiro.preco, custo: primeiro.custo, tamanhos, lista } };
  }

  const preco = lerValor(form.preco);
  const lista = listaNumerica(form.lista);
  const { total: estimado } = estimarCusto(lista.filter((l) => l.quantidade > 0), porId);
  const custo = estimado ?? custoDigitado(form.custo);
  if (!Number.isFinite(preco) || preco <= 0) erros.preco = 'Digite um preço maior que zero, como 12,50.';
  if (custo !== null && (!Number.isFinite(custo) || custo < 0)) erros.custo = 'Digite um valor como 6,00 ou deixe em branco.';
  if (lista.some((l) => !quantidadeValida(l.quantidade))) {
    erros.lista ??= 'Diga quanto vai de cada ingrediente, como 120 (g) ou 1 (un).';
  }
  if (Object.keys(erros).length) return { erros };
  return { dados: { ...base, preco: arredondar(preco), custo: custo === null ? null : arredondar(custo), tamanhos: null, lista } };
}

// Liga os tamanhos: começa com 2 linhas vazias, e a quantidade de cada
// ingrediente que já estava vale para todos os tamanhos (dá para ajustar).
export function comTamanhosLigados(form) {
  const tamanhos = form.tamanhos.length ? form.tamanhos : [tamanhoVazio(), tamanhoVazio()];
  const lista = form.lista.map((l) => ({
    ...l,
    por: l.por ?? Object.fromEntries(tamanhos.map((t) => [t.chave, l.quantidade ?? ''])),
  }));
  return { ...form, comTamanhos: true, tamanhos, lista };
}

// Desliga os tamanhos. pedirPreco: o produto já tinha tamanhos salvos, então
// o preço único é pedido de novo (não dá para adivinhar qual tamanho vale).
// Cada ingrediente fica com a quantidade do primeiro tamanho preenchido.
export function comTamanhosDesligados(form, pedirPreco) {
  return {
    ...form,
    comTamanhos: false,
    preco: pedirPreco ? '' : form.preco,
    custo: pedirPreco ? '' : form.custo,
    lista: form.lista.map((l) => {
      const primeira = form.tamanhos.map((t) => l.por?.[t.chave]).find((q) => q && q.trim() !== '');
      return { ingrediente_id: l.ingrediente_id, quantidade: primeira || l.quantidade || '' };
    }),
    tamanhos: [],
  };
}

// Preenche os nomes ("P · M · G"); o preço já digitado em cada linha fica.
export function preencherNomes(tamanhos, nomes) {
  const linhas = nomes.map((nome, i) => ({ ...(tamanhos[i] ?? tamanhoVazio()), nome }));
  return [...linhas, ...tamanhos.slice(nomes.length)];
}
