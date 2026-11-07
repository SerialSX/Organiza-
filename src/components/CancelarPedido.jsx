import { useState } from 'react';
import { MOTIVOS_CANCELAMENTO } from '../lib/pedidoStatus';
import { cancelarPedido } from '../services/pedidos';

const classeOpcao = 'rounded-xl px-3 py-3 text-sm font-semibold text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)] disabled:opacity-60';
const classeVoltar = 'self-start min-h-11 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

// Dois toques para cancelar: "Cancelar" e depois o motivo. O motivo serve de
// confirmação e alimenta o relatório de cancelamentos.
// pago: o cliente já pagou. Depois do motivo, pergunta se o dinheiro voltou
// para ele (sim, ou "ainda vou devolver", que fica no Caixa como a devolver).
export default function CancelarPedido({ pedidoId, pago = false, onErro, onCancelado }) {
  const [passo, setPasso] = useState(null); // null | 'motivo' | 'devolucao'
  const [motivo, setMotivo] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function cancelar(motivoEscolhido, devolucao = null) {
    setSalvando(true);
    try {
      await cancelarPedido(pedidoId, motivoEscolhido, devolucao);
      onCancelado?.();
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
      setPasso(null);
    }
  }

  function escolherMotivo(id) {
    if (!pago) {
      cancelar(id);
      return;
    }
    setMotivo(id);
    setPasso('devolucao');
  }

  if (!passo) {
    return (
      <button
        type="button"
        onClick={() => setPasso('motivo')}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
      >
        Cancelar
      </button>
    );
  }

  if (passo === 'devolucao') {
    return (
      <div className="w-full flex flex-col gap-2" role="group" aria-label="O dinheiro foi devolvido?">
        <p className="text-sm font-semibold text-[var(--text-primary)]">O cliente já pagou. Você devolveu o dinheiro?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={salvando} onClick={() => cancelar(motivo, 'devolvido')} className={classeOpcao}>
            Sim, devolvi
          </button>
          <button type="button" disabled={salvando} onClick={() => cancelar(motivo, 'a_devolver')} className={classeOpcao}>
            Ainda vou devolver
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">“Ainda vou devolver” fica no Caixa até você tocar em “Devolvi”.</p>
        <button type="button" disabled={salvando} onClick={() => setPasso(null)} className={classeVoltar}>
          Voltar, não cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2" role="group" aria-label="Motivo do cancelamento">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Por que cancelar?</p>
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS_CANCELAMENTO.map((m) => (
          <button key={m.id} type="button" disabled={salvando} onClick={() => escolherMotivo(m.id)} className={classeOpcao}>
            {m.rotulo}
          </button>
        ))}
      </div>
      <button type="button" disabled={salvando} onClick={() => setPasso(null)} className={classeVoltar}>
        Voltar, não cancelar
      </button>
    </div>
  );
}
