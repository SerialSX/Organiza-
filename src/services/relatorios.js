// Cálculo feito no cliente a partir dos pedidos do período. Para o volume de
// um pequeno negócio isso basta; se crescer, dá para mover para uma view SQL.
export function calcularRelatorio(pedidos, produtos) {
  const custos = Object.fromEntries(produtos.map((p) => [p.id, p.custo]));
  const porProduto = new Map();
  let faturamento = 0;

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const receita = item.quantidade * item.preco_unitario;
      const custo = custos[item.produto_id];
      const lucro = custo === null || custo === undefined ? null : item.quantidade * (item.preco_unitario - custo);

      faturamento += receita;
      const atual = porProduto.get(item.produto_id) ?? {
        produto_id: item.produto_id,
        nome: item.nome,
        quantidade: 0,
        faturamento: 0,
        lucro: null,
      };
      atual.quantidade += item.quantidade;
      atual.faturamento += receita;
      if (lucro !== null) atual.lucro = (atual.lucro ?? 0) + lucro;
      porProduto.set(item.produto_id, atual);
    }
  }

  const ranking = [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade);
  const comLucro = ranking.filter((p) => p.lucro !== null);
  const maisLucrativo = [...comLucro].sort((a, b) => b.lucro - a.lucro)[0] ?? null;

  return {
    totalPedidos: pedidos.length,
    faturamento,
    ticketMedio: pedidos.length ? faturamento / pedidos.length : 0,
    lucroEstimado: comLucro.reduce((soma, p) => soma + p.lucro, 0),
    produtosSemCusto: ranking.filter((p) => p.lucro === null).length,
    maisVendido: ranking[0] ?? null,
    maisLucrativo,
    ranking,
  };
}

function celulaCsv(valor) {
  const texto = String(valor ?? '');
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function numeroCsv(valor) {
  return valor === null || valor === undefined ? '' : valor.toFixed(2).replace('.', ',');
}

// Separador ";" e vírgula decimal: é o que o Excel em português abre direto.
export function rankingParaCsv(ranking) {
  const linhas = [
    ['Produto', 'Quantidade', 'Faturamento (R$)', 'Lucro estimado (R$)'],
    ...ranking.map((p) => [p.nome, p.quantidade, numeroCsv(p.faturamento), numeroCsv(p.lucro)]),
  ];
  return linhas.map((linha) => linha.map(celulaCsv).join(';')).join('\r\n');
}

function chaveDoDia(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function faturamentoPorDia(pedidos, inicio, fim) {
  const totais = new Map();
  for (const pedido of pedidos) {
    const chave = chaveDoDia(pedido.criado_em);
    const valor = pedido.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
    totais.set(chave, (totais.get(chave) ?? 0) + valor);
  }

  const dias = [];
  for (const d = new Date(inicio); d < fim; d.setDate(d.getDate() + 1)) {
    dias.push({ data: new Date(d), valor: totais.get(chaveDoDia(d)) ?? 0 });
  }
  return dias;
}

export function intervaloDoPeriodo(periodo, agora = new Date()) {
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim = new Date(inicioHoje);
  fim.setDate(fim.getDate() + 1);
  const dias = { hoje: 1, semana: 7, mes: 30 }[periodo] ?? 1;
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio, fim };
}
