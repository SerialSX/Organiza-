import { Link } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { mode } = useTheme();

  return (
    <header className="sticky top-0 z-10 bg-[var(--surface)]/90 backdrop-blur border-b border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
        <Link to="/" className="shrink-0 rounded-lg" aria-label="Organiza+, página inicial">
          <img src={mode === 'dark' ? logoDark : logoLight} alt="" width="1372" height="434" className="h-7 sm:h-10 w-auto" />
        </Link>
        <nav aria-label="Conta" className="flex items-center gap-1 sm:gap-3">
          <ThemeToggle />
          {/* Visível também no celular: quem já tem conta precisa achar onde entrar */}
          <Link
            to="/login"
            className="inline-flex items-center min-h-11 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs sm:text-sm font-medium px-2 sm:px-4 transition-colors whitespace-nowrap"
          >
            Já tenho conta
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex items-center min-h-11 bg-brand-orange hover:brightness-110 text-[var(--sobre-destaque)] text-xs sm:text-sm font-semibold px-3 sm:px-5 rounded-lg transition-[filter] whitespace-nowrap"
          >
            Criar conta grátis
          </Link>
        </nav>
      </div>
    </header>
  );
}
