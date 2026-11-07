import { numeroDoPedido } from '../../lib/formatadores';

// Aviso depois de enviar. Balcão: a senha para dizer ao cliente (ele
// acompanha pelo QR code). Mesa: não tem senha nem QR, quem atende leva o
// pedido até a mesa.
export default function PedidoEnviado({ pedido }) {
  // Só bebida (nada para a cozinha preparar): já sai pronto para entregar.
  const jaPronto = pedido.status === 'pronto';
  const situacao = jaPronto ? 'Pronto para entregar.' : 'Enviado para a cozinha.';

  return (
    <div
      role="status"
      className="rounded-2xl p-4 text-center text-[var(--sobre-destaque)]"
      style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
    >
      {pedido.mesa ? (
        <>
          <p className="text-sm font-semibold">{situacao}</p>
          <p className="text-5xl font-extrabold tabular-nums mt-1">Mesa {pedido.mesa}</p>
          <p className="text-sm mt-1">{jaPronto ? 'Pode levar até a mesa.' : 'Entrou na conta da mesa.'}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold">{situacao} Diga ao cliente a senha:</p>
          <p className="text-5xl font-extrabold tracking-wider tabular-nums mt-1" translate="no">
            {numeroDoPedido(pedido)}
          </p>
          {pedido.identificacao && <p className="text-lg font-bold mt-1 break-words">{pedido.identificacao}</p>}
          <p className="text-sm mt-1">Com ela o cliente acompanha a fila pelo QR code.</p>
        </>
      )}
    </div>
  );
}
