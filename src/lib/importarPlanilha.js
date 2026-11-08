import { lerValor, valorParaCampo } from './formatadores';
import { ErroDePlanilha } from './lerPlanilha';

// Transforma as linhas da planilha em produtos para conferir. Nada é salvo
// aqui: a tela mostra tudo e o dono decide.

export const LIMITE_DE_PRODUTOS = 300;
export const PRECO_MAXIMO = 99999.99;
const LIMITE_DO_NOME = 120;

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Mesmo critério de "já existe" do cardápio pronto: sem ligar para acento,
// maiúscula e espaço sobrando.
export const chaveDoNome = normalizar;

const CABECALHO = {
  nome: /^(produto|produtos|nome|item|itens|descricao|sabor|lanche|prato|cardapio)\b/,
  preco: /^(preco|precos|valor|venda|r\$)/,
  custo: /^custo/,
  cozinha: /cozinha/,
};

const SIM = new Set(['sim', 's', 'x', 'yes', 'y', '1', 'true', 'verdadeiro', 'vai']);
const NAO = new Set(['nao', 'n', '0', 'no', 'false', 'falso', 'nao vai']);

// Bebida e o que já sai pronto não vão para a cozinha. Só um palpite quando a
// planilha não diz: a tela mostra a caixinha para o dono conferir.
const BEBIDA =
  /\b(refrigerante|refri|cerveja|agua|coca|guarana|fanta|sprite|pepsi|soda|tonica|lata|latinha|long ?neck|garrafa|\d+ ?ml|\d+ ?l|litros?|energetico|red ?bull|monster|skol|brahma|heineken|itaipava|antarctica|budweiser|stella|amstel|devassa|caixinha|h2oh|del valle|chopp?|dose|cachaca|whisky|vodka)\b/;

export function pareceBebida(nome) {
  return BEBIDA.test(normalizar(nome));
}

function lerSimNao(valor) {
  if (typeof valor === 'boolean') return valor;
  const t = normalizar(valor).replace(/[.!]/g, '');
  if (SIM.has(t)) return true;
  if (NAO.has(t)) return false;
  return null;
}

function lerNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : lerValor(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

const textoDe = (valor) => (valor === null || valor === undefined ? '' : String(valor).replace(/\s+/g, ' ').trim());

// Procura nas 10 primeiras linhas a que tem o título da coluna de preço.
function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    // "R$ 9,00" é preço, não título de coluna.
    const celulas = linhas[i].map((c) => (typeof c === 'string' && !pareceValor(c) ? normalizar(c) : ''));
    const preco = celulas.findIndex((c) => CABECALHO.preco.test(c));
    if (preco < 0) continue;
    let nome = celulas.findIndex((c) => CABECALHO.nome.test(c));
    if (nome < 0) nome = celulas.findIndex((c, j) => j !== preco && c !== '');
    if (nome < 0) continue;
    const custo = celulas.findIndex((c) => CABECALHO.custo.test(c));
    const cozinha = celulas.findIndex((c) => CABECALHO.cozinha.test(c));
    return { linha: i, nome, preco, custo: custo < 0 ? null : custo, cozinha: cozinha < 0 ? null : cozinha };
  }
  return null;
}

// Valor de dinheiro: número da planilha ou texto como "12,50" e "R$ 9".
const pareceValor = (c) => typeof c === 'number' || (typeof c === 'string' && /^\s*(r\$)?\s*[\d.,]+\s*$/i.test(c));

// Sem cabeçalho: o nome é o primeiro texto com letra da linha ("Refri 2L"
// também) e o preço, o primeiro valor depois dele.
function colunasSemCabecalho(linha) {
  const nome = linha.findIndex((c) => typeof c === 'string' && /\p{L}/u.test(c) && !pareceValor(c));
  if (nome < 0) return { nome: linha.findIndex((c) => c !== null), preco: null };
  const preco = linha.findIndex((c, j) => j > nome && pareceValor(c));
  return { nome, preco: preco < 0 ? null : preco };
}

