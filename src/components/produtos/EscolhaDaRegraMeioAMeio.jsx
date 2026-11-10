import { useId } from 'react';
import { REGRAS_MEIO_A_MEIO } from '../../lib/meioAMeio';

// Como o negócio cobra o meio a meio: pelo sabor mais caro ou pela média.
// Usada no cadastro do produto (ao marcar o primeiro), no aviso de Produtos e
// em Minha conta.
export default function EscolhaDaRegraMeioAMeio({ valor, onMudar, erro, legendaVisivel = true, texto }) {
  const id = useId();
  const idErro = erro ? `${id}-erro` : undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={idErro}>
      <legend className={legendaVisivel ? 'font-semibold text-[var(--text-primary)] mb-1' : 'sr-only'}>
        Como você cobra o meio a meio?
      </legend>
      {texto && <p className="text-sm text-[var(--text-secondary)]">{texto}</p>}
      {REGRAS_MEIO_A_MEIO.map((r) => (
        <label
          key={r.valor}
          className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-3 cursor-pointer has-[:checked]:border-[var(--color-accent-produtos)]"
        >
          <input
            type="radio"
            name="regraMeioAMeio"
            value={r.valor}
            checked={valor === r.valor}
            onChange={() => onMudar(r.valor)}
            className="mt-0.5 w-5 h-5 shrink-0"
          />
          <span>
            <span className="block font-semibold text-[var(--text-primary)]">{r.titulo}</span>
            <span className="block text-sm text-[var(--text-secondary)]">{r.exemplo}</span>
          </span>
        </label>
      ))}
      {erro && (
        <p id={idErro} role="alert" className="text-sm font-medium text-[var(--texto-cozinha)]">
          {erro}
        </p>
      )}
    </fieldset>
  );
}
