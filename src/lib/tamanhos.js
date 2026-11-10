// Tamanhos de um produto (P, M, G; 300 ml, 500 ml). Mesmas regras e textos
// das funções do banco (salvar_tamanhos_do_produto, criar_produtos_com_tamanhos).
import { formatarMoeda } from './formatadores';

export const MINIMO_DE_TAMANHOS = 2;
export const MAXIMO_DE_TAMANHOS = 8;
export const LIMITE_NOME_TAMANHO = 20;
const PRECO_MAXIMO = 99999.99;

// Botões de preencher rápido no cadastro.
export const TAMANHOS_RAPIDOS = [
  ['P', 'M', 'G'],
  ['Pequeno', 'Médio', 'Grande'],
];

export function limparNomeTamanho(nome) {
  return (nome ?? '').trim().replace(/\s+/g, ' ');
}

function chave(nome) {
  return limparNomeTamanho(nome).toLowerCase();
}

// Lança o mesmo erro que o banco lançaria. produto: com o nome do produto
// (cadastro de vários de uma vez), para dizer qual deles está errado.
export function conferirTamanhos(lista, produto = null) {
  if (lista.length > MAXIMO_DE_TAMANHOS || (produto && lista.length < MINIMO_DE_TAMANHOS)) {
    throw new Error(produto ? `${produto} precisa ter de 2 a 8 tamanhos.` : 'Um produto pode ter até 8 tamanhos.');
  }
  if (lista.length === 1) throw new Error('Com um tamanho só, use o preço do produto. Tamanhos são 2 ou mais.');
  const vistos = new Set();
  for (const t of lista) {
    const nome = limparNomeTamanho(t.nome);
    if (nome.length < 1 || nome.length > LIMITE_NOME_TAMANHO) {
      throw new Error('O nome de cada tamanho precisa ter de 1 a 20 letras.');
    }
    if (!(t.preco > 0 && t.preco <= PRECO_MAXIMO)) {
      throw new Error(produto ? `Digite o preço de cada tamanho de ${produto}.` : 'Digite o preço de cada tamanho.');
    }
    if (t.custo !== null && t.custo !== undefined && !(t.custo >= 0 && t.custo <= PRECO_MAXIMO)) {
      throw new Error('O custo de cada tamanho precisa ficar entre 0 e 99.999,99.');
    }
    if (vistos.has(chave(nome))) {
      throw new Error(
        produto ? `${produto} tem dois tamanhos com o nome "${nome}".` : `Dois tamanhos com o nome "${nome}". Use nomes diferentes.`,
      );
    }
    vistos.add(chave(nome));
  }
}

export function temTamanhos(produto) {
  return Boolean(produto?.tamanhos?.length);
}

// O esgotado do produto vale para todos os tamanhos.
export function tamanhoDisponivel(produto, tamanho) {
  return produto.disponivel && tamanho.disponivel;
}

// Algum tamanho ainda sai? (o produto todo esgotado ou todos os tamanhos esgotados: não)
export function algumTamanhoDisponivel(produto) {
  if (!temTamanhos(produto)) return produto.disponivel;
  return produto.tamanhos.some((t) => tamanhoDisponivel(produto, t));
}

// "R$ 30,00 a R$ 50,00": a faixa de preço, para listas.
export function faixaDePreco(produto) {
  if (!temTamanhos(produto)) return formatarMoeda(produto.preco);
  const precos = produto.tamanhos.map((t) => t.preco);
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  return menor === maior ? formatarMoeda(menor) : `${formatarMoeda(menor)} a ${formatarMoeda(maior)}`;
}

// "P 30,00 · M 40,00 · G 50,00"
export function resumoDosTamanhos(produto) {
  return produto.tamanhos.map((t) => `${t.nome} ${formatarMoeda(t.preco)}`).join(' · ');
}
