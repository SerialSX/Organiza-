// Meio a meio (pizza ½ Calabresa + ½ Portuguesa). As mesmas regras do
// gravar_itens_pedido no banco: os dois sabores precisam estar marcados como
// "Pode ser meio a meio" e ter o mesmo tamanho (G com G), ou os dois sem
// tamanhos. O preço segue a regra que o dono escolheu em Minha conta.

export const REGRAS_MEIO_A_MEIO = [
  {
    valor: 'mais_caro',
    titulo: 'Pelo sabor mais caro',
    exemplo: 'Calabresa G R$ 55 + Portuguesa G R$ 60: cobra R$ 60,00.',
  },
  {
    valor: 'media',
    titulo: 'Pela média dos dois',
    exemplo: 'Calabresa G R$ 55 + Portuguesa G R$ 60: cobra R$ 57,50 (metade de cada).',
  },
];

export function regraValida(regra) {
  return REGRAS_MEIO_A_MEIO.some((r) => r.valor === regra);
}

export function tituloDaRegra(regra) {
  return REGRAS_MEIO_A_MEIO.find((r) => r.valor === regra)?.titulo ?? '';
}

const centavos = (v) => Math.round(Number(v) * 100);

// Mesmo arredondamento do banco: metade de um centavo sobe.
export function precoMeioAMeio(regra, primeiro, segundo) {
  if (regra === 'mais_caro') return Math.max(centavos(primeiro), centavos(segundo)) / 100;
  return Math.round((centavos(primeiro) + centavos(segundo)) / 2) / 100;
}

// Metade do custo de cada sabor. Sem o custo de um deles, fica sem saber.
export function custoMeioAMeio(primeiro, segundo) {
  if (primeiro === null || primeiro === undefined || segundo === null || segundo === undefined) return null;
  return Math.round((centavos(primeiro) + centavos(segundo)) / 2) / 100;
}

const mesmoNome = (a, b) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

// O tamanho do segundo sabor que combina com o tamanho escolhido (G com G).
// Sem tamanho escolhido: o segundo sabor também não pode ter tamanhos.
// Devolve undefined quando não combina.
export function tamanhoQueCombina(produto, nomeDoTamanho) {
  const tamanhos = produto.tamanhos ?? [];
  if (!nomeDoTamanho) return tamanhos.length ? undefined : null;
  return tamanhos.find((t) => mesmoNome(t.nome, nomeDoTamanho));
}

// Sabores para a segunda metade: os outros produtos marcados que têm o mesmo
// tamanho. Esgotado aparece riscado (não some sem explicação).
// [{ produto, tamanho (do sabor, ou null), preco, disponivel }]
export function saboresParaCombinar(produtos, primeiro, tamanho) {
  const lista = [];
  for (const p of produtos) {
    if (p.id === primeiro.id || !p.meio_a_meio) continue;
    const t = tamanhoQueCombina(p, tamanho?.nome ?? null);
    if (t === undefined) continue;
    lista.push({
      produto: p,
      tamanho: t,
      preco: t ? t.preco : p.preco,
      disponivel: p.disponivel && (t ? t.disponivel : true),
    });
  }
  return lista.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'));
}

// "G: ½ Calabresa + ½ Portuguesa"; sem meio a meio, "Pizza Calabresa (G)".
export function nomeDoItem(produto, tamanho, segundoSabor) {
  if (segundoSabor) return `${tamanho ? `${tamanho}: ` : ''}½ ${produto} + ½ ${segundoSabor}`;
  return tamanho ? `${produto} (${tamanho})` : produto;
}
