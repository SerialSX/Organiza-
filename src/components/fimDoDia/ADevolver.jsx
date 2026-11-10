import { useState } from 'react';
import Botao from '../ui/Botao';
import { ROTULO_FORMA } from '../../services/pedidos';
import { marcarDevolvido } from '../../services/fimDoDia';
import { formatarHora, formatarMoeda, numeroDoPedido } from '../../lib/formatadores';
import { totalDoPedido } from '../../lib/caixa';
export default function ADevolver({ pedido, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const forma = ROTULO_FORMA[pedido.forma_pagamento] ?? pedido.forma_pagamento;

  async function devolvi() {
    setSalvando(true);
    onErro('');
    try {
      await marcarDevolvido(pedido.id);
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-bold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
      {pedido.identificacao && <span className="font-medium text-[var(--text-primary)] break-words">{pedido.identificacao}</span>}
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
        pago{forma ? ` em ${forma}` : ''}, cancelado às {formatarHora(pedido.cancelado_em)}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(totalDoPedido(pedido))}</span>
      <Botao variante="secundaria" onClick={devolvi} disabled={salvando} aria-label={`Devolvi o dinheiro do pedido ${numeroDoPedido(pedido)}`}>
        Devolvi
      </Botao>
    </li>
  );
}

