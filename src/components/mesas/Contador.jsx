import { useId, useState } from 'react';

const botao =
  'w-14 h-14 shrink-0 rounded-xl border-2 border-[var(--border-subtle)] text-2xl font-bold text-[var(--text-primary)] hover:border-[var(--color-brand-orange)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--border-subtle)]';

// − 8 +: grande para o dedo. O número também pode ser digitado (quem tem 40
// mesas não precisa tocar 32 vezes no +).
// rotulo: nome acessível do campo; menos/mais: texto dos botões para o leitor de tela.
export default function Contador({ rotulo, valor, onMudar, min, max, sufixo = '', menos, mais, rotuloVisivel = false }) {
  const id = useId();
  // Enquanto a pessoa apaga para digitar outro número, o campo pode ficar vazio.
  const [texto, setTexto] = useState(null);
  const limitar = (n) => Math.min(max, Math.max(min, n));

  function digitar(e) {
    const limpo = e.target.value.replace(/\D/g, '').slice(0, 3);
    setTexto(limpo);
    if (limpo !== '') onMudar(limitar(Number(limpo)));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={rotuloVisivel ? 'text-sm font-medium text-[var(--text-secondary)]' : 'sr-only'}>
        {rotulo}
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className={botao} onClick={() => onMudar(limitar(valor - 1))} disabled={valor <= min} aria-label={menos}>
          −
        </button>
        <span className="flex items-baseline gap-1">
          <input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            value={texto ?? String(valor)}
            onChange={digitar}
            onBlur={() => setTexto(null)}
            className="w-20 min-h-14 rounded-xl border border-[var(--borda-campo)] bg-[var(--surface)] text-center text-3xl font-extrabold tabular-nums text-[var(--text-primary)] focus:border-[var(--color-brand-orange)]"
          />
          {sufixo && <span className="text-2xl font-bold text-[var(--text-primary)]">{sufixo}</span>}
        </span>
        <button type="button" className={botao} onClick={() => onMudar(limitar(valor + 1))} disabled={valor >= max} aria-label={mais}>
          +
        </button>
      </div>
    </div>
  );
}
