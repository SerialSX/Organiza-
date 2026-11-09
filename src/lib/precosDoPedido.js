// Mesma escolha da promoção feita por gravar_itens_pedido.
export function promocaoDasMetades(regra, a, b) {
  if (regra === 'mais_caro') {
    if (a.normal !== b.normal) return a.normal > b.normal ? a.promocao : b.promocao;
    return a.preco >= b.preco ? a.promocao : b.promocao;
  }
  return a.normal-a.preco >= b.normal-b.preco ? a.promocao : b.promocao;
}

// Consome os preços combinados uma única vez, mesmo com observações diferentes.
export function precoDaEdicao(quantidade, lotes, hoje) {
  let falta=quantidade, centavos=0, quantidadeAntiga=0;
  for (const lote of lotes ?? []) {
    const usar=Math.min(falta,lote.quantidade);
    centavos+=usar*Math.round(lote.preco*100);
    quantidadeAntiga+=usar;
    lote.quantidade-=usar;
    falta-=usar;
  }
  centavos+=falta*Math.round((hoje ?? 0)*100);
  return {totalLinha:centavos/100,quantidadeAntiga,excedente:falta};
}
