import { describe, expect, it } from 'vitest';
import { calcularRelatorio, faltasNoPeriodo, faturamentoPorDia, intervaloDoPeriodo, pedidosPorHora, rankingParaCsv, tempoAtePronto } from './relatorios';
import { inicioDoDia } from '../lib/formatadores';

const produtos = [
  { id: 'x', nome: 'X-Burguer', preco: 18.5, custo: 9 },
  { id: 'b', nome: 'Batata', preco: 15, custo: 6 },
  { id: 's', nome: 'Suco', preco: 8, custo: null },
];

function pedido(criado_em, itens) {
  return {
    id: criado_em,
    criado_em,
    itens: itens.map(([produto_id, quantidade, preco_unitario]) => ({
      produto_id,
      nome: produtos.find((p) => p.id === produto_id).nome,
      quantidade,
      preco_unitario,
    })),
  };
}

describe('calcularRelatorio', () => {
  const pedidos = [
    pedido('2026-09-24T12:00:00', [
      ['x', 2, 18.5],
      ['b', 1, 15],
    ]),
    pedido('2026-09-24T13:00:00', [
      ['b', 3, 15],
      ['s', 4, 8],
    ]),
  ];

  it('soma faturamento, pedidos e ticket médio', () => {
    const r = calcularRelatorio(pedidos, produtos);
    expect(r.faturamento).toBe(37 + 15 + 45 + 32);
    expect(r.totalPedidos).toBe(2);
    expect(r.ticketMedio).toBe((37 + 15 + 45 + 32) / 2);
  });

  it('calcula lucro só de produtos com custo e conta os que ficaram de fora', () => {
    const r = calcularRelatorio(pedidos, produtos);
    // X: 2 × 9,50 = 19 · Batata: 4 × 9 = 36 · Suco sem custo
    expect(r.lucroEstimado).toBe(55);
    expect(r.produtosSemCusto).toBe(1);
  });

  it('separa mais vendido de mais lucrativo', () => {
    const r = calcularRelatorio(pedidos, produtos);
    expect(r.maisVendido.nome).toBe('Batata');
    expect(r.maisLucrativo.nome).toBe('Batata');
    expect(r.ranking.map((p) => p.nome)).toEqual(['Batata', 'Suco', 'X-Burguer']);
  });

  it('usa o preço gravado no pedido, não o preço atual do produto', () => {
    const r = calcularRelatorio([pedido('2026-09-24T12:00:00', [['x', 1, 10]])], produtos);
    expect(r.faturamento).toBe(10);
    expect(r.lucroEstimado).toBe(1);
  });

  it('usa o custo gravado no pedido, não o custo atual do produto', () => {
    const comCusto = pedido('2026-09-24T12:00:00', [['x', 1, 18.5]]);
    comCusto.itens[0].custo_unitario = 5;
    const semCusto = pedido('2026-09-24T13:00:00', [['b', 1, 15]]);
    semCusto.itens[0].custo_unitario = null;

    const r = calcularRelatorio([comCusto, semCusto], produtos);
    expect(r.lucroEstimado).toBe(13.5);
    expect(r.produtosSemCusto).toBe(1);
  });

  it('cancelados ficam fora do faturamento e do ranking, contados por motivo', () => {
    const cancelado = { ...pedido('2026-09-24T14:00:00', [['x', 5, 18.5]]), status: 'cancelado', motivo_cancelamento: 'cliente_desistiu' };
    const r = calcularRelatorio([...pedidos, cancelado], produtos);
    expect(r.faturamento).toBe(37 + 15 + 45 + 32);
    expect(r.totalPedidos).toBe(2);
    expect(r.ranking.find((p) => p.nome === 'X-Burguer').quantidade).toBe(2);
    expect(r.totalCancelados).toBe(1);
    expect(r.canceladosPorMotivo).toEqual({ cliente_desistiu: 1 });
  });

  it('retorna zeros sem pedidos', () => {
    const r = calcularRelatorio([], produtos);
    expect(r).toMatchObject({ faturamento: 0, totalPedidos: 0, ticketMedio: 0, maisVendido: null, maisLucrativo: null });
  });
});

describe('intervaloDoPeriodo', () => {
  const agora = new Date('2026-09-24T15:30:00-03:00');

  it('hoje vai do início do dia de trabalho até o início do seguinte (fuso de Fortaleza)', () => {
    const { inicio, fim } = intervaloDoPeriodo('hoje', agora);
    expect(inicio.toISOString()).toBe('2026-09-24T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-09-25T03:00:00.000Z');
  });

  it('semana cobre os últimos 7 dias incluindo hoje', () => {
    const { inicio } = intervaloDoPeriodo('semana', agora);
    expect(inicio.toISOString()).toBe('2026-09-18T03:00:00.000Z');
  });
});