export function interpretarPlanilha(linhas) {
  const cabecalho = acharCabecalho(linhas);
  const inicio = cabecalho ? cabecalho.linha + 1 : 0;
  const itens = [];

  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    if (!linha.some((c) => c !== null && c !== '')) continue;
    const col = cabecalho ?? colunasSemCabecalho(linha);
    const nome = textoDe(linha[col.nome]);
    const brutoPreco = col.preco === null ? null : linha[col.preco];
    // Cabeçalho repetido no meio da lista (planilha colada duas vezes).
    if (cabecalho && CABECALHO.preco.test(normalizar(brutoPreco)) && CABECALHO.nome.test(normalizar(nome))) continue;
    if (!nome && (brutoPreco === null || brutoPreco === '')) continue;

    const preco = lerNumero(brutoPreco);
    const brutoCusto = cabecalho?.custo === null || !cabecalho ? null : linha[cabecalho.custo];
    const custo = lerNumero(brutoCusto);
    const cozinhaDaPlanilha = cabecalho?.cozinha === null || !cabecalho ? null : lerSimNao(linha[cabecalho.cozinha]);

    itens.push({
      linha: i + 1,
      nome: nome.slice(0, LIMITE_DO_NOME),
      preco: preco === null ? '' : Number.isFinite(preco) && preco > 0 ? valorParaCampo(preco) : textoDe(brutoPreco),
      custo: custo === null ? '' : Number.isFinite(custo) && custo >= 0 ? valorParaCampo(custo) : textoDe(brutoCusto),
      vaiParaCozinha: cozinhaDaPlanilha ?? !pareceBebida(nome),
      cozinhaAdivinhada: cozinhaDaPlanilha === null,
      nomeLongo: nome.length > LIMITE_DO_NOME,
    });
  }

  if (itens.length === 0) {
    throw new ErroDePlanilha(
      'Não achei produtos nessa planilha. Confira se a primeira aba tem o nome do produto numa coluna e o preço na coluna do lado.',
    );
  }
  if (itens.length > LIMITE_DE_PRODUTOS) {
    throw new ErroDePlanilha(
      `Essa planilha tem ${itens.length} linhas com produto. O limite é ${LIMITE_DE_PRODUTOS} de uma vez: divida em duas planilhas.`,
    );
  }
  return { itens, temCusto: Boolean(cabecalho && cabecalho.custo !== null) };
}

const mesmoItem = (a, b) => a.preco === b.preco && a.custo === b.custo && a.vaiParaCozinha === b.vaiParaCozinha;

// Junta as linhas pelo nome: o que aparece mais de uma vez (com valores
// diferentes) e o que já está no cardápio viram uma escolha do dono.
// Linhas repetidas idênticas entram uma vez só.
export function montarRevisao(itens, produtos) {
  const existentes = new Map(produtos.map((p) => [chaveDoNome(p.nome), p]));
  const grupos = new Map();
  for (let item of itens) {
    const chave = chaveDoNome(item.nome);
    // Sem nome não dá para agrupar: cada linha fica sozinha.
    const id = chave || `sem-nome-${item.linha}`;
    const grupo = grupos.get(id);
    const existente = chave ? (existentes.get(chave) ?? null) : null;
    // A planilha não disse se vai para a cozinha: vale o que já está no cardápio.
    if (existente && item.cozinhaAdivinhada) item = { ...item, vaiParaCozinha: existente.vai_para_cozinha !== false };
    if (!grupo) {
      grupos.set(id, { id, ocorrencias: [item], repetidasIguais: [], existente });
    } else if (grupo.ocorrencias.some((o) => mesmoItem(o, item))) {
      grupo.repetidasIguais.push(item.linha);
    } else {
      grupo.ocorrencias.push(item);
    }
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    // Escolha inicial: linha única nova entra; o que já está no cardápio fica
    // como está; repetida com valores diferentes espera o dono escolher.
    escolha: g.existente ? 'manter' : g.ocorrencias.length > 1 ? null : 0,
  }));
}

// Precisa de atenção: o dono tem que olhar antes de salvar.
export function precisaDeAtencao(grupo) {
  if (grupo.existente || grupo.ocorrencias.length > 1) return true;
  const [item] = grupo.ocorrencias;
  const preco = lerValor(item.preco);
  return !item.nome || item.nomeLongo || !(preco > 0 && preco <= PRECO_MAXIMO) || (item.custo !== '' && !(lerValor(item.custo) >= 0));
}

// Erros de uma linha escolhida, com as mesmas regras do formulário de produto.
export function errosDoItem(item, { exigirNome = true } = {}) {
  const erros = {};
  const preco = lerValor(item.preco);
  if (exigirNome && !item.nome.trim()) erros.nome = 'Digite o nome do produto.';
  if (!Number.isFinite(preco) || preco <= 0) erros.preco = 'Digite um preço maior que zero, como 12,50.';
  else if (preco > PRECO_MAXIMO) erros.preco = 'Esse preço está alto demais. Confira.';
  if (item.custo.trim() !== '') {
    const custo = lerValor(item.custo);
    if (!Number.isFinite(custo) || custo < 0 || custo > PRECO_MAXIMO) erros.custo = 'Digite um valor como 6,00 ou deixe em branco.';
  }
  return erros;
}

// O que salvar, a partir das escolhas: produtos novos e os que já existiam e
// o dono mandou atualizar.
export function oQueSalvar(grupos) {
  const novos = [];
  const atualizar = [];
  for (const g of grupos) {
    if (typeof g.escolha !== 'number') continue;
    const item = g.ocorrencias[g.escolha];
    const custo = item.custo.trim() === '' ? null : Math.round(lerValor(item.custo) * 100) / 100;
    const dados = {
      preco: Math.round(lerValor(item.preco) * 100) / 100,
      vai_para_cozinha: item.vaiParaCozinha,
    };
    if (g.existente) {
      // Custo em branco na planilha não apaga o custo que já estava lá.
      atualizar.push({ grupo: g.id, id: g.existente.id, alteracoes: custo === null ? dados : { ...dados, custo } });
    } else {
      novos.push({ grupo: g.id, nome: item.nome.trim().replace(/\s+/g, ' '), ...dados, custo });
    }
  }
  return { novos, atualizar };
}
