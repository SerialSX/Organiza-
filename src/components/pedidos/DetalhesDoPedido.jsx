import { useId } from 'react';
import { classeCampo } from '../ui/Campo';
import { FORMAS_DE_PAGAMENTO } from '../../services/pedidos';

const ACCENT = 'var(--color-accent-pedidos)';

function Opcao({ ativa, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className="min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors"
      style={
        ativa
          ? { backgroundColor: ACCENT, borderColor: ACCENT, color: 'var(--sobre-destaque)' }
          : { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }
      }
    >
      {children}
    </button>
  );
}

// Nome do cliente (para chamar quando ficar pronto) e se já foi pago.
// A mesa fica em DestinoDoPedido.
export default function DetalhesDoPedido({ identificacao, onIdentificacao, forma, onForma }) {
  const idCampo = useId();

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCampo} className="text-sm font-medium text-[var(--text-secondary)]">
          Nome do cliente (opcional)
        </label>
        <input
          id={idCampo}
          value={identificacao}
          onChange={(e) => onIdentificacao(e.target.value.slice(0, 30))}
          maxLength={30}
          placeholder="Só o primeiro nome. Ex.: Carlos"
          autoComplete="off"
          enterKeyHint="done"
          className={classeCampo}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--text-secondary)]" id={`${idCampo}-pagamento`}>
          Pagamento
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${idCampo}-pagamento`}>
          <Opcao ativa={!forma} onClick={() => onForma(null)}>
            Paga depois
          </Opcao>
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <Opcao key={f.id} ativa={forma === f.id} onClick={() => onForma(f.id)}>
              {f.rotulo}
            </Opcao>
          ))}
        </div>
      </div>
    </div>
  );
}
