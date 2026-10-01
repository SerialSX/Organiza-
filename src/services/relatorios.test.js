import { describe, expect, it } from 'vitest';
import { calcularRelatorio, faturamentoPorDia, intervaloDoPeriodo, rankingParaCsv } from './relatorios';

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
  const agora = new Date(2026, 8, 24, 15, 30);

  it('hoje vai da meia-noite até a meia-noite seguinte', () => {
    const { inicio, fim } = intervaloDoPeriodo('hoje', agora);
    expect(inicio).toEqual(new Date(2026, 8, 24));
    expect(fim).toEqual(new Date(2026, 8, 25));
  });

  it('semana cobre os últimos 7 dias incluindo hoje', () => {
    const { inicio } = intervaloDoPeriodo('semana', agora);
    expect(inicio).toEqual(new Date(2026, 8, 18));
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
    const pedidos = [pedido(new Date(2026, 8, 23, 10).toISOString(), [['x', 1, 18.5]])];
    const dias = faturamentoPorDia(pedidos, new Date(2026, 8, 22), new Date(2026, 8, 25));
    expect(dias.map((d) => d.valor)).toEqual([0, 18.5, 0]);
  });
});
