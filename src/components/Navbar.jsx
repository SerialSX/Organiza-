import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const navigate = useNavigate();
  const { mode } = useTheme();

  return (
    <header className="sticky top-0 z-10 bg-[var(--surface)]/90 backdrop-blur border-b border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        <img
          src={mode === 'dark' ? logoDark : logoLight}
          alt="Organiza+"
          className="h-7 sm:h-10 w-auto cursor-pointer"
          onClick={() => navigate('/')}
        />
        <nav className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle className="w-9 h-9 sm:w-10 sm:h-10" />
          <button
            onClick={() => navigate('/login')}
            className="hidden sm:inline-flex text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium px-4 py-2 transition-colors"
          >
            Já tenho conta
          </button>
          <button
            onClick={() => navigate('/cadastro')}
            className="bg-brand-orange hover:brightness-110 text-white text-xs sm:text-sm font-semibold px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg transition whitespace-nowrap"
          >
            Criar conta grátis
          </button>
        </nav>
      </div>
    </header>
  );
}
