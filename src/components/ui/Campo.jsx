import { useId } from 'react';

// text-base (16 px) de propósito: abaixo disso o iPhone dá zoom ao tocar no campo.
export const classeCampo =
  'w-full min-h-12 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] px-4 py-3 text-base placeholder:text-[var(--text-secondary)] focus:border-[var(--color-brand-orange)]';

export default function Campo({ rotulo, dica, erro, className = '', id, ...props }) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idDica = dica ? `${idCampo}-dica` : undefined;
  const idErro = erro ? `${idCampo}-erro` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={idCampo} className="text-sm font-medium text-[var(--text-secondary)]">
        {rotulo}
      </label>
      <input
        id={idCampo}
        className={classeCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idDica, idErro].filter(Boolean).join(' ') || undefined}
        {...props}
      />
      {dica && (
        <p id={idDica} className="text-xs text-[var(--text-secondary)]">
          {dica}
        </p>
      )}
      {erro && (
        <p id={idErro} className="text-sm font-medium text-[var(--texto-cozinha)]">
          {erro}
        </p>
      )}
    </div>
  );
}
