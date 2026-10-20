import { Link } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import ThemeToggle from './ThemeToggle';

// Moldura das telas de entrar, criar conta e recuperar senha.
export default function TelaDeAcesso({ titulo, subtitulo, children, rodape }) {
  const { mode } = useTheme();

  return (
    <div className="min-h-svh bg-[var(--surface)] flex flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <Link to="/" className="block w-fit mx-auto mb-8 rounded-lg" aria-label="Organiza+, página inicial">
            <img src={mode === 'dark' ? logoDark : logoLight} alt="" width="1372" height="434" className="h-12 w-auto" />
          </Link>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-alt)] p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{titulo}</h1>
              {subtitulo && <p className="text-sm text-[var(--text-secondary)]">{subtitulo}</p>}
            </div>
            {children}
          </div>
          {rodape && <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">{rodape}</div>}
        </div>
      </main>
    </div>
  );
}
