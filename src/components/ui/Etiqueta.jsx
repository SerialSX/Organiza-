// Etiqueta de status ("Novo", "Pronto"...): cor sólida, texto em caixa normal.
export default function Etiqueta({ cor, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold text-[var(--sobre-destaque)] ${className}`}
      style={{ backgroundColor: cor }}
    >
      {children}
    </span>
  );
}
