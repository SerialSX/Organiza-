import { useTheme } from '../context/useTheme';
import { SunIcon, MoonIcon } from './icons/AppIcons';

export default function ThemeToggle({ className = '' }) {
  const { mode, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)] transition ${className}`}
    >
      {mode === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
    </button>
  );
}
