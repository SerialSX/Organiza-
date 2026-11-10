import { hojeNoNegocio, inicioDoDia } from '../lib/formatadores';

const DIA_MS = 24 * 3600000;

// Cálculo feito no cliente a partir dos pedidos do período. Para o volume de
// um pequeno negócio isso basta; se crescer, dá para mover para uma view SQL.
// Cancelados não entram em faturamento, ticket, lucro nem ranking: são contados
// à parte, por motivo. O que não foi recebido (foram embora sem pagar) também
// fica fora e é contado à parte, com o valor perdido.
// Produto com tamanhos conta junto ("Pizza Calabresa: 30"), com o detalhe de
// cada tamanho (P 5 · M 10 · G 15); o lucro usa o custo de cada tamanho.
// Meio a meio: cada sabor conta meia (0,5), com metade do faturamento e do lucro.
// Combo: cada parte conta no produto dela ("X-Burguer: 12, sendo 5 em combo"),
// com a parte do preço do combo que coube a ela; e o combo tem a lista dele.
// Promoção: quantas vendas saíram por ela e quanto de desconto deu.
export function calcularRelatorio(todosOsPedidos, produtos) {
  const custos = Object.fromEntries(produtos.map((p) => [p.id, p.custo]));
  const custosDosTamanhos = Object.fromEntries(produtos.flatMap((p) => (p.tamanhos ?? []).map((t) => [t.id, t.custo])));
  // Ordem dos tamanhos no cadastro de hoje; tamanho que saiu do cardápio vai pro fim.
  const ordemDosTamanhos = Object.fromEntries(
    produtos.map((p) => [p.id, Object.fromEntries((p.tamanhos ?? []).map((t, i) => [t.nome.toLowerCase(), i]))]),
  );
  const porProduto = new Map();
  const pedidos = todosOsPedidos.filter((p) => p.status !== 'cancelado' && !p.nao_recebido_em);
  const cancelados = todosOsPedidos.filter((p) => p.status === 'cancelado');
  const naoRecebidos = todosOsPedidos.filter((p) => p.status !== 'cancelado' && p.nao_recebido_em);
  const valorNaoRecebido =
    Math.round(naoRecebidos.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.quantidade * (i.preco_unitario ?? 0), 0), 0) * 100) / 100;
  const canceladosPorMotivo = {};
  for (const p of cancelados) {
    const motivo = p.motivo_cancelamento ?? 'outro';
    canceladosPorMotivo[motivo] = (canceladosPorMotivo[motivo] ?? 0) + 1;
  }
  let faturamento = 0;
  const porCombo = new Map();
  const porPromocao = new Map();
  // Cada combo vendido conta uma vez (as partes têm o mesmo combo_grupo).
  const gruposContados = new Set();

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const receita = item.quantidade * item.preco_unitario;
      // custo_unitario é o custo gravado no pedido. Itens sem ele (dados antigos
      // do modo demonstração) usam o custo atual do produto.
      const custoDoCadastro = item.tamanho_id ? custosDosTamanhos[item.tamanho_id] : custos[item.produto_id];
      const custo = item.custo_unitario !== undefined ? item.custo_unitario : custoDoCadastro;
      const lucro = custo === null || custo === undefined ? null : item.quantidade * (item.preco_unitario - custo);

      faturamento += receita;
      const primeiraDoGrupo = item.combo_grupo && !gruposContados.has(item.combo_grupo);
      if (item.combo_grupo) {
        gruposContados.add(item.combo_grupo);
        const chave = item.combo_id ?? `nome|${item.combo_nome}`;
        const combo = porCombo.get(chave) ?? { chave, nome: item.combo_nome, quantidade: 0, faturamento: 0, lucro: 0, semCusto: false };
        if (primeiraDoGrupo) combo.quantidade += item.quantidade;
        combo.faturamento += receita;
        if (lucro === null) combo.semCusto = true;
        else combo.lucro += lucro;
        porCombo.set(chave, combo);
      }
      if (item.promocao) {
        const chave = item.promocao_id ?? `nome|${item.promocao}`;
        const promo = porPromocao.get(chave) ?? { chave, nome: item.promocao, vendas: 0, faturamento: 0, desconto: 0 };
        if (!item.combo_grupo || primeiraDoGrupo) promo.vendas += item.quantidade;
        promo.faturamento += receita;
        if (item.preco_cheio !== null && item.preco_cheio !== undefined) {
          promo.desconto += item.quantidade * Math.max(0, item.preco_cheio - item.preco_unitario);
        }
        porPromocao.set(chave, promo);
      }
      const partes = item.segundo_produto_id
        ? [
            { produto_id: item.produto_id, nome: item.produto_nome ?? item.nome, fator: 0.5 },
            { produto_id: item.segundo_produto_id, nome: item.segundo_sabor, fator: 0.5 },
          ]
        : [{ produto_id: item.produto_id, nome: item.produto_nome ?? item.nome, fator: 1 }];
      for (const parte of partes) {
        const quantidade = item.quantidade * parte.fator;
        const atual = porProduto.get(parte.produto_id) ?? {
          produto_id: parte.produto_id,
          nome: parte.nome,
          quantidade: 0,
          faturamento: 0,
          lucro: null,
          porTamanho: [],
          emCombo: 0,
        };
        atual.quantidade += quantidade;
        if (item.combo_grupo) atual.emCombo += quantidade;
        if (item.tamanho) {
          const doTamanho = atual.porTamanho.find((t) => t.nome.toLowerCase() === item.tamanho.toLowerCase());
          if (doTamanho) doTamanho.quantidade += quantidade;
          else atual.porTamanho.push({ nome: item.tamanho, quantidade });
        }
        atual.faturamento += receita * parte.fator;
        if (lucro !== null) atual.lucro = (atual.lucro ?? 0) + lucro * parte.fator;
        porProduto.set(parte.produto_id, atual);
      }
    }
  }

  for (const p of porProduto.values()) {
    const ordem = ordemDosTamanhos[p.produto_id] ?? {};
    const posicao = (t) => ordem[t.nome.toLowerCase()] ?? 99;
    p.porTamanho.sort((a, b) => posicao(a) - posicao(b));
    p.detalheTamanhos = detalheDosTamanhos(p.porTamanho);
  }
  const ranking = [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade);
  const comLucro = ranking.filter((p) => p.lucro !== null);
  const maisLucrativo = [...comLucro].sort((a, b) => b.lucro - a.lucro)[0] ?? null;
  const centavos = (v) => Math.round(v * 100) / 100;
  const combos = [...porCombo.values()]
    .map(({ semCusto, ...c }) => ({ ...c, faturamento: centavos(c.faturamento), lucro: semCusto ? null : centavos(c.lucro) }))
    .sort((a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento);
  const promocoes = [...porPromocao.values()]
    .map((p) => ({ ...p, faturamento: centavos(p.faturamento), desconto: centavos(p.desconto) }))
    .sort((a, b) => b.vendas - a.vendas || b.faturamento - a.faturamento);

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
    totalNaoRecebidos: naoRecebidos.length,
    valorNaoRecebido,
    combos,
    promocoes,
    descontoDasPromocoes: centavos(promocoes.reduce((s, p) => s + p.desconto, 0)),
  };
}

