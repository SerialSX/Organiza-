import { hojeNoNegocio } from './formatadores';
import { PRONTO_SAI_DA_LISTA_HORAS, STATUS_NA_FILA } from './pedidoStatus';

// Divide os pedidos abertos em:
//   fila: de hoje, ainda por fazer (Cozinha)
//   prontos: de hoje, esperando entrega (atendente)
//   pendencias: abertos de dias anteriores, ou prontos esquecidos há mais de
//     PRONTO_SAI_DA_LISTA_HORAS; o dono resolve na Home
//   cancelados: cancelados há poucos minutos (aviso de "não preparar")
export function separarPedidos(pedidos, agora = new Date()) {
  const hoje = hojeNoNegocio(agora);
  const limitePronto = agora.getTime() - PRONTO_SAI_DA_LISTA_HORAS * 3600000;
  const grupos = { fila: [], prontos: [], pendencias: [], cancelados: [] };

  for (const p of pedidos) {
    if (p.status === 'cancelado') grupos.cancelados.push(p);
    else if (p.dia < hoje) grupos.pendencias.push(p);
    else if (STATUS_NA_FILA.includes(p.status)) grupos.fila.push(p);
    else if (p.status === 'pronto' && new Date(p.pronto_em).getTime() < limitePronto) grupos.pendencias.push(p);
    else if (p.status === 'pronto') grupos.prontos.push(p);
  }
  return grupos;
}

export function itensQueFaltaram(pedido) {
  return pedido.itens.filter((i) => i.faltou);
}
