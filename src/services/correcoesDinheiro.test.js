// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { salvarDemo } from './demoStore';
import { listarPendenciasAnteriores } from './pedidos';
import { emAberto } from '../lib/fimDoDia';
beforeEach(() => localStorage.clear());
it('DIN-08: devolução de qualquer dia aparece nas pendências sem bloquear encerramento', async () => {
  const p = { id:'p', dia:'2000-01-01', criado_em:'2000-01-01T12:00:00Z', status:'cancelado', pago_em:'2000-01-01T12:00:00Z', devolucao:'a_devolver' };
  salvarDemo({ produtos:[], pedidos:[p, {...p,id:'devolvido',devolucao:'devolvido'}], itens_pedido:[] });
  expect((await listarPendenciasAnteriores()).map(p=>p.id)).toEqual(['p']);
  expect(emAberto(p)).toBe(false);
});
