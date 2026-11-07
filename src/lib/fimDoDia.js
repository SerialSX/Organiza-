// Fim do dia: o que ainda está em aberto e impede encerrar o dia. Mesmas
// regras de encerrar_dia e reabrir_dia_do_pedido no banco.
import { STATUS_ABERTOS } from './pedidoStatus';
import { totalDoPedido } from './caixa';

// Sem receber: ninguém pagou e ninguém disse que o cliente foi embora sem pagar.
export function semReceber(pedido) {
  return pedido.status !== 'cancelado' && !pedido.pago_em && !pedido.nao_recebido_em;
}

// Em aberto: ainda sem entregar ou ainda sem receber.
export function emAberto(pedido) {
  return pedido.status !== 'cancelado' && (STATUS_ABERTOS.includes(pedido.status) || semReceber(pedido));
}

// O que falta resolver, do jeito que a tela mostra:
//   contas: pedidos sem receber, um cartão por mesa (os pedidos da mesa
//     juntos) ou por pedido do balcão. Receber, "foi embora sem pagar" ou
//     cancelar a conta resolvem também a entrega.
//   aEntregar: pedidos já pagos que ainda não saíram (na cozinha ou prontos).
// Cada conta: { chave, mesa, nome, pedidos, total, dia }.
export function pendenciasDoDia(pedidos) {
  const contas = new Map();
  const aEntregar = [];
  const ordenados = [...pedidos].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  for (const p of ordenados) {
    if (!emAberto(p)) continue;
    if (!semReceber(p)) {
      aEntregar.push(p);
      continue;
    }
    // A mesma mesa em dias diferentes são contas diferentes.
    const chave = p.mesa ? `${p.dia}:mesa:${p.mesa}` : `pedido:${p.id}`;
    const conta = contas.get(chave) ?? { chave, mesa: p.mesa ?? null, nome: null, dia: p.dia, pedidos: [], total: 0 };
    conta.pedidos.push(p);
    conta.total += totalDoPedido(p);
    if (p.nome_mesa) conta.nome = p.nome_mesa;
    contas.set(chave, conta);
  }
  const listaDeContas = [...contas.values()];
  return {
    contas: listaDeContas,
    aEntregar,
    // Quantos pedidos impedem encerrar (o mesmo número que o banco conta).
    total: aEntregar.length + listaDeContas.reduce((s, c) => s + c.pedidos.length, 0),
  };
}

// Pedido pago e cancelado cujo dinheiro ainda não voltou para o cliente.
// Sem resposta (cancelado antes da pergunta existir) conta como a devolver.
export function aDevolver(pedido) {
  return pedido.status === 'cancelado' && Boolean(pedido.pago_em) && !pedido.conta_id && pedido.devolucao !== 'devolvido';
}

// "Dia encerrado" só vale enquanto nada reabriu o dia.
export function diaEncerrado(encerramento, pedidos) {
  return Boolean(encerramento) && !pedidos.some(emAberto);
}

export function quantosPedidos(n) {
  return n === 1 ? '1 pedido' : `${n} pedidos`;
}

// Pedidos com a lista do que resolver para encerrar o dia.
export function enderecoParaResolver(dia) {
  return `/pedidos?resolver=${dia}`;
}
