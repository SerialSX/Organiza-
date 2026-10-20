import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import { CloseIcon } from '../icons/AppIcons';
import { numeroDoPedido } from '../../lib/formatadores';
import { rotuloDoMotivo } from '../../lib/pedidoStatus';

const VERMELHO = 'var(--color-accent-cozinha)';

export default function CartaoCancelado({ pedido, onOk }) {
  return (
    <li
      aria-label={`Pedido ${numeroDoPedido(pedido)} cancelado`}
      className="rounded-2xl border-2 p-4 sm:p-5 flex flex-col gap-3 bg-[color-mix(in_srgb,var(--color-accent-cozinha)_12%,var(--surface-card))]"
      style={{ borderColor: VERMELHO }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl font-extrabold tracking-wide tabular-nums text-[var(--text-primary)] line-through" translate="no">
          {numeroDoPedido(pedido)}
        </span>
        <Etiqueta cor={VERMELHO}>Cancelado</Etiqueta>
      </div>
      <p className="text-lg font-bold text-[var(--texto-cozinha)]">Não preparar. {rotuloDoMotivo(pedido.motivo_cancelamento)}.</p>
      <p className="text-sm text-[var(--text-secondary)] line-through break-words">
        {pedido.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}
      </p>
      <Botao variante="secundaria" className="self-start" onClick={onOk}>
        <CloseIcon className="w-4 h-4" />
        Ok, entendi
      </Botao>
    </li>
  );
}
