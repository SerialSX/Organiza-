import { numeroDoPedido } from '../../lib/formatadores';

export default function PedidoEnviado({ pedido }) {
  return (
    <div
      role="status"
      className="rounded-2xl p-4 text-center text-[var(--sobre-destaque)]"
      style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
    >
      <p className="text-sm font-semibold">Enviado para a cozinha. Diga ao cliente a senha:</p>
      <p className="text-5xl font-extrabold tracking-wider tabular-nums mt-1" translate="no">
        {numeroDoPedido(pedido)}
      </p>
      {pedido.mesa && <p className="text-xl font-bold tabular-nums mt-1">Mesa {pedido.mesa}</p>}
      <p className="text-sm mt-1">Com ele o cliente acompanha a fila pelo QR code.</p>
    </div>
  );
}
