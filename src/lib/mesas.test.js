import { describe, expect, it } from 'vitest';
import { dividirIgual, faltaAnotar, limparNomeMesa, montarMapa, nomeDaMesa, proximaMesaExtra, servicoEmCentavos } from './mesas';
import { usaMapaDeMesas, precisaResponderMesas, precisaResponderBoasVindas, taxaDoNegocio } from './atendimento';

function pedido(id, mesa, { nome = null, preco = 10, pago = false, status = 'pendente', criado = '2026-11-20T22:00:00Z' } = {}) {
  return {
    id,
    mesa,
    nome_mesa: nome,
    status,
    criado_em: criado,
    pago_em: pago ? '2026-11-20T23:00:00Z' : null,
    itens: [{ quantidade: 1, preco_unitario: preco }],
  };
}

describe('mapa das mesas', () => {
  it('mostra as mesas do mapa livres e as ocupadas com o total', () => {
    const mapa = montarMapa(
      [pedido('a', 2, { preco: 9 }), pedido('b', 2, { preco: 7 }), pedido('c', 3, { pago: true }), pedido('d', 1, { status: 'cancelado' })],
      4,
    );
    expect(mapa.map((m) => [m.mesa, m.pedidos.length, m.total])).toEqual([
      [1, 0, 0],
      [2, 2, 16],
      [3, 0, 0],
      [4, 0, 0],
    ]);
  });

  it('mesa extra com pedido aberto aparece depois do mapa, com o nome mais novo', () => {
    const mapa = montarMapa(
      [pedido('a', 5, { nome: 'Varanda', criado: '2026-11-20T21:00:00Z' }), pedido('b', 5, { nome: 'Varandão', criado: '2026-11-20T22:00:00Z' })],
      2,
    );
    expect(mapa.at(-1)).toMatchObject({ mesa: 5, nome: 'Varandão', extra: true, total: 20 });
  });

  it('balcão não entra no mapa', () => {
    expect(montarMapa([pedido('a', null)], 2).every((m) => m.pedidos.length === 0)).toBe(true);
  });

  it('próxima mesa extra: primeiro número livre acima do mapa e nome que não se repete', () => {
    const mapa = montarMapa([pedido('a', 9, { nome: 'Extra 1' })], 8);
    expect(proximaMesaExtra(mapa, 8)).toEqual({ mesa: 10, nome: 'Extra 2' });
    expect(proximaMesaExtra(montarMapa([], 8), 8)).toEqual({ mesa: 9, nome: 'Extra 1' });
  });

  it('nome da mesa: o da mesa extra ou "Mesa N"', () => {
    expect(nomeDaMesa({ mesa: 4, nome_mesa: null })).toBe('Mesa 4');
    expect(nomeDaMesa({ mesa: 9, nome_mesa: 'Varanda' })).toBe('Varanda');
    expect(limparNomeMesa('  Varanda   do  fundo ')).toBe('Varanda do fundo');
    expect(limparNomeMesa('   ')).toBeNull();
    expect(limparNomeMesa('x'.repeat(30))).toHaveLength(20);
  });
});

describe('conta da mesa', () => {
  it('taxa de serviço arredondada no centavo, como no banco', () => {
    expect(servicoEmCentavos(4300, 10)).toBe(430);
    expect(servicoEmCentavos(900, 12)).toBe(108);
    // 10,05 × 10% = 1,005: arredonda para cima, como o round do Postgres.
    expect(servicoEmCentavos(1005, 10)).toBe(101);
    expect(servicoEmCentavos(4300, 0)).toBe(0);
  });

  it('dividir igual: o centavo que sobra vai para o último', () => {
    expect(dividirIgual(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(dividirIgual(4730, 2)).toEqual([2365, 2365]);
    expect(dividirIgual(1, 3)).toEqual([0, 0, 1]);
    expect(dividirIgual(4730, 3).reduce((s, v) => s + v, 0)).toBe(4730);
  });

  it('quanto falta anotar em cada um um valor', () => {
    expect(faltaAnotar(4730, [{ centavos: 2000 }, { centavos: null }])).toBe(2730);
    expect(faltaAnotar(4730, [{ centavos: 2000 }, { centavos: 2730 }])).toBe(0);
    expect(faltaAnotar(4730, [{ centavos: 5000 }])).toBe(-270);
  });
});

describe('perguntas das mesas', () => {
  const dono = { papel: 'admin', modo_atendimento: 'mesa', quantidade_mesas: null, taxa_servico: null };

  it('quem atende na mesa e ainda não disse as mesas responde só elas', () => {
    expect(precisaResponderMesas(dono)).toBe(true);
    expect(precisaResponderBoasVindas(dono)).toBe(true);
    expect(precisaResponderMesas({ ...dono, quantidade_mesas: 8, taxa_servico: 0 })).toBe(false);
  });

  it('só balcão, atendente ou banco sem a migração não perguntam', () => {
    expect(precisaResponderMesas({ ...dono, modo_atendimento: 'balcao' })).toBe(false);
    expect(precisaResponderMesas({ ...dono, papel: 'atendente' })).toBe(false);
    expect(precisaResponderMesas({ ...dono, quantidade_mesas: undefined, taxa_servico: undefined })).toBe(false);
  });

  it('mapa só com o número de mesas respondido; taxa 0 sem o mapa', () => {
    expect(usaMapaDeMesas({ ...dono, quantidade_mesas: 8 })).toBe(true);
    expect(usaMapaDeMesas(dono)).toBe(false);
    expect(usaMapaDeMesas({ ...dono, modo_atendimento: 'balcao', quantidade_mesas: 8 })).toBe(false);
    expect(taxaDoNegocio({ ...dono, quantidade_mesas: 8, taxa_servico: 10 })).toBe(10);
    expect(taxaDoNegocio({ ...dono, taxa_servico: 10 })).toBe(0);
  });
});
