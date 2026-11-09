export function itensDoCarrinho(itens) {
  return itens.map(({ comboId, escolhas, produtoId, tamanhoId, segundoId, quantidade, observacao }) =>
      comboId
        ? {
            combo_id: comboId,
            partes: escolhas.map((e) => ({ produto_id: e.produtoId, tamanho_id: e.tamanhoId ?? null, segundo_produto_id: e.segundoId ?? null })),
            quantidade,
            observacao,
          }
        : {
            produto_id: produtoId,
            tamanho_id: tamanhoId ?? null,
            segundo_produto_id: segundoId ?? null,
            quantidade,
            observacao,
          },
    );
}