describe('rankingParaCsv', () => {
  it('gera planilha com ";" e vírgula decimal, deixando lucro vazio sem custo', () => {
    const csv = rankingParaCsv([
      { nome: 'X-Burguer', quantidade: 2, faturamento: 37, lucro: 19 },
      { nome: 'Suco; grande', quantidade: 1, faturamento: 8, lucro: null },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Produto;Quantidade;Faturamento (R$);Lucro estimado (R$)',
      'X-Burguer;2;37,00;19,00',
      '"Suco; grande";1;8,00;',
    ]);
  });
});

describe('faturamentoPorDia', () => {
  it('cria uma barra por dia, com zero nos dias sem venda', () => {
    const pedidos = [pedido('2026-09-23T10:00:00-03:00', [['x', 1, 18.5]])];
    const dias = faturamentoPorDia(pedidos, inicioDoDia('2026-09-22'), inicioDoDia('2026-09-25'));
    expect(dias.map((d) => d.valor)).toEqual([0, 18.5, 0]);
  });

  it('não soma pedido cancelado', () => {
    const vendido = pedido('2026-09-23T10:00:00-03:00', [['x', 1, 18.5]]);
    const cancelado = { ...pedido('2026-09-23T11:00:00-03:00', [['x', 2, 18.5]]), status: 'cancelado' };
    const dias = faturamentoPorDia([vendido, cancelado], inicioDoDia('2026-09-23'), inicioDoDia('2026-09-24'));
    expect(dias.map((d) => d.valor)).toEqual([18.5]);
  });

  it('conta os pedidos de cada dia', () => {
    const pedidos = [
      pedido('2026-09-23T10:00:00-03:00', [['x', 1, 18.5]]),
      // 0h30 com o dia virando às 5h: conta no dia 23, pelo campo dia do banco
      { ...pedido('2026-09-24T00:30:00-03:00', [['b', 1, 15]]), dia: '2026-09-23' },
    ];
    const dias = faturamentoPorDia(pedidos, inicioDoDia('2026-09-22'), inicioDoDia('2026-09-24'));
    expect(dias.map((d) => d.pedidos)).toEqual([0, 2]);
  });
});

describe('tempoAtePronto', () => {
  it('mediana e quantos passaram de 15 minutos, sem cancelados e esquecidos', () => {
    const base = (min, extra = {}) => ({
      criado_em: '2026-09-23T12:00:00Z',
      pronto_em: new Date(Date.parse('2026-09-23T12:00:00Z') + min * 60000).toISOString(),
      status: 'entregue',
      ...extra,
    });
    const r = tempoAtePronto([base(5), base(9), base(20), base(12), base(300), base(2, { status: 'cancelado' })]);
    expect(r).toEqual({ quantos: 4, medianaMin: 11, acimaDe15: 25 });
    expect(tempoAtePronto([])).toBeNull();
  });
});

describe('pedidosPorHora', () => {
  it('conta por hora de Fortaleza, do primeiro ao último horário com movimento', () => {
    const pedidos = [
      pedido('2026-09-24T14:10:00Z', [['x', 1, 18.5]]),
      pedido('2026-09-24T14:50:00Z', [['x', 1, 18.5]]),
      pedido('2026-09-24T16:05:00Z', [['x', 1, 18.5]]),
      { ...pedido('2026-09-24T20:00:00Z', [['x', 1, 18.5]]), status: 'cancelado' },
    ];
    expect(pedidosPorHora(pedidos)).toEqual([
      { hora: 11, pedidos: 2 },
      { hora: 12, pedidos: 0 },
      { hora: 13, pedidos: 1 },
    ]);
  });

  it('sem pedidos, lista vazia', () => {
    expect(pedidosPorHora([])).toEqual([]);
  });
});

describe('faltasNoPeriodo', () => {
  it('soma ingredientes e itens inteiros que faltaram', () => {
    const p1 = pedido('2026-09-24T12:00:00', [['x', 1, 18.5]]);
    p1.itens[0].faltou_ingredientes = ['Queijo'];
    const p2 = pedido('2026-09-24T13:00:00', [['x', 1, 18.5], ['b', 1, 15]]);
    p2.itens[0].faltou_ingredientes = ['Queijo', 'Pão'];
    p2.itens[1].faltou = true;
    expect(faltasNoPeriodo([p1, p2])).toEqual([
      { nome: 'Queijo', vezes: 2 },
      { nome: 'Batata', vezes: 1 },
      { nome: 'Pão', vezes: 1 },
    ]);
  });
});
