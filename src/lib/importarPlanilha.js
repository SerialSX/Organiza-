import { formatarMoeda, lerValor, valorParaCampo } from './formatadores';
import { ErroDePlanilha } from './lerPlanilha';
import { LIMITE_NOME_TAMANHO, MAXIMO_DE_TAMANHOS, MINIMO_DE_TAMANHOS, limparNomeTamanho } from './tamanhos';

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
  tamanho: /^tamanho/,
  meio: /meio/,
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
    const tamanho = celulas.findIndex((c, j) => j !== nome && CABECALHO.tamanho.test(c));
    const meio = celulas.findIndex((c, j) => j !== nome && CABECALHO.meio.test(c));
    return {
      linha: i,
      nome,
      preco,
      custo: custo < 0 ? null : custo,
      cozinha: cozinha < 0 ? null : cozinha,
      tamanho: tamanho < 0 ? null : tamanho,
      meio: meio < 0 ? null : meio,
    };
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

function semTamanhoDaLinha(item) {
  const copia = { ...item };
  delete copia.tamanho;
  return copia;
}

let chaveDeTamanho = 0;
function tamanhoDaLinha(item) {
  chaveDeTamanho += 1;
  return { chave: `t${chaveDeTamanho}`, linha: item.linha, nome: item.tamanho, preco: item.preco, custo: item.custo };
}

const mesmoTamanho = (a, b) => chaveDoNome(a.nome) === chaveDoNome(b.nome) && a.preco === b.preco && a.custo === b.custo;

// Coluna "Tamanho": as linhas com o mesmo nome viram um produto só, com um
// tamanho por linha (linha do mesmo nome sem tamanho entra com o tamanho em
// branco, para o dono preencher). Um tamanho só não é tamanho: vira produto
// de preço único com o tamanho no nome ("Açaí 500 ml").
// comTamanhos false (banco sem a migração dos tamanhos): todo tamanho vai
// para o nome, como antes.
function juntarTamanhos(itens, comTamanhos) {
  const comTamanho = new Set(itens.filter((i) => i.tamanho && chaveDoNome(i.nome)).map((i) => chaveDoNome(i.nome)));
  const noNome = (i) => ({ ...i, nome: `${i.nome} ${i.tamanho}`.slice(0, LIMITE_DO_NOME) });
  if (!comTamanhos || !comTamanho.size) return itens.map((i) => (i.tamanho ? noNome(i) : i));

  const juntos = new Map();
  const saida = [];
  for (const item of itens) {
    const chave = chaveDoNome(item.nome);
    if (!comTamanho.has(chave)) {
      saida.push(item);
      continue;
    }
    let produto = juntos.get(chave);
    if (!produto) {
      produto = { ...item, preco: '', custo: '', tamanhos: [], repetidas: [], linhas: [] };
      delete produto.tamanho;
      juntos.set(chave, produto);
      saida.push(produto);
    }
    produto.linhas.push(item);
    const tamanho = tamanhoDaLinha(item);
    // A mesma linha colada duas vezes entra uma vez só.
    if (produto.tamanhos.some((t) => mesmoTamanho(t, tamanho))) produto.repetidas.push(item.linha);
    else produto.tamanhos.push(tamanho);
  }
  return saida.map((p) => {
    if (!p.tamanhos) return p;
    const { linhas, ...juntado } = p;
    // Meio a meio: basta uma linha do produto dizer "Sim".
    const meios = linhas.map((l) => l.meioAMeio);
    const produto =
      juntado.meioAMeio === undefined
        ? juntado
        : { ...juntado, meioAMeio: meios.includes(true) ? true : meios.includes(false) ? false : null };
    if (produto.tamanhos.length > 1) return produto;
    // Um tamanho só: produto de preço único, com o tamanho no nome.
    const [unico] = produto.tamanhos;
    const original = linhas.find((l) => l.linha === unico.linha);
    return {
      ...noNome(original),
      ...(produto.meioAMeio === undefined ? {} : { meioAMeio: produto.meioAMeio }),
      umTamanho: unico.nome || null,
      repetidas: produto.repetidas,
    };
  });
}

