import { useState } from 'react';
import { MOTIVOS_CANCELAMENTO } from '../lib/pedidoStatus';
import { cancelarPedido } from '../services/pedidos';

// Dois toques para cancelar: "Cancelar" e depois o motivo. O motivo serve de
// confirmação e alimenta o relatório de cancelamentos.
export default function CancelarPedido({ pedidoId, onErro, onCancelado }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function cancelar(motivo) {
    setSalvando(true);
    try {
      await cancelarPedido(pedidoId, motivo);
      onCancelado?.();
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
      setEscolhendo(false);
    }
  }

  if (!escolhendo) {
    return (
      <button
        type="button"
        onClick={() => setEscolhendo(true)}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--color-accent-cozinha)] hover:bg-[var(--surface-card-hover)]"
      >
        Cancelar
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2" role="group" aria-label="Motivo do cancelamento">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Por que cancelar?</p>
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS_CANCELAMENTO.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={salvando}
            onClick={() => cancelar(m.id)}
            className="rounded-xl px-3 py-3 text-sm font-semibold text-white bg-[var(--color-accent-cozinha)] disabled:opacity-60"
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={salvando}
        onClick={() => setEscolhendo(false)}
        className="self-start text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        Voltar, não cancelar
      </button>
    </div>
  );
}
