// Liga e desliga ("Disponível", "Valendo"): um botão switch com nome falado.
export default function Interruptor({ ligado, onChange, rotulo, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onChange}
      disabled={disabled}
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ backgroundColor: ligado ? 'var(--color-accent-relatorios)' : 'var(--border-subtle)' }}
    >
      <span
        className="inline-block h-6 w-6 rounded-full bg-white shadow transition-transform"
        style={{ transform: ligado ? 'translateX(28px)' : 'translateX(4px)' }}
      />
    </button>
  );
}
