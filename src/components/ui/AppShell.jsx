import AppNav from '../AppNav';
import { useAuth } from '../../context/useAuth';

export default function AppShell({ children, largura = 'max-w-5xl' }) {
  const { modoDemo } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--surface)] pb-24 md:pb-0">
      <AppNav />
      {modoDemo && (
        <p className="text-center text-xs font-medium px-4 py-2 bg-[color-mix(in_srgb,var(--color-brand-orange)_15%,transparent)] text-[var(--color-brand-orange)]">
          Modo demonstração: os dados ficam salvos só neste navegador.
        </p>
      )}
      <main className={`${largura} mx-auto px-4 sm:px-6 py-6 sm:py-10`}>{children}</main>
    </div>
  );
}
