// Contas do dia: o que entrou por forma de pagamento, o que falta receber e
// as contas abertas das mesas. Usado no fechamento do caixa e em Pedidos.

export function totalDoPedido(pedido) {
  return pedido.itens.reduce((s, i) => s + i.quantidade * (i.preco_unitario ?? 0), 0);
}

// Mesas com pedido ainda não pago: a conta que vai somando a noite.
// identificacao é o rótulo da conta ("Mesa 4").
export function contasAbertas(pedidos) {
  const contas = new Map();
  for (const p of pedidos) {
    if (p.status === 'cancelado' || p.pago_em || !p.mesa) continue;
    const conta = contas.get(p.mesa) ?? { mesa: p.mesa, identificacao: `Mesa ${p.mesa}`, pedidos: [], total: 0 };
    conta.pedidos.push(p);
    conta.total += totalDoPedido(p);
    contas.set(p.mesa, conta);
  }
  return [...contas.values()].sort((a, b) => a.mesa - b.mesa);
}

// Fechamento: por forma de pagamento, a receber e o que foi cancelado
// depois de pago (dinheiro a devolver).
export function fecharCaixa(pedidos) {
  const porForma = { pix: 0, dinheiro: 0, cartao: 0 };
  const quantidadePorForma = { pix: 0, dinheiro: 0, cartao: 0 };
  let aReceber = 0;
  const pendentes = [];
  let devolver = 0;

  for (const p of pedidos) {
    const total = totalDoPedido(p);
    if (p.status === 'cancelado') {
      if (p.pago_em) devolver += total;
      continue;
    }
    if (p.pago_em && p.forma_pagamento in porForma) {
      porForma[p.forma_pagamento] += total;
      quantidadePorForma[p.forma_pagamento] += 1;
    } else {
      aReceber += total;
      pendentes.push(p);
    }
  }

  const recebido = porForma.pix + porForma.dinheiro + porForma.cartao;
  return { porForma, quantidadePorForma, recebido, aReceber, pendentes, devolver, vendido: recebido + aReceber };
}
