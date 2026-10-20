import { useState } from 'react';
import Botao from '../ui/Botao';
import { CheckIcon } from '../icons/AppIcons';
import { numeroDoPedido } from '../../lib/formatadores';

export default function BarraDesfazer({ pedido, onDesfazer }) {
  const [desfazendo, setDesfazendo] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30 px-4">
      <div
        role="status"
        className="max-w-md mx-auto flex items-center gap-3 rounded-2xl bg-[var(--surface-alt)] border border-[var(--border-subtle)] shadow-lg p-3"
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0 bg-[var(--color-accent-relatorios)] text-[var(--sobre-destaque)]">
          <CheckIcon className="w-5 h-5" />
        </span>
        <p className="flex-1 font-semibold tabular-nums text-[var(--text-primary)]">Pedido {numeroDoPedido(pedido)} pronto</p>
        <Botao
          variante="secundaria"
          disabled={desfazendo}
          onClick={async () => {
            setDesfazendo(true);
            await onDesfazer(pedido);
          }}
        >
          Desfazer
        </Botao>
      </div>
    </div>
  );
}
