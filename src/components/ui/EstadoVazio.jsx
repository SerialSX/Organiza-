export default function EstadoVazio({ icon: Icon, accent, titulo, texto, children }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-14 px-6 rounded-2xl border-2 border-dashed border-[var(--border-subtle)]">
      <span
        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
      >
        <Icon className="w-8 h-8" />
      </span>
      <p className="text-lg font-semibold text-[var(--text-primary)]">{titulo}</p>
      {texto && <p className="text-sm text-[var(--text-secondary)] max-w-sm">{texto}</p>}
      {children}
    </div>
  );
}