// "2", "2,5" (meio a meio conta meia).
export function formatarQuantidade(n) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

// "P 5 · M 10 · G 15" (vazio para produto sem tamanhos).
export function detalheDosTamanhos(porTamanho) {
  return porTamanho.map((t) => `${t.nome} ${formatarQuantidade(t.quantidade)}`).join(' · ');
}

function celulaCsv(valor) {
  let texto = String(valor ?? '');
  // Nome começando com = + - @ (ou tab/CR) vira fórmula no Excel/LibreOffice:
  // o apóstrofo faz a planilha mostrar como texto (injeção de fórmula em CSV).
  if (typeof valor === 'string' && /^[=+@\t\r-]/.test(texto)) texto = `'${texto}`;
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function numeroCsv(valor) {
  return valor === null || valor === undefined ? '' : valor.toFixed(2).replace('.', ',');
}

// Separador ";" e vírgula decimal: é o que o Excel em português abre direto.
// Com combos ou promoções no período, vêm mais duas tabelas embaixo.
export function rankingParaCsv(ranking, combos = [], promocoes = []) {
  const comCombo = ranking.some((p) => p.emCombo);
  const linhas = [
    ['Produto', 'Quantidade', 'Por tamanho', 'Faturamento (R$)', 'Lucro estimado (R$)', ...(comCombo ? ['Em combo'] : [])],
    ...ranking.map((p) => [
      p.nome,
      formatarQuantidade(p.quantidade),
      p.detalheTamanhos ?? '',
      numeroCsv(p.faturamento),
      numeroCsv(p.lucro),
      ...(comCombo ? [p.emCombo ? formatarQuantidade(p.emCombo) : ''] : []),
    ]),
  ];
  if (combos.length) {
    linhas.push([], ['Combo', 'Quantidade', 'Faturamento (R$)', 'Lucro estimado (R$)']);
    for (const c of combos) linhas.push([c.nome, formatarQuantidade(c.quantidade), numeroCsv(c.faturamento), numeroCsv(c.lucro)]);
  }
  if (promocoes.length) {
    linhas.push([], ['Promoção', 'Vendas', 'Faturamento (R$)', 'Desconto dado (R$)']);
    for (const p of promocoes) linhas.push([p.nome, formatarQuantidade(p.vendas), numeroCsv(p.faturamento), numeroCsv(p.desconto)]);
  }
  return linhas.map((linha) => linha.map(celulaCsv).join(';')).join('\r\n');
}

// O dia de trabalho do pedido (pedidos.dia, que já respeita a virada).
function diaDoPedido(pedido) {
  return pedido.dia ?? hojeNoNegocio(new Date(pedido.criado_em));
}

// Faturamento e número de pedidos (senhas usadas) de cada dia do período.
// inicio e fim: instantes de início de dia de trabalho (intervaloDoPeriodo).
export function faturamentoPorDia(pedidos, inicio, fim) {
  const totais = new Map();
  for (const pedido of pedidos) {
    // Cancelado ou não recebido não é venda: fica fora, como nos totais.
    if (pedido.status === 'cancelado' || pedido.nao_recebido_em) continue;
    const chave = diaDoPedido(pedido);
    const valor = pedido.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
    const atual = totais.get(chave) ?? { valor: 0, pedidos: 0 };
    totais.set(chave, { valor: atual.valor + valor, pedidos: atual.pedidos + 1 });
  }

  const dias = [];
  for (let t = new Date(inicio).getTime(); t < new Date(fim).getTime(); t += DIA_MS) {
    const dia = hojeNoNegocio(new Date(t));
    const { valor, pedidos: quantos } = totais.get(dia) ?? { valor: 0, pedidos: 0 };
    // Meio-dia de Fortaleza: o rótulo "24/09" sai certo em qualquer fuso.
    dias.push({ data: new Date(`${dia}T12:00:00-03:00`), valor, pedidos: quantos });
  }
  return dias;
}

// Do envio até o "Pronto": mediana e quantos passaram de 15 minutos. Fora os
// cancelados e os acima de 3 horas (esquecidos, não espera de verdade).
export function tempoAtePronto(pedidos) {
  const minutos = pedidos
    .filter((p) => p.status !== 'cancelado' && p.pronto_em)
    .map((p) => (new Date(p.pronto_em) - new Date(p.criado_em)) / 60000)
    // 0 min: só bebida, que nasce pronto sem passar pela cozinha.
    .filter((m) => m > 0 && m < 180)
    .sort((a, b) => a - b);
  if (!minutos.length) return null;
  const meio = Math.floor(minutos.length / 2);
  const mediana = minutos.length % 2 ? minutos[meio] : (minutos[meio - 1] + minutos[meio]) / 2;
  return {
    quantos: minutos.length,
    medianaMin: Math.round(mediana),
    acimaDe15: Math.round((100 * minutos.filter((m) => m >= 15).length) / minutos.length),
  };
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

// Do início do dia de trabalho (com a virada do negócio) de N dias atrás até
// o fim do dia de trabalho de hoje.
export function intervaloDoPeriodo(periodo, agora = new Date()) {
  const fim = new Date(inicioDoDia(hojeNoNegocio(agora)).getTime() + DIA_MS);
  const dias = { hoje: 1, semana: 7, mes: 30 }[periodo] ?? 1;
  const inicio = new Date(fim.getTime() - dias * DIA_MS);
  return { inicio, fim };
}
