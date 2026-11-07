// Contas do dia: o que entrou por forma de pagamento, o que falta receber e
// as contas abertas das mesas. Usado no fechamento do caixa e em Pedidos.

export function totalDoPedido(pedido) {
  return pedido.itens.reduce((s, i) => s + i.quantidade * (i.preco_unitario ?? 0), 0);
}

// Mesas com pedido ainda não pago: a conta que vai somando a noite.
// identificacao é o rótulo da conta ("Mesa 4"). Usado quando o negócio ainda
// não tem o mapa das mesas (banco sem a migração das mesas).
export function contasAbertas(pedidos) {
  const contas = new Map();
  for (const p of pedidos) {
    if (p.status === 'cancelado' || p.pago_em || p.nao_recebido_em || !p.mesa) continue;
    const conta = contas.get(p.mesa) ?? { mesa: p.mesa, identificacao: p.nome_mesa || `Mesa ${p.mesa}`, pedidos: [], total: 0 };
    conta.pedidos.push(p);
    conta.total += totalDoPedido(p);
    contas.set(p.mesa, conta);
  }
  return [...contas.values()].sort((a, b) => a.mesa - b.mesa);
}

// Fechamento: por forma de pagamento, a receber, o que não foi recebido
// (foram embora sem pagar) e o que foi cancelado depois de pago (dinheiro a
// devolver, até alguém tocar em "Devolvi").
// contas: contas de mesa fechadas no dia ({ consumo, servico, jeito,
// pagamentos: [{ forma, valor }] }). O pedido pago numa conta não entra
// sozinho: o que entrou está nas partes da conta.
// A taxa de serviço entra no recebido (o dinheiro está no caixa), mas não no
// vendido: é dos garçons.
export function fecharCaixa(pedidos, contas = []) {
  // cartao: pedidos pagos antes de separar crédito e débito.
  const porForma = { pix: 0, dinheiro: 0, credito: 0, debito: 0, cartao: 0 };
  const quantidadePorForma = { pix: 0, dinheiro: 0, credito: 0, debito: 0, cartao: 0 };
  let aReceber = 0;
  const pendentes = [];
  const recebidos = [];
  let devolver = 0;
  const aDevolver = [];
  let naoRecebido = 0;
  const naoRecebidos = [];

  for (const p of pedidos) {
    const total = totalDoPedido(p);
    if (p.status === 'cancelado') {
      if (p.pago_em && !p.conta_id && p.devolucao !== 'devolvido') {
        devolver += total;
        aDevolver.push(p);
      }
      continue;
    }
    if (p.conta_id) continue;
    if (p.nao_recebido_em) {
      naoRecebido += total;
      naoRecebidos.push(p);
      continue;
    }
    if (p.pago_em && p.forma_pagamento in porForma) {
      porForma[p.forma_pagamento] += total;
      quantidadePorForma[p.forma_pagamento] += 1;
      recebidos.push(p);
    } else {
      aReceber += total;
      pendentes.push(p);
    }
  }

  // Somado em centavos: várias partes de R$ 15,77 não podem virar 47,309999.
  let semDetalheCentavos = 0;
  let servicoCentavos = 0;
  const centavosPorForma = {};
  for (const c of contas) {
    servicoCentavos += Math.round(c.servico * 100);
    if (c.jeito === 'separado') semDetalheCentavos += Math.round((c.consumo + c.servico) * 100);
    for (const parte of c.pagamentos) {
      if (!(parte.forma in porForma)) continue;
      centavosPorForma[parte.forma] = (centavosPorForma[parte.forma] ?? 0) + Math.round(parte.valor * 100);
      quantidadePorForma[parte.forma] += 1;
    }
  }
  for (const [forma, centavos] of Object.entries(centavosPorForma)) {
    porForma[forma] = Math.round(porForma[forma] * 100 + centavos) / 100;
  }
  const semDetalhe = semDetalheCentavos / 100;
  const servico = servicoCentavos / 100;
  const contasSeparadas = contas.filter((c) => c.jeito === 'separado').length;

  const recebido = Math.round((Object.values(porForma).reduce((s, v) => s + v, 0) + semDetalhe) * 100) / 100;
  return {
    porForma,
    quantidadePorForma,
    recebido,
    aReceber,
    pendentes,
    recebidos,
    contas,
    semDetalhe,
    contasSeparadas,
    servico,
    devolver,
    aDevolver,
    naoRecebido,
    naoRecebidos,
    vendido: Math.round((recebido + aReceber - servico) * 100) / 100,
  };
}
