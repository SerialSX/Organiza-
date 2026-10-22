// Cálculo feito no cliente a partir dos pedidos do período. Para o volume de
// um pequeno negócio isso basta; se crescer, dá para mover para uma view SQL.
// Cancelados não entram em faturamento, ticket, lucro nem ranking: são contados
// à parte, por motivo.
export function calcularRelatorio(todosOsPedidos, produtos) {
  const custos = Object.fromEntries(produtos.map((p) => [p.id, p.custo]));
  const porProduto = new Map();
  const pedidos = todosOsPedidos.filter((p) => p.status !== 'cancelado');
  const cancelados = todosOsPedidos.filter((p) => p.status === 'cancelado');
  const canceladosPorMotivo = {};
  for (const p of cancelados) {
    const motivo = p.motivo_cancelamento ?? 'outro';
    canceladosPorMotivo[motivo] = (canceladosPorMotivo[motivo] ?? 0) + 1;
  }
  let faturamento = 0;

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const receita = item.quantidade * item.preco_unitario;
      // custo_unitario é o custo gravado no pedido. Itens sem ele (dados antigos
      // do modo demonstração) usam o custo atual do produto.
      const custo = item.custo_unitario !== undefined ? item.custo_unitario : custos[item.produto_id];
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
    totalCancelados: cancelados.length,
    canceladosPorMotivo,
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

// Faturamento e número de pedidos (senhas usadas) de cada dia do período.
export function faturamentoPorDia(pedidos, inicio, fim) {
  const totais = new Map();
  for (const pedido of pedidos) {
    // Cancelado não é venda: fica fora, como nos totais.
    if (pedido.status === 'cancelado') continue;
    const chave = chaveDoDia(pedido.criado_em);
    const valor = pedido.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
    const atual = totais.get(chave) ?? { valor: 0, pedidos: 0 };
    totais.set(chave, { valor: atual.valor + valor, pedidos: atual.pedidos + 1 });
  }

  const dias = [];
  for (const d = new Date(inicio); d < fim; d.setDate(d.getDate() + 1)) {
    const { valor, pedidos: quantos } = totais.get(chaveDoDia(d)) ?? { valor: 0, pedidos: 0 };
    dias.push({ data: new Date(d), valor, pedidos: quantos });
  }
  return dias;
}

const horaEmFortaleza = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Fortaleza' });

// Pedidos por hora (sem os cancelados), do primeiro ao último horário com
// movimento: mostra a hora de pico para o dono reforçar a equipe.
export function pedidosPorHora(pedidos) {
  const contagem = new Map();
  for (const p of pedidos) {
    if (p.status === 'cancelado') continue;
    const hora = Number(horaEmFortaleza.format(new Date(p.criado_em)));
    contagem.set(hora, (contagem.get(hora) ?? 0) + 1);
  }
  if (!contagem.size) return [];
  const horas = [...contagem.keys()];
  const lista = [];
  for (let h = Math.min(...horas); h <= Math.max(...horas); h++) lista.push({ hora: h, pedidos: contagem.get(h) ?? 0 });
  return lista;
}

// O que a cozinha avisou que faltou no período, do que mais faltou para o
// que menos: lista de compras. Conta também pedidos cancelados, porque a
// falta aconteceu do mesmo jeito.
export function faltasNoPeriodo(pedidos) {
  const vezes = new Map();
  const somar = (nome) => vezes.set(nome, (vezes.get(nome) ?? 0) + 1);
  for (const p of pedidos) {
    for (const item of p.itens) {
      for (const nome of item.faltou_ingredientes ?? []) somar(nome);
      if (item.faltou) somar(item.nome);
    }
  }
  return [...vezes].map(([nome, n]) => ({ nome, vezes: n })).sort((a, b) => b.vezes - a.vezes || a.nome.localeCompare(b.nome, 'pt-BR'));
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
