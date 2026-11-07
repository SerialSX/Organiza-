import { numeroDoPedido } from '../../lib/formatadores';

export default function PedidoEnviado({ pedido }) {
  // Só bebida (nada para a cozinha preparar): já sai pronto para entregar.
  const jaPronto = pedido.status === 'pronto';

  return (
    <div
      role="status"
      className="rounded-2xl p-4 text-center text-[var(--sobre-destaque)]"
      style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
    >
      <p className="text-sm font-semibold">
        {jaPronto ? 'Pronto para entregar.' : 'Enviado para a cozinha.'} Diga ao cliente a senha:
      </p>
      <p className="text-5xl font-extrabold tracking-wider tabular-nums mt-1" translate="no">
        {numeroDoPedido(pedido)}
      </p>
      {pedido.mesa && <p className="text-xl font-bold tabular-nums mt-1">Mesa {pedido.mesa}</p>}
      {pedido.identificacao && <p className="text-lg font-bold mt-1 break-words">{pedido.identificacao}</p>}
      <p className="text-sm mt-1">Com ela o cliente acompanha a fila pelo QR code.</p>
    </div>
  );
}
