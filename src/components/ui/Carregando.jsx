export default function Carregando({ texto = 'Carregando...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-secondary)]" role="status">
      <span className="w-8 h-8 rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--color-brand-orange)] animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}
