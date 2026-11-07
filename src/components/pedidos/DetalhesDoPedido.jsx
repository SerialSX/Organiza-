import { useId, useState } from 'react';
import { classeCampo } from '../ui/Campo';
import { FORMAS_DE_PAGAMENTO } from '../../services/pedidos';

const ACCENT = 'var(--color-accent-pedidos)';

function Opcao({ ativa, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className="min-h-12 rounded-xl border-2 px-2 text-sm font-semibold transition-colors"
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

// Pedido de balcão: como o cliente pagou (obrigatório, ele paga na hora) e,
// se quiser, o primeiro nome para chamar quando ficar pronto. O número do
// pedido continua sendo o principal; o nome fica escondido atrás de um link.
export default function DetalhesDoPedido({ identificacao, onIdentificacao, forma, onForma, erroPagamento, idPagamento }) {
  const idCampo = useId();
  const [comNome, setComNome] = useState(Boolean(identificacao));
  const mostrarNome = comNome || Boolean(identificacao);

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]" id={`${idCampo}-pagamento`}>
          Como o cliente pagou?
        </span>
        <div
          id={idPagamento}
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2"
          role="group"
          aria-labelledby={`${idCampo}-pagamento`}
          aria-describedby={erroPagamento ? `${idCampo}-erro` : undefined}
        >
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <Opcao key={f.id} ativa={forma === f.id} onClick={() => onForma(f.id)}>
              {f.rotulo}
            </Opcao>
          ))}
        </div>
        {erroPagamento && (
          <p id={`${idCampo}-erro`} role="alert" className="text-sm font-semibold text-[var(--texto-cozinha)]">
            {erroPagamento}
          </p>
        )}
      </div>

      {mostrarNome ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-sm font-medium text-[var(--text-secondary)]">
            Nome do cliente (opcional)
          </label>
          <input
            id={idCampo}
            value={identificacao}
            onChange={(e) => onIdentificacao(e.target.value.slice(0, 30))}
            maxLength={30}
            placeholder="Ex.: Carlos"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby={`${idCampo}-dica`}
            className={classeCampo}
          />
          <p id={`${idCampo}-dica`} className="text-xs text-[var(--text-secondary)]">
            Só o primeiro nome. Não anote telefone nem CPF.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setComNome(true);
            setTimeout(() => document.getElementById(idCampo)?.focus(), 0);
          }}
          className="self-start min-h-11 text-sm font-semibold text-[var(--texto-pedidos)] underline-offset-4 hover:underline"
        >
          + Anotar o nome do cliente (se quiser)
        </button>
      )}
    </div>
  );
}
