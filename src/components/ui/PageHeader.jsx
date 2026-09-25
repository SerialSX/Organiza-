export default function PageHeader({ icon: Icon, accent, title, subtitle, children }) {
  return (
    <header className="flex flex-wrap items-center gap-4 mb-6 sm:mb-8">
      <span
        className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shrink-0"
        style={{ backgroundColor: accent }}
      >
        <Icon className="w-7 h-7 text-white" />
      </span>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