// comTamanhos: o banco aceita tamanhos (aceitaTamanhos() do serviço).
// comMeioAMeio: o banco aceita o meio a meio (aceitaMeioAMeio()). Sem ele, a
// coluna "Meio a meio?" é ignorada.
// meioAMeio no item: true/false (a planilha disse), null (em branco) ou
// undefined (a planilha não tem a coluna).
export function interpretarPlanilha(linhas, { comTamanhos = true, comMeioAMeio = true } = {}) {
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
    const tamanho = cabecalho?.tamanho === null || !cabecalho ? '' : limparNomeTamanho(textoDe(linha[cabecalho.tamanho]));
    const temColunaMeio = comMeioAMeio && cabecalho && cabecalho.meio !== null;

    itens.push({
      linha: i + 1,
      nome: nome.slice(0, LIMITE_DO_NOME),
      preco: preco === null ? '' : Number.isFinite(preco) && preco > 0 ? valorParaCampo(preco) : textoDe(brutoPreco),
      custo: custo === null ? '' : Number.isFinite(custo) && custo >= 0 ? valorParaCampo(custo) : textoDe(brutoCusto),
      vaiParaCozinha: cozinhaDaPlanilha ?? !pareceBebida(nome),
      cozinhaAdivinhada: cozinhaDaPlanilha === null,
      nomeLongo: nome.length > LIMITE_DO_NOME,
      tamanho,
      ...(temColunaMeio ? { meioAMeio: lerSimNao(linha[cabecalho.meio]) } : {}),
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
  const juntos = juntarTamanhos(itens, comTamanhos);
  if (juntos.length > LIMITE_DE_PRODUTOS) {
    throw new ErroDePlanilha(
      `Essa planilha tem ${juntos.length} produtos. O limite é ${LIMITE_DE_PRODUTOS} de uma vez: divida em duas planilhas.`,
    );
  }
  return {
    // O tamanho da linha já foi usado para juntar: não segue no item.
    itens: juntos.map(semTamanhoDaLinha),
    temCusto: Boolean(cabecalho && cabecalho.custo !== null),
  };
}

const textoDosTamanhos = (tamanhos) => JSON.stringify((tamanhos ?? []).map((t) => [chaveDoNome(t.nome), t.preco, t.custo]));
const mesmoItem = (a, b) =>
  a.preco === b.preco &&
  a.custo === b.custo &&
  a.vaiParaCozinha === b.vaiParaCozinha &&
  a.meioAMeio === b.meioAMeio &&
  textoDosTamanhos(a.tamanhos) === textoDosTamanhos(b.tamanhos);

// "P R$ 35,00 · G R$ 55,00" ou o preço único; para as escolhas da revisão.
export function precoDoItem(item) {
  if (item.tamanhos) {
    return item.tamanhos.map((t) => `${t.nome || '?'} ${lerValor(t.preco) > 0 ? formatarMoeda(lerValor(t.preco)) : 'sem preço'}`).join(' · ');
  }
  const valor = lerValor(item.preco);
  return valor > 0 ? formatarMoeda(valor) : 'sem preço';
}

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
    // Meio a meio em branco: também vale o que já está no cardápio.
    if (existente && item.meioAMeio === null) item = { ...item, meioAMeio: Boolean(existente.meio_a_meio) };
    if (!grupo) {
      grupos.set(id, { id, ocorrencias: [item], repetidasIguais: [...(item.repetidas ?? [])], existente });
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

function erroDoPreco(texto) {
  const preco = lerValor(texto);
  if (!Number.isFinite(preco) || preco <= 0) return 'Digite um preço maior que zero, como 12,50.';
  if (preco > PRECO_MAXIMO) return 'Esse preço está alto demais. Confira.';
  return null;
}

function erroDoCusto(texto) {
  if (texto.trim() === '') return null;
  const custo = lerValor(texto);
  return !Number.isFinite(custo) || custo < 0 || custo > PRECO_MAXIMO ? 'Digite um valor como 6,00 ou deixe em branco.' : null;
}

// Erros de uma linha escolhida, com as mesmas regras do formulário de produto.
// Com tamanhos, os erros de cada um vêm como "tamanho-nome-<chave>",
// "tamanho-preco-<chave>" e "tamanho-custo-<chave>".
export function errosDoItem(item, { exigirNome = true } = {}) {
  const erros = {};
  if (exigirNome && !item.nome.trim()) erros.nome = 'Digite o nome do produto.';
  if (item.tamanhos) {
    if (item.tamanhos.length < MINIMO_DE_TAMANHOS) erros.tamanhos = 'Um produto com tamanhos precisa de 2 ou mais. Adicione outro tamanho.';
    if (item.tamanhos.length > MAXIMO_DE_TAMANHOS) erros.tamanhos = `Um produto pode ter até ${MAXIMO_DE_TAMANHOS} tamanhos. Tire os que sobram.`;
    const vistos = new Set();
    for (const t of item.tamanhos) {
      const nome = limparNomeTamanho(t.nome);
      if (!nome) erros[`tamanho-nome-${t.chave}`] = 'Digite o tamanho, como P ou 500 ml.';
      else if (nome.length > LIMITE_NOME_TAMANHO) erros[`tamanho-nome-${t.chave}`] = `Use até ${LIMITE_NOME_TAMANHO} letras no tamanho.`;
      else if (vistos.has(chaveDoNome(nome))) erros[`tamanho-nome-${t.chave}`] = `O tamanho "${nome}" aparece duas vezes. Deixe um só.`;
      vistos.add(chaveDoNome(nome));
      const preco = erroDoPreco(t.preco);
      if (preco) erros[`tamanho-preco-${t.chave}`] = preco;
      const custo = erroDoCusto(t.custo);
      if (custo) erros[`tamanho-custo-${t.chave}`] = custo;
    }
    return erros;
  }
  const preco = erroDoPreco(item.preco);
  if (preco) erros.preco = preco;
  const custo = erroDoCusto(item.custo);
  if (custo) erros.custo = custo;
  return erros;
}

// Precisa de atenção: o dono tem que olhar antes de salvar.
export function precisaDeAtencao(grupo) {
  if (grupo.existente || grupo.ocorrencias.length > 1) return true;
  const [item] = grupo.ocorrencias;
  if (item.umTamanho !== undefined || item.nomeLongo) return true;
  return Object.keys(errosDoItem(item)).length > 0;
}

const arredondar = (v) => Math.round(v * 100) / 100;
// Só manda o meio a meio quando a planilha disse (ou ele já estava no cardápio).
const meioDoItem = (item) => (typeof item.meioAMeio === 'boolean' ? { meio_a_meio: item.meioAMeio } : {});
const meioDoNovo = (item) => (item.meioAMeio ? { meio_a_meio: true } : {});

// O que salvar, a partir das escolhas: produtos novos e os que já existiam e
// o dono mandou atualizar. Com tamanhos, o novo vem com tamanhos (sem preço) e
// o atualizado traz a lista nova de tamanhos ([] desliga os tamanhos).
export function oQueSalvar(grupos) {
  const novos = [];
  const atualizar = [];
  for (const g of grupos) {
    if (typeof g.escolha !== 'number') continue;
    const item = g.ocorrencias[g.escolha];
    if (item.tamanhos) {
      const tamanhos = item.tamanhos.map((t) => ({
        nome: limparNomeTamanho(t.nome),
        preco: arredondar(lerValor(t.preco)),
        custo: t.custo.trim() === '' ? null : arredondar(lerValor(t.custo)),
      }));
      if (g.existente) {
        // Os tamanhos que já existem (mesmo nome) continuam os mesmos.
        const atuais = new Map((g.existente.tamanhos ?? []).map((t) => [chaveDoNome(t.nome), t]));
        atualizar.push({
          grupo: g.id,
          id: g.existente.id,
          alteracoes: { vai_para_cozinha: item.vaiParaCozinha, ...meioDoItem(item) },
          tamanhos: tamanhos.map((t) => {
            const atual = atuais.get(chaveDoNome(t.nome));
            // Custo em branco na planilha não apaga o custo que já estava lá.
            return { ...t, id: atual?.id ?? null, custo: t.custo ?? atual?.custo ?? null, disponivel: atual?.disponivel ?? true };
          }),
        });
      } else {
        novos.push({ grupo: g.id, nome: item.nome.trim().replace(/\s+/g, ' '), vai_para_cozinha: item.vaiParaCozinha, ...meioDoNovo(item), tamanhos });
      }
      continue;
    }
    const custo = item.custo.trim() === '' ? null : arredondar(lerValor(item.custo));
    const dados = {
      preco: arredondar(lerValor(item.preco)),
      vai_para_cozinha: item.vaiParaCozinha,
      ...(g.existente ? meioDoItem(item) : meioDoNovo(item)),
    };
    if (g.existente) {
      // Custo em branco na planilha não apaga o custo que já estava lá.
      // Já tinha tamanhos: a planilha com preço único desliga os tamanhos.
      atualizar.push({
        grupo: g.id,
        id: g.existente.id,
        alteracoes: custo === null ? dados : { ...dados, custo },
        ...(g.existente.tamanhos?.length ? { tamanhos: [] } : {}),
      });
    } else {
      novos.push({ grupo: g.id, nome: item.nome.trim().replace(/\s+/g, ' '), ...dados, custo });
    }
  }
  return { novos, atualizar };
}
