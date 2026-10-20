import { Link } from 'react-router-dom';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[filter,background-color,opacity] disabled:opacity-50 disabled:cursor-not-allowed';

const tamanhos = {
  medio: 'min-h-11 px-4 py-2.5 text-sm',
  grande: 'min-h-14 px-5 py-3.5 text-base',
};

const variantes = {
  // cor: variável CSS do destaque (ex.: var(--color-accent-pedidos))
  primaria: 'text-[var(--sobre-destaque)] hover:brightness-110',
  secundaria: 'border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]',
  perigo: 'text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)] hover:brightness-110',
  texto: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline',
};

export default function Botao({
  variante = 'primaria',
  tamanho = 'medio',
  cor = 'var(--color-brand-orange)',
  larguraTotal = false,
  para,
  className = '',
  style,
  children,
  type = 'button',
  ...resto
}) {
  const classes = `${base} ${tamanhos[tamanho]} ${variantes[variante]} ${larguraTotal ? 'w-full' : ''} ${className}`;
  const estilo = variante === 'primaria' ? { backgroundColor: cor, ...style } : style;

  if (para) {
    return (
      <Link to={para} className={classes} style={estilo} {...resto}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} style={estilo} {...resto}>
      {children}
    </button>
  );
}
