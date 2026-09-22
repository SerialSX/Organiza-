function ScreenIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="m6.5 13.5 3-3 2.5 2.5 2-2 3.5 3.5" />
    </svg>
  );
}

export default function ScreenshotPlaceholder({ label, fase, className = '' }) {
  return (
    <div
      className={`w-full aspect-[16/10] rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-col items-center justify-center text-center gap-2 px-6 ${className}`}
    >
      <ScreenIcon className="w-8 h-8 text-[var(--text-secondary)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-secondary)]">
        Print real entra quando a tela ficar pronta ({fase}).
      </p>
    </div>
  );
}
